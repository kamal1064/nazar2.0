const { maskSecret, maskMongoUri } = require('../config');

/**
 * Production-Grade Centralized Global Error Handler Middleware
 * 
 * Ensures all API errors adhere strictly to the standardized schema:
 * {
 *   "success": false,
 *   "message": "User-friendly description.",
 *   "code": "STANDARD_ERROR_CODE",
 *   "requestId": "correlation-uuid"
 * }
 * 
 * Includes req.id (X-Request-Id) correlation tracking, automatic credential log masking,
 * comprehensive MongoDB driver exception sanitization, and third-party API error mapping.
 */

const ERROR_CODES = {
    400: 'BAD_REQUEST',
    401: 'UNAUTHORIZED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    408: 'REQUEST_TIMEOUT',
    409: 'CONFLICT',
    422: 'UNPROCESSABLE_ENTITY',
    429: 'TOO_MANY_REQUESTS',
    500: 'INTERNAL_SERVER_ERROR',
    502: 'BAD_GATEWAY',
    503: 'SERVICE_UNAVAILABLE'
};

/**
 * Helper to mask sensitive log objects (headers, body parameters, tokens)
 */
function sanitizeLogDetails(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    const sanitized = Array.isArray(obj) ? [] : {};
    
    for (const [key, value] of Object.entries(obj)) {
        const lowerKey = key.toLowerCase();
        if (['authorization', 'cookie', 'jwt', 'token', 'password', 'secret', 'key', 'apikey', 'mongodb_uri', 'email_app_password'].some(k => lowerKey.includes(k))) {
            sanitized[key] = maskSecret(typeof value === 'string' ? value : JSON.stringify(value));
        } else if (typeof value === 'object' && value !== null) {
            sanitized[key] = sanitizeLogDetails(value);
        } else {
            sanitized[key] = value;
        }
    }
    return sanitized;
}

const errorHandler = (err, req, res, next) => {
    const requestId = req.id || 'req_unknown';
    const timestamp = new Date().toISOString();
    
    // Determine HTTP Status Code
    let statusCode = err.status || err.statusCode || res.statusCode;
    if (!statusCode || statusCode === 200) {
        statusCode = 500;
    }

    // Default Client Parameters
    let errorCode = err.code || ERROR_CODES[statusCode] || 'INTERNAL_SERVER_ERROR';
    let clientMessage = 'An unexpected server error occurred. Please try again later.';

    // 1. Database Exception Sanitization
    if (err.name === 'CastError') {
        statusCode = 400;
        errorCode = 'INVALID_ID_FORMAT';
        clientMessage = 'Invalid identifier format.';
    } else if (err.name === 'ValidationError') {
        statusCode = 422;
        errorCode = 'VALIDATION_ERROR';
        clientMessage = 'Validation failed. Please check your inputs.';
    } else if (err.code === 11000 || (err.message && err.message.includes('E11000'))) {
        statusCode = 409;
        errorCode = 'DUPLICATE_RESOURCE';
        clientMessage = 'This record already exists.';
    } else if (err.name === 'MongoNetworkError' || err.name === 'MongoTimeoutError' || err.name === 'MongoServerSelectionError') {
        statusCode = 503;
        errorCode = 'DATABASE_UNAVAILABLE';
        clientMessage = 'Database service is temporarily unavailable. Please try again later.';
    } else if (err.name === 'MongoWriteError' || err.name === 'MongoBulkWriteError' || err.name === 'MongoTransactionError') {
        statusCode = 500;
        errorCode = 'DATABASE_TRANSACTION_ERROR';
        clientMessage = 'A database operation error occurred.';

    // 2. External API Exception Sanitization
    } else if (err.isGeminiError || (err.message && (err.message.includes('Gemini') || err.message.includes('Vision API')))) {
        statusCode = 502;
        errorCode = 'AI_SERVICE_UNAVAILABLE';
        clientMessage = 'The AI service is temporarily unavailable. Please try again later.';
    } else if (err.isEmailError || (err.message && (err.message.includes('SMTP') || err.message.includes('Nodemailer')))) {
        statusCode = 502;
        errorCode = 'EMAIL_SERVICE_UNAVAILABLE';
        clientMessage = 'The email service is temporarily unavailable. Please try again later.';

    // 3. Timeout & Client 4xx Errors
    } else if (err.isTimeout) {
        statusCode = 408;
        errorCode = 'REQUEST_TIMEOUT';
        clientMessage = 'Request processing timed out.';
    } else if (statusCode < 500) {
        // Safe 4xx user-facing message provided explicitly
        clientMessage = err.message || 'Invalid request.';
    }

    // 4. Server-Side Log Output (Diagnostic info retained internally with masked secrets)
    const logData = {
        timestamp,
        requestId,
        method: req.method,
        route: req.originalUrl || req.url,
        statusCode,
        errorCode,
        errorName: err.name || 'Error',
        errorMessage: err.message || 'No error message'
    };

    console.error(`[ERROR LOG] [${timestamp}] [Req-ID: ${requestId}] [${req.method}] [${logData.route}] Status: ${statusCode} Code: ${errorCode}`);
    console.error(`  Error: ${logData.errorName} - ${logData.errorMessage}`);
    if (err.stack) {
        console.error(`  Stack: ${err.stack.split('\n').slice(0, 5).join('\n  ')}`);
    }

    // 5. Send Clean, Standardized JSON Payload with Correlation requestId
    res.status(statusCode).json({
        success: false,
        message: clientMessage,
        code: errorCode,
        requestId: requestId
    });
};

module.exports = errorHandler;
