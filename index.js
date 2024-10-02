const express = require("express");
const { Server } = require("socket.io");
// import { createServer } from "http";
// const db = require("./db.js");
// const Game = require("./models/GameModel.js");
// const Room = require("./models/RoomModel.js");
const app = express();
const cors = require("cors");
// const server = createServer();
const io = new Server(5000, {
  cors: {
    origin: "*",
  },
});

// db.connectToDB();
app.use(cors());

let room = {};
let roomID = "121";

io.on("connection", (socket) => {
  const _id = socket.id;
  io.to(_id).emit("connection", "connected");
  console.log(`user connected: ${_id}`);

  // socket.on("createRoom", (roomID) => {
  //   room[roomID] = { firstPlayerChoice: null, firstPlayerResult: null };

  //   socket.join(room[roomID]);

  //   console.log(`room ${roomID} created by ${_id}`);

  //   socket.to(roomID).emit("playersConnected", { roomID: roomID });
  // });

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
    }
    // console.log("room", room);
    // socket.to(roomID).emit("playersConnected", { roomID, player1: !player1 });

    // return socket.emit("playersConnected", { roomID, player1: !player1 });
    // // }
  });

  socket.on("p1Choice", (data) => {
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
      // socket.to(roomID).emit("p1Choice", {
      //   rpsValue: choice,
      //   score: room[roomID].firstPlayerResult,
      // });
      console.log(room);

      if (
        !!room[roomID].firstPlayerChoice &&
        !!room[roomID].secondPlayerChoice
      ) {
        determineWinnerChoice(roomID);
      }
    }
  });

  socket.on("p2Choice", (data) => {
    console.log("p2choice");
    if (data) {
      const choice = data.rpsChoice;
      const roomID = data.roomID;

      room[roomID].secondPlayerChoice = choice;
      // socket.to(roomID).emit("p2Choice", {
      //   rpsValue: choice,
      //   score: room[roomID].secondPlayerResult,
      // });
      console.log("room", room);
      if (
        !!room[roomID].firstPlayerChoice &&
        !!room[roomID].secondPlayerChoice
      ) {
        determineWinnerChoice(roomID);
      }
    }
  });

  socket.on("playerClicked", (data) => {
    const roomID = data.roomID;
    room[roomID].firstPlayerChoice = null;
    return socket.to(roomID).emit("playAgain");
  });

  socket.on("exitGame", (data) => {
    const roomID = data.roomID;
    if (data.player) {
      socket.to(roomID).emit("play1Left");
    } else {
      socket.to(roomID).emit("play2Left");
    }
    return socket.leave(roomID);
  });
  socket.on("disconnect", () => {
    console.log("client disconnect");
  });
});
const FIGHT_OPTION = {
  KEO: 1,
  BUA: 2,
  BAO: 3,
};

const determineWinnerChoice = (roomID) => {
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
  console.log("roomID", roomID);
  if (roomID) {
    io.sockets.emit("winner", {
      roomID,
      winner,
    });
    console.log(
      "Emitted winner to room:",
      room[roomID],
      "with winner:",
      winner
    );
  }
};

// server.listen(3000, async () => {
//   console.log("run");
// });
