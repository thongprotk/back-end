const express = require("express");
const router = express.Router();
const passport = require("passport");
const AuthController = require("../controllers/authController");

// Local login
router.post("/api/login", AuthController.login);

// Đăng ký (tạo tài khoản)
router.post("/api/register", AuthController.register);

// Đăng xuất
router.post("/api/logout", AuthController.logout);

// Lấy thông tin profile từ session
router.get("/api/profile", AuthController.getProfile);

// Trình duyệt gọi route này để chuyển đến Google
router.get(
  "/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
  })
);

// Google redirect về đây sau khi xác thực
router.get(
  "/google/redirect",
  passport.authenticate("google", {
    failureRedirect: "/api/login-fail",
    session: true,
  }),
  AuthController.google
);

// Route lỗi khi login fail (local hoặc google)
router.get("/api/login-fail", (req, res) => {
  res.status(401).json({ error: "Login failed" });
});
module.exports = router;
