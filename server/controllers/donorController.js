
const pool = require("../config/db");

const createDonorProfile = async (req, res) => {
  try {
    const {
      blood_type,
      location,
      latitude,
      longitude
    } = req.body;

    const validBloodTypes = [
      "A+", "A-", "B+", "B-",
      "AB+", "AB-", "O+", "O-"
    ];

    if (!validBloodTypes.includes(blood_type)) {
      return res.status(400).json({
        message: "Invalid blood group"
      });
    }

    if (!location) {
      return res.status(400).json({
        message: "Location is required"
      });
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
        latitude ?? null,
        longitude ?? null
      ]
    );

    res.status(201).json({
      message: "Donor profile created",
      donor: result.rows[0]
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Could not create donor profile"
    });
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
      return res.status(400).json({
        message: "Invalid availability status"
      });
    }

    const result = await pool.query(
      `UPDATE donors
       SET availability_status = $1
       WHERE user_id = $2
       RETURNING *`,
      [availability_status, req.user.user_id]
    );

    if (!result.rowCount) {
      return res.status(404).json({
        message: "Donor profile not found"
      });
    }

    res.json({
      message: "Availability updated",
      donor: result.rows[0]
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Update failed"
    });
  }
};

module.exports = {
  createDonorProfile,
  updateAvailability
};
