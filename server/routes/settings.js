const express = require('express');
const router = express.Router();
const Settings = require('../models/Settings');
const User = require('../models/User');
const { settingsValidator, validateObjectId } = require('../middleware/validator');
const { settingsLimiter } = require('../middleware/rateLimiter');

// PUT /api/settings/:userId - Update or create settings config
router.put('/:userId', settingsLimiter, settingsValidator, async (req, res, next) => {
    try {
        const userId = req.params.userId;
        if (!validateObjectId(userId)) {
            return res.status(400).json({ success: false, message: 'Invalid User ID format' });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const { voiceEnabled, speechRate, speechVolume, locationSharing, darkMode } = req.body;

        const settings = await Settings.findOneAndUpdate(
            { userId },
            {
                voiceEnabled,
                speechRate,
                speechVolume,
                locationSharing,
                darkMode
            },
            { new: true, upsert: true, runValidators: true }
        );

        res.status(200).json({ success: true, data: settings });
    } catch (err) {
        next(err);
    }
});

// GET /api/settings/:userId - Fetch settings for a user
router.get('/:userId', settingsLimiter, async (req, res, next) => {
    try {
        const userId = req.params.userId;
        if (!validateObjectId(userId)) {
            return res.status(400).json({ success: false, message: 'Invalid User ID format' });
        }

        let settings = await Settings.findOne({ userId });
        if (!settings) {
            settings = {
                userId,
                voiceEnabled: false,
                speechRate: 1.0,
                speechVolume: 1.0,
                locationSharing: false,
                darkMode: false
            };
        }

        res.status(200).json({ success: true, data: settings });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
