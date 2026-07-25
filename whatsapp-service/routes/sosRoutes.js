const express = require('express');
const router = express.Router();
const sosController = require('../controllers/sosController');
const apiKeyAuth = require('../middleware/apiKeyAuth');

// Public endpoints
router.get('/', sosController.handleRoot);
router.get('/ready', sosController.handleReady);
router.get('/qr', sosController.handleQr);

// Protected endpoints
router.post('/api/send-sos', apiKeyAuth, sosController.handleSendSos);
router.get('/health', apiKeyAuth, sosController.handleHealth);
router.get('/metrics', apiKeyAuth, sosController.handleMetrics);

module.exports = router;
