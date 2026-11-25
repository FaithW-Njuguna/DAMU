const express = require("express");
const { getBloodGroupInsights } = require("../controllers/insightsController");

const router = express.Router();

router.get("/blood-groups", getBloodGroupInsights);

module.exports = router;