require("dotenv").config();
const bcrypt = require("bcryptjs");
const pool = require("../config/db");

(async () => {
  const [role, name, phone, password, hospitalName, location] = process.argv.slice(2);
  if (!["hospital", "regulator", "admin"].includes(role) || !name || !phone || !password || password.length < 10 || (role === "hospital" && !hospitalName)) {
    console.log('Usage: node scripts/createStaff.js <hospital|regulator|admin> "<full name>" <phone> <password, 10+ chars> ["<hospital name>" "<location>"]');
    process.exit(1);
  }
  let hospitalId = null;
  if (role === "hospital") {
    const found = await pool.query("SELECT hospital_id FROM hospitals WHERE name = $1", [hospitalName]);
    hospitalId = found.rows[0]?.hospital_id ||
      (await pool.query("INSERT INTO hospitals (name, location, verified) VALUES ($1, $2, true) RETURNING hospital_id", [hospitalName, location || ""])).rows[0].hospital_id;
  }
  await pool.query(
    "INSERT INTO users (full_name, phone_number, password_hash, role, hospital_id) VALUES ($1, $2, $3, $4, $5)",
    [name, phone, await bcrypt.hash(password, 12), role, hospitalId]
  );
  console.log(`Created ${role} account for ${name}`);
  await pool.end();
})().catch((e) => { console.error(e.message); process.exit(1); });