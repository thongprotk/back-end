const User = require("../models/UserModel");
const bcrypt = require("bcrypt");
const keys = require("../config/keys");
const jwt = require("jsonwebtoken");

const AuthController = {
  // Đăng ký
  async register(req, res) {
    try {
      const { username, email, password } = req.body;

      // Check email hoặc username tồn tại chưa
      const existingUser = await User.findOne({
        $or: [{ email }, { username }],
      });
      if (existingUser) {
        return res
          .status(400)
          .json({ message: "Email hoặc username đã tồn tại" });
      }

      // Hash mật khẩu
      const hashedPassword = await bcrypt.hash(password, 10);

      const user = new User({
        username,
        email,
        password: hashedPassword,
        authProvider: "local",
      });
      await user.save();

      // Tự login sau khi đăng ký thành công (nếu muốn)
      req.login(user, (err) => {
        if (err) {
          return res
            .status(500)
            .json({ message: "Login failed after register" });
        }
        return res.status(201).json({ message: "Đăng ký thành công" });
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Đăng ký thất bại" });
    }
  },

  async login(req, res) {
    try {
      const { username, password } = req.body;
      const cleanedUsername = username.trim();
      // Kiểm tra xem người dùng có tồn tại không
      const user = await User.findOne({ username: cleanedUsername });
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      // So sánh mật khẩu người dùng nhập vào với mật khẩu đã được hash trong cơ sở dữ liệu
      bcrypt.compare(password, user.password, (err, isMatch) => {
        if (err) {
          return res
            .status(500)
            .json({ message: "Login failed due to server error" });
        }

        if (!isMatch) {
          return res.status(401).json({ message: "Incorrect password" });
        }

        // Tạo access token (JWT) cho người dùng
        const accessToken = jwt.sign(
          { id: user._id, username: user.username, email: user.email },
          keys.session.cookieKey, // Secret key dùng để ký token
          { expiresIn: "15m" } // Thời gian hết hạn của access token
        );

        // Tạo refresh token và lưu vào cookie
        const refreshToken = jwt.sign(
          { id: user._id },
          keys.session.jwtRefreshSecret, // Secret key cho refresh token
          { expiresIn: "7d" } // Thời gian hết hạn của refresh token (7 ngày)
        );

        // Lưu refresh token vào cookie (httpOnly giúp ngăn chặn các cuộc tấn công XSS)
        res.cookie("refresh_token", refreshToken, {
          httpOnly: true,
          secure: false, // Set to true nếu sử dụng HTTPS
          sameSite: "Lax", // Cài đặt SameSite giúp bảo vệ cookie khỏi CSRF
          maxAge: 7 * 24 * 60 * 60 * 1000, // Thời gian sống của refresh token (7 ngày)
        });

        // Trả về access token cho phía client (sử dụng cho các API yêu cầu xác thực)
        return res.json({
          message: "Login successful",
          access_token: accessToken,
        });
      });
    } catch (err) {
      console.error(err);
      return res
        .status(500)
        .json({ message: "Login failed due to server error" });
    }
  },
  // Logout
  logout(req, res, next) {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  },

  // Lấy profile user nếu đã login
  getProfile(req, res) {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
      return res.status(401).json({ message: "Chưa đăng nhập" });
    }
    res.json(req.user);
  },

  // Xử lý sau khi login Google thành công
  // google(req, res) {
  //   if (!req.user) {
  //     return res.status(401).json({ message: "Authentication failed" });
  //   }
  //   const userInfo = encodeURIComponent(JSON.stringify(req.user));
  //   res.redirect(`http://localhost:5173/profile?user=${userInfo}`);
  // },
  google(req, res) {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication failed" });
    }

    const user = req.user;

    // Tạo access token
    const accessToken = jwt.sign(
      { id: user._id, email: user.email, username: user.username },
      keys.session.cookieKey,
      { expiresIn: "15m" }
    );

    // Tạo refresh token và lưu vào cookie
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

    res.json({
      access_token: accessToken,
    });
  },
};

module.exports = AuthController;
