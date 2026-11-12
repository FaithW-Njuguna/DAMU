// server/routes/adminRoutes.js
const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const authMiddleware = require('../middleware/authMiddleware');

// Middleware to ensure the requester is specifically an admin
const verifyAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    return next();
  }
  return res.status(403).json({ error: 'Access denied. Administrator privileges required.' });
};

// POST route: /api/admin/create-user
router.post('/create-user', authMiddleware, verifyAdmin, adminController.createUserAccount);

module.exports = router;