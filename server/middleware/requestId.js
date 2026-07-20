const crypto = require('crypto');

/**
 * Production Middleware:
 * 1. Generates or forwards correlation X-Request-Id UUID header.
 * 2. Attaches req.id to request context.
 * 3. Patches res.json to automatically inject requestId into all error responses (success: false).
 */
const requestId = (req, res, next) => {
    const existingId = req.headers['x-request-id'];
    const id = existingId || crypto.randomUUID();
    req.id = id;
    res.setHeader('X-Request-Id', id);

    // Intercept res.json to ensure all failure payloads carry the correlation requestId
    const originalJson = res.json.bind(res);
    res.json = (data) => {
        if (data && typeof data === 'object' && data.success === false && !data.requestId) {
            data.requestId = req.id;
        }
        return originalJson(data);
    };

    next();
};

module.exports = requestId;
