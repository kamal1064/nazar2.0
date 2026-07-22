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

// Helper utilities for PKCE & Signed State Token
function generateCodeVerifier() {
    return crypto.randomBytes(32).toString('base64url');
}

function generateCodeChallenge(verifier) {
    return crypto.createHash('sha256').update(verifier).digest('base64url');
}

function signStateToken(payloadObj) {
    const payloadStr = Buffer.from(JSON.stringify(payloadObj)).toString('base64url');
    const signature = crypto.createHmac('sha256', config.jwtSecret).update(payloadStr).digest('base64url');
    return `${payloadStr}.${signature}`;
}

function verifyStateToken(signedStateStr) {
    if (!signedStateStr || typeof signedStateStr !== 'string') return null;
    const parts = signedStateStr.split('.');
    if (parts.length !== 2) return null;

    const [payloadStr, signature] = parts;
    const expectedSignature = crypto.createHmac('sha256', config.jwtSecret).update(payloadStr).digest('base64url');

    try {
        if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
            return null; // Signature mismatch / tampering
        }
        return JSON.parse(Buffer.from(payloadStr, 'base64url').toString('utf8'));
    } catch (e) {
        return null;
    }
}

function sanitizeReturnTo(returnTo) {
    if (!returnTo || typeof returnTo !== 'string') return '';
    const trimmed = returnTo.trim();
    if (trimmed.startsWith('/') && !trimmed.startsWith('//') && !trimmed.includes('://')) {
        return trimmed;
    }
    return '';
}

// GET /api/auth/google (Initiate Google OAuth 2.0 Authorization Code Flow with PKCE & HMAC State)
exports.initiateGoogleOAuth = (req, res) => {
    const clientId = config.googleClientId;
    if (!clientId) {
        console.warn('[Google OAuth] GOOGLE_CLIENT_ID is not configured in environment variables.');
        return res.redirect('/?authError=google_oauth_not_configured');
    }

    const deviceId = req.query.deviceId || '';
    const returnTo = sanitizeReturnTo(req.query.returnTo);

    // PKCE generation
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    // Signed state creation
    const stateObj = {
        nonce: crypto.randomBytes(16).toString('hex'),
        deviceId: deviceId,
        returnTo: returnTo
    };
    const signedState = signStateToken(stateObj);

    // Store state and PKCE verifier in HttpOnly cookies
    const cookieOpts = {
        httpOnly: true,
        secure: config.env === 'production',
        sameSite: 'lax',
        maxAge: 10 * 60 * 1000 // 10 minutes
    };

    res.cookie('nazar_oauth_state', signedState, cookieOpts);
    res.cookie('nazar_pkce_verifier', codeVerifier, cookieOpts);

    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${protocol}://${host}/api/auth/google/callback`;

    const googleAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    googleAuthUrl.searchParams.append('client_id', clientId);
    googleAuthUrl.searchParams.append('redirect_uri', redirectUri);
    googleAuthUrl.searchParams.append('response_type', 'code');
    googleAuthUrl.searchParams.append('scope', 'openid email profile');
    googleAuthUrl.searchParams.append('state', signedState);
    googleAuthUrl.searchParams.append('code_challenge', codeChallenge);
    googleAuthUrl.searchParams.append('code_challenge_method', 'S256');
    googleAuthUrl.searchParams.append('prompt', 'select_account');

    return res.redirect(googleAuthUrl.toString());
};

