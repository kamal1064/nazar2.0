const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { userValidator, validateObjectId } = require('../middleware/validator');
const { userLimiter } = require('../middleware/rateLimiter');

// POST /api/users - Register a new user
router.post('/', userLimiter, userValidator, async (req, res, next) => {
    try {
        const { name, email, profilePicture, provider } = req.body;
        
        let user = await User.findOne({ email: email.toLowerCase() });
        if (user) {
            return res.status(409).json({ success: false, message: 'User with this email already exists' });
        }

        user = new User({
            name,
            email,
            profilePicture,
            provider
        });

        await user.save();
        res.status(201).json({ success: true, data: user });
    } catch (err) {
        next(err);
    }
});

// GET /api/users/:id - Retrieve user profile by id
router.get('/:id', userLimiter, async (req, res, next) => {
    try {
        const id = req.params.id;
        if (!validateObjectId(id)) {
            return res.status(400).json({ success: false, message: 'Invalid User ID format' });
        }

        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        res.status(200).json({ success: true, data: user });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
