const pool = require("../config/db");
const { isUUID } = require("../utils/validate");

const {
  notify,
  flushSmsInBackground
} = require("../services/notificationService");

const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const SEVERITIES = ["low", "critical"];
const AUDIENCES = ["donors", "public", "both"];

const ALERT_HOURS = 48;        // an alert lapses on its own after this long
const MAX_ALERTS_PER_DAY = 5;  // per hospital, so alerts stay meaningful
const MAX_DONORS_ALERTED = 500;

const fail = (res, status, message) => res.status(status).json({ message });

// A verified hospital tells donors and/or the public that it is short of a
// blood group. Donors get an in-app notification, and an SMS too when the
// alert is critical and SMS is switched on.
const createAlert = async (req, res) => {
  const { blood_type, severity, audience } = req.body;
  const message =
    typeof req.body.message === "string" ? req.body.message.trim() : "";

  if (!BLOOD_TYPES.includes(blood_type)) {
    return fail(res, 400, "Choose the blood group you are short of");
  }

  if (!SEVERITIES.includes(severity)) {
    return fail(res, 400, "Choose how urgent the shortage is");
  }

  if (!AUDIENCES.includes(audience)) {
    return fail(res, 400, "Choose who to alert");
  }

  if (message.length > 200) {
    return fail(res, 400, "Keep the message under 200 characters");
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // An alert that ran out of time no longer blocks a new one.
    await client.query(
      `UPDATE shortage_alerts
       SET status = 'resolved', resolved_at = NOW()
       WHERE hospital_id = $1 AND blood_type = $2
         AND status = 'active' AND expires_at <= NOW()`,
      [req.user.hospital_id, blood_type]
    );

    const recent = await client.query(
      `SELECT COUNT(*)::int AS n FROM shortage_alerts
       WHERE hospital_id = $1 AND created_at > NOW() - INTERVAL '24 hours'`,
      [req.user.hospital_id]
    );

    if (recent.rows[0].n >= MAX_ALERTS_PER_DAY) {
      await client.query("ROLLBACK");
      return fail(
        res,
        429,
        `Your hospital has already sent ${MAX_ALERTS_PER_DAY} alerts in the last 24 hours. Please try again later.`
      );
    }

    const inserted = await client.query(
      `INSERT INTO shortage_alerts
       (hospital_id, created_by, blood_type, severity, audience, message, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW() + $7::int * INTERVAL '1 hour')
       RETURNING *`,
      [
        req.user.hospital_id,
        req.user.user_id,
        blood_type,
        severity,
        audience,
        message || null,
        ALERT_HOURS
      ]
    );

    const alert = inserted.rows[0];
    let notified = 0;

    if (audience === "donors" || audience === "both") {
      const hospital = await client.query(
        "SELECT name FROM hospitals WHERE hospital_id = $1",
        [req.user.hospital_id]
      );

      // Donors of exactly this group who are available and past their 56-day rest.
      const donors = await client.query(
        `SELECT d.user_id
         FROM donors d
         JOIN users u ON u.user_id = d.user_id
         WHERE d.blood_type = $1
           AND d.availability_status = 'available'
           AND (d.last_donation_date IS NULL
                OR d.last_donation_date <= CURRENT_DATE - 56)
           AND u.is_active
         ORDER BY d.last_donation_date NULLS FIRST
         LIMIT $2`,
        [blood_type, MAX_DONORS_ALERTED]
      );

      const text =
        `${severity === "critical" ? "URGENT: " : ""}${hospital.rows[0].name} needs ${blood_type} blood donors` +
        (message ? `: ${message}` : ". Please donate if you can.") +
        " Open DAMU to respond.";

      for (const donor of donors.rows) {
        await notify(client, donor.user_id, text, { sms: severity === "critical" });
      }

      notified = donors.rowCount;

      await client.query(
        "UPDATE shortage_alerts SET donors_notified = $1 WHERE alert_id = $2",
        [notified, alert.alert_id]
      );
    }

    await client.query("COMMIT");
    flushSmsInBackground();

    res.status(201).json({
      message: "Alert sent",
      alert: { ...alert, donors_notified: notified },
      donors_notified: notified
    });

  } catch (error) {
    await client.query("ROLLBACK");

    // uq_active_alert: this hospital already has an active alert for the group.
    if (error.code === "23505") {
      return fail(
        res,
        409,
        `You already have an active alert for ${blood_type}. Resolve it first, or wait for it to lapse.`
      );
    }

    console.error(error);
    fail(res, 500, "Could not send the alert");

  } finally {
    client.release();
  }
};

// The hospital's own recent alerts, newest first.
const listMyAlerts = async (req, res) => {
  const result = await pool.query(
    `SELECT alert_id, blood_type, severity, audience, message, status,
            donors_notified, created_at, expires_at, resolved_at,
            (status = 'active' AND expires_at > NOW()) AS is_active
     FROM shortage_alerts
     WHERE hospital_id = $1
     ORDER BY created_at DESC
     LIMIT 30`,
    [req.user.hospital_id]
  );

  res.json({ alerts: result.rows });
};

// The shortage is over: stop showing the alert.
const resolveAlert = async (req, res) => {
  if (!isUUID(req.params.id)) {
    return fail(res, 400, "Invalid alert");
  }

  const result = await pool.query(
    `UPDATE shortage_alerts
     SET status = 'resolved', resolved_at = NOW()
     WHERE alert_id = $1 AND hospital_id = $2 AND status = 'active'
     RETURNING alert_id`,
    [req.params.id, req.user.hospital_id]
  );

  if (!result.rowCount) {
    return fail(res, 404, "Active alert not found");
  }

  res.json({ message: "Alert resolved" });
};

// Public. Only alerts meant for the public, still in date, from a verified hospital.
const listPublicAlerts = async (req, res) => {
  const result = await pool.query(
    `SELECT a.alert_id, a.blood_type, a.severity, a.message,
            a.created_at, a.expires_at,
            h.name AS hospital_name, h.location AS hospital_location
     FROM shortage_alerts a
     JOIN hospitals h ON h.hospital_id = a.hospital_id
     WHERE a.status = 'active'
       AND a.expires_at > NOW()
       AND a.audience IN ('public', 'both')
       AND h.verified
     ORDER BY (a.severity = 'critical') DESC, a.created_at DESC
     LIMIT 20`
  );

  res.json({ alerts: result.rows });
};

module.exports = {
  createAlert,
  listMyAlerts,
  resolveAlert,
  listPublicAlerts
};