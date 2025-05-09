const ProfileController = require("../controllers/profileController");
const authCheck = (req, res, next) => {
  if (!req.user) {
    res.redirect("/api/login");
  } else {
    next();
  }
};
const router = require("express").Router();

router.get("/", authCheck, ProfileController.profile);

module.exports = router;
