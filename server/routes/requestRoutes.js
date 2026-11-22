const express = require("express");

const {
  createRequest,
  respondToMatch,
  updateRequestStatus
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

module.exports = router;