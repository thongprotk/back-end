const User = require("../models/UserModel");
const bcrypt = require("bcrypt");
const keys = require("../config/keys");
const jwt = require("jsonwebtoken");

const AuthController = {
  async register(req, res) {
    try {
      const { username, email, password } = req.body;

      const existingUser = await User.findOne({
        $or: [{ email }, { username }],
      });
      if (existingUser) {
        return res.status(400).json({ message: "Email hoặc username đã tồn tại" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const user = new User({
        username,
        email,
        password: hashedPassword,
        authProvider: "local",
      });
      await user.save();

      // Tạo JWT token và trả về ngay sau khi đăng ký thành công
      const accessToken = jwt.sign(
        { id: user._id, username: user.username, email: user.email },
        keys.session.cookieKey,
        { expiresIn: "15m" }
      );

      const refreshToken = jwt.sign(
        { id: user._id },
        keys.session.jwtRefreshSecret,
        { expiresIn: "7d" }
      );

      res.cookie("refresh_token", refreshToken, {
        httpOnly: true,
        secure: false,
        sameSite: "Lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      return res.status(201).json({
        message: "Đăng ký thành công",
        access_token: accessToken,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Đăng ký thất bại" });
    }
  },

  async login(req, res) {
    try {
      const { username, password } = req.body;
      const cleanedUsername = username;
      const user = await User.findOne({ username: cleanedUsername });

      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(401).json({ message: "Incorrect password" });
      }

      const accessToken = jwt.sign(
        { id: user._id, username: user.username, email: user.email },
        keys.session.cookieKey,
        { expiresIn: "15m" }
      );

      const refreshToken = jwt.sign(
        { id: user._id },
        keys.session.jwtRefreshSecret,
        { expiresIn: "7d" }
      );

      res.cookie("refresh_token", refreshToken, {
        httpOnly: true,
        secure: false,
        sameSite: "Lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      return res.json({
        message: "Login successful",
        access_token: accessToken,
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Login failed due to server error" });
    }
  },

  logout(req, res, next) {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  },

  getProfile(req, res) {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
      return res.status(401).json({ message: "Chưa đăng nhập" });
    }
    res.json(req.user);
  },

  google(req, res) {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication failed" });
    }

    const user = req.user;
    const accessToken = jwt.sign(
      { id: user._id, email: user.email, username: user.username },
      keys.session.cookieKey,
      { expiresIn: "15m" }
    );

    const refreshToken = jwt.sign(
      { id: user._id },
      keys.session.jwtRefreshSecret,
      { expiresIn: "7d" }
    );

    res.cookie("refresh_token", refreshToken, {
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.json({ access_token: accessToken, message: "Login with Google successful" });
  },
};

module.exports = AuthController;

