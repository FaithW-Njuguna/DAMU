const cron = require("node-cron");
const pool = require("../config/db");
const { notify } = require("./notificationService");

const DONATION_GAP_DAYS = 56;

// Donors whose rest period is over become available again and are told so.
async function releaseDonorCooldowns() {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query(
      `UPDATE donors
       SET availability_status = 'available'
       WHERE availability_status = 'recently_donated'
         AND last_donation_date IS NOT NULL
         AND last_donation_date <= CURRENT_DATE - $1::int
       RETURNING user_id`,
      [DONATION_GAP_DAYS]
    );

    for (const donor of result.rows) {
      await notify(
        client,
        donor.user_id,
        "You can donate again. Your status is back to Available, and you can change it any time on My donations."
      );
    }

    await client.query("COMMIT");

    console.log(`${result.rowCount} donors available again`);

  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);

  } finally {
    client.release();
  }
}

function startDonorJob() {
  cron.schedule("0 2 * * *", releaseDonorCooldowns);
}

module.exports = startDonorJob;
module.exports.releaseDonorCooldowns = releaseDonorCooldowns;