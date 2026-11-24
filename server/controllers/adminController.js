const bcrypt = require("bcryptjs");
const pool = require("../config/db");
const { normalizePhone, phoneVariants } = require("../utils/phone");
const { isUUID } = require("../utils/validate");

const bad = (res, message, status = 400) => res.status(status).json({ message });
const STAFF_ROLES = ["hospital", "regulator", "admin"];

// Runs an action and its audit entry in one transaction, so neither can exist without the other.
async function withTransaction(work) {
  const db = await pool.connect();

  try {
    await db.query("BEGIN");
    const result = await work(db);
    await db.query("COMMIT");
    return result;
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally {
    db.release();
  }
}

const audit = (db, adminId, action, targetType, targetId, details = null) =>
  db.query(
    `INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [adminId, action, targetType, targetId, details ? JSON.stringify(details) : null]
  );

const listHospitals = async (req, res) => {
  const r = await pool.query(
    `SELECT h.hospital_id, h.name, h.location, h.verified, h.verified_at,
            h.verification_notes, h.created_at,
            (SELECT COUNT(*)::int FROM users u
             WHERE u.hospital_id = h.hospital_id AND u.is_active) AS staff_count
     FROM hospitals h ORDER BY h.name`
  );
  res.json({ hospitals: r.rows });
};

// New hospitals start unverified. Their staff can be created and can log in,
// but cannot record units until the administrator has checked the facility.
const createHospital = async (req, res) => {
  const name = (req.body.name || "").trim();
  const location = (req.body.location || "").trim();

  if (!name || !location) {
    return bad(res, "Hospital name and location are required");
  }

  const dup = await pool.query(
    "SELECT 1 FROM hospitals WHERE LOWER(name) = LOWER($1)",
    [name]
  );

  if (dup.rowCount) {
    return bad(res, "A hospital with this name already exists", 409);
  }

  const hospital = await withTransaction(async (db) => {
    const r = await db.query(
      `INSERT INTO hospitals (name, location, verified)
       VALUES ($1, $2, false)
       RETURNING hospital_id, name, location, verified`,
      [name, location]
    );

    await audit(db, req.user.user_id, "hospital_registered", "hospital", r.rows[0].hospital_id, { name, location });

    return r.rows[0];
  });

  res.status(201).json({ hospital });
};

// Verifying needs the licence or registry reference that was checked.
// Suspending needs the reason.
const setHospitalVerified = async (req, res) => {
  const { id } = req.params;
  const { verified } = req.body;
  const notes =
    typeof req.body.notes === "string" ? req.body.notes.trim() : "";

  if (!isUUID(id) || typeof verified !== "boolean") {
    return bad(res, "Invalid request");
  }

  if (notes.length < 10 || notes.length > 500) {
    return bad(
      res,
      verified
        ? "Add the licence or registry reference you checked (10 to 500 characters)"
        : "Add the reason for suspending this hospital (10 to 500 characters)"
    );
  }

  const hospital = await withTransaction(async (db) => {
    const r = await db.query(
      `UPDATE hospitals
       SET verified = $2::boolean,
           verified_at = CASE WHEN $2::boolean THEN NOW() ELSE verified_at END,
           verified_by = CASE WHEN $2::boolean THEN $3::uuid ELSE verified_by END,
           verification_notes = $4
       WHERE hospital_id = $1
       RETURNING hospital_id, name, verified, verified_at`,
      [id, verified, req.user.user_id, notes]
    );

    if (r.rowCount) {
      await audit(
        db,
        req.user.user_id,
        verified ? "hospital_verified" : "hospital_unverified",
        "hospital",
        id,
        { notes }
      );
    }

    return r.rows[0];
  });

  if (!hospital) {
    return bad(res, "Hospital not found", 404);
  }

  res.json({ hospital });
};

// Never returns password hashes.
const listUsers = async (req, res) => {
  const r = await pool.query(
    `SELECT u.user_id, u.full_name, u.phone_number, u.email, u.role, u.hospital_id,
            u.is_active, u.must_change_password, u.created_at,
            h.name AS hospital_name
     FROM users u LEFT JOIN hospitals h ON h.hospital_id = u.hospital_id
     WHERE u.role IN ('hospital', 'regulator', 'admin')
     ORDER BY u.created_at DESC`
  );
  res.json({ users: r.rows });
};

// Admins can create hospital and regulator accounts only. Another admin can
// only be created on the server (scripts/staff.js), so the website can never
// be used to gain admin access.
const createUser = async (req, res) => {
  const { role, full_name, phone_number, email, password, hospital_id } = req.body;
  const phone = normalizePhone(phone_number);

  if (!["hospital", "regulator"].includes(role)) {
    return bad(res, "Role must be hospital or regulator");
  }

  if (typeof full_name !== "string" || !full_name.trim()) {
    return bad(res, "Full name is required");
  }

  if (!phone) {
    return bad(res, "Enter a valid phone number, for example +254712345678");
  }

  if (email && !/^\S+@\S+\.\S+$/.test(email)) {
    return bad(res, "Enter a valid email or leave it empty");
  }

  if (typeof password !== "string" || password.length < 10 || password.length > 128) {
    return bad(res, "Password must contain 10 to 128 characters");
  }

  if (role === "hospital") {
    if (!isUUID(hospital_id)) {
      return bad(res, "Choose the hospital this account belongs to");
    }

    const h = await pool.query(
      "SELECT 1 FROM hospitals WHERE hospital_id = $1",
      [hospital_id]
    );

    if (!h.rowCount) {
      return bad(res, "Hospital not found", 404);
    }
  }

  const dup = await pool.query(
    `SELECT 1 FROM users
     WHERE phone_number = ANY($1::text[]) OR (email IS NOT NULL AND LOWER(email) = LOWER($2))`,
    [phoneVariants(phone_number), email || null]
  );

  if (dup.rowCount) {
    return bad(res, "An account with this phone number or email already exists", 409);
  }

  const hash = await bcrypt.hash(password, 12);

  const user = await withTransaction(async (db) => {
    const r = await db.query(
      `INSERT INTO users
       (full_name, email, phone_number, password_hash, role, hospital_id, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE)
       RETURNING user_id, full_name, role, hospital_id`,
      [full_name.trim(), email || null, phone, hash, role, role === "hospital" ? hospital_id : null]
    );

    await audit(db, req.user.user_id, "account_created", "user", r.rows[0].user_id, {
      role,
      hospital_id: role === "hospital" ? hospital_id : null
    });

    return r.rows[0];
  });

  res.status(201).json({ message: "Account created", user });
};

// Disable or re-enable a staff account. It takes effect on that person's next request.
const setUserActive = async (req, res) => {
  const { id } = req.params;
  const { active } = req.body;

  if (!isUUID(id) || typeof active !== "boolean") {
    return bad(res, "Invalid request");
  }

  if (id === req.user.user_id) {
    return bad(res, "You can't change the status of your own account");
  }

  const updated = await withTransaction(async (db) => {
    const r = await db.query(
      `UPDATE users SET is_active = $2
       WHERE user_id = $1 AND role = ANY($3::text[])
       RETURNING user_id, is_active`,
      [id, active, STAFF_ROLES]
    );

    if (r.rowCount) {
      await audit(db, req.user.user_id, active ? "account_enabled" : "account_disabled", "user", id);
    }

    return r.rows[0];
  });

  if (!updated) {
    return bad(res, "Account not found", 404);
  }

  res.json(updated);
};

// Sets a temporary password. The person must replace it at their next login.
const resetUserPassword = async (req, res) => {
  const { id } = req.params;
  const { password } = req.body;

  if (!isUUID(id)) {
    return bad(res, "Invalid request");
  }

  if (typeof password !== "string" || password.length < 10 || password.length > 128) {
    return bad(res, "Password must contain 10 to 128 characters");
  }

  if (id === req.user.user_id) {
    return bad(res, "Use Change password to update your own password");
  }

  const hash = await bcrypt.hash(password, 12);

  const updated = await withTransaction(async (db) => {
    const r = await db.query(
      `UPDATE users SET password_hash = $2, must_change_password = TRUE
       WHERE user_id = $1 AND role = ANY($3::text[])
       RETURNING user_id`,
      [id, hash, STAFF_ROLES]
    );

    if (r.rowCount) {
      await audit(db, req.user.user_id, "password_reset", "user", id);
    }

    return r.rows[0];
  });

  if (!updated) {
    return bad(res, "Account not found", 404);
  }

  res.json({ message: "Password reset" });
};

const listAudit = async (req, res) => {
  const r = await pool.query(
    `SELECT a.audit_id, a.action, a.target_type, a.target_id, a.details, a.created_at,
            u.full_name AS admin_name
     FROM admin_audit_log a LEFT JOIN users u ON u.user_id = a.admin_id
     ORDER BY a.created_at DESC
     LIMIT 200`
  );
  res.json({ entries: r.rows });
};

module.exports = {
  listHospitals,
  createHospital,
  setHospitalVerified,
  listUsers,
  createUser,
  setUserActive,
  resetUserPassword,
  listAudit
};