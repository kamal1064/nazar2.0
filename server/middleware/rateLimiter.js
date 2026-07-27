const rateLimit = require('express-rate-limit');

const userLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20,
    message: {
        success: false,
        message: 'Too many authentication/user requests, please try again after 15 minutes.',
        code: 'TOO_MANY_REQUESTS'
    },
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false, forwardedHeader: false }
});

const scanLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 60,
    message: {
        success: false,
        message: 'Too many scan requests, please try again after 15 minutes.',
        code: 'TOO_MANY_REQUESTS'
    },
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false, forwardedHeader: false }
});

const settingsLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    message: {
        success: false,
        message: 'Too many settings adjustments, please try again after 15 minutes.',
        code: 'TOO_MANY_REQUESTS'
    },
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false, forwardedHeader: false }
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10,
    message: {
        success: false,
        message: 'Too many authentication attempts. Please try again after 15 minutes.',
        code: 'TOO_MANY_REQUESTS'
    },
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false, forwardedHeader: false }
});

const voiceLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 150,
    message: {
        success: false,
        message: 'Too many voice assistant requests, please try again after 15 minutes.',
        code: 'TOO_MANY_REQUESTS'
    },
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false, forwardedHeader: false }
});

const sosLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 3,
    keyGenerator: (req) => {
        // Limit by userId if authenticated, else IP
        return req.user ? req.user._id.toString() : req.ip;
    },
    message: {
        success: false,
        message: 'Too many SOS requests, please try again after 5 minutes.',
        code: 'TOO_MANY_REQUESTS'
    },
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false, forwardedHeader: false, keyGeneratorIpFallback: false }
});

module.exports = {
    userLimiter,
    scanLimiter,
    settingsLimiter,
    authLimiter,
    voiceLimiter,
    sosLimiter
};
