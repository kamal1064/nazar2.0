const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { userValidator, validateObjectId } = require('../middleware/validator');
const { userLimiter } = require('../middleware/rateLimiter');

// POST /api/users - Register or find user by deviceId
router.post('/', userLimiter, userValidator, async (req, res, next) => {
    try {
        const { deviceId, name, profilePicture, provider } = req.body;
        
        let user = await User.findOne({ deviceId: deviceId.trim() });
        if (user) {
            // Return existing user if already registered
            return res.status(200).json({ success: true, data: user });
        }

        user = new User({
            deviceId: deviceId.trim(),
            name: name || 'Nazar User',
            profilePicture: profilePicture || '',
            provider: provider || 'local'
        });

        await user.save();
        res.status(201).json({ success: true, data: user });
    } catch (err) {
        next(err);
    }
});

// GET /api/users/:id - Retrieve user profile by database ObjectId
router.get('/:id', userLimiter, async (req, res, next) => {
    try {
        const id = req.params.id;
        if (!validateObjectId(id)) {
            return res.status(400).json({ success: false, message: 'Invalid User ID format.', code: 'INVALID_USER_ID' });
        }

        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found.', code: 'USER_NOT_FOUND' });
        }

        res.status(200).json({ success: true, data: user });
    } catch (err) {
        next(err);
    }
});

// GET /api/users/device/:deviceId - Retrieve user profile by deviceId
router.get('/device/:deviceId', userLimiter, async (req, res, next) => {
    try {
        const deviceId = req.params.deviceId;
        if (!deviceId || !deviceId.trim()) {
            return res.status(400).json({ success: false, message: 'Missing deviceId parameter.', code: 'BAD_REQUEST' });
        }

        const user = await User.findOne({ deviceId: deviceId.trim() });
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found.', code: 'USER_NOT_FOUND' });
        }

        res.status(200).json({ success: true, data: user });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
