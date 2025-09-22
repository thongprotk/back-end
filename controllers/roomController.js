let rooms = new Map();

// Import the proper determineWinner from service
const { determineWinner: serviceWinner } = require("../services/detemineWinner");

const createRoomState = () => ({
  players: new Map(), // socketId -> {readyStatus: boolean, choice: null}
  activePlayers: [], // Array of socketIds currently in game
  waitingQueue: [], // Queue of players waiting to play
  gameState: {
    inProgress: false,
    round: 0,
    choices: new Map(), // socketId -> choice
    results: []
  },
  settings: {
    maxPlayers: 2, // Can be configured
    rotatePlayersAfterRound: false // If true, allows queue rotation
  },
  // Play-again coordination
  playAgainVotes: new Set(), // socketIds who clicked "play again"
  playAgainTimer: null, // timeout id for waiting window
  createdAt: Date.now(),
  lastActivity: Date.now()
});

// Utility functions
const normalizeRoomID = (roomID) => String(roomID);

const updateLastActivity = (roomID) => {
  const room = rooms.get(roomID);
  if (room) {
    room.lastActivity = Date.now();
  }
};

const isRoomFull = (room) => {
  return room.activePlayers.length >= room.settings.maxPlayers;
};

const isRoomEmpty = (room) => {
  return room.players.size === 0;
};

const getPlayerData = (room, socketId) => {
  return room.players.get(socketId) || null;
};

const isActivePlayer = (room, socketId) => {
  return room.activePlayers.includes(socketId);
};

const isInQueue = (room, socketId) => {
  return room.waitingQueue.includes(socketId);
};

const emitToRoom = (io, roomID, event, data) => {
  io.to(roomID).emit(event, { ...data, roomID });
};

const emitToActivePlayers = (io, room, roomID, event, data) => {
  room.activePlayers.forEach(socketId => {
    io.to(socketId).emit(event, { ...data, roomID });
  });
};

const emitRoomStatus = (io, roomID) => {
  const room = rooms.get(roomID);
  if (!room) return;

  const status = {
    roomID,
    activePlayers: room.activePlayers.length,
    maxPlayers: room.settings.maxPlayers,
    queueLength: room.waitingQueue.length,
    gameInProgress: room.gameState.inProgress,
    players: Array.from(room.players.entries()).map(([id, data]) => ({
      id,
      ready: data.readyStatus,
      isActive: room.activePlayers.includes(id),
      inQueue: room.waitingQueue.includes(id)
    }))
  };

  emitToRoom(io, roomID, 'roomStatus', status);
};

// Enhanced room creation
const createRoom = (socket, roomID, io) => {
  const rid = normalizeRoomID(roomID);

  try {
    socket.join(rid);

    if (rooms.has(rid)) {
      // Room exists, join it
      joinExistingRoom(socket, rid, io);
    } else {
      // Create new room
      const newRoom = createRoomState();

      // Add creator as first active player
      newRoom.players.set(socket.id, {
        readyStatus: false,
        choice: null,
        joinedAt: Date.now()
      });
      newRoom.activePlayers.push(socket.id);

      rooms.set(rid, newRoom);

      socket.emit("room-created", rid);
      socket.emit("playerJoined", {
        roomID: rid,
        position: 'active',
        playerNumber: 1
      });

      emitRoomStatus(io, rid);
      io.emit("room-list", getActiveRooms());
    }

  } catch (error) {
    console.error('Error creating room:', error);
    socket.emit("err", {
      message: "Lỗi tạo phòng",
      code: "CREATE_ERROR",
      roomID: rid
    });
  }
};

// Enhanced room joining logic
const joinRoom = (socket, roomID, io) => {
  const rid = normalizeRoomID(roomID);

  try {
    socket.join(rid);

    if (!rooms.has(rid)) {
      // Create room if doesn't exist
      createRoom(socket, rid, io);
      return;
    }

    joinExistingRoom(socket, rid, io);

  } catch (error) {
    console.error('Error joining room:', error);
    socket.emit("err", {
      message: "Lỗi tham gia phòng",
      code: "JOIN_ERROR",
      roomID: rid
    });
  }
};

