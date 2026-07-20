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
            return res.status(400).json({ success: false, message: 'Invalid User ID format.', code: 'INVALID_USER_ID' });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found.', code: 'USER_NOT_FOUND' });
        }

        const { voiceEnabled, speechRate, speechVolume, locationSharing, darkMode, continuousScanning, preferredScanMode } = req.body;

        const updateData = {};
        if (voiceEnabled !== undefined) updateData.voiceEnabled = voiceEnabled;
        if (speechRate !== undefined) updateData.speechRate = speechRate;
        if (speechVolume !== undefined) updateData.speechVolume = speechVolume;
        if (locationSharing !== undefined) updateData.locationSharing = locationSharing;
        if (darkMode !== undefined) updateData.darkMode = darkMode;
        if (continuousScanning !== undefined) updateData.continuousScanning = continuousScanning;
        if (preferredScanMode !== undefined) updateData.preferredScanMode = preferredScanMode;

        const settings = await Settings.findOneAndUpdate(
            { userId },
            updateData,
            { returnDocument: 'after', upsert: true, runValidators: true }
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
            return res.status(400).json({ success: false, message: 'Invalid User ID format.', code: 'INVALID_USER_ID' });
        }

        let settings = await Settings.findOne({ userId });
        if (!settings) {
            settings = {
                userId,
                voiceEnabled: false,
                speechRate: 1.0,
                speechVolume: 1.0,
                locationSharing: false,
                darkMode: false,
                continuousScanning: false,
                preferredScanMode: 'scene'
            };
        }

        res.status(200).json({ success: true, data: settings });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
