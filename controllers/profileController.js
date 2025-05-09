// const User = require('/models/user-model');
// const {mongooseToObject} = require('../../util/mongoose');

class ProfileController {
  profile(req, res) {
    res.render("profile", { user: req.user });
  }
}
module.exports = new ProfileController();
