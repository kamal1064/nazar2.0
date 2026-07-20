const express = require('express');
const router = express.Router();
const keyRotationService = require('../services/keyRotationService');

// GET /api/admin/api-usage - Diagnostic endpoint for key rotation & capacity analytics
router.get('/api-usage', async (req, res, next) => {
    try {
        const analytics = await keyRotationService.getAnalyticsState();
        res.status(200).json({
            success: true,
            ...analytics
        });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
