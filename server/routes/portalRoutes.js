const express = require("express");
const c = require("../controllers/portalController");
const { authenticateToken, authorizeRoles } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/donors/me", authenticateToken, authorizeRoles("donor"), c.getMyDonorProfile);
router.get("/donors/matches", authenticateToken, authorizeRoles("donor"), c.getMyMatches);
router.get("/requests/mine", authenticateToken, authorizeRoles("patient", "hospital"), c.getMyRequests);
router.get("/hospitals", c.listHospitals);
router.get("/units", authenticateToken, authorizeRoles("hospital"), c.listHospitalUnits);
router.get("/units/confirmed-matches", authenticateToken, authorizeRoles("hospital"), c.listConfirmedMatches);
router.get("/units/flagged", authenticateToken, authorizeRoles("regulator", "admin"), c.listFlaggedUnits);

module.exports = router;