const crypto = require("crypto");
const pool = require("../config/db");

const {
  getCompatibleBloodTypes,
  matchRequest
} = require("../services/matchingService");

const { notify } = require("../services/notificationService");
const { isUUID, parseCoords } = require("../utils/validate");

const URGENCIES = ["normal", "urgent", "critical"];
const MAX_UNITS = 20;
const OPEN_STATUSES = ["pending", "matching"];

const fail = (res, status, message) => res.status(status).json({ message });

const createRequest = async (req, res) => {
  const { blood_type, urgency = "normal", location } = req.body;
  const units = Number(req.body.units_required);
  const place = typeof location === "string" ? location.trim() : "";

  if (!getCompatibleBloodTypes(blood_type).length) {
    return fail(res, 400, "Invalid blood group");
  }

  if (!Number.isInteger(units) || units < 1 || units > MAX_UNITS) {
    return fail(res, 400, `Units required must be a whole number from 1 to ${MAX_UNITS}`);
  }

  if (!URGENCIES.includes(urgency)) {
    return fail(res, 400, "Invalid urgency");
  }

  if (place.length < 2 || place.length > 150) {
    return fail(res, 400, "Enter where the blood is needed");
  }

  const coords = parseCoords(req.body);
  if (coords.error) {
    return fail(res, 400, coords.error);
  }

  // Hospital staff always post for their own hospital; others may choose one.
  const hospitalId = req.user.hospital_id || req.body.hospital_id || null;

  if (hospitalId) {
    if (!isUUID(hospitalId)) {
      return fail(res, 400, "Invalid hospital");
    }

    const hospital = await pool.query(
      "SELECT 1 FROM hospitals WHERE hospital_id = $1",
      [hospitalId]
    );

    if (!hospital.rowCount) {
      return fail(res, 404, "Hospital not found");
    }
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Starts as pending. It becomes matching only if at least one donor is asked.
    const inserted = await client.query(
      `INSERT INTO blood_requests
       (requester_id, hospital_id, blood_type, units_required,
        urgency, location, latitude, longitude, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
       RETURNING *`,
      [
        req.user.user_id,
        hospitalId,
        blood_type,
        units,
        urgency,
        place,
        coords.latitude,
        coords.longitude
      ]
    );

    const request = inserted.rows[0];
    const asked = await matchRequest(client, request);

    if (asked > 0) {
      await client.query(
        "UPDATE blood_requests SET status = 'matching' WHERE request_id = $1",
        [request.request_id]
      );
    }

    await client.query("COMMIT");

    res.status(201).json({
      message: "Blood request created",
      request_id: request.request_id,
      candidates_notified: asked
    });

  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    fail(res, 500, "Could not process blood request");

  } finally {
    client.release();
  }
};

const respondToMatch = async (req, res) => {
  const { match_id } = req.params;
  const { response } = req.body;

  if (!isUUID(match_id)) {
    return fail(res, 400, "Invalid match");
  }

  if (!["confirm", "decline"].includes(response)) {
    return fail(res, 400, "Invalid response");
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Lock the request first, then the match. Every handler that touches both
    // uses this order, so two people acting at once cannot deadlock.
    const ref = await client.query(
      "SELECT request_id FROM matches WHERE match_id = $1",
      [match_id]
    );

    if (!ref.rowCount) {
      await client.query("ROLLBACK");
      return fail(res, 404, "Match not found");
    }

    const requestResult = await client.query(
      "SELECT * FROM blood_requests WHERE request_id = $1 FOR UPDATE",
      [ref.rows[0].request_id]
    );

    const request = requestResult.rows[0];

    const matchResult = await client.query(
      `SELECT m.match_id, m.status, d.user_id AS donor_user_id
       FROM matches m
       JOIN donors d ON d.donor_id = m.donor_id
       WHERE m.match_id = $1
       FOR UPDATE OF m`,
      [match_id]
    );

    const match = matchResult.rows[0];

    if (match.donor_user_id !== req.user.user_id) {
      await client.query("ROLLBACK");
      return fail(res, 403, "This match does not belong to you");
    }

    if (["expired", "cancelled"].includes(match.status)) {
      await client.query("ROLLBACK");
      return fail(res, 409, "This request is no longer open");
    }

    if (match.status !== "notified") {
      await client.query("ROLLBACK");
      return fail(res, 409, "This match has already been answered");
    }

    if (!OPEN_STATUSES.includes(request.status)) {
      await client.query("ROLLBACK");
      return fail(res, 409, "This request is no longer open");
    }

    if (response === "decline") {
      await client.query(
        `UPDATE matches
         SET status = 'declined', response_at = NOW()
         WHERE match_id = $1`,
        [match_id]
      );

      // Replace this donor with the next best candidate.
      const replaced = await matchRequest(client, request, 1);

      const active = await client.query(
        `SELECT COUNT(*)::int AS n FROM matches
         WHERE request_id = $1 AND status IN ('notified', 'confirmed')`,
        [request.request_id]
      );

      // Nobody left to answer: back to pending.
      if (active.rows[0].n === 0) {
        await client.query(
          "UPDATE blood_requests SET status = 'pending' WHERE request_id = $1",
          [request.request_id]
        );
      }

      await client.query("COMMIT");

      return res.json({
        message: "Response recorded",
        replacement_found: replaced > 0
      });
    }

    const trackingCode =
      "DAMU-" + crypto.randomBytes(6).toString("hex").toUpperCase();

    await client.query(
      `UPDATE matches
       SET status = 'confirmed',
           response_at = NOW(),
           tracking_code = $1
       WHERE match_id = $2`,
      [trackingCode, match_id]
    );

    const confirmedResult = await client.query(
      `SELECT COUNT(*)::int AS n FROM matches
       WHERE request_id = $1 AND status = 'confirmed'`,
      [request.request_id]
    );

    const confirmed = confirmedResult.rows[0].n;
    const filled = confirmed >= request.units_required;

    if (filled) {
      await client.query(
        "UPDATE blood_requests SET status = 'matched' WHERE request_id = $1",
        [request.request_id]
      );

      // Tell donors who are still waiting that the need has been met.
      const closed = await client.query(
        `UPDATE matches m
         SET status = 'expired'
         FROM donors d
         WHERE d.donor_id = m.donor_id
           AND m.request_id = $1
           AND m.status = 'notified'
         RETURNING d.user_id`,
        [request.request_id]
      );

      for (const row of closed.rows) {
        await notify(
          client,
          row.user_id,
          `The ${request.blood_type} request near ${request.location} has been filled. Thank you for being ready to help.`
        );
      }
    } else {
      await client.query(
        "UPDATE blood_requests SET status = 'matching' WHERE request_id = $1",
        [request.request_id]
      );
    }

    await notify(
      client,
      request.requester_id,
      filled
        ? `All ${request.units_required} donor(s) for your ${request.blood_type} request have confirmed. The hospital will record each donation.`
        : `A donor has confirmed for your ${request.blood_type} request (${confirmed} of ${request.units_required}).`
    );

    await client.query("COMMIT");

    res.json({
      message: "Match confirmed",
      tracking_code: trackingCode
    });

  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    fail(res, 500, "Could not process response");

  } finally {
    client.release();
  }
};

