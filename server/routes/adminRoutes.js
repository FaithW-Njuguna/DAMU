const express = require("express");
const c = require("../controllers/adminController");
const { authenticateToken, authorizeRoles } = require("../middleware/authMiddleware");

const router = express.Router();
router.use(authenticateToken, authorizeRoles("admin"));

router.get("/hospitals", c.listHospitals);
router.post("/hospitals", c.createHospital);
router.patch("/hospitals/:id/verify", c.setHospitalVerified);
router.get("/users", c.listUsers);
router.post("/users", c.createUser);
router.post("/create-user", c.createUser); 
router.patch("/users/:id/active", c.setUserActive);
router.post("/users/:id/reset-password", c.resetUserPassword);
router.get("/audit", c.listAudit);

module.exports = router;