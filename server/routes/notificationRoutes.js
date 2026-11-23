const express = require("express");

const {
  list,
  unreadCount,
  markRead,
  markAllRead
} = require("../controllers/notificationController");

const { authenticateToken } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(authenticateToken);

router.get("/", list);
router.get("/unread-count", unreadCount);
router.post("/read-all", markAllRead);
router.patch("/:id/read", markRead);

module.exports = router;