const joinExistingRoom = (socket, roomID, io) => {
  const room = rooms.get(roomID);
  updateLastActivity(roomID);

  // Check if player already in room
  if (room.players.has(socket.id)) {
    // Player reconnecting
    const playerData = room.players.get(socket.id);
    socket.emit("playerReconnected", {
      roomID,
      position: getPlayerPosition(room, socket.id)
    });
    emitRoomStatus(io, roomID);
    return;
  }

  // Determine where to place the new player
  if (room.activePlayers.length < room.settings.maxPlayers && !room.gameState.inProgress) {
    // Add as active player
    room.players.set(socket.id, {
      readyStatus: false,
      choice: null,
      joinedAt: Date.now()
    });
    room.activePlayers.push(socket.id);

    socket.emit("playerJoined", {
      roomID,
      position: 'active',
      playerNumber: room.activePlayers.length
    });

    // Check if we can start the game
    if (room.activePlayers.length === room.settings.maxPlayers) {
      emitToActivePlayers(io, room, roomID, "gameReady", {
        players: room.activePlayers
      });
    }

  } else {
    // Add to waiting queue
    room.players.set(socket.id, {
      readyStatus: false,
      choice: null,
      joinedAt: Date.now()
    });
    room.waitingQueue.push(socket.id);

    socket.emit("playerJoined", {
      roomID,
      position: 'queue',
      queuePosition: room.waitingQueue.length
    });
  }

  emitRoomStatus(io, roomID);
};

const getPlayerPosition = (room, socketId) => {
  if (room.activePlayers.includes(socketId)) return 'active';
  if (room.waitingQueue.includes(socketId)) return 'queue';
  return 'unknown';
};

// Enhanced exit room
const exitRoom = (socket, roomID, io) => {
  const rid = normalizeRoomID(roomID);

  if (!rooms.has(rid)) return;

  const room = rooms.get(rid);

  try {
    const playerData = room.players.get(socket.id);
    if (!playerData) return;

    // Remove from all collections
    room.players.delete(socket.id);
    room.activePlayers = room.activePlayers.filter(id => id !== socket.id);
    room.waitingQueue = room.waitingQueue.filter(id => id !== socket.id);
    room.gameState.choices.delete(socket.id);

    // Also remove any playAgain vote from this player
    if (room.playAgainVotes && room.playAgainVotes.has(socket.id)) {
      room.playAgainVotes.delete(socket.id);
    }

    socket.leave(rid);

    // Handle player leaving during game
    if (room.gameState.inProgress && playerData) {
      // End current game if active player leaves
      room.gameState.inProgress = false;
      room.gameState.choices.clear();

      emitToRoom(io, rid, "gameInterrupted", {
        reason: "Người chơi đã rời đi",
        leavingPlayer: socket.id
      });
    }

    // Try to fill empty active player slots
    fillActivePlayerSlots(room, rid, io);

    // Emit updated status
    emitRoomStatus(io, rid);
    emitToRoom(io, rid, "playerLeft", {
      socketId: socket.id,
      playerData
    });

    // Clean up empty rooms
    if (isRoomEmpty(room)) {
      // clear any pending timer
      if (room.playAgainTimer) {
        clearTimeout(room.playAgainTimer);
        room.playAgainTimer = null;
      }
      rooms.delete(rid);
    } else {
      updateLastActivity(rid);
    }

    io.emit("room-list", getActiveRooms());

  } catch (error) {
    console.error('Error exiting room:', error);
  }
};

const fillActivePlayerSlots = (room, roomID, io) => {
  // Fill active player slots from queue
  while (room.activePlayers.length < room.settings.maxPlayers && room.waitingQueue.length > 0) {
    const nextPlayerId = room.waitingQueue.shift();

    if (room.players.has(nextPlayerId)) {
      room.activePlayers.push(nextPlayerId);
      const playerData = room.players.get(nextPlayerId);
      playerData.readyStatus = false;

      io.to(nextPlayerId).emit("promotedToActive", {
        roomID,
        playerNumber: room.activePlayers.length
      });
    }
  }

  // Check if game can start
  if (room.activePlayers.length === room.settings.maxPlayers && !room.gameState.inProgress) {
    emitToActivePlayers(io, room, roomID, "gameReady", {
      players: room.activePlayers
    });
  }
};

