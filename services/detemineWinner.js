const FIGHT_OPTION = { KEO: 1, BUA: 2, BAO: 3 };

const determineWinner = (choice1, choice2) => {
  if (choice1 === choice2) return "draw";
  if (
    (choice1 === FIGHT_OPTION.BUA && choice2 === FIGHT_OPTION.KEO) ||
    (choice1 === FIGHT_OPTION.KEO && choice2 === FIGHT_OPTION.BAO) ||
    (choice1 === FIGHT_OPTION.BAO && choice2 === FIGHT_OPTION.BUA)
  )
    return "1";
  return "2";
};
module.exports = {
  determineWinner,
  FIGHT_OPTION,
};
