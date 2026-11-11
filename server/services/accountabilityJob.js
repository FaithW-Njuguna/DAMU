const cron = require("node-cron");
const pool = require("../config/db");

function startAccountabilityJob() {
  cron.schedule("0 1 * * *", async () => {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const result = await client.query(
        `UPDATE blood_units
         SET status = 'flagged'
         WHERE status IN ('collected', 'received')
         AND collection_date <= CURRENT_DATE - 14
         RETURNING unit_id, hospital_id`
      );

      for (const unit of result.rows) {
        await client.query(
          `INSERT INTO accountability_logs
           (unit_id, hospital_id, action, notes)
           VALUES ($1, $2, 'flagged', $3)`,
          [
            unit.unit_id,
            unit.hospital_id,
            "Automatically flagged after 14-day review threshold"
          ]
        );
      }

      await client.query("COMMIT");

      console.log(
        `${result.rowCount} units flagged for review`
      );

    } catch (error) {
      await client.query("ROLLBACK");
      console.error(error);

    } finally {
      client.release();
    }
  });
}

module.exports = startAccountabilityJob;