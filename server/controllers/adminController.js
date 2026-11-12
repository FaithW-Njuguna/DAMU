const bcrypt = require("bcryptjs");
const pool = require("../config/db");

const PHONE = /^\+?\d{9,14}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bad = (res, message, status = 400) => res.status(status).json({ message });

const listHospitals = async (req, res) => {
  const r = await pool.query(
    `SELECT h.hospital_id, h.name, h.location, h.verified, h.created_at,
            (SELECT COUNT(*)::int FROM users u WHERE u.hospital_id = h.hospital_id) AS staff_count
     FROM hospitals h ORDER BY h.name`
  );
  res.json({ hospitals: r.rows });
};

const createHospital = async (req, res) => {
  const name = (req.body.name || "").trim();
  const location = (req.body.location || "").trim();
  if (!name || !location) return bad(res, "Hospital name and location are required");
  const dup = await pool.query("SELECT 1 FROM hospitals WHERE LOWER(name) = LOWER($1)", [name]);
  if (dup.rowCount) return bad(res, "A hospital with this name already exists", 409);
  const r = await pool.query(
    "INSERT INTO hospitals (name, location, verified) VALUES ($1, $2, true) RETURNING hospital_id, name, location, verified",
    [name, location]
  );
  res.status(201).json({ hospital: r.rows[0] });
};

const setHospitalVerified = async (req, res) => {
  const { id } = req.params;
  if (!UUID.test(id) || typeof req.body.verified !== "boolean") return bad(res, "Invalid request");
  const r = await pool.query("UPDATE hospitals SET verified = $2 WHERE hospital_id = $1 RETURNING hospital_id, verified", [id, req.body.verified]);
  if (!r.rowCount) return bad(res, "Hospital not found", 404);
  res.json({ hospital: r.rows[0] });
};

// Never returns password hashes.
const listUsers = async (req, res) => {
  const r = await pool.query(
    `SELECT u.user_id, u.full_name, u.phone_number, u.email, u.role, u.hospital_id, u.created_at, h.name AS hospital_name
     FROM users u LEFT JOIN hospitals h ON h.hospital_id = u.hospital_id
     WHERE u.role IN ('hospital', 'regulator', 'admin') ORDER BY u.created_at DESC`
  );
  res.json({ users: r.rows });
};

const createUser = async (req, res) => {
  const { role, full_name, phone_number, email, password, hospital_id } = req.body;
  if (!["hospital", "regulator"].includes(role)) return bad(res, "Role must be hospital or regulator");
  if (!full_name?.trim()) return bad(res, "Full name is required");
  if (!PHONE.test(phone_number || "")) return bad(res, "Enter a valid phone number");
  if (!password || password.length < 10) return bad(res, "Password must be at least 10 characters");
  if (role === "hospital") {
    if (!UUID.test(hospital_id || "")) return bad(res, "Choose the hospital this account belongs to");
    const h = await pool.query("SELECT 1 FROM hospitals WHERE hospital_id = $1", [hospital_id]);
    if (!h.rowCount) return bad(res, "Hospital not found", 404);
  }
  const dup = await pool.query(
    "SELECT 1 FROM users WHERE phone_number = $1 OR (email IS NOT NULL AND email = $2)",
    [phone_number, email || null]
  );
  if (dup.rowCount) return bad(res, "An account with this phone number or email already exists", 409);
  const r = await pool.query(
    `INSERT INTO users (full_name, email, phone_number, password_hash, role, hospital_id)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING user_id, full_name, role, hospital_id`,
    [full_name.trim(), email || null, phone_number, await bcrypt.hash(password, 12), role, role === "hospital" ? hospital_id : null]
  );
  res.status(201).json({ message: "Account created", user: r.rows[0] });
};

module.exports = { listHospitals, createHospital, setHospitalVerified, listUsers, createUser };