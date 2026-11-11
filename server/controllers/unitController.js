
const pool = require("../config/db");
const crypto = require("crypto");

const createUnit = async (req, res) => {
  const client = await pool.connect();

  try {
    const { match_id, hospital_id } = req.body;

    await client.query("BEGIN");

    const matchResult = await client.query(
      `SELECT m.*, d.donor_id
       FROM matches m
       JOIN donors d ON d.donor_id = m.donor_id
       WHERE m.match_id = $1
       FOR UPDATE`,
      [match_id]
    );

    if (!matchResult.rowCount ||
        matchResult.rows[0].status !== "confirmed") {
      await client.query("ROLLBACK");

      return res.status(400).json({
        message: "A confirmed match is required"
      });
    }

    const match = matchResult.rows[0];

    const trackingCode =
      "UNIT-" + crypto.randomBytes(8).toString("hex").toUpperCase();

    const result = await client.query(
      `INSERT INTO blood_units
       (match_id, donor_id, hospital_id,
        collection_date, status, tracking_code)
       VALUES ($1, $2, $3, CURRENT_DATE, 'collected', $4)
       RETURNING *`,
      [
        match_id,
        match.donor_id,
        hospital_id,
        trackingCode
      ]
    );

    await client.query(
      `INSERT INTO accountability_logs
       (unit_id, hospital_id, staff_id, action, notes)
       VALUES ($1, $2, $3, 'collected', $4)`,
      [
        result.rows[0].unit_id,
        hospital_id,
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

    console.error(error);

    res.status(500).json({
      message: "Could not create blood unit"
    });

  } finally {
    client.release();
  }
};

const updateUnitStatus = async (req, res) => {
  const client = await pool.connect();

  try {
    const { unit_id } = req.params;
    const { status, notes } = req.body;

    const allowedTransitions = {
      collected: ["received", "flagged"],
      received: ["used", "flagged"],
      used: [],
      flagged: []
    };

    await client.query("BEGIN");

    const result = await client.query(
      `SELECT * FROM blood_units
       WHERE unit_id = $1
       FOR UPDATE`,
      [unit_id]
    );

    if (!result.rowCount) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        message: "Unit not found"
      });
    }

    const unit = result.rows[0];

    if (!allowedTransitions[unit.status]?.includes(status)) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        message: "Invalid status transition"
      });
    }

    if (unit.hospital_id !== req.user.hospital_id) {
      await client.query("ROLLBACK");

      return res.status(403).json({
        message: "Hospital access mismatch"
      });
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
      [
        unit_id,
        unit.hospital_id,
        req.user.user_id,
        status,
        notes || null
      ]
    );

    await client.query("COMMIT");

    res.json({
      message: "Unit status updated",
      status
    });

  } catch (error) {
    await client.query("ROLLBACK");

    console.error(error);

    res.status(500).json({
      message: "Could not update unit"
    });

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
       WHERE tracking_code = $1`,
      [code]
    );

    if (!result.rowCount) {
      return res.status(404).json({
        message: "Tracking code not found"
      });
    }

    res.json(result.rows[0]);

  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Tracking lookup failed"
    });
  }
};

module.exports = {
  createUnit,
  updateUnitStatus,
  getUnitByTrackingCode
};
