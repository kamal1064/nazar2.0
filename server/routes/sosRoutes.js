const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { sosLimiter } = require('../middleware/rateLimiter');
const { handleSosDispatch } = require('../controllers/sosController');

router.post('/', protect, sosLimiter, handleSosDispatch);

module.exports = router;