// The requester (or staff of the hospital the request was sent to) closes a
// request: cancel it, or mark it fulfilled once the blood has been received.
const updateRequestStatus = async (req, res) => {
  const { request_id } = req.params;
  const { status } = req.body;

  if (!isUUID(request_id)) {
    return fail(res, 400, "Invalid request");
  }

  if (!["cancelled", "fulfilled"].includes(status)) {
    return fail(res, 400, "Status must be cancelled or fulfilled");
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query(
      "SELECT * FROM blood_requests WHERE request_id = $1 FOR UPDATE",
      [request_id]
    );

    if (!result.rowCount) {
      await client.query("ROLLBACK");
      return fail(res, 404, "Request not found");
    }

    const request = result.rows[0];

    const allowedToManage =
      request.requester_id === req.user.user_id ||
      (
        req.user.role === "hospital" &&
        req.user.hospital_id &&
        request.hospital_id === req.user.hospital_id
      );

    if (!allowedToManage) {
      await client.query("ROLLBACK");
      return fail(res, 403, "You can only update your own requests");
    }

    const confirmedResult = await client.query(
      `SELECT COUNT(*)::int AS n FROM matches
       WHERE request_id = $1 AND status = 'confirmed'`,
      [request_id]
    );

    const confirmed = confirmedResult.rows[0].n;

    const allowed =
      status === "cancelled"
        ? ["pending", "matching", "matched"].includes(request.status)
        : ["matching", "matched"].includes(request.status) && confirmed > 0;

    if (!allowed) {
      await client.query("ROLLBACK");

      return fail(
        res,
        409,
        status === "fulfilled"
          ? "Only a request with at least one confirmed donor can be marked fulfilled"
          : `A ${request.status} request can't be cancelled`
      );
    }

    await client.query(
      "UPDATE blood_requests SET status = $1 WHERE request_id = $2",
      [status, request_id]
    );

    if (status === "cancelled") {
      // Release donors who were asked or confirmed, unless their blood was
      // already collected.
      const released = await client.query(
        `UPDATE matches m
         SET status = 'cancelled'
         FROM donors d
         WHERE d.donor_id = m.donor_id
           AND m.request_id = $1
           AND m.status IN ('notified', 'confirmed')
           AND NOT EXISTS (
             SELECT 1 FROM blood_units u WHERE u.match_id = m.match_id
           )
         RETURNING d.user_id, m.response_at`,
        [request_id]
      );

      for (const row of released.rows) {
        await notify(
          client,
          row.user_id,
          row.response_at
            ? `The ${request.blood_type} request you confirmed has been cancelled, so you no longer need to donate. Thank you for stepping up.`
            : `A ${request.blood_type} request near ${request.location} was cancelled.`
        );
      }
    } else {
      await client.query(
        `UPDATE matches SET status = 'expired'
         WHERE request_id = $1 AND status = 'notified'`,
        [request_id]
      );
    }

    await client.query("COMMIT");

    res.json({ message: `Request ${status}`, status });

  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    fail(res, 500, "Could not update request");

  } finally {
    client.release();
  }
};

module.exports = {
  createRequest,
  respondToMatch,
  updateRequestStatus
};