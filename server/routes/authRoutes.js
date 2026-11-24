const express = require("express");

const {
  register,
  login,
  changePassword,
  me
} = require("../controllers/authController");

const { authenticateToken } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.post("/change-password", authenticateToken, changePassword);
router.get("/me", authenticateToken, me);

module.exports = router;