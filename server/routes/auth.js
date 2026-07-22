const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');

// Public auth endpoints protected by rate limiting
router.post('/signup', authLimiter, authController.signup);
router.post('/login', authLimiter, authController.login);
router.get('/google', authLimiter, authController.initiateGoogleOAuth);
router.get('/google/callback', authLimiter, authController.googleOAuthCallback);
router.post('/google', authLimiter, authController.googleAuth);
router.post('/forgot-password', authLimiter, authController.forgotPassword);
router.post('/reset-password', authLimiter, authController.resetPassword);

// Session endpoints
router.post('/logout', authController.logout);
router.get('/me', protect, authController.getMe);

module.exports = router;
