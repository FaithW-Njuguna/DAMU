const express = require("express");

const {
  createUnit,
  updateUnitStatus,
  getUnitByTrackingCode
} = require("../controllers/unitController");

const {
  authenticateToken,
  authorizeRoles,
  requireVerifiedHospital
} = require("../middleware/authMiddleware");

const router = express.Router();

router.post(
  "/",
  authenticateToken,
  authorizeRoles("hospital"),
  requireVerifiedHospital,
  createUnit
);

router.patch(
  "/:unit_id/status",
  authenticateToken,
  authorizeRoles("hospital"),
  requireVerifiedHospital,
  updateUnitStatus
);

router.get(
  "/tracking/:code",
  getUnitByTrackingCode
);

module.exports = router;