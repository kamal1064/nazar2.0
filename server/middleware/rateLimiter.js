const rateLimit = require('express-rate-limit');

const userLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20,
    message: {
        success: false,
        message: 'Too many authentication/user requests, please try again after 15 minutes.'
    },
    standardHeaders: true,
    legacyHeaders: false
});

const scanLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 60,
    message: {
        success: false,
        message: 'Too many scan requests, please try again after 15 minutes.'
    },
    standardHeaders: true,
    legacyHeaders: false
});

const settingsLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    message: {
        success: false,
        message: 'Too many settings adjustments, please try again after 15 minutes.'
    },
    standardHeaders: true,
    legacyHeaders: false
});

module.exports = {
    userLimiter,
    scanLimiter,
    settingsLimiter
};
