const express = require("express");
const { Server } = require("socket.io");
const http = require("http");
const db = require("./db.js");
const cors = require("cors");
const Game = require("./models/GameModel.js");
const Room = require("./models/RoomModel.js");
const app = express();

app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  serveClient: false,
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

db.connectToDB();

io.on("connection", (socket) => {
  console.log("A user connected:${socket.id}");
  socket.on("JoinRoom", async (roomName) => {
    let Room = await Room.findOne({ roomName });
    if (!roomName) {
      Room = new Room({ roomName });
      await Room.save();
    }
    socket.join(roomName);
    socket.roomName = roomName;

    if (Room.players.length < 2) {
      Room.players.push(socket.id);
      await Room.save();
    }
    if (Room.players.length === 2) {
      io.to(roomName).emit("Game Start");
    }
  });

  socket.on("sendChoice", async (choice) => {
    const roomName = socket.roomName;
    const room = await Room.findOne({ roomName });

    if (room && room.players.includes(socket.id)) {
      const opponentSocketId = room.players.find((id) => id !== socket.id);
      if (opponentSocketId) {
        const game = await Game.findOne({ room: roomName, result: null });

        if (game) {
          if (game.player1 === socket.id) {
            game.player1Choice = choice;
          } else {
            game.player2Choice = choice;
          }

          if (game.player1Choice && game.player2Choice) {
            game.result = determineWinnerChoice(
              game.player1Choice,
              game.player2Choice
            );
            await game.save();
            io.to(roomName).emit("gameResult", { game });
          } else {
            await game.save();
          }
        } else {
          const newGame = new Game({
            room: roomName,
            player1: socket.id,
            player1Choice: choice,
          });
          await newGame.save();
        }

        socket.broadcast.to(opponentSocketId).emit("receiveChoice", choice);
      }
    }
  });

  socket.on("disconnect", () => {
    console.log("A user disconnected");
  });
});

const determineWinnerChoice = (player1Choice, player2Choice) => {
  if (player1Choice === player2Choice) {
    return "draw";
  } else if (
    (player1Choice === "punch" && player2Choice === "drag") ||
    (player1Choice === "leaves" && player2Choice === "punch") ||
    (player1Choice === "drag" && player2Choice === "leaves")
  ) {
    return "player1 wins";
  } else {
    return "player2 wins";
  }
};

server.listen(3001, () => {
  console.log("run");
});
