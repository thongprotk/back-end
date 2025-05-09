let rooms = {};

const createRoom = (socket, roomID, io) => {
  socket.join(roomID);
  if (!rooms[roomID]) {
    rooms[roomID] = { player1: socket.id, player2: null };
    socket.emit("playersConnected", { roomID, player1: true });
    io.emit("room-list", Object.keys(rooms));
    socket.emit("room-created", roomID);
    socket.emit("waiting_for_player", rooms[roomID]);
  } else if (!rooms[roomID].player2) {
    rooms[roomID].player2 = socket.id;
    socket.emit("playersConnected", { roomID, player1: false });
    io.to(rooms[roomID].player1).emit("playersConnected", {
      roomID,
      player1: true,
    });

    // Game ready
    [rooms[roomID].player1, rooms[roomID].player2].forEach((id) => {
      io.to(id).emit("gameReady", { roomID, ...rooms[roomID] });
    });
  } else {
    socket.emit("err", { message: "Phòng đã tồn tại" });
  }
};

const joinRoom = (socket, roomID, io) => {
  socket.join(roomID);
  if (!rooms[roomID]) {
    rooms[roomID] = { player1: socket.id, player2: null };
    socket.emit("playersConnected", { roomID, player1: true });
  } else if (!rooms[roomID].player2) {
    rooms[roomID].player2 = socket.id;
    socket.emit("playersConnected", { roomID, player1: false });
    io.to(rooms[roomID].player1).emit("playersConnected", {
      roomID,
      player1: true,
    });

    [rooms[roomID].player1, rooms[roomID].player2].forEach((id) => {
      io.to(id).emit("gameReady", { roomID, ...rooms[roomID] });
    });
  }
};
const exitRoom = (socket, roomID, io) => {
  if (!rooms[roomID]) return;
  if (rooms[roomID].player1) {
    // socket.to(roomID).emit("player-left", {
    //   roomID,
    //   remainingPlayer: rooms[roomID].player2,
    //   message: `Người chơi đã rời đi. Đợi người chơi khác tham gia!`,
    // });
    rooms[roomID].player1 = null;
    socket.leave(roomID);
  } else if (rooms[roomID].player2) {
    rooms[roomID].player2 = null;
    socket.leave(roomID);
  }
  // If both players are null, delete the room
  if (!rooms[roomID].player1 && !rooms[roomID].player2) {
    delete rooms[roomID];
  }

  // Thông báo cho client rằng đã rời khỏi phòng
  io.emit("room-list", Object.keys(rooms || {}));
};
// const cleanupRoomsOnDisconnect = (socketID, io) => {
//   for (const roomID in rooms) {
//     if (rooms[roomID].player1 === socketID) {
//       rooms[roomID].player1 = null;
//       io.to(roomID).emit("player-left", {
//         roomID,
//         remainingPlayer: rooms[roomID].player2,
//         message: `Người chơi đã rời đi. Đợi người chơi khác tham gia!`,
//       });
//     } else if (rooms[roomID].player2 === socketID) {
//       rooms[roomID].player2 = null;
//       io.to(roomID).emit("player-left", {
//         roomID,
//         remainingPlayer: rooms[roomID].player1,
//         message: `Người chơi đã rời đi. Đợi người chơi khác tham gia!`,
//       });
//     }

//     // Xóa phòng nếu không còn ai
//     if (!rooms[roomID].player1 && !rooms[roomID].player2) {
//       delete rooms[roomID];
//       io.emit("room-list", Object.keys(rooms));
//     }
//   }
// };

const getRoomList = () => Object.keys(rooms);
const getRoomData = () => rooms;

module.exports = {
  createRoom,
  joinRoom,
  exitRoom,
  // cleanupRoomsOnDisconnect,
  getRoomList,
  getRoomData,
};
