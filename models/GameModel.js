const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const gameSchema = new Schema(
  {
    roomID: String,
    player: String,
    result: { type: String, enum: ["win", "lose", "draw"], required: true },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

const Game = mongoose.model("Game", gameSchema);

module.exports = Game;
