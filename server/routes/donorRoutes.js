const express = require("express");

const {
  createDonorProfile,
  updateAvailability
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

module.exports = router;