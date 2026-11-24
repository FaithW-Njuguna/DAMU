const jwt = require("jsonwebtoken");
const pool = require("../config/db");

const ALLOWED_BEFORE_PASSWORD_CHANGE = [
  "/api/auth/change-password",
  "/api/auth/me"
];

async function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;

  const token = authHeader?.split(" ")[1];

  if (!token) {
    return res.status(401).json({
      message: "Authentication required"
    });
  }

  let decoded;

  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(403).json({
      message: "Invalid or expired token"
    });
  }

  try {
    const result = await pool.query(
      `SELECT user_id, role, hospital_id, is_active, must_change_password
       FROM users WHERE user_id = $1`,
      [decoded.user_id]
    );

    const user = result.rows[0];

    if (!user || !user.is_active) {
      return res.status(401).json({
        message: "This account is disabled. Contact the DAMU administrator."
      });
    }

    if (
      user.must_change_password &&
      !ALLOWED_BEFORE_PASSWORD_CHANGE.some((path) =>
        req.originalUrl.startsWith(path)
      )
    ) {
      return res.status(403).json({
        message: "Change your temporary password to continue.",
        code: "PASSWORD_CHANGE_REQUIRED"
      });
    }

    req.user = {
      user_id: user.user_id,
      role: user.role,
      hospital_id: user.hospital_id
    };

    next();
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Could not verify your session"
    });
  }
}

function authorizeRoles(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        message: "Access denied"
      });
    }

    next();
  };
}

async function requireVerifiedHospital(req, res, next) {
  if (!req.user.hospital_id) {
    return res.status(400).json({
      message: "Your account is not linked to a hospital"
    });
  }

  const result = await pool.query(
    "SELECT verified FROM hospitals WHERE hospital_id = $1",
    [req.user.hospital_id]
  );

  if (!result.rows[0]?.verified) {
    return res.status(403).json({
      message: "Your hospital is awaiting verification by the DAMU administrator.",
      code: "HOSPITAL_NOT_VERIFIED"
    });
  }

  next();
}

module.exports = {
  authenticateToken,
  authorizeRoles,
  requireVerifiedHospital
};