// GET /api/auth/google/callback (Process Google OAuth 2.0 Callback with PKCE & Account Merge Safety)
exports.googleOAuthCallback = async (req, res, next) => {
    try {
        const { code, state, error } = req.query;
        const savedStateCookie = req.cookies ? req.cookies.nazar_oauth_state : null;
        const savedPkceVerifier = req.cookies ? req.cookies.nazar_pkce_verifier : null;

        res.clearCookie('nazar_oauth_state');
        res.clearCookie('nazar_pkce_verifier');

        if (error || !code) {
            console.warn('[Google OAuth Callback] Authorization error or user cancelled:', error);
            const errCode = error === 'access_denied' ? 'access_denied' : 'google_oauth_cancelled';
            return res.redirect(`/?authError=${errCode}`);
        }

        // Validate state for CSRF protection & HMAC signature
        const verifiedStateObj = verifyStateToken(state);
        if (!verifiedStateObj || (savedStateCookie && state !== savedStateCookie)) {
            console.warn('[Google OAuth Callback] CSRF State validation failed.');
            return res.redirect('/?authError=invalid_state');
        }

        const deviceId = verifiedStateObj.deviceId || '';
        const returnTo = sanitizeReturnTo(verifiedStateObj.returnTo);

        const clientId = config.googleClientId;
        const clientSecret = config.googleClientSecret;
        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        const host = req.headers['x-forwarded-host'] || req.get('host');
        const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${protocol}://${host}/api/auth/google/callback`;

        // Exchange authorization code for tokens with PKCE
        const tokenParams = new URLSearchParams({
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code'
        });

        if (savedPkceVerifier) {
            tokenParams.append('code_verifier', savedPkceVerifier);
        }

        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: tokenParams
        });

        if (!tokenRes.ok) {
            const errText = await tokenRes.text();
            console.error('[Google OAuth Token Exchange Failed]', errText);
            return res.redirect('/?authError=token_exchange_failed');
        }

        const tokens = await tokenRes.json();
        const accessToken = tokens.access_token;

        // Fetch User Profile from Google UserInfo endpoint
        const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        if (!userRes.ok) {
            console.error('[Google OAuth UserInfo Failed]');
            return res.redirect('/?authError=userinfo_failed');
        }

        const profile = await userRes.json();
        if (profile.email_verified !== true && profile.email_verified !== 'true') {
            return res.redirect('/?authError=unverified_email');
        }

        const cleanEmail = profile.email.trim().toLowerCase();
        const googleId = profile.sub;
        const name = profile.name || 'Google User';
        const picture = profile.picture || '';

        // Safe User Lookup & Account Merge (Prevent Duplicate Google IDs)
        let user = await User.findOne({ googleId: googleId });

        if (!user) {
            user = await User.findOne({ email: cleanEmail });
            if (user) {
                // Ensure no OTHER account already claims this googleId
                const googleIdConflict = await User.findOne({ googleId: googleId, _id: { $ne: user._id } });
                if (googleIdConflict) {
                    console.warn('[Google OAuth Conflict] Google ID already associated with another user account.');
                    return res.redirect('/?authError=account_conflict');
                }
                user.googleId = googleId;
                if (picture && !user.profilePicture) user.profilePicture = picture;
                user.emailVerified = true;
                user.lastLogin = new Date();
                await user.save();
            } else {
                user = new User({
                    googleId: googleId,
                    email: cleanEmail,
                    name: name,
                    profilePicture: picture,
                    provider: 'google',
                    emailVerified: true,
                    lastLogin: new Date()
                });
                await user.save();
            }
        } else {
            user.emailVerified = true;
            if (picture && !user.profilePicture) user.profilePicture = picture;
            user.lastLogin = new Date();
            await user.save();
        }

        if (deviceId) {
            await migrateDeviceSession(deviceId, user._id);
        }

        // Issue JWT token and set HttpOnly Cookie
        const token = jwt.sign({ id: user._id }, config.jwtSecret, {
            expiresIn: config.jwtExpiresIn
        });

        const cookieOptions = {
            expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            httpOnly: true,
            secure: config.env === 'production',
            sameSite: 'lax'
        };

        res.cookie('token', token, cookieOptions);

        const returnQuery = returnTo ? `&returnTo=${encodeURIComponent(returnTo)}` : '';
        return res.redirect(`/?authSuccess=google${returnQuery}`);
    } catch (err) {
        console.error('[Google OAuth Callback Exception]', err);
        return res.redirect('/?authError=server_error');
    }
};

// POST /api/auth/google (API Token Endpoint)
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
