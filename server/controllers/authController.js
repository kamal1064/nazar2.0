const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const Contact = require('../models/Contact');
const Settings = require('../models/Settings');
const Scan = require('../models/Scan');
const config = require('../config');
const { sendPasswordResetEmail } = require('../services/emailService');

/**
 * Generate JWT token and set HttpOnly cookie response
 */
const sendAuthTokenResponse = (user, statusCode, res, message = 'Authentication successful.') => {
    const token = jwt.sign({ id: user._id }, config.jwtSecret, {
        expiresIn: config.jwtExpiresIn
    });

    const cookieOptions = {
        expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        httpOnly: true,
        secure: config.env === 'production',
        sameSite: 'lax'
    };

    const userData = {
        _id: user._id,
        email: user.email || '',
        name: user.name || 'Nazar User',
        profilePicture: user.profilePicture || '',
        provider: user.provider || 'local',
        emailVerified: !!user.emailVerified,
        createdAt: user.createdAt
    };

    res.status(statusCode)
        .cookie('token', token, cookieOptions)
        .json({
            success: true,
            message,
            token,
            data: userData
        });
};

/**
 * Perform atomic device session migration to authenticated User account
 */
const migrateDeviceSession = async (deviceId, newUserId) => {
    if (!deviceId || !deviceId.trim() || !newUserId) return;
    const cleanDeviceId = deviceId.trim();

    try {
        const tempDeviceUser = await User.findOne({ deviceId: cleanDeviceId });
        if (!tempDeviceUser || tempDeviceUser._id.toString() === newUserId.toString()) {
            return; // No migration needed
        }

        const oldUserId = tempDeviceUser._id;
        console.log(`[Auth Migration] Migrating device session data from ${oldUserId} to ${newUserId}...`);

        let session = null;
        let useTransaction = false;

        try {
            session = await mongoose.startSession();
            session.startTransaction();
            useTransaction = true;
        } catch (sessErr) {
            console.warn('[Auth Migration] MongoDB transactions unsupported on standalone instance. Performing ordered fallback migration.');
        }

        const options = useTransaction && session ? { session } : {};

        try {
            // Re-assign emergency contacts
            await Contact.updateMany({ userId: oldUserId }, { userId: newUserId }, options);

            // Re-assign settings if user doesn't already have settings
            const existingSettings = await Settings.findOne({ userId: newUserId }, null, options);
            if (!existingSettings) {
                await Settings.updateMany({ userId: oldUserId }, { userId: newUserId }, options);
            }

            // Re-assign scan history
            await Scan.updateMany({ userId: oldUserId }, { userId: newUserId }, options);

            // Clean up temporary device user record
            await User.findByIdAndDelete(oldUserId, options);

            if (useTransaction && session) {
                await session.commitTransaction();
            }
            console.log(`[Auth Migration] Successfully transferred device session data to user ${newUserId}.`);
        } catch (err) {
            if (useTransaction && session) {
                await session.abortTransaction();
            }
            console.error('[Auth Migration] Migration failed:', err.message);
        } finally {
            if (session) {
                session.endSession();
            }
        }
    } catch (err) {
        console.error('[Auth Migration] Device migration error:', err.message);
    }
};

/**
 * Password strength validator
 * Requires: 8+ chars, uppercase, lowercase, number, special char
 */
const validatePasswordRules = (password) => {
    if (!password || typeof password !== 'string' || password.length < 8) return false;
    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasNum = /[0-9]/.test(password);
    const hasSpecial = /[^A-Za-z0-9]/.test(password);
    return hasUpper && hasLower && hasNum && hasSpecial;
};

// POST /api/auth/signup
exports.signup = async (req, res, next) => {
    try {
        const { name, email, password, deviceId } = req.body;

        if (!name || typeof name !== 'string' || !name.trim()) {
            return res.status(400).json({ success: false, message: 'Please provide your full name.', code: 'VALIDATION_ERROR' });
        }
        if (!email || typeof email !== 'string' || !email.includes('@')) {
            return res.status(400).json({ success: false, message: 'Please provide a valid email address.', code: 'VALIDATION_ERROR' });
        }
        if (!validatePasswordRules(password)) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 8 characters long and contain uppercase, lowercase, number, and special character.',
                code: 'WEAK_PASSWORD'
            });
        }

        const cleanEmail = email.trim().toLowerCase();
        const existingUser = await User.findOne({ email: cleanEmail });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'An account with this email address already exists. Please log in.',
                code: 'EMAIL_EXISTS'
            });
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        const user = new User({
            name: name.trim(),
            email: cleanEmail,
            password: hashedPassword,
            provider: 'local',
            lastLogin: new Date()
        });

        await user.save();

        if (deviceId) {
            await migrateDeviceSession(deviceId, user._id);
        }

        sendAuthTokenResponse(user, 201, res, 'Account created successfully.');
    } catch (err) {
        next(err);
    }
};

