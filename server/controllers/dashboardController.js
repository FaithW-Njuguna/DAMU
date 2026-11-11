const pool = require("../config/db");

const getDashboard = async (req, res) => {
  try {
    const [donors, requests, units, statuses] =
      await Promise.all([
        pool.query(
          "SELECT COUNT(*) FROM donors"
        ),

        pool.query(
          "SELECT COUNT(*) FROM blood_requests"
        ),

        pool.query(
          "SELECT COUNT(*) FROM blood_units"
        ),

        pool.query(
          `SELECT status, COUNT(*) AS total
           FROM blood_units
           GROUP BY status`
        )
      ]);

    res.json({
      total_donors: Number(donors.rows[0].count),
      total_requests: Number(requests.rows[0].count),
      total_units: Number(units.rows[0].count),
      unit_statuses: statuses.rows
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Dashboard data unavailable"
    });
  }
};

module.exports = { getDashboard };