// Enhanced disconnect cleanup
const cleanupRoomsOnDisconnect = (socketID, io) => {
  try {
    for (const [roomID, room] of rooms.entries()) {
      if (!room.players.has(socketID)) continue;

      const playerData = room.players.get(socketID);

      // Remove from all collections
      room.players.delete(socketID);
      room.activePlayers = room.activePlayers.filter(id => id !== socketID);
      room.waitingQueue = room.waitingQueue.filter(id => id !== socketID);
      room.gameState.choices.delete(socketID);

      // Remove any playAgain vote
      if (room.playAgainVotes && room.playAgainVotes.has(socketID)) {
        room.playAgainVotes.delete(socketID);
      }

      // Handle disconnect during game
      if (room.gameState.inProgress && playerData) {
        room.gameState.inProgress = false;
        room.gameState.choices.clear();

        emitToRoom(io, roomID, "gameInterrupted", {
          reason: "Người chơi bị mất kết nối",
          disconnectedPlayer: socketID
        });
      }

      // Try to fill slots and notify room
      fillActivePlayerSlots(room, roomID, io);
      emitRoomStatus(io, roomID);
      emitToRoom(io, roomID, "playerDisconnected", {
        socketId: socketID
      });

      // Clean up empty room
      if (isRoomEmpty(room)) {
        if (room.playAgainTimer) {
          clearTimeout(room.playAgainTimer);
          room.playAgainTimer = null;
        }
        rooms.delete(roomID);
      } else {
        updateLastActivity(roomID);
      }
    }

    io.emit("room-list", getActiveRooms());

  } catch (error) {
    console.error('Error cleaning up rooms:', error);
  }
};

// Enhanced player ready system
const playerReady = (socket, roomID, io) => {
  const rid = normalizeRoomID(roomID);
  const room = rooms.get(rid);

  if (!room) {
    socket.emit("err", {
      message: "Phòng không tồn tại",
      code: "ROOM_NOT_FOUND",
      roomID: rid
    });
    return;
  }

  const playerData = room.players.get(socket.id);
  if (!playerData || !isActivePlayer(room, socket.id)) {
    socket.emit("err", {
      message: "Bạn không phải là người chơi đang hoạt động",
      code: "NOT_ACTIVE_PLAYER",
      roomID: rid
    });
    return;
  }

  // Toggle ready status
  playerData.readyStatus = !playerData.readyStatus;
  updateLastActivity(rid);

  // Check if all active players are ready
  const allReady = room.activePlayers.every(playerId => {
    const pData = room.players.get(playerId);
    return pData && pData.readyStatus;
  });

  emitRoomStatus(io, rid);

  if (allReady && room.activePlayers.length >= 2) {
    // Start new game
    startNewRound(room, rid, io);
  }
};

const startNewRound = (room, roomID, io) => {
  // Cancel any pending playAgain timer and clear votes
  if (room.playAgainTimer) {
    clearTimeout(room.playAgainTimer);
    room.playAgainTimer = null;
  }
  if (room.playAgainVotes) room.playAgainVotes.clear();

  // Reset ready status
  room.activePlayers.forEach(playerId => {
    const playerData = room.players.get(playerId);
    if (playerData) {
      playerData.readyStatus = false;
      playerData.choice = null;
    }
  });

  room.gameState.inProgress = true;
  room.gameState.round++;
  room.gameState.choices.clear();

  emitToRoom(io, roomID, 'gameStarted', {
    round: room.gameState.round,
    players: room.activePlayers
  });


  emitToRoom(io, roomID, 'playAgain', {
    round: room.gameState.round,
    players: room.activePlayers,
    firstPlayerChoice: null,
    secondPlayerChoice: null
  });
};

// Enhanced choice handling
const handlePlayerChoice = (socket, roomID, choice, io) => {
  console.log("Player choice received:", { socketId: socket.id, roomID, choice });
  const rid = normalizeRoomID(roomID);
  const room = rooms.get(rid);

  if (!room || !room.gameState.inProgress) {
    socket.emit("err", {
      message: "Game không trong trạng thái chơi",
      code: "GAME_NOT_ACTIVE",
      roomID: rid
    });
    return;
  }

  if (!isActivePlayer(room, socket.id)) {
    socket.emit("err", {
      message: "Bạn không phải là người chơi đang hoạt động",
      code: "NOT_ACTIVE_PLAYER",
      roomID: rid
    });
    return;
  }

  // Store choice
  room.gameState.choices.set(socket.id, choice);
  const playerData = room.players.get(socket.id);
  if (playerData) {
    playerData.choice = choice;
  }

  updateLastActivity(rid);

  // Check if all active players have made choices
  if (room.gameState.choices.size === room.activePlayers.length) {
    finishRound(room, rid, io);
  } else {
    // Notify waiting for other players
    emitToRoom(io, rid, 'waitingForChoices', {
      madeChoices: room.gameState.choices.size,
      totalPlayers: room.activePlayers.length
    });
  }
};