// POST /api/auth/login
exports.login = async (req, res, next) => {
    try {
        const { email, password, deviceId } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Please provide email and password.', code: 'VALIDATION_ERROR' });
        }

        const cleanEmail = email.trim().toLowerCase();
        const user = await User.findOne({ email: cleanEmail }).select('+password');

        if (!user || !user.password) {
            return res.status(401).json({ success: false, message: 'Invalid email or password.', code: 'INVALID_CREDENTIALS' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Invalid email or password.', code: 'INVALID_CREDENTIALS' });
        }

        user.lastLogin = new Date();
        await user.save();

        if (deviceId) {
            await migrateDeviceSession(deviceId, user._id);
        }

        sendAuthTokenResponse(user, 200, res, 'Log in successful.');
    } catch (err) {
        next(err);
    }
};

// POST /api/auth/google
exports.googleAuth = async (req, res, next) => {
    try {
        const { credential, googleId, email, name, picture, deviceId } = req.body;
        let verifiedEmail = email;
        let verifiedGoogleId = googleId;
        let verifiedName = name;
        let verifiedPicture = picture;

        // If Google Credential ID Token passed, verify via fetch or google tokeninfo API
        if (credential && typeof credential === 'string') {
            try {
                const fetchRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
                if (fetchRes.ok) {
                    const payload = await fetchRes.json();
                    if (payload.email_verified === 'true' || payload.email_verified === true) {
                        verifiedEmail = payload.email;
                        verifiedGoogleId = payload.sub;
                        verifiedName = payload.name || verifiedName;
                        verifiedPicture = payload.picture || verifiedPicture;
                    } else {
                        return res.status(400).json({ success: false, message: 'Google email is not verified.', code: 'UNVERIFIED_EMAIL' });
                    }
                }
            } catch (e) {
                console.warn('[GoogleAuth] Could not reach Google tokeninfo endpoint, relying on client payload:', e.message);
            }
        }

        if (!verifiedEmail) {
            return res.status(400).json({ success: false, message: 'Missing Google user email.', code: 'VALIDATION_ERROR' });
        }

        const cleanEmail = verifiedEmail.trim().toLowerCase();
        let user = await User.findOne({ $or: [{ googleId: verifiedGoogleId }, { email: cleanEmail }] });

        if (user) {
            // Merge Google details into existing email account if matched by verified email
            let updated = false;
            if (!user.googleId && verifiedGoogleId) {
                user.googleId = verifiedGoogleId;
                updated = true;
            }
            if (verifiedPicture && !user.profilePicture) {
                user.profilePicture = verifiedPicture;
                updated = true;
            }
            user.emailVerified = true;
            user.lastLogin = new Date();
            await user.save();
        } else {
            // Create new Google User
            user = new User({
                googleId: verifiedGoogleId,
                email: cleanEmail,
                name: verifiedName || 'Nazar User',
                profilePicture: verifiedPicture || '',
                provider: 'google',
                emailVerified: true,
                lastLogin: new Date()
            });
            await user.save();
        }

        if (deviceId) {
            await migrateDeviceSession(deviceId, user._id);
        }

        sendAuthTokenResponse(user, 200, res, 'Google authentication successful.');
    } catch (err) {
        next(err);
    }
};

// POST /api/auth/forgot-password
exports.forgotPassword = async (req, res, next) => {
    try {
        const { email } = req.body;
        if (!email || !email.includes('@')) {
            return res.status(400).json({ success: false, message: 'Please provide a valid email address.', code: 'VALIDATION_ERROR' });
        }

        const cleanEmail = email.trim().toLowerCase();
        const user = await User.findOne({ email: cleanEmail });

        if (!user) {
            // Return 200 to prevent email enumeration
            return res.status(200).json({
                success: true,
                message: 'If an account exists with that email, a password reset link has been sent.'
            });
        }

        // Generate reset token
        const resetToken = crypto.randomBytes(32).toString('hex');
        const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

        user.resetPasswordToken = hashedToken;
        user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
        await user.save();

        const resetUrl = `${config.clientUrl || 'http://localhost:5000'}?resetToken=${resetToken}`;

        try {
            await sendPasswordResetEmail({
                recipientEmail: user.email,
                recipientName: user.name,
                resetUrl
            });
            return res.status(200).json({
                success: true,
                message: 'Password reset link sent to your email.'
            });
        } catch (emailErr) {
            user.resetPasswordToken = undefined;
            user.resetPasswordExpires = undefined;
            await user.save();
            return res.status(500).json({
                success: false,
                message: 'Email delivery failed. Please try again later.',
                code: 'EMAIL_SEND_FAILED'
            });
        }
    } catch (err) {
        next(err);
    }
};

// POST /api/auth/reset-password
exports.resetPassword = async (req, res, next) => {
    try {
        const { token, password } = req.body;

        if (!token || !password) {
            return res.status(400).json({ success: false, message: 'Token and new password are required.', code: 'VALIDATION_ERROR' });
        }

        if (!validatePasswordRules(password)) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 8 characters long and contain uppercase, lowercase, number, and special character.',
                code: 'WEAK_PASSWORD'
            });
        }

        const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
        const user = await User.findOne({
            resetPasswordToken: hashedToken,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({
                success: false,
                message: 'Password reset token is invalid or has expired.',
                code: 'INVALID_TOKEN'
            });
        }

        user.password = await bcrypt.hash(password, 12);
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        user.lastLogin = new Date();
        await user.save();

        sendAuthTokenResponse(user, 200, res, 'Password reset successful. You are now logged in.');
    } catch (err) {
        next(err);
    }
};

// GET /api/auth/me
exports.getMe = async (req, res, next) => {
    try {
        res.status(200).json({
            success: true,
            data: req.user
        });
    } catch (err) {
        next(err);
    }
};

// POST /api/auth/logout
exports.logout = async (req, res, next) => {
    try {
        res.cookie('token', 'none', {
            expires: new Date(Date.now() + 10 * 1000),
            httpOnly: true
        });
        res.status(200).json({
            success: true,
            message: 'Successfully logged out.'
        });
    } catch (err) {
        next(err);
    }
};
