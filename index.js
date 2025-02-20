const express = require("express");
const { Server } = require("socket.io");
// import { createServer } from "http";
const db = require("./db.js");
const Game = require("./models/GameModel.js");
// const Room = require("./models/RoomModel.js");
const app = express();
const cors = require("cors");
// const server = createServer();
const io = new Server(3000, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
  },
});

db.connectToDB();
app.use(cors());

let room = {};

io.on("connection", (socket) => {
  const _id = socket.id;
  io.to(_id).emit("connection", "connected");
  console.log(`user connected: ${_id}`);
  socket.emit("room-list", Object.keys(room));
  socket.on("createRoom", (roomID) => {
    if (!room[roomID]) {
      room[roomID] = { player1: socket.id, player2: null };

      // Gửi sự kiện cho player1 biết họ là player1
      socket.emit("playersConnected", { roomID, player1: true });
      // Gửi thông tin phòng mới cho tất cả client
      io.emit("room-list", Object.keys(room));
      socket.emit("room-created", roomID);
      socket.emit("waiting_for_player", room[roomID]); // Gửi thông báo đợi người chơi khác
    } else if (!room[roomID].player2) {
      // Nếu phòng đã có player1, gán người chơi này là player2
      room[roomID].player2 = socket.id;

      // Gửi sự kiện cho player2 biết họ là player2
      socket.emit("playersConnected", { roomID, player1: false });

      // Gửi thông báo cho cả player1 rằng player2 đã tham gia
      socket
        .to(room[roomID].player1)
        .emit("playersConnected", { roomID, player1: true });
    } else {
      socket.emit("err", { message: "Phòng đã tồn tại" });
      return;
    }
  });
  socket.on("joinRoom", (roomID) => {
    socket.join(roomID);
    if (!room[roomID]) {
      room[roomID] = { player1: socket.id, player2: null };

      // Gửi sự kiện cho player1 biết họ là player1
      socket.emit("playersConnected", { roomID, player1: true });
    } else if (!room[roomID].player2) {
      // Nếu phòng đã có player1, gán người chơi này là player2
      room[roomID].player2 = socket.id;

      // Gửi sự kiện cho player2 biết họ là player2
      socket.emit("playersConnected", { roomID, player1: false });

      // Gửi thông báo cho cả player1 rằng player2 đã tham gia
      socket
        .to(room[roomID].player1)
        .emit("playersConnected", { roomID, player1: true });
    } else if (
      room[roomID] &&
      !!room[roomID].player1 &&
      !!room[roomID].player2
    ) {
      socket.emit("gameReady", {
        roomID,
        player1: room[roomID].player1,
        player2: room[roomID].player2,
      });
    }
  });

  socket.on("p1Choice", (data) => {
    if (!data || !data.roomID || !room[data.roomID]) return;
    console.log("p1 choice");
    if (data) {
      const choice = data.rpsChoice;
      const roomID = data.roomID;
      if (!room[roomID]) {
        room[roomID] = {
          firstPlayerChoice: choice, // hoặc các thuộc tính khác nếu cần
        };
      } else {
        room[roomID].firstPlayerChoice = choice;
      }
      console.log(room);

      if (
        !!room[roomID].firstPlayerChoice &&
        !!room[roomID].secondPlayerChoice
      ) {
        io.sockets.emit("bothChoicesMade", {
          roomID: roomID,
          p1Choice: room[roomID].firstPlayerChoice,
          p2Choice: room[roomID].secondPlayerChoice,
        });
        determineWinnerChoice(roomID);
        room[roomID].firstPlayerChoice = null;
        room[roomID].secondPlayerChoice = null;
      }
    }
  });

  socket.on("p2Choice", (data) => {
    console.log("p2choice");
    if (data) {
      const choice = data.rpsChoice;
      const roomID = data.roomID;
      if (!room[roomID]) {
        room[roomID] = {
          secondPlayerChoice: choice, // hoặc các thuộc tính khác nếu cần
        };
      } else {
        room[roomID].secondPlayerChoice = choice;
      }
      console.log("room", room);
      if (
        !!room[roomID].firstPlayerChoice &&
        !!room[roomID].secondPlayerChoice
      ) {
        io.sockets.emit("bothChoicesMade", {
          roomID: roomID,
          p1Choice: room[roomID].firstPlayerChoice,
          p2Choice: room[roomID].secondPlayerChoice,
        });
        determineWinnerChoice(roomID);
        room[roomID].firstPlayerChoice = null;
        room[roomID].secondPlayerChoice = null;
      }
    }
  });

  socket.on("playerClicked", (data) => {
    const roomID = data.roomID;
    socket.emit("playAgain", {
      firstPlayerChoice: (room[roomID].firstPlayerChoice = null),
      secondPlayerChoice: (room[roomID].secondPlayerChoice = null),
    });
  });

  socket.on("exitGame", (data) => {
    const roomID = data.roomID;
    socket.leave(roomID);
    if (room[roomID]) {
      // Xoá người chơi khỏi phòng
      if (room[roomID].player1 === socket.id) {
        room[roomID].player1 = null;
      } else if (room[roomID].player2 === socket.id) {
        room[roomID].player2 = null;
      }

      // If both players are null, delete the room
      if (!room[roomID].player1 && !room[roomID].player2) {
        delete room[roomID];
      } else {
        io.to(roomID).emit("player-left", {
          roomID,
          remainingPlayer: room[roomID],
          message: "Người chơi đã rời đi. Đợi người chơi khác tham gia!",
        });
      }

      // Thông báo cho client rằng đã rời khỏi phòng
      io.emit("room-list", Object.keys(room));
    }
  });
  socket.on("resultGame", async (data) => {
    console.log("kkk", data);
    try {
      const { roomID, player, result } = data;
      const game = new Game({
        roomID: roomID,
        player: player,
        result: result,
      });
      await game.save();
      const winners = await Game.find({ result: "win" });
      io.emit("winList", winners);
      console.log(winners);
    } catch (err) {
      console.log("loi,.....");
    }
  });

  socket.on("disconnect", () => {
    console.log(`User disconnected: ${_id}`);

    // Clean up room data when a player disconnects
    for (const roomID in room) {
      if (room[roomID].player1 === _id) {
        room[roomID].player1 = null;
      } else if (room[roomID].player2 === _id) {
        room[roomID].player2 = null;
      }

      if (!room[roomID].player1 && !room[roomID].player2) {
        delete room[roomID];
      }

      io.emit("room-list", Object.keys(room));
    }
  });
});
const FIGHT_OPTION = {
  KEO: 1,
  BUA: 2,
  BAO: 3,
};

const determineWinnerChoice = (roomID) => {
  if (!room[roomID]) return;
  let winner;
  if (room[roomID].firstPlayerChoice == room[roomID].secondPlayerChoice) {
    winner = "draw";
  } else if (room[roomID].firstPlayerChoice == FIGHT_OPTION.BUA) {
    if (room[roomID].secondPlayerChoice == FIGHT_OPTION.BAO) {
      winner = "2";
    } else {
      winner = "1";
    }
  } else if (room[roomID].firstPlayerChoice == FIGHT_OPTION.KEO) {
    if (room[roomID].secondPlayerChoice == FIGHT_OPTION.BUA) {
      winner = "2";
    } else {
      winner = "1";
    }
  } else if (room[roomID].firstPlayerChoice == FIGHT_OPTION.BAO) {
    if (room[roomID].secondPlayerChoice == FIGHT_OPTION.KEO) {
      winner = "2";
    } else {
      winner = "1";
    }
  }
  if (roomID) {
    io.sockets.emit("winner", { roomID, winner });
    // console.log(
    //   "Emitted winner to room:",
    //   room[roomID],
    //   "with winner:",
    //   winner
    // );
    // Lưu kết quả vào database
  }
};

// server.listen(3000, async () => {
//   console.log("run");
// });
