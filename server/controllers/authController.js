const pool = require("../config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { normalizePhone, phoneVariants } = require("../utils/phone");

// Compared against when the phone number is unknown, so a missing account and
// a wrong password take about the same time to reject.
const DUMMY_HASH = bcrypt.hashSync("damu-dummy-password", 12);

const fail = (res, status, message) => res.status(status).json({ message });

const register = async (req, res) => {
  try {
    const { password, role } = req.body;

    const full_name =
      typeof req.body.full_name === "string" ? req.body.full_name.trim() : "";
    const email =
      typeof req.body.email === "string" ? req.body.email.trim() : "";
    const phone = normalizePhone(req.body.phone_number);

    if (!full_name || !req.body.phone_number || !password || !role) {
      return fail(res, 400, "Please fill in all required fields");
    }

    if (full_name.length < 2 || full_name.length > 100) {
      return fail(res, 400, "Enter your full name");
    }

    if (!phone) {
      return fail(res, 400, "Enter a valid phone number, for example +254712345678");
    }

    if (email && !/^\S+@\S+\.\S+$/.test(email)) {
      return fail(res, 400, "Enter a valid email or leave it empty");
    }

    const allowedRoles = ["donor", "patient"];

    if (!allowedRoles.includes(role)) {
      return fail(res, 400, "Invalid registration role");
    }

    if (
      typeof password !== "string" ||
      password.length < 10 ||
      password.length > 128
    ) {
      return fail(res, 400, "Password must contain 10 to 128 characters");
    }

    // Accounts saved before numbers were standardised may use another form.
    const existing = await pool.query(
      "SELECT 1 FROM users WHERE phone_number = ANY($1::text[])",
      [phoneVariants(req.body.phone_number)]
    );

    if (existing.rowCount) {
      return fail(res, 409, "Email or phone number already registered");
    }

    const password_hash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `INSERT INTO users
       (full_name, email, phone_number, password_hash, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING user_id, full_name, email, phone_number, role`,
      [full_name, email || null, phone, password_hash, role]
    );

    res.status(201).json({
      message: "Registration successful",
      user: result.rows[0]
    });

  } catch (error) {
    if (error.code === "23505") {
      return fail(res, 409, "Email or phone number already registered");
    }

    console.error(error);
    fail(res, 500, "Registration failed");
  }
};

const login = async (req, res) => {
  try {
    const { phone_number, password } = req.body;

    if (typeof phone_number !== "string" || typeof password !== "string") {
      return fail(res, 400, "Enter your phone number and password");
    }

    const result = await pool.query(
      "SELECT * FROM users WHERE phone_number = ANY($1::text[])",
      [phoneVariants(phone_number)]
    );

    const user = result.rows[0];

    const validPassword = await bcrypt.compare(
      password,
      user ? user.password_hash : DUMMY_HASH
    );

    if (!user || !validPassword) {
      return fail(res, 401, "Invalid credentials");
    }

    if (!user.is_active) {
      return fail(res, 403, "This account has been disabled. Contact the DAMU administrator.");
    }

    const token = jwt.sign(
      {
        user_id: user.user_id,
        role: user.role,
        hospital_id: user.hospital_id || null
      },
      process.env.JWT_SECRET,
      { expiresIn: "2h" }
    );

    res.json({
      message: "Login successful",
      token,
      user: {
        user_id: user.user_id,
        full_name: user.full_name,
        role: user.role,
        hospital_id: user.hospital_id || null,
        must_change_password: user.must_change_password
      }
    });

  } catch (error) {
    console.error(error);
    fail(res, 500, "Login failed");
  }
};

const changePassword = async (req, res) => {
  const { current_password, new_password } = req.body;

  if (typeof current_password !== "string" || typeof new_password !== "string") {
    return fail(res, 400, "Enter your current and new password");
  }

  if (new_password.length < 10 || new_password.length > 128) {
    return fail(res, 400, "New password must contain 10 to 128 characters");
  }

  if (new_password === current_password) {
    return fail(res, 400, "Choose a password you haven't used for this account");
  }

  const result = await pool.query(
    "SELECT password_hash FROM users WHERE user_id = $1",
    [req.user.user_id]
  );

  if (
    !result.rowCount ||
    !(await bcrypt.compare(current_password, result.rows[0].password_hash))
  ) {
    return fail(res, 400, "Your current password is incorrect");
  }

  await pool.query(
    `UPDATE users
     SET password_hash = $1, must_change_password = FALSE
     WHERE user_id = $2`,
    [await bcrypt.hash(new_password, 12), req.user.user_id]
  );

  res.json({ message: "Password updated" });
};

const me = async (req, res) => {
  const result = await pool.query(
    `SELECT u.user_id, u.full_name, u.role, u.hospital_id, u.must_change_password,
            h.name AS hospital_name, h.verified AS hospital_verified
     FROM users u
     LEFT JOIN hospitals h ON h.hospital_id = u.hospital_id
     WHERE u.user_id = $1`,
    [req.user.user_id]
  );

  res.json({ user: result.rows[0] });
};

module.exports = { register, login, changePassword, me };