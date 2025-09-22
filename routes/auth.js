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
router.get("/api/google", AuthController.google);


module.exports = router;
