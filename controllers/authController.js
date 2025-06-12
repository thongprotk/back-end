const User = require("../models/UserModel");
const bcrypt = require("bcrypt");
const keys = require("../config/keys");
const jwt = require("jsonwebtoken");
const axios = require("axios");
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

  async google(req, res) {
    try {
      const { code, redirectUri } = req.query;

      // Nếu không có code, tạo và trả về Google OAuth URL
      if (!code) {
        const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
          `client_id=${keys.google.clientID}&` +
          `redirect_uri=${encodeURIComponent(redirectUri || 'http://localhost:3000/auth')}&` +
          `response_type=code&` +
          `scope=profile email&` +
          `access_type=offline&` +
          `prompt=consent`;

        return res.status(200).json({
          _url: googleAuthUrl
        });
      }

      // Nếu có code, xử lý để lấy access token
      const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
        client_id: keys.google.clientID,
        client_secret: keys.google.clientSecret,
        code: code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri || 'http://localhost:3000/auth'
      });

      const googleAccessToken = tokenResponse.data.access_token;

      const userResponse = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: {
          Authorization: `Bearer ${googleAccessToken}`
        }
      });

      const googleUser = userResponse.data;

      let user = await User.findOne({ email: googleUser.email });

      if (!user) {
        // Tạo user mới
        user = new User({
          username: googleUser.name,
          email: googleUser.email,
          googleId: googleUser.id,
          avatar: googleUser.picture,
          isVerified: true
        });
        await user.save();
      } else {
        // Cập nhật thông tin Google nếu user đã tồn tại
        user.googleId = googleUser.id;
        user.avatar = googleUser.picture;
        await user.save();
      }

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

      // Set refresh token cookie
      res.cookie("refresh_token", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: "Lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      // Trả về theo format giống client code ví dụ
      return res.status(200).json({
        data: {
          access_token: accessToken
        }
      });

    } catch (error) {
      console.error('Google OAuth Error:', error);
      console.error('Error response:', error.response?.data);
      console.error('Error status:', error.response?.status);

      return res.status(500).json({
        message: "Google authentication failed",
        error: error.response?.data || error.message,
        details: {
          status: error.response?.status,
          data: error.response?.data
        }
      });
    }
  }
};


module.exports = AuthController;

