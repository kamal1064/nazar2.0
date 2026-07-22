require('dotenv').config();

/**
 * Mask sensitive secret strings showing only prefix/suffix for safe logging.
 * Example: "AQ.Ab8RN6JeVIKeFnH" -> "AQ.A*******************"
 */
function maskSecret(str) {
    if (!str || typeof str !== 'string') return '[NOT SET]';
    const trimmed = str.trim();
    if (trimmed.length <= 8) return '****';
    return trimmed.substring(0, 4) + '*'.repeat(Math.max(4, trimmed.length - 8)) + trimmed.substring(trimmed.length - 4);
}

/**
 * Mask sensitive credentials inside MongoDB connection strings for safe logging.
 * Example: "mongodb+srv://user:pass@cluster.mongodb.net" -> "mongodb+srv://****:****@cluster.mongodb.net"
 */
function maskMongoUri(uri) {
    if (!uri || typeof uri !== 'string') return '[NOT SET]';
    try {
        return uri.replace(/\/\/(.*):(.*)@/, '//$1:****@');
    } catch (e) {
        return 'mongodb://****:****@...';
    }
}

/**
 * Validate presence of required environment variables on startup.
 */
function validateConfig() {
    const isProduction = process.env.NODE_ENV === 'production';
    const warnings = [];
    const errors = [];

    if (!process.env.MONGODB_URI && isProduction) {
        warnings.push('MONGODB_URI is not set. Database features will run in offline mode.');
    }

    if (!process.env.GEMINI_API_KEY_1) {
        warnings.push('No GEMINI_API_KEY_1 configured. Scan requests will fail until an API key is provided.');
    }

    if (!process.env.JWT_SECRET) {
        warnings.push('JWT_SECRET is not set. A temporary development fallback secret will be used. Configure JWT_SECRET in production.');
    }

    if (!process.env.GOOGLE_CLIENT_ID) {
        warnings.push('GOOGLE_CLIENT_ID is not set. Google OAuth authentication button will operate in offline/disabled mode.');
    }

    if (warnings.length > 0) {
        console.warn('[Config Validation Warnings]:');
        warnings.forEach(w => console.warn(`  ⚠️ ${w}`));
    }

    if (errors.length > 0) {
        console.error('[Config Validation Errors]:');
        errors.forEach(e => console.error(`  ❌ ${e}`));
        throw new Error('Application configuration validation failed.');
    }
}

// Run validation check on module load
validateConfig();

module.exports = {
    port: parseInt(process.env.PORT || '5000', 10),
    env: process.env.NODE_ENV || 'development',
    geminiModel: process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite',
    geminiTimeoutMs: parseInt(process.env.GEMINI_TIMEOUT || '60000', 10),
    mongoUri: process.env.MONGODB_URI || '',
    mongoDbName: process.env.MONGODB_DB_NAME || 'nazar',
    emailUser: process.env.EMAIL_USER || '',
    emailAppPassword: process.env.EMAIL_APP_PASSWORD || '',
    jwtSecret: process.env.JWT_SECRET || 'nazar-dev-jwt-secret-key-2026-safe-fallback',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    clientUrl: process.env.CLIENT_URL || 'http://localhost:5000',
    maskSecret,
    maskMongoUri,
    validateConfig
};
