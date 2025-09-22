require("dotenv").config();
const express = require("express");
const app = express();
const session = require("express-session");
const MongoStore = require("connect-mongo");
const passport = require("passport");
require("./config/passport-setup");

const { Server } = require("socket.io");
const { createServer } = require("http");
const db = require("./config/db.js");
require("./models/GameModel.js");
// const Room = require("./models/RoomModel.js");
const setupSocket = require("./controllers/socketController");
const cors = require("cors");
const Router = require("./routes");

const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
  },
});
db.connectToDB();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "secret-key",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGO_URI,
    }),
    cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 },
  })
);

app.use(passport.initialize());
app.use(passport.session());

Router(app);
setupSocket(io);

server.listen(3000, async () => {
  console.log("run server at port 3000");
});
