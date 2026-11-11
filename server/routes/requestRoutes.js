const express = require("express");

const {
  createRequest,
  respondToMatch
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

module.exports = router;