const express = require("express");
const { Server } = require("socket.io");
const http = require("http");
// const db = require("./db.js");
const Game = require("./models/GameModel.js");
const Room = require("./models/RoomModel.js");
const app = express();
const cors = require("cors");
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Hoặc bạn có thể chỉ định cụ thể miền nào được phép
  },
});

// db.connectToDB();

let waitingPlayer = null;
let playerChoices = {};

io.on("connection", (socket) => {
  var _id = socket.id;
  io.to(_id).emit("connection", "connected");

  socket.on("playerReady", () => {
    if (waitingPlayer) {
      const firstPlayerId = waitingPlayer.id;
      const secondPlayerId = _id;
      // gửi id về client:
      socket.emit('firstPlayerId',{id: firstPlayerId});
      socket.emit('secondPlayerId',{idVs: secondPlayerId});
 
      console.log(`Matching ${firstPlayerId} and ${secondPlayerId}`);

      io.to(firstPlayerId).emit("startGame", {
        id: firstPlayerId,
        idVs: secondPlayerId,
      });
      io.to(secondPlayerId).emit("startGame", {
        id: secondPlayerId,
        idVs: firstPlayerId,
      });

      waitingPlayer = null;
    } else {
      waitingPlayer = socket;
    }
  });
  socket.on("disconnect", () => {
    console.log("A player disconnected:", socket.id);
    if (waitingPlayer && waitingPlayer.id === socket.id) {
      waitingPlayer = null;
    }
  });
  socket.on("choices", (data) => {
    const { playerChoice } = data; // choice = data.choice
    const playerId = _id;
    playerChoices[playerId] = playerChoice;

    if (playerChoices[firstPlayerId] && playerChoices[secondPlayerId]) {
      const result = determineWinnerChoice(
        playerChoices[firstPlayerId],
        playerChoices[secondPlayerId]
      );
      optionChoice(
        determineWinnerChoice(
          playerChoices[firstPlayerId],
          playerChoices[secondPlayerId]
        )
      );

      io.to(firstPlayerId).emit("result", {
        optionChoice,
        result,
        manSelected: playerChoices[firstPlayerId],
        opponentChoice: playerChoices[secondPlayerId],
      });
      io.to(secondPlayerId).emit("result", {
        result,
        optionChoice,
        manSelected: playerChoices[secondPlayerId],
        opponentChoice: playerChoices[firstPlayerId],
      });

      playerChoices = {};
    }
  });
});

const FIGHT_OPTION = {
  KEO: 1,
  BUA: 2,
  BAO: 3,
};
const FIGHT_LIST = [
  {
    value: FIGHT_OPTION.KEO,
    label: "keo",
  },
  {
    value: FIGHT_OPTION.BUA,
    label: "bua",
  },
  {
    value: FIGHT_OPTION.BAO,
    label: "bao",
  },
];

function determineWinnerChoice(playerChoice, opponentSelected) {
  if (playerChoice === opponentSelected) {
    return "draw";
  } else if (
    (playerChoice === FIGHT_OPTION.KEO &&
      opponentSelected === FIGHT_OPTION.BAO) ||
    (playerChoice === FIGHT_OPTION.BUA &&
      opponentSelected === FIGHT_OPTION.KEO) ||
    (playerChoice === FIGHT_OPTION.BAO && opponentSelected === FIGHT_OPTION.BUA)
  ) {
    return "win";
  } else {
    return "lose";
  }
}

server.listen(3000, async () => {
  console.log("run");
});
