const express = require('express');
const router = express.Router();
const sosController = require('../controllers/sosController');
const apiKeyAuth = require('../middleware/apiKeyAuth');

// Public endpoints
router.get('/ready', sosController.handleReady);

// Protected endpoints
router.post('/api/send-sos', apiKeyAuth, sosController.handleSendSos);
router.get('/health', apiKeyAuth, sosController.handleHealth);
router.get('/metrics', apiKeyAuth, sosController.handleMetrics);

module.exports = router;
