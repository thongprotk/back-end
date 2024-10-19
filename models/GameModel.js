const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const gameSchema = new Schema({
  room: String,
  player: String,
  playerChoice: String,
  opponentChoice: String,
  result: String,
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const Game = mongoose.model("Game", gameSchema);

module.exports = Game;
