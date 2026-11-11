const pool = require("../config/db");

const {
  getCompatibleBloodTypes
} = require("../services/matchingService");

const crypto = require("crypto");

function distanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;

  const toRad = (value) => value * Math.PI / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
    Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.atan2(
    Math.sqrt(a),
    Math.sqrt(1 - a)
  );
}

const createRequest = async (req, res) => {
  const client = await pool.connect();

  try {
    const {
      blood_type,
      units_required,
      urgency,
      location,
      latitude,
      longitude,
      hospital_id
    } = req.body;

    if (
      !blood_type ||
      !units_required ||
      !location
    ) {
      return res.status(400).json({
        message: "Required fields are missing"
      });
    }

    const compatibleTypes =
      getCompatibleBloodTypes(blood_type);

    if (!compatibleTypes.length) {
      return res.status(400).json({
        message: "Invalid blood group"
      });
    }

    if (!Number.isInteger(units_required) ||
        units_required < 1) {
      return res.status(400).json({
        message: "Invalid number of units"
      });
    }

    await client.query("BEGIN");

    const requestResult = await client.query(
      `INSERT INTO blood_requests
       (requester_id, hospital_id, blood_type,
        units_required, urgency, location, latitude, longitude, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'matching')
       RETURNING *`,
      [
        req.user.user_id,
        hospital_id || null,
        blood_type,
        units_required,
        urgency || "normal",
        location,
        latitude ?? null,
        longitude ?? null
      ]
    );

    const request = requestResult.rows[0];

    const donorResult = await client.query(
      `SELECT d.*, u.full_name, u.phone_number
       FROM donors d
       JOIN users u ON u.user_id = d.user_id
       WHERE d.blood_type = ANY($1::blood_group[])
       AND d.availability_status = 'available'
       AND (
         d.last_donation_date IS NULL
         OR d.last_donation_date <= CURRENT_DATE - 56
       )`,
      [compatibleTypes]
    );

    let candidates = donorResult.rows;

    if (latitude != null && longitude != null) {
      candidates = candidates
        .filter(d =>
          d.latitude != null &&
          d.longitude != null
        )
        .map(d => ({
          ...d,
          distance: distanceKm(
            Number(latitude),
            Number(longitude),
            Number(d.latitude),
            Number(d.longitude)
          )
        }))
        .filter(d => d.distance <= 50)
        .sort((a, b) => a.distance - b.distance);
    }

    const selected = candidates.slice(0, 10);

    for (const donor of selected) {
      await client.query(
        `INSERT INTO matches (request_id, donor_id, status)
         VALUES ($1, $2, 'notified')
         ON CONFLICT (request_id, donor_id) DO NOTHING`,
        [request.request_id, donor.donor_id]
      );

      await client.query(
        `INSERT INTO notifications (user_id, message, channel)
         VALUES ($1, $2, 'in_app')`,
        [
          donor.user_id,
          `A blood request matching your registered group is available. Request reference: ${request.request_id}`
        ]
      );
    }

    await client.query("COMMIT");

    res.status(201).json({
      message: "Blood request created",
      request_id: request.request_id,
      candidates_notified: selected.length
    });

  } catch (error) {
    await client.query("ROLLBACK");

    console.error(error);

    res.status(500).json({
      message: "Could not process blood request"
    });

  } finally {
    client.release();
  }
};

module.exports = { createRequest };

const respondToMatch = async (req, res) => {
  const client = await pool.connect();

  try {
    const { match_id } = req.params;
    const { response } = req.body;

    if (!["confirm", "decline"].includes(response)) {
      return res.status(400).json({
        message: "Invalid response"
      });
    }

    await client.query("BEGIN");

    const result = await client.query(
      `SELECT m.*, d.user_id
       FROM matches m
       JOIN donors d ON d.donor_id = m.donor_id
       WHERE m.match_id = $1
       FOR UPDATE`,
      [match_id]
    );

    if (!result.rowCount) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        message: "Match not found"
      });
    }

    const match = result.rows[0];

    if (match.user_id !== req.user.user_id) {
      await client.query("ROLLBACK");

      return res.status(403).json({
        message: "This match does not belong to you"
      });
    }

    if (match.status !== "notified") {
      await client.query("ROLLBACK");

      return res.status(409).json({
        message: "This match has already been answered"
      });
    }

    if (response === "decline") {
      await client.query(
        `UPDATE matches
         SET status = 'declined', response_at = NOW()
         WHERE match_id = $1`,
        [match_id]
      );

      await client.query("COMMIT");

      return res.json({
        message: "Response recorded"
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

    await client.query(
      `UPDATE blood_requests
       SET status = 'matched'
       WHERE request_id = $1`,
      [match.request_id]
    );

    await client.query("COMMIT");

    res.json({
      message: "Match confirmed",
      tracking_code: trackingCode
    });

  } catch (error) {
    await client.query("ROLLBACK");

    console.error(error);

    res.status(500).json({
      message: "Could not process response"
    });

  } finally {
    client.release();
  }
};

module.exports = {
  createRequest,
  respondToMatch
};
