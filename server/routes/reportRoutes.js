const express = require("express");
const { submitWhistleblower, listWhistleblower } = require("../controllers/portalController");
const { authenticateToken, authorizeRoles } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/whistleblower", submitWhistleblower);
router.get("/whistleblower", authenticateToken, authorizeRoles("regulator", "admin"), listWhistleblower);

module.exports = router;