const finishRound = (room, roomID, io) => {
  const choices = Array.from(room.gameState.choices.entries());

  // Determine winner (for 2+ players)
  let results;
  if (choices.length === 2) {
    // Traditional rock-paper-scissors
    // Use the canonical activePlayers order (first active player = player1)
    const p1Id = room.activePlayers[0];
    const p2Id = room.activePlayers[1];

    const choice1 = room.gameState.choices.get(p1Id);
    const choice2 = room.gameState.choices.get(p2Id);

    const rawWinner = serviceWinner(choice1, choice2);

    // Normalize winner to socketId for clarity on client
    let winnerSocketId = null;
    if (rawWinner === 'tie' || rawWinner === 'draw') {
      winnerSocketId = 'draw';
    } else if (rawWinner === '1' || rawWinner === 'player1') {
      winnerSocketId = String(p1Id);
    } else if (rawWinner === '2' || rawWinner === 'player2') {
      winnerSocketId = String(p2Id);
    } else {
      // If service already returned a socketId, use it
      winnerSocketId = rawWinner;
    }

    results = {
      type: 'duel',
      winner: winnerSocketId,
      choices: Object.fromEntries(choices)
    };
  } else {
    // Multi-player logic (elimination style or scoring)
    results = determineMultiPlayerWinner(choices);
  }

  room.gameState.results.push(results);
  room.gameState.inProgress = false;

  emitToRoom(io, roomID, 'roundFinished', {
    results,
    round: room.gameState.round
  });

  // Handle player rotation if enabled
  if (room.settings.rotatePlayersAfterRound && room.waitingQueue.length > 0) {
    rotatePlayersAfterRound(room, roomID, io);
  }

  emitRoomStatus(io, roomID);
};

// Player clicked (for play again functionality)
const playerClicked = (socket, roomID, io) => {
  const rid = normalizeRoomID(roomID);
  const room = rooms.get(rid);

  if (!room) {
    socket.emit("err", {
      message: "Phòng không tồn tại",
      code: "ROOM_NOT_FOUND",
      roomID: rid
    });
    return;
  }

  if (!isActivePlayer(room, socket.id)) {
    socket.emit("err", {
      message: "Bạn không phải là người chơi đang hoạt động",
      code: "NOT_ACTIVE_PLAYER",
      roomID: rid
    });
    return;
  }

  // Initialize playAgainVotes set if missing
  if (!room.playAgainVotes) room.playAgainVotes = new Set();

  // Add this player's vote
  room.playAgainVotes.add(socket.id);
  updateLastActivity(rid);

  // Debug logging to trace vote state
  console.log(`playerClicked: room=${rid}, voter=${socket.id}, votes=${Array.from(room.playAgainVotes)}, activePlayers=${room.activePlayers}`);

  // Notify room of current votes
  emitToRoom(io, rid, 'playAgainVote', {
    votes: Array.from(room.playAgainVotes),
    needed: room.activePlayers.length
  });

  // If all active players voted, start new round
  if (room.playAgainVotes.size === room.activePlayers.length) {
    if (room.playAgainTimer) {
      clearTimeout(room.playAgainTimer);
      room.playAgainTimer = null;
    }
    room.playAgainVotes.clear();
    startNewRound(room, rid, io);
    emitRoomStatus(io, rid);
    return;
  }

  // Start a timeout waiting for other players (e.g., 15s)
  if (!room.playAgainTimer) {
    room.playAgainTimer = setTimeout(() => {
      // After timeout, find non-voters among active players
      const nonVoters = room.activePlayers.filter(id => !room.playAgainVotes.has(id));

      // Move non-voters to queue (they effectively gave up)
      nonVoters.forEach(nid => {
        room.activePlayers = room.activePlayers.filter(id => id !== nid);
        // avoid duplicating in queue
        if (!room.waitingQueue.includes(nid)) room.waitingQueue.push(nid);
        io.to(nid).emit('removedForNoPlay', { roomID: rid });
      });

      // Clear votes and timer
      room.playAgainVotes.clear();
      room.playAgainTimer = null;

      // Fill slots from queue and start game if possible
      fillActivePlayerSlots(room, rid, io);
      emitRoomStatus(io, rid);

      // If there are enough active players to start, start immediately
      if (room.activePlayers.length >= 2) {
        startNewRound(room, rid, io);
        emitRoomStatus(io, rid);
      }
    }, 15000);
  }
};

