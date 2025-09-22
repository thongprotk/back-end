const Game = require("../models/GameModel");
const { determineWinner, FIGHT_OPTION } = require("../services/detemineWinner");

const normalizeResult = (r) => {
  if (!r && r !== 0) return null;
  const s = String(r).toLowerCase();
  if (s === "win" || s === "man win" || s === "player1" || s === "1") return "win";
  if (s === "lose" || s === "opponent win" || s === "player2" || s === "2") return "lose";
  if (s === "draw" || s === "tie") return "draw";
  return null;
};

const saveGameResult = async (roomID, player, result, io, socket) => {
  try {
    const canonical = normalizeResult(result);
    if (!canonical) {
      console.log("Bỏ qua lưu kết quả game: giá trị result không hợp lệ hoặc thiếu:", result);
      return;
    }

    const game = new Game({ roomID: String(roomID), player: String(player), result: canonical });
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
