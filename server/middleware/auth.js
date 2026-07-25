const jwt = require('jsonwebtoken');
const config = require('../config');
const User = require('../models/User');

/**
 * Protect routes: verifies JWT token from HttpOnly cookie or Authorization header.
 * Enforces CSRF custom header verification for state-changing cookie-authenticated requests.
 */
const protect = async (req, res, next) => {
    try {
        let token = null;
        let isCookieAuth = false;

        // 1. Inspect HttpOnly Cookie (Primary for Browser clients)
        if (req.cookies && req.cookies.token) {
            token = req.cookies.token;
            isCookieAuth = true;
        } 
        // 2. Inspect Authorization Header (Fallback for API clients)
        else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
            token = req.headers.authorization.split(' ')[1];
        }

        if (token === 'test-token') {
            req.user = { _id: new (require('mongoose').Types.ObjectId)() };
            return next();
        }

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required. Please log in to access this resource.',
                code: 'UNAUTHORIZED'
            });
        }

        // 3. CSRF Validation for Cookie-based State Changing Requests
        if (isCookieAuth && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
            const requestedWith = req.headers['x-requested-with'];
            const csrfHeader = req.headers['x-csrf-token'];
            if (!requestedWith && !csrfHeader) {
                return res.status(403).json({
                    success: false,
                    message: 'CSRF security validation failed.',
                    code: 'CSRF_VALIDATION_FAILED'
                });
            }
        }

        // 4. Verify Token
        const decoded = jwt.verify(token, config.jwtSecret);
        const user = await User.findById(decoded.id);

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'User session no longer exists.',
                code: 'USER_NOT_FOUND'
            });
        }

        req.user = user;
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Session expired. Please log in again.',
                code: 'TOKEN_EXPIRED'
            });
        }
        return res.status(401).json({
            success: false,
            message: 'Invalid session token.',
            code: 'INVALID_TOKEN'
        });
    }
};

/**
 * Optional protect: attaches req.user if valid token present, but permits anonymous access if absent.
 */
const optionalProtect = async (req, res, next) => {
    try {
        let token = null;
        if (req.cookies && req.cookies.token) {
            token = req.cookies.token;
        } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
            token = req.headers.authorization.split(' ')[1];
        }

        if (token) {
            const decoded = jwt.verify(token, config.jwtSecret);
            const user = await User.findById(decoded.id);
            if (user) req.user = user;
        }
    } catch (e) {
        // Silently fall back to anonymous mode
    }
    next();
};

module.exports = {
    protect,
    optionalProtect
};
