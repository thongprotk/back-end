const RoomController = require("./roomController");
const GameController = require("./gameController");
const Game = require("../models/GameModel");

const setupSocket = (io) => {
  const rooms = RoomController.getRoomData();

  io.on("connection", (socket) => {
    socket.on("getWinList", async () => {
      try {
        const winners = await Game.find();
        socket.emit("winList", winners);
      } catch (error) {
        console.error("Lỗi khi gửi danh sách người thắng:", error);
      }
    });

    const _id = socket.id;
    socket.emit("connection", "connected");
    socket.emit("room-list", RoomController.getRoomList());

    socket.on("createRoom", (roomID) =>
      RoomController.createRoom(socket, roomID, io)
    );
    socket.on("joinRoom", (roomID) =>
      RoomController.joinRoom(socket, roomID, io)
    );
    socket.on("exitGame", ({ roomID }) => {
      RoomController.exitRoom(socket, roomID, io);
    });

    socket.on("p1Choice", (data) => {
      if (!data || !rooms[data.roomID]) return;
      rooms[data.roomID].firstPlayerChoice = data.rpsChoice;
      checkChoicesAndAnnounce(data.roomID, io);
    });

    socket.on("p2Choice", (data) => {
      if (!data || !rooms[data.roomID]) return;
      rooms[data.roomID].secondPlayerChoice = data.rpsChoice;
      checkChoicesAndAnnounce(data.roomID, io);
    });

    socket.on("playerClicked", (data) => {
      const room = rooms[data.roomID];
      if (room) {
        room.firstPlayerChoice = null;
        room.secondPlayerChoice = null;
        socket.emit("playAgain", { ...room });
      }
    });

    socket.on("resultGame", async (data) => {
      const { roomID, player, result } = data;
      await GameController.saveGameResult(roomID, player, result, io, socket);
    });

    // socket.on("disconnect", () => {
    //   RoomController.cleanupRoomsOnDisconnect(_id, io);
    //   console.log(`User disconnected: ${_id}`);
    // });
  });
};

function checkChoicesAndAnnounce(roomID, io) {
  const room = RoomController.getRoomData()[roomID];
  if (room.firstPlayerChoice && room.secondPlayerChoice) {
    io.emit("bothChoicesMade", {
      roomID,
      p1Choice: room.firstPlayerChoice,
      p2Choice: room.secondPlayerChoice,
    });

    const winner = GameController.determineWinner(
      room.firstPlayerChoice,
      room.secondPlayerChoice
    );

    io.emit("winner", { roomID, winner });

    room.firstPlayerChoice = null;
    room.secondPlayerChoice = null;
  }
}

module.exports = setupSocket;
