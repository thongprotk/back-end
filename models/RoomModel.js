const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const roomSchema = new Schema({
  roomName: { type: String, unique: true, required: true },
  players: { type: [String], default: [] },
  status: { type: String, default: "waiting" },
  createdAt: { type: Date, default: Date.now },
});

const Room = mongoose.model("Room", roomSchema);

module.exports = Room;
