/**
 * Centralized Global Error Handler Middleware
 * 
 * Ensures all API errors adhere to a clean, standardized client response schema:
 * {
 *   "success": false,
 *   "message": "User-friendly description.",
 *   "code": "STANDARD_ERROR_CODE"
 * }
 * 
 * Prevents internal information disclosure (stack traces, raw database error dumps,
 * file system paths, exception names) while preserving complete diagnostic logs server-side.
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

const errorHandler = (err, req, res, next) => {
    const reqId = req.id || 'N/A';
    const timestamp = new Date().toISOString();
    
    // Determine status code
    let statusCode = err.status || err.statusCode || res.statusCode;
    if (!statusCode || statusCode === 200) {
        statusCode = 500;
    }

    // Default error response parameters
    let errorCode = err.code || ERROR_CODES[statusCode] || 'INTERNAL_SERVER_ERROR';
    let clientMessage = 'An unexpected server error occurred. Please try again later.';

    // Handle Database & Validation Specific Errors
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
        clientMessage = 'Record already exists.';
    } else if (err.isTimeout) {
        statusCode = 408;
        errorCode = 'REQUEST_TIMEOUT';
        clientMessage = 'Request processing timed out.';
    } else if (statusCode < 500) {
        // Safe 4xx user-facing message provided explicitly
        clientMessage = err.message || 'Invalid request.';
    }

    // Diagnostic Server-Side Logging (Never exposed to client)
    console.error(`[ERROR LOG] [${timestamp}] [Req-ID: ${reqId}] [${req.method}] [${req.originalUrl || req.url}] Status: ${statusCode} Code: ${errorCode}`);
    console.error(`  Details: ${err.message || 'No error message'}`);
    if (err.stack) {
        console.error(`  Stack: ${err.stack.split('\n').slice(0, 5).join('\n  ')}`);
    }

    // Send Clean, Standardized JSON Payload
    res.status(statusCode).json({
        success: false,
        message: clientMessage,
        code: errorCode
    });
};

module.exports = errorHandler;
