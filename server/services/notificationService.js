const pool = require("../config/db");
const sendSMS = require("./smsService");
const { toInternational } = require("../utils/phone");

const MAX_ATTEMPTS = 3;

async function notify(db, userId, message, { sms = false } = {}) {
  if (!userId) return;

  await db.query(
    `INSERT INTO notifications (user_id, message, channel, status)
     VALUES ($1, $2, 'in_app', 'delivered')`,
    [userId, message]
  );

  if (sms && sendSMS.smsEnabled()) {
    await db.query(
      `INSERT INTO notifications (user_id, message, channel, status)
       VALUES ($1, $2, 'sms', 'pending')`,
      [userId, message]
    );
  }
}

async function flushSms() {
  if (!sendSMS.smsEnabled()) {
    return 0;
  }

  const claimed = await pool.query(
    `UPDATE notifications n
     SET status = 'sending', attempts = n.attempts + 1
     FROM users u
     WHERE u.user_id = n.user_id
       AND n.channel = 'sms'
       AND n.status IN ('pending', 'failed')
       AND n.attempts < $1
     RETURNING n.notification_id, n.message, u.phone_number`,
    [MAX_ATTEMPTS]
  );

  let sent = 0;

  for (const row of claimed.rows) {
    try {
      const to = toInternational(row.phone_number);

      if (!to) {
        throw new Error("Phone number is not valid for SMS");
      }

      await sendSMS(to, row.message);

      await pool.query(
        "UPDATE notifications SET status = 'sent' WHERE notification_id = $1",
        [row.notification_id]
      );

      sent += 1;

    } catch (error) {
      console.error("SMS failed:", error.message);

      await pool.query(
        "UPDATE notifications SET status = 'failed' WHERE notification_id = $1",
        [row.notification_id]
      );
    }
  }

  return sent;
}

function flushSmsInBackground() {
  flushSms().catch((error) =>
    console.error("SMS flush error:", error.message)
  );
}

module.exports = { notify, flushSms, flushSmsInBackground };