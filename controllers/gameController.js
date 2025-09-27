const Game = require("../models/GameModel");
const { determineWinner, FIGHT_OPTION } = require("../services/detemineWinner");

const saveGameResult = async (roomID, player, result, io, socket) => {
  try {

    if (!roomID || !player || !result) {
      return;
    }
    const game = new Game({ roomID, player, result });
    await game.save();

    const winners = await Game.find({}).sort({ createdAt: -1 }).limit(10).lean();
    io.emit("winList", winners);
  } catch (error) {
    console.log("Lỗi lưu kết quả game:", error);
  }
};

module.exports = {
  saveGameResult,
  FIGHT_OPTION,
  determineWinner,
};
