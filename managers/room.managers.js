const rooms = {};

function createRoom(roomID, socket) {
  if (!rooms[roomID]) {
    rooms[roomID] = { player1: socket.id, player2: null };
    return { success: true, isNew: true };
  }
  return { success: false, message: "Phòng đã tồn tại hoặc đầy." };
}

function joinRoom(roomID, socket) {
  const room = rooms[roomID];
  if (room && !room.player2) {
    room.player2 = socket.id;
    return { success: true, room };
  }
  return { success: false, message: "Không thể tham gia phòng." };
}

function leaveRoom(roomID, socketId) {
  if (rooms[roomID]) {
    if (rooms[roomID].player1 === socketId) rooms[roomID].player1 = null;
    else if (rooms[roomID].player2 === socketId) rooms[roomID].player2 = null;

    if (!rooms[roomID].player1 && !rooms[roomID].player2) {
      delete rooms[roomID];
    }
  }
}

function getRoom(roomID) {
  return rooms[roomID];
}

function getRoomList() {
  return Object.keys(rooms);
}

function setChoice(roomID, player, choice) {
  const room = rooms[roomID];
  if (player === 1) room.firstPlayerChoice = choice;
  else if (player === 2) room.secondPlayerChoice = choice;
}

function resetChoices(roomID) {
  if (rooms[roomID]) {
    rooms[roomID].firstPlayerChoice = null;
    rooms[roomID].secondPlayerChoice = null;
  }
}

module.exports = {
  createRoom,
  joinRoom,
  leaveRoom,
  getRoom,
  getRoomList,
  setChoice,
  resetChoices,
};
