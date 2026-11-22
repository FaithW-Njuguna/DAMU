async function notify(db, userId, message) {
  if (!userId) return;

  await db.query(
    `INSERT INTO notifications (user_id, message, channel, status)
     VALUES ($1, $2, 'in_app', 'delivered')`,
    [userId, message]
  );
}

module.exports = { notify };