const crypto = require('crypto');

/**
 * Middleware to generate or forward correlation X-Request-Id for log tracing
 */
const requestId = (req, res, next) => {
    const existingId = req.headers['x-request-id'];
    const id = existingId || crypto.randomUUID();
    req.id = id;
    res.setHeader('X-Request-Id', id);
    next();
};

module.exports = requestId;
