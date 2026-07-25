const crypto = require('crypto');

/**
 * Middleware to secure endpoint calls from the Vercel gateway using:
 * 1. Bearer Token authorization
 * 2. HMAC-SHA256 Payload Signature verification
 */
function apiKeyAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    const receivedSignature = req.headers['x-nazar-signature'];
    const apiKey = process.env.INTERNAL_WHATSAPP_API_KEY;

    if (!apiKey) {
        console.error(JSON.stringify({
            level: 'error',
            message: 'INTERNAL_WHATSAPP_API_KEY environment variable is not set.',
            timestamp: new Date().toISOString()
        }));
        return res.status(500).json({ success: false, reason: 'Internal server security configuration error' });
    }

    // 1. Bearer Token Verification
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.warn(JSON.stringify({
            level: 'warn',
            message: 'Unauthorized request: missing or invalid Bearer token',
            requestId: req.headers['x-request-id'] || 'N/A',
            timestamp: new Date().toISOString()
        }));
        return res.status(401).json({ success: false, reason: 'Unauthorized: missing or invalid Bearer token' });
    }

    const token = authHeader.split(' ')[1];
    if (token !== apiKey) {
        console.warn(JSON.stringify({
            level: 'warn',
            message: 'Unauthorized request: invalid API key token',
            requestId: req.headers['x-request-id'] || 'N/A',
            timestamp: new Date().toISOString()
        }));
        return res.status(401).json({ success: false, reason: 'Unauthorized: invalid API token' });
    }

    // 2. HMAC-SHA256 Payload Verification for POST/PUT requests
    if (['POST', 'PUT'].includes(req.method)) {
        if (!receivedSignature) {
            console.warn(JSON.stringify({
                level: 'warn',
                message: 'Unauthorized request: missing payload verification signature',
                requestId: req.headers['x-request-id'] || 'N/A',
                timestamp: new Date().toISOString()
            }));
            return res.status(401).json({ success: false, reason: 'Unauthorized: missing verification signature' });
        }

        try {
            // Compute expected signature of the parsed body
            const hmac = crypto.createHmac('sha256', apiKey);
            hmac.update(JSON.stringify(req.body));
            const calculatedSignature = hmac.digest('hex');

            if (receivedSignature !== calculatedSignature) {
                console.warn(JSON.stringify({
                    level: 'warn',
                    message: 'Unauthorized request: payload signature verification failed',
                    requestId: req.headers['x-request-id'] || 'N/A',
                    timestamp: new Date().toISOString()
                }));
                return res.status(401).json({ success: false, reason: 'Unauthorized: invalid payload signature' });
            }
        } catch (err) {
            console.error(JSON.stringify({
                level: 'error',
                message: 'Signature calculation exception occurred',
                error: err.message,
                requestId: req.headers['x-request-id'] || 'N/A',
                timestamp: new Date().toISOString()
            }));
            return res.status(500).json({ success: false, reason: 'Signature validation calculation failure' });
        }
    }

    next();
}

module.exports = apiKeyAuth;
