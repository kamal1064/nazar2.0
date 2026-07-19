const express = require('express');
const router = express.Router();
const { handleSendEmergencyEmail, handleSendSafeEmail } = require('../controllers/emergencyController');
const { userLimiter } = require('../middleware/rateLimiter');

// POST /api/emergency/send-email - Dispatch Emergency SOS Email
router.post('/send-email', userLimiter, handleSendEmergencyEmail);

// POST /api/emergency/send-safe-email - Dispatch "I'm Safe" Follow-Up Email
router.post('/send-safe-email', userLimiter, handleSendSafeEmail);

module.exports = router;
