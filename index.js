const express = require("express");
const { Server } = require("socket.io");
// import { createServer } from "http";
// const db = require("./db.js");
// const Game = require("./models/GameModel.js");
// const Room = require("./models/RoomModel.js");
const app = express();
const cors = require("cors");
// const server = createServer();
const io = new Server(3000, {
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

  socket.on("createRoom", (roomID) => {
    room[roomID] = { firstPlayerChoice: null, firstPlayerResult: null };

    socket.join(room[roomID]);

    console.log(`room ${roomID} created by ${_id}`);

    socket.to(roomID).emit("playersConnected", { roomID: roomID });
  });
  socket.on("joinRoom", (roomID) => {
    // const roomSize = io.sockets.adapter.rooms.get(roomID).size;
    // if (roomSize >= 2) {
    //   return socket.emit("roomFull");
    // }
    // if (io.sockets.adapter.r√ooms.has(roomID)) {
    socket.join(roomID);
    room[roomID] = { secondPlayerChoice: null };

    socket.to(roomID).emit("playersConnected", { roomID });
    console.log(`room id: ${roomID}`);
    return socket.emit("playersConnected", { roomID });
    // }
  });

  socket.on("p1Choice", (data) => {
    if (data) {
      const choice = data.rpsChoice;
      const roomID = data.roomID;

      room[roomID].firstPlayerChoice = choice;
      socket.to(roomID).emit("p1Choice", {
        rpsValue: choice,
        score: room[roomID].firstPlayerResult,
      });
      if (room[roomID].secondPlayerChoice) {
        return determineWinnerChoice(roomID);
      }
    }
  });
  socket.on("p2Choice", (data) => {
    if (data) {
      const choice = data.rpsChoice;
      const roomID = data.roomID;

      room[roomID].secondPlayerChoice = choice;
      socket.to(roomID).emit("p2Choice", {
        rpsValue: choice,
        score: room[roomID].secondPlayerResult,
      });
      if (room[roomID].firstPlayerChoice) {
        return determineWinnerChoice(roomID);
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
      winner = " p2";
    } else {
      winner = "p1";
    }
  } else if (room[roomID].firstPlayerChoice == FIGHT_OPTION.KEO) {
    if (room[roomID].secondPlayerChoice == FIGHT_OPTION.BUA) {
      winner = "p2";
    } else {
      winner = "p1";
    }
  } else if (room[roomID].firstPlayerChoice == FIGHT_OPTION.BAO) {
    if (room[roomID].secondPlayerChoice == FIGHT_OPTION.KEO) {
      winner = "p2";
    } else {
      winner = "p1";
    }
  }
  return io.sockets.to(roomID).emit("winner", winner);
};

// server.listen(3000, async () => {
//   console.log("run");
// });
