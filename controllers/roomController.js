let rooms = new Map();

// Import the proper determineWinner from service
const { determineWinner: serviceWinner } = require("../services/detemineWinner");

const createRoomState = () => ({
  players: new Map(), // socketId -> {readyStatus: boolean, choice: null, playerNumber: 1|2|null}
  activePlayers: [], // Array of socketIds currently in game
  playerSlots: [null, null], // [player1SocketId, player2SocketId] - maintain positions
  waitingQueue: [], // Queue of players waiting to play
  reservedSlots: new Map(), // socketId -> { timeoutId, reservedUntil }
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
    reserved: room.reservedSlots.size > 0, // Thêm flag để client biết có slot reserved
    players: Array.from(room.players.entries()).map(([id, data]) => ({
      id,
      ready: data.readyStatus,
      isActive: room.activePlayers.includes(id),
      inQueue: room.waitingQueue.includes(id),
      playerNumber: data.playerNumber || null // Include playerNumber from backend
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
        joinedAt: Date.now(),
        playerNumber: 1
      });
      newRoom.activePlayers.push(socket.id);
      newRoom.playerSlots[0] = socket.id;

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
      // Create new room directly here instead of calling createRoom
      const newRoom = createRoomState();

      // Add joiner as first active player
      newRoom.players.set(socket.id, {
        readyStatus: false,
        choice: null,
        joinedAt: Date.now(),
        playerNumber: 1
      });
      newRoom.activePlayers.push(socket.id);
      newRoom.playerSlots[0] = socket.id;

      rooms.set(rid, newRoom);

      socket.emit("playerJoined", {
        roomID: rid,
        position: 'active',
        playerNumber: 1
      });

      emitRoomStatus(io, rid);
      io.emit("room-list", getActiveRooms());
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
  try {
    const room = rooms.get(roomID);
    updateLastActivity(roomID);

    console.log(`[DEBUG] joinExistingRoom - socketId: ${socket.id}, roomID: ${roomID}`);
    console.log(`[DEBUG] Room state - players:`, Array.from(room.players.keys()));
    console.log(`[DEBUG] Room state - activePlayers:`, room.activePlayers);
    console.log(`[DEBUG] Room state - playerSlots:`, room.playerSlots);
    console.log(`[DEBUG] Room state - waitingQueue:`, room.waitingQueue);
    console.log(`[DEBUG] Room state - reservedSlots:`, Array.from(room.reservedSlots.keys()));

    // Check if player already in room
    if (room.players.has(socket.id)) {
      console.log(`[DEBUG] Player ${socket.id} already in room - reconnecting`);
      // Player reconnecting - clear any reserved slot for this player
      if (room.reservedSlots.has(socket.id)) {
        const { timeoutId } = room.reservedSlots.get(socket.id);
        clearTimeout(timeoutId);
        room.reservedSlots.delete(socket.id);
      }

      const playerData = room.players.get(socket.id);
      socket.emit("playerReconnected", {
        roomID,
        position: getPlayerPosition(room, socket.id)
      });
      emitRoomStatus(io, roomID);
      return;
    }

    // Determine where to place the new player
    console.log(`[DEBUG] Determining player placement - activePlayers: ${room.activePlayers.length}/${room.settings.maxPlayers}, gameInProgress: ${room.gameState.inProgress}`);

    if (room.activePlayers.length < room.settings.maxPlayers && !room.gameState.inProgress) {
      console.log(`[DEBUG] Path: Adding as active player`);

      // RACE CONDITION FIX: Double-check after adding player to prevent overshooting maxPlayers
      if (room.activePlayers.length >= room.settings.maxPlayers) {
        console.log(`[DEBUG] Room became full during processing - adding to queue instead`);
        // Room became full while we were processing, add to queue
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
        console.log(`[DEBUG] Successfully added ${socket.id} to queue at position ${room.waitingQueue.length}`);
      } else {
        // Check for expired reserved slots and clean them up
        const now = Date.now();
        let hasValidReservation = false;

        for (const [reservedSocketId, reservation] of room.reservedSlots.entries()) {
          if (now > reservation.reservedUntil) {
            console.log(`[DEBUG] Cleaning expired reserved slot for ${reservedSocketId}`);
            clearTimeout(reservation.timeoutId);
            room.reservedSlots.delete(reservedSocketId);
          } else {
            hasValidReservation = true;
          }
        }

        // Only block if there are still valid reservations
        if (hasValidReservation) {
          console.log(`[DEBUG] SLOT_RESERVED detected - valid reservations count: ${room.reservedSlots.size}`);
          console.log(`[DEBUG] Reserved slots details:`, Array.from(room.reservedSlots.entries()));
          socket.emit("err", {
            message: "Slot đang được giữ, vui lòng chờ giây lát",
            code: "SLOT_RESERVED",
            roomID
          });
          return;
        }

        // Add as active player
        console.log(`[DEBUG] Successfully adding ${socket.id} as active player`);

        // Find available player slot (1 or 2)
        let playerNumber = 1;
        if (room.playerSlots[0] === null) {
          playerNumber = 1;
          room.playerSlots[0] = socket.id;
        } else if (room.playerSlots[1] === null) {
          playerNumber = 2;
          room.playerSlots[1] = socket.id;
        }

        room.players.set(socket.id, {
          readyStatus: false,
          choice: null,
          joinedAt: Date.now(),
          playerNumber: playerNumber
        });
        room.activePlayers.push(socket.id);

        socket.emit("playerJoined", {
          roomID,
          position: 'active',
          playerNumber: playerNumber
        });

        // Check if we can start the game
        if (room.activePlayers.length === room.settings.maxPlayers) {
          emitToActivePlayers(io, room, roomID, "gameReady", {
            players: room.activePlayers
          });
        }
      }

    } else {
      // Add to waiting queue
      console.log(`[DEBUG] Path: Adding to queue - activePlayers: ${room.activePlayers.length}/${room.settings.maxPlayers}, gameInProgress: ${room.gameState.inProgress}`);
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
      console.log(`[DEBUG] Successfully added ${socket.id} to queue at position ${room.waitingQueue.length}`);
    }

    console.log(`[DEBUG] Final room state - players: ${Array.from(room.players.keys())}, activePlayers: ${room.activePlayers}, waitingQueue: ${room.waitingQueue}`);
    console.log(`[DEBUG] Player details:`, Array.from(room.players.entries()).map(([id, data]) => ({ id, playerNumber: data.playerNumber, ready: data.readyStatus })));
    emitRoomStatus(io, roomID);

    // Auto-ready logic: If room has played games before and existing player was ready, set them ready again
    if (room.activePlayers.length >= 2 && !room.gameState.inProgress && room.gameState.round > 0) {
      console.log(`[DEBUG] Room has game history (round ${room.gameState.round}), applying auto-ready logic`);

      // Find existing player (not the one who just joined)
      const existingPlayerId = room.activePlayers.find(id => id !== socket.id);
      if (existingPlayerId) {
        const existingPlayer = room.players.get(existingPlayerId);
        if (existingPlayer) {
          console.log(`[DEBUG] Setting existing player ${existingPlayerId.substr(-4)} to ready=true (game history)`);
          existingPlayer.readyStatus = true;
        }
      }

      // Re-emit room status with updated ready states
      emitRoomStatus(io, roomID);
    }

    // Check if all active players are ready after new join (including auto-ready)
    if (room.activePlayers.length >= 2 && !room.gameState.inProgress) {
      const allReady = room.activePlayers.every(playerId => {
        const pData = room.players.get(playerId);
        return pData && pData.readyStatus;
      });

      console.log(`[DEBUG] After new join - allReady: ${allReady}, activePlayers: ${room.activePlayers.length}`);

      if (allReady) {
        console.log(`[DEBUG] All players ready after new join - starting game`);
        startNewRound(room, roomID, io);
      }
    }

  } catch (error) {
    console.error(`[ERROR] Exception in joinExistingRoom for ${socket.id}:`, error);
    socket.emit("err", {
      message: "Lỗi tham gia phòng",
      code: "JOIN_ERROR",
      roomID
    });
  }
};

const getPlayerPosition = (room, socketId) => {
  if (room.activePlayers.includes(socketId)) return 'active';
  if (room.waitingQueue.includes(socketId)) return 'queue';
  return 'unknown';
};

// Reorganize player slots to fill gaps (move player2 to slot1 if slot1 is empty)
const reorganizePlayerSlots = (room, roomID, io) => {
  // If slot[0] is empty but slot[1] has a player, move player from slot[1] to slot[0]
  if (room.playerSlots[0] === null && room.playerSlots[1] !== null) {
    const player2Id = room.playerSlots[1];
    const playerData = room.players.get(player2Id);

    if (playerData) {
      console.log(`[DEBUG] Reorganizing: Moving player ${player2Id} from slot[1] to slot[0]`);
      // Move player from slot[1] to slot[0]
      room.playerSlots[0] = player2Id;
      room.playerSlots[1] = null;
      playerData.playerNumber = 1;

      // Notify the reorganized player of their new position
      io.to(player2Id).emit("playerJoined", {
        roomID,
        position: 'active',
        playerNumber: 1
      });

      // Emit room status to sync all clients
      emitRoomStatus(io, roomID);

      return true; // Indicates reorganization occurred
    }
  }
  return false; // No reorganization needed
};

// Enhanced exit room
const exitRoom = (socket, roomID, io) => {
  const rid = normalizeRoomID(roomID);

  if (!rooms.has(rid)) return;

  const room = rooms.get(rid);

  try {
    const playerData = room.players.get(socket.id);
    if (!playerData) return;

    // Clear player slot based on playerNumber
    if (playerData && playerData.playerNumber) {
      room.playerSlots[playerData.playerNumber - 1] = null;
    }

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

    // Reorganize player slots - move remaining players to fill gaps
    const wasReorganized = reorganizePlayerSlots(room, rid, io);

    // Chỉ reserve khi có lý do (có người chờ hoặc game đang chơi)
    const shouldReserve = room.waitingQueue.length > 0 || room.gameState.inProgress;

    if (room.activePlayers.length < room.settings.maxPlayers && shouldReserve) {
      const reservedUntil = Date.now() + 10000; // 10 giây grace period
      const timeoutId = setTimeout(() => {
        room.reservedSlots.delete(socket.id);
        fillActivePlayerSlots(room, rid, io); // Sau timeout, fill slot
        emitRoomStatus(io, rid);
        io.emit("room-list", getActiveRooms());
      }, 10000);
      room.reservedSlots.set(socket.id, { timeoutId, reservedUntil });
    } else if (room.activePlayers.length < room.settings.maxPlayers) {
      // Không reserve, fill slot ngay lập tức
      fillActivePlayerSlots(room, rid, io);
    }

    // Emit updated status (always emit after reorganization or any changes)
    emitRoomStatus(io, rid);
    emitToRoom(io, rid, "playerLeft", {
      socketId: socket.id,
      playerData
    });

    // Clean up empty rooms
    if (isRoomEmpty(room)) {
      // Clear any reserved timeouts
      room.reservedSlots.forEach(({ timeoutId }) => clearTimeout(timeoutId));
      room.reservedSlots.clear();
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
  let promoted = false;

  // Fill active player slots from queue - prioritize empty slots
  while (room.activePlayers.length < room.settings.maxPlayers && room.waitingQueue.length > 0) {
    const nextPlayerId = room.waitingQueue.shift();

    if (room.players.has(nextPlayerId)) {
      // Find available player slot
      let playerNumber = 1;
      if (room.playerSlots[0] === null) {
        playerNumber = 1;
        room.playerSlots[0] = nextPlayerId;
      } else if (room.playerSlots[1] === null) {
        playerNumber = 2;
        room.playerSlots[1] = nextPlayerId;
      }

      room.activePlayers.push(nextPlayerId);
      const playerData = room.players.get(nextPlayerId);
      // DON'T reset ready status when promoting from queue - preserve user's ready state
      playerData.playerNumber = playerNumber;

      io.to(nextPlayerId).emit("promotedToActive", {
        roomID,
        playerNumber: playerNumber
      });

      promoted = true;
    }
  }

  // CRITICAL: Always emit room status after any promotion to sync all clients
  if (promoted) {
    emitRoomStatus(io, roomID);

    // Check if all active players are ready after promotion
    const allReady = room.activePlayers.every(playerId => {
      const pData = room.players.get(playerId);
      return pData && pData.readyStatus;
    });

    console.log(`[DEBUG] After promotion - allReady: ${allReady}, activePlayers: ${room.activePlayers.length}`);

    // If all are ready and room is full, start game immediately
    if (allReady && room.activePlayers.length >= 2 && !room.gameState.inProgress) {
      console.log(`[DEBUG] All players ready after promotion - starting game`);
      startNewRound(room, roomID, io);
    } else if (room.activePlayers.length === room.settings.maxPlayers && !room.gameState.inProgress) {
      // If room is full but not all ready, emit gameReady
      emitToActivePlayers(io, room, roomID, "gameReady", {
        players: room.activePlayers
      });
    }
  }
};

// Enhanced disconnect cleanup
const cleanupRoomsOnDisconnect = (socketID, io) => {
  try {
    for (const [roomID, room] of rooms.entries()) {
      if (!room.players.has(socketID)) continue;

      const playerData = room.players.get(socketID);

      // Clear player slot based on playerNumber
      if (playerData && playerData.playerNumber) {
        room.playerSlots[playerData.playerNumber - 1] = null;
      }

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

      // Reorganize player slots after disconnect
      const wasReorganized = reorganizePlayerSlots(room, roomID, io);

      // Chỉ reserve disconnect nếu có lý do
      const shouldReserve = room.waitingQueue.length > 0 || room.gameState.inProgress;

      if (room.activePlayers.length < room.settings.maxPlayers && shouldReserve) {
        const reservedUntil = Date.now() + 10000;
        const timeoutId = setTimeout(() => {
          room.reservedSlots.delete(socketID);
          fillActivePlayerSlots(room, roomID, io);
          emitRoomStatus(io, roomID);
          io.emit("room-list", getActiveRooms());
        }, 10000);
        room.reservedSlots.set(socketID, { timeoutId, reservedUntil });
      } else if (room.activePlayers.length < room.settings.maxPlayers) {
        // Không reserve, fill slot ngay
        fillActivePlayerSlots(room, roomID, io);
      }

      // Try to fill slots and notify room
      emitRoomStatus(io, roomID);
      emitToRoom(io, roomID, "playerDisconnected", {
        socketId: socketID
      });

      // Clean up empty room
      if (isRoomEmpty(room)) {
        room.reservedSlots.forEach(({ timeoutId }) => clearTimeout(timeoutId));
        room.reservedSlots.clear();
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
  const wasReady = playerData.readyStatus;
  playerData.readyStatus = !playerData.readyStatus;
  updateLastActivity(rid);

  console.log(`[DEBUG] Player ${socket.id} toggled ready from ${wasReady} to ${playerData.readyStatus}`);

  // Check if all active players are ready
  const readyStates = room.activePlayers.map(playerId => {
    const pData = room.players.get(playerId);
    return { playerId: playerId.substr(-4), ready: pData ? pData.readyStatus : false };
  });

  const allReady = room.activePlayers.every(playerId => {
    const pData = room.players.get(playerId);
    return pData && pData.readyStatus;
  });

  console.log(`[DEBUG] Ready states:`, readyStates);
  console.log(`[DEBUG] All ready: ${allReady}, Active players: ${room.activePlayers.length}`);

  emitRoomStatus(io, rid);

  if (allReady && room.activePlayers.length >= 2) {
    console.log(`[DEBUG] 🚀 Starting new round - all players ready!`);
    startNewRound(room, rid, io);
  } else {
    console.log(`[DEBUG] ⏳ Waiting for more players or readiness...`);
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

  // CRITICAL FIX: Emit room status FIRST before gameStarted to sync state
  emitRoomStatus(io, roomID);

  // Small delay to ensure room status is processed first
  setTimeout(() => {
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
  }, 10); // Very small delay to ensure proper event order
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
        round: room.gameState.round,
        reserved: room.reservedSlots.size > 0 // Thêm để client hiển thị
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