const determineMultiPlayerWinner = (choices) => {
  const choiceCount = {};
  choices.forEach(([playerId, choice]) => {
    choiceCount[choice] = (choiceCount[choice] || 0) + 1;
  });

  const maxCount = Math.max(...Object.values(choiceCount));
  const winners = choices.filter(([playerId, choice]) =>
    choiceCount[choice] === maxCount
  );

  return {
    type: 'multiplayer',
    winners: winners.map(([playerId]) => playerId),
    choices: Object.fromEntries(choices),
    choiceStats: choiceCount
  };
};

const rotatePlayersAfterRound = (room, roomID, io) => {
  if (room.waitingQueue.length === 0) return;

  // Move first active player to queue
  const rotatedPlayer = room.activePlayers.shift();
  room.waitingQueue.push(rotatedPlayer);

  // Promote first queued player
  const promotedPlayer = room.waitingQueue.shift();
  room.activePlayers.push(promotedPlayer);

  // Update player data
  const rotatedData = room.players.get(rotatedPlayer);
  const promotedData = room.players.get(promotedPlayer);

  if (rotatedData) rotatedData.readyStatus = false;
  if (promotedData) promotedData.readyStatus = false;

  // Notify players
  io.to(rotatedPlayer).emit('movedToQueue', {
    roomID,
    queuePosition: room.waitingQueue.length
  });
  io.to(promotedPlayer).emit('promotedToActive', {
    roomID,
    playerNumber: room.activePlayers.length
  });
};

// Room configuration
const updateRoomSettings = (socket, roomID, settings, io) => {
  const rid = normalizeRoomID(roomID);
  const room = rooms.get(rid);

  if (!room) return;

  // Only allow first player or room creator to modify settings
  if (room.activePlayers[0] !== socket.id) {
    socket.emit("err", {
      message: "Chỉ người tạo phòng mới có thể thay đổi cài đặt",
      code: "NOT_AUTHORIZED"
    });
    return;
  }

  // Update settings
  Object.assign(room.settings, settings);
  updateLastActivity(rid);

  emitToRoom(io, rid, 'settingsUpdated', {
    settings: room.settings
  });
  emitRoomStatus(io, rid);
};

// Cleanup and utility functions
const cleanupOldRooms = (io, maxAge = 30 * 60 * 1000) => {
  const now = Date.now();
  const roomsToDelete = [];

  for (const [roomID, room] of rooms.entries()) {
    if (now - room.lastActivity > maxAge && isRoomEmpty(room)) {
      roomsToDelete.push(roomID);
    }
  }

  roomsToDelete.forEach(roomID => {
    rooms.delete(roomID);
  });

  if (roomsToDelete.length > 0) {
    io.emit("room-list", getActiveRooms());
  }
};

const getRoomList = () => Array.from(rooms.keys());

const getRoomData = () => Object.fromEntries(rooms.entries());

const getRoomCount = () => rooms.size;

const getActiveRooms = () => {
  const active = [];
  for (const [roomID, room] of rooms.entries()) {
    if (!isRoomEmpty(room)) {
      active.push({
        roomID,
        activePlayers: room.activePlayers.length,
        maxPlayers: room.settings.maxPlayers,
        queueLength: room.waitingQueue.length,
        gameInProgress: room.gameState.inProgress,
        round: room.gameState.round
      });
    }
  }
  return active;
};

module.exports = {
  createRoom,
  joinRoom,
  exitRoom,
  cleanupRoomsOnDisconnect,
  playerReady,
  playerClicked,
  handlePlayerChoice,
  updateRoomSettings,
  cleanupOldRooms,
  getRoomList,
  getRoomData,
  getRoomCount,
  getActiveRooms
};