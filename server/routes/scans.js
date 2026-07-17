const express = require('express');
const router = express.Router();
const Scan = require('../models/Scan');
const User = require('../models/User');
const { scanValidator, validateObjectId } = require('../middleware/validator');
const { scanLimiter } = require('../middleware/rateLimiter');

// POST /api/scans - Log a new AI camera scan
router.post('/', scanLimiter, scanValidator, async (req, res, next) => {
    try {
        const { userId, imageUrl, detectedObjects, aiDescription } = req.body;
        
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const scan = new Scan({
            userId,
            imageUrl,
            detectedObjects,
            aiDescription
        });

        await scan.save();
        res.status(201).json({ success: true, data: scan });
    } catch (err) {
        next(err);
    }
});

// GET /api/scans/:userId - Retrieve scan history for a user
router.get('/:userId', scanLimiter, async (req, res, next) => {
    try {
        const userId = req.params.userId;
        if (!validateObjectId(userId)) {
            return res.status(400).json({ success: false, message: 'Invalid User ID format' });
        }

        const scans = await Scan.find({ userId }).sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: scans });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
