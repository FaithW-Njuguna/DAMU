const express = require("express");

const {
  createRequest,
  respondToMatch,
  updateRequestStatus,
  confirmDonations
} = require("../controllers/requestController");

const {
  authenticateToken,
  authorizeRoles
} = require("../middleware/authMiddleware");

const router = express.Router();

router.post(
  "/",
  authenticateToken,
  authorizeRoles("patient", "hospital"),
  createRequest
);

router.post(
  "/:match_id/respond",
  authenticateToken,
  authorizeRoles("donor"),
  respondToMatch
);

router.patch(
  "/:request_id/status",
  authenticateToken,
  authorizeRoles("patient", "hospital"),
  updateRequestStatus
);

router.post(
  "/:request_id/confirm-donations",
  authenticateToken,
  authorizeRoles("patient", "hospital"),
  confirmDonations
);

module.exports = router;