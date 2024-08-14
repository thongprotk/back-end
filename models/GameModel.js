const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const gameSchema = new Schema({
  room: String,
  player: String,
  opponent: String,
  player1Choice: String,
  player2Choice: String,
  result: String,
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const Game = mongoose.model("Game", gameSchema);

module.exports=Game;
