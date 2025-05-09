const Game = require("../models/GameModel");
const { determineWinner, FIGHT_OPTION } = require("../services/detemineWinner");

const saveGameResult = async (roomID, player, result, io, socket) => {
  try {
    const game = new Game({ roomID, player, result });
    await game.save();

    const winners = await Game.find({ result: "win" });
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
