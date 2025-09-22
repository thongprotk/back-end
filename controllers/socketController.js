const RoomController = require("./roomController");
const GameController = require("./gameController");
const Game = require("../models/GameModel");


const roomLocks = new Map();
function lockRoom(roomID, fn) {
  const key = String(roomID);
  const prev = roomLocks.get(key) || Promise.resolve();
  const next = prev.then(() => Promise.resolve().then(fn).catch((e) => {
    console.error("Lỗi trong lockRoom:", e);
  }));
  roomLocks.set(key, next);
  next.finally(() => {
    if (roomLocks.get(key) === next) roomLocks.delete(key);
  });
  return next;
}

const setupSocket = (io) => {

  io.on("connection", (socket) => {
    socket.on("getWinList", async () => {
      try {
        const winners = await Game.find().sort({ createdAt: -1 }).limit(10);
        socket.emit("winList", winners);
      } catch (error) {
        console.error("Lỗi khi gửi danh sách người thắng:", error);
      }
    });

    const _id = socket.id;
    socket.emit("connection", "connected");

    // Send initial room list with proper structure
    const activeRooms = RoomController.getActiveRooms();
    socket.emit("room-list", activeRooms);

    socket.on("createRoom", (roomID) =>
      RoomController.createRoom(socket, roomID, io)
    );
    socket.on("joinRoom", (roomID) =>
      RoomController.joinRoom(socket, roomID, io)
    );
    socket.on("exitRoom", (roomID) => {
      RoomController.exitRoom(socket, roomID, io);
    });

    socket.on("exitGame", ({ roomID }) => {
      RoomController.exitRoom(socket, roomID, io);
    });

    // Player ready toggle
    socket.on("playerReady", (roomID) => {
      const rid = String(roomID);
      lockRoom(rid, () => {
        RoomController.playerReady(socket, rid, io);
      });
    });

    // Player choice (unified for both players)
    socket.on("playerChoice", (data) => {
      if (!data || data.roomID === undefined) return;
      const rid = String(data.roomID);
      lockRoom(rid, () => {
        RoomController.handlePlayerChoice(socket, rid, data.choice, io);
      });
    });

    socket.on("p1Choice", (data) => {
      if (!data || data.roomID === undefined) return;
      const rid = String(data.roomID);
      lockRoom(rid, async () => {
        await RoomController.handlePlayerChoice(socket, rid, data.rpsChoice, io);
      });
    });

    socket.on("p2Choice", (data) => {
      if (!data || data.roomID === undefined) return;
      const rid = String(data.roomID);
      lockRoom(rid, async () => {
        await RoomController.handlePlayerChoice(socket, rid, data.rpsChoice, io);
      });
    });
    socket.on("playerClicked", (data) => {
      if (!data || data.roomID === null) return;
      const rid = String(data.roomID);
      lockRoom(rid, async () => {
        await RoomController.playerClicked(socket, rid, io);

      });
    });

    socket.on("resultGame", async (data) => {
      const { roomID, player, result } = data;
      await GameController.saveGameResult(String(roomID), player, result, io, socket);
    });

    socket.on("disconnect", () => {
      RoomController.cleanupRoomsOnDisconnect(_id, io);
    });
  });
};

function checkChoicesAndAnnounce(roomID, io) {
  return lockRoom(roomID, () => {
    const room = RoomController.getRoomData()[roomID];
    if (room.firstPlayerChoice != null && room.secondPlayerChoice != null) {
      io.to(roomID).emit("bothChoicesMade", {
        roomID: roomID,
        p1Choice: room.firstPlayerChoice,
        p2Choice: room.secondPlayerChoice,
      });
      try {
        const winner = GameController.determineWinner ? GameController.determineWinner(
          room.firstPlayerChoice,
          room.secondPlayerChoice
        ) : null;
        if (winner === null) throw new Error("Invalid choices for determining winner");
        if (winner != null)
          io.to(roomID).emit("winner", { roomID, winner });
      } catch (error) {
        console.error("Error determining winner:", error);
      }
      room.firstPlayerChoice = null;
      room.secondPlayerChoice = null;
    }
  });
}

module.exports = setupSocket;
