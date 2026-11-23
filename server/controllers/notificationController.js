const pool = require("../config/db");
const { isUUID } = require("../utils/validate");

const list = async (req, res) => {
  const [items, unread] = await Promise.all([
    pool.query(
      `SELECT notification_id, message, created_at, read_at
       FROM notifications
       WHERE user_id = $1 AND channel = 'in_app'
       ORDER BY created_at DESC
       LIMIT 50`,
      [req.user.user_id]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS n FROM notifications
       WHERE user_id = $1 AND channel = 'in_app' AND read_at IS NULL`,
      [req.user.user_id]
    )
  ]);

  res.json({
    notifications: items.rows,
    unread: unread.rows[0].n
  });
};

const unreadCount = async (req, res) => {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS n FROM notifications
     WHERE user_id = $1 AND channel = 'in_app' AND read_at IS NULL`,
    [req.user.user_id]
  );

  res.json({ unread: result.rows[0].n });
};

const markRead = async (req, res) => {
  if (!isUUID(req.params.id)) {
    return res.status(400).json({ message: "Invalid notification" });
  }

  const result = await pool.query(
    `UPDATE notifications
     SET read_at = COALESCE(read_at, NOW())
     WHERE notification_id = $1 AND user_id = $2 AND channel = 'in_app'
     RETURNING notification_id`,
    [req.params.id, req.user.user_id]
  );

  if (!result.rowCount) {
    return res.status(404).json({ message: "Notification not found" });
  }

  res.json({ message: "Marked as read" });
};

const markAllRead = async (req, res) => {
  await pool.query(
    `UPDATE notifications SET read_at = NOW()
     WHERE user_id = $1 AND channel = 'in_app' AND read_at IS NULL`,
    [req.user.user_id]
  );

  res.json({ message: "All notifications marked as read" });
};

module.exports = { list, unreadCount, markRead, markAllRead };