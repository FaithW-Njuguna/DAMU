const express = require("express");

const {
  createAlert,
  listMyAlerts,
  resolveAlert,
  listPublicAlerts
} = require("../controllers/alertController");

const {
  authenticateToken,
  authorizeRoles,
  requireVerifiedHospital
} = require("../middleware/authMiddleware");

const router = express.Router();

// Anyone can see the current public alerts.
router.get("/public", listPublicAlerts);

// Everything below is for hospital staff.
router.use(authenticateToken, authorizeRoles("hospital"));

// Only a verified hospital can raise an alert.
router.post("/", requireVerifiedHospital, createAlert);

router.get("/mine", listMyAlerts);
router.patch("/:id/resolve", resolveAlert);

module.exports = router;