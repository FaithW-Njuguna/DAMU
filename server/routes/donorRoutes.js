const express = require("express");

const {
  createDonorProfile,
  updateAvailability,
  updateLocation,
  logDonation
} = require("../controllers/donorController");

const {
  authenticateToken,
  authorizeRoles
} = require("../middleware/authMiddleware");

const router = express.Router();

router.post(
  "/profile",
  authenticateToken,
  authorizeRoles("donor"),
  createDonorProfile
);

router.patch(
  "/availability",
  authenticateToken,
  authorizeRoles("donor"),
  updateAvailability
);

router.patch(
  "/location",
  authenticateToken,
  authorizeRoles("donor"),
  updateLocation
);

router.post(
  "/donations",
  authenticateToken,
  authorizeRoles("donor"),
  logDonation
);

module.exports = router;