const express = require('express');
const router = express.Router();
const { handleSendEmergencyEmail } = require('../controllers/emergencyController');
const { userLimiter } = require('../middleware/rateLimiter');

// POST /api/emergency/send-email
router.post('/send-email', userLimiter, handleSendEmergencyEmail);

module.exports = router;
