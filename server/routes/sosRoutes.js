const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { sosLimiter } = require('../middleware/rateLimiter');
const { handleSosDispatch, handleSosCallback } = require('../controllers/sosController');

router.post('/', protect, sosLimiter, handleSosDispatch);
router.post('/callback', handleSosCallback);

module.exports = router;
