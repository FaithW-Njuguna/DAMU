
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const authRoutes = require("./routes/authRoutes");
const donorRoutes = require("./routes/donorRoutes");
const requestRoutes = require("./routes/requestRoutes");
const unitRoutes = require("./routes/unitRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const reportRoutes = require("./routes/reportRoutes");
const adminRoutes = require('./routes/adminRoutes');
const notificationRoutes = require("./routes/notificationRoutes");
const alertRoutes = require("./routes/alertRoutes");
const insightsRoutes = require("./routes/insightsRoutes");

const app = express();

app.use(helmet());

app.use(cors({
  origin: process.env.CLIENT_URL,
  credentials: true
}));

app.use(express.json({ limit: "20kb" }));

app.use("/api", rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 200
}));

const authLimitMessage = {
  message: "Too many attempts. Please wait a few minutes and try again."
};

app.use("/api/auth/login", rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.LOGIN_RATE_LIMIT) || 10,
  skipSuccessfulRequests: true,
  message: authLimitMessage
}));

app.use("/api/auth/register", rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: Number(process.env.REGISTER_RATE_LIMIT) || 20,
  message: authLimitMessage
}));

app.use("/api/auth/change-password", rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: authLimitMessage
}));

app.get("/", (req, res) => {
  res.json({
    message: "Welcome to DAMU Blood Donation Platform API"
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/donors", donorRoutes);
app.use("/api/requests", requestRoutes);
app.use("/api/units", unitRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/reports", reportRoutes);

const portalRoutes = require("./routes/portalRoutes");
// ...
app.use("/api/reports", reportRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/alerts", alertRoutes);
app.use("/api/insights", insightsRoutes);
app.use("/api", portalRoutes);
app.use('/api/admin', adminRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({
    message: "An internal server error occurred"
  });
});

module.exports = app;
