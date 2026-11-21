const pool = require("../config/db");
const crypto = require("crypto");
const { isUUID } = require("../utils/validate");

const fail = (res, status, message) => res.status(status).json({ message });

// Hospital staff record that a confirmed donor's blood was collected.
// The hospital always comes from the login token, never from the request body.
const createUnit = async (req, res) => {
  const { match_id } = req.body;
  const hospitalId = req.user.hospital_id;

  if (!hospitalId) {
    return fail(res, 400, "Your account is not linked to a hospital");
  }

  if (!isUUID(match_id)) {
    return fail(res, 400, "A confirmed match is required");
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const matchResult = await client.query(
      `SELECT m.match_id, m.status, m.donor_id,
              r.hospital_id AS request_hospital_id
       FROM matches m
       JOIN blood_requests r ON r.request_id = m.request_id
       WHERE m.match_id = $1
       FOR UPDATE OF m`,
      [match_id]
    );

    const match = matchResult.rows[0];

    if (!match || match.status !== "confirmed") {
      await client.query("ROLLBACK");
      return fail(res, 400, "A confirmed match is required");
    }

    // A request addressed to one hospital can only be collected by that hospital.
    if (match.request_hospital_id && match.request_hospital_id !== hospitalId) {
      await client.query("ROLLBACK");
      return fail(res, 403, "This donor was matched to a different hospital");
    }

    const trackingCode =
      "UNIT-" + crypto.randomBytes(8).toString("hex").toUpperCase();

    const result = await client.query(
      `INSERT INTO blood_units
       (match_id, donor_id, hospital_id,
        collection_date, status, tracking_code)
       VALUES ($1, $2, $3, CURRENT_DATE, 'collected', $4)
       RETURNING *`,
      [match_id, match.donor_id, hospitalId, trackingCode]
    );

    await client.query(
      `INSERT INTO accountability_logs
       (unit_id, hospital_id, staff_id, action, notes)
       VALUES ($1, $2, $3, 'collected', $4)`,
      [
        result.rows[0].unit_id,
        hospitalId,
        req.user.user_id,
        "Unit collection recorded"
      ]
    );

    await client.query("COMMIT");

    res.status(201).json({
      message: "Blood unit created",
      unit: result.rows[0]
    });

  } catch (error) {
    await client.query("ROLLBACK");

    // uq_unit_match: this donation was already logged (for example a double click).
    if (error.code === "23505") {
      return fail(res, 409, "This donation has already been logged");
    }

    console.error(error);
    fail(res, 500, "Could not create blood unit");

  } finally {
    client.release();
  }
};

const allowedTransitions = {
  collected: ["received", "flagged"],
  received: ["used", "flagged"],
  used: [],
  flagged: []
};

const updateUnitStatus = async (req, res) => {
  const { unit_id } = req.params;
  const { status } = req.body;
  const notes =
    typeof req.body.notes === "string"
      ? req.body.notes.trim().slice(0, 1000)
      : null;

  if (!isUUID(unit_id)) {
    return fail(res, 400, "Invalid unit");
  }

  if (!Object.keys(allowedTransitions).includes(status)) {
    return fail(res, 400, "Invalid status");
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query(
      `SELECT * FROM blood_units
       WHERE unit_id = $1
       FOR UPDATE`,
      [unit_id]
    );

    if (!result.rowCount) {
      await client.query("ROLLBACK");
      return fail(res, 404, "Unit not found");
    }

    const unit = result.rows[0];

    // Check ownership first so one hospital learns nothing about another's units.
    if (unit.hospital_id !== req.user.hospital_id) {
      await client.query("ROLLBACK");
      return fail(res, 403, "Hospital access mismatch");
    }

    if (!allowedTransitions[unit.status].includes(status)) {
      await client.query("ROLLBACK");
      return fail(res, 400, "Invalid status transition");
    }

    await client.query(
      `UPDATE blood_units
       SET status = $1
       WHERE unit_id = $2`,
      [status, unit_id]
    );

    await client.query(
      `INSERT INTO accountability_logs
       (unit_id, hospital_id, staff_id, action, notes)
       VALUES ($1, $2, $3, $4, $5)`,
      [unit_id, unit.hospital_id, req.user.user_id, status, notes || null]
    );

    await client.query("COMMIT");

    res.json({
      message: "Unit status updated",
      status
    });

  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    fail(res, 500, "Could not update unit");

  } finally {
    client.release();
  }
};

const getUnitByTrackingCode = async (req, res) => {
  try {
    const { code } = req.params;

    const result = await pool.query(
      `SELECT tracking_code, status, collection_date
       FROM blood_units
       WHERE tracking_code = $1
       OR match_id IN (SELECT match_id FROM matches WHERE tracking_code = $1)`,
      [code]
    );

    if (!result.rowCount) {
      return fail(res, 404, "Tracking code not found");
    }

    res.json(result.rows[0]);

  } catch (error) {
    console.error(error);
    fail(res, 500, "Tracking lookup failed");
  }
};

module.exports = {
  createUnit,
  updateUnitStatus,
  getUnitByTrackingCode
};