const pool = require("../config/db");
const { isUUID, parseCoords } = require("../utils/validate");
const { notify } = require("../services/notificationService");

const fail = (res, status, message) => res.status(status).json({ message });

const VALID_BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

const createDonorProfile = async (req, res) => {
  try {
    const { blood_type } = req.body;
    const location =
      typeof req.body.location === "string" ? req.body.location.trim() : "";

    if (!VALID_BLOOD_TYPES.includes(blood_type)) {
      return fail(res, 400, "Invalid blood group");
    }

    if (location.length < 2 || location.length > 100) {
      return fail(res, 400, "Location is required");
    }

    const coords = parseCoords(req.body);

    if (coords.error) {
      return fail(res, 400, coords.error);
    }

    const result = await pool.query(
      `INSERT INTO donors
       (user_id, blood_type, location, latitude, longitude)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        req.user.user_id,
        blood_type,
        location,
        coords.latitude,
        coords.longitude
      ]
    );

    res.status(201).json({
      message: "Donor profile created",
      donor: result.rows[0]
    });

  } catch (error) {
    if (error.code === "23505") {
      return fail(res, 409, "You already have a donor profile");
    }

    console.error(error);
    fail(res, 500, "Could not create donor profile");
  }
};

const updateAvailability = async (req, res) => {
  try {
    const { availability_status } = req.body;

    const allowed = [
      "available",
      "unavailable",
      "recently_donated"
    ];

    if (!allowed.includes(availability_status)) {
      return fail(res, 400, "Invalid availability status");
    }

    const result = await pool.query(
      `UPDATE donors
       SET availability_status = $1
       WHERE user_id = $2
       RETURNING *`,
      [availability_status, req.user.user_id]
    );

    if (!result.rowCount) {
      return fail(res, 404, "Donor profile not found");
    }

    res.json({
      message: "Availability updated",
      donor: result.rows[0]
    });

  } catch (error) {
    console.error(error);
    fail(res, 500, "Update failed");
  }
};

// Lets a donor correct their area, or refresh their coordinates after moving.
const updateLocation = async (req, res) => {
  try {
    const location =
      typeof req.body.location === "string" ? req.body.location.trim() : "";

    if (location.length < 2 || location.length > 100) {
      return fail(res, 400, "Location is required");
    }

    const coords = parseCoords(req.body);

    if (coords.error) {
      return fail(res, 400, coords.error);
    }

    const result = await pool.query(
      `UPDATE donors
       SET location = $1, latitude = $2, longitude = $3
       WHERE user_id = $4
       RETURNING *`,
      [location, coords.latitude, coords.longitude, req.user.user_id]
    );

    if (!result.rowCount) {
      return fail(res, 404, "Donor profile not found");
    }

    res.json({
      message: "Location updated",
      donor: result.rows[0]
    });

  } catch (error) {
    console.error(error);
    fail(res, 500, "Update failed");
  }
};

const isRealDate = (value) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value;

// A donor reports that they gave blood for a request they confirmed. The
// requester or the hospital then confirms it, and that confirmation starts
// the donor's 56-day rest.
const logDonation = async (req, res) => {
  const { match_id, donation_date } = req.body;

  if (!isUUID(match_id)) {
    return fail(res, 400, "Choose the request you donated for");
  }

  if (donation_date !== undefined && !isRealDate(donation_date)) {
    return fail(res, 400, "Enter the donation date as YYYY-MM-DD");
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query(
      `SELECT m.match_id, m.status, m.donor_reported_at,
              m.response_at::date AS responded_on,
              (m.response_at::date)::text AS responded_text,
              d.donor_id, d.user_id AS donor_user_id,
              r.requester_id, r.hospital_id, r.blood_type,
              EXISTS (SELECT 1 FROM blood_units u WHERE u.match_id = m.match_id) AS unit_logged
       FROM matches m
       JOIN donors d ON d.donor_id = m.donor_id
       JOIN blood_requests r ON r.request_id = m.request_id
       WHERE m.match_id = $1
       FOR UPDATE OF m`,
      [match_id]
    );

    const match = result.rows[0];

    if (!match || match.donor_user_id !== req.user.user_id) {
      await client.query("ROLLBACK");
      return fail(res, 404, "Request not found");
    }

    if (match.status !== "confirmed") {
      await client.query("ROLLBACK");
      return fail(res, 409, "You can only report a donation for a request you confirmed");
    }

    if (match.donor_reported_at || match.unit_logged) {
      await client.query("ROLLBACK");
      return fail(res, 409, "This donation has already been reported");
    }

    const dateCheck = await client.query(
      `SELECT
         COALESCE($1::date, CURRENT_DATE) AS chosen,
         COALESCE($1::date, CURRENT_DATE) <= CURRENT_DATE AS not_future,
         COALESCE($1::date, CURRENT_DATE) >= CURRENT_DATE - 30 AS recent,
         COALESCE($1::date, CURRENT_DATE) >= $2::date AS after_confirming,
         to_char(COALESCE($1::date, CURRENT_DATE), 'YYYY-MM-DD') AS chosen_text`,
      [donation_date || null, match.responded_text]
    );

    const check = dateCheck.rows[0];

    if (!check.not_future) {
      await client.query("ROLLBACK");
      return fail(res, 400, "The donation date can't be in the future");
    }

    if (!check.recent) {
      await client.query("ROLLBACK");
      return fail(res, 400, "You can only report a donation made in the last 30 days");
    }

    if (!check.after_confirming) {
      await client.query("ROLLBACK");
      return fail(res, 400, "The donation date can't be before the day you confirmed this request");
    }

    await client.query(
      `UPDATE matches
       SET donation_date = $2::date, donor_reported_at = NOW()
       WHERE match_id = $1`,
      [match_id, check.chosen_text]
    );

    // A reversible precaution: the donor stops being matched right away. The
    // strict 56-day rule starts once someone confirms the donation.
    await client.query(
      `UPDATE donors SET availability_status = 'recently_donated'
       WHERE donor_id = $1`,
      [match.donor_id]
    );

    await notify(
      client,
      match.requester_id,
      `A donor reports donating for your ${match.blood_type} request. Please confirm it once the blood has been received.`
    );

    if (match.hospital_id) {
      const staff = await client.query(
        `SELECT user_id FROM users
         WHERE hospital_id = $1 AND role = 'hospital' AND is_active`,
        [match.hospital_id]
      );

      for (const person of staff.rows) {
        await notify(
          client,
          person.user_id,
          `A donor reports donating for a ${match.blood_type} request. Confirm it on Unit tracking.`
        );
      }
    }

    await client.query("COMMIT");

    res.json({
      message: "Donation reported. Thank you! It will count once the hospital or requester confirms it.",
      donation_date: check.chosen_text
    });

  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    fail(res, 500, "Could not report the donation");

  } finally {
    client.release();
  }
};

module.exports = {
  createDonorProfile,
  updateAvailability,
  updateLocation,
  logDonation
};