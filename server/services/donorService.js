async function startCooldown(db, donorId, donationDate) {
  await db.query(
    `UPDATE donors
     SET last_donation_date =
           GREATEST(COALESCE(last_donation_date, $2::date), $2::date),
         availability_status = 'recently_donated'
     WHERE donor_id = $1`,
    [donorId, donationDate]
  );
}

module.exports = { startCooldown };