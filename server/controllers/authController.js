
const pool = require("../config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const register = async (req, res) => {
  try {
    const {
      full_name,
      email,
      phone_number,
      password,
      role
    } = req.body;

    if (
      !full_name ||
      !phone_number ||
      !password ||
      !role
    ) {
      return res.status(400).json({
        message: "Please fill in all required fields"
      });
    }

    const allowedRoles = ["donor", "patient"];

    if (!allowedRoles.includes(role)) {
      return res.status(400).json({
        message: "Invalid registration role"
      });
    }

    if (password.length < 10) {
      return res.status(400).json({
        message: "Password must contain at least 10 characters"
      });
    }

    const password_hash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `INSERT INTO users
       (full_name, email, phone_number, password_hash, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING user_id, full_name, email, phone_number, role`,
      [
        full_name,
        email || null,
        phone_number,
        password_hash,
        role
      ]
    );

    res.status(201).json({
      message: "Registration successful",
      user: result.rows[0]
    });

  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        message: "Email or phone number already registered"
      });
    }

    console.error(error);

    res.status(500).json({
      message: "Registration failed"
    });
  }
};

const login = async (req, res) => {
  try {
    const { phone_number, password } = req.body;

    const result = await pool.query(
      "SELECT * FROM users WHERE phone_number = $1",
      [phone_number]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        message: "Invalid credentials"
      });
    }

    const user = result.rows[0];

    const validPassword = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!validPassword) {
      return res.status(401).json({
        message: "Invalid credentials"
      });
    }

    const token = jwt.sign(
      {
        user_id: user.user_id,
        role: user.role
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
        role: user.role
      }
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Login failed"
    });
  }
};

module.exports = { register, login };
