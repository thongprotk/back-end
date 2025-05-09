const UserRouter = require("./auth");
const ProfileRouter = require("./profile");
function route(app) {
  app.use("/auth", UserRouter);
  app.use("/profile", ProfileRouter);
}
module.exports = route;
