const crypto = require('crypto');
const openwaService = require('../services/openwaService');
const { MemoryQueue } = require('../services/queueService');

/**
 * Controller to handle SOS triggers and health/readiness monitoring
 */

/**
 * Endpoint to receive and queue an SOS request
 * POST /api/send-sos
 */
async function handleSendSos(req, res) {
    const requestId = req.headers['x-request-id'] || 'req-' + crypto.randomUUID();
    const { dispatchId, latitude, longitude, accuracy, timestamp, contacts } = req.body;

    if (!dispatchId || latitude === undefined || longitude === undefined || !contacts) {
        console.warn(JSON.stringify({
            level: 'warn',
            message: 'Bad Request: Missing required parameters in SOS payload',
            requestId,
            body: req.body,
            timestamp: new Date().toISOString()
        }));
        return res.status(400).json({ success: false, reason: 'Missing required parameters' });
    }

    try {
        const result = await MemoryQueue.enqueue({
            dispatchId,
            latitude,
            longitude,
            accuracy,
            timestamp,
            contacts
        });

        console.log(JSON.stringify({
            level: 'info',
            message: 'SOS request processed successfully',
            dispatchId,
            requestId,
            status: result.status,
            timestamp: new Date().toISOString()
        }));

        return res.status(202).json({
            success: true,
            dispatchId,
            requestId,
            status: result.status
        });
    } catch (err) {
        console.error(JSON.stringify({
            level: 'error',
            message: 'SOS enqueue exception occurred',
            error: err.message,
            dispatchId,
            requestId,
            timestamp: new Date().toISOString()
        }));
        return res.status(500).json({ success: false, reason: 'Failed to queue SOS dispatch job' });
    }
}

/**
 * Lightweight Readiness Check Endpoint
 * GET /ready
 */
async function handleReady(req, res) {
    const isReady = openwaService.isReady();
    return res.status(isReady ? 200 : 503).json({
        ready: isReady
    });
}

/**
 * Diagnostic Health Check Endpoint
 * GET /health
 */
async function handleHealth(req, res) {
    const isReady = openwaService.isReady();
    
    return res.status(isReady ? 200 : 503).json({
        success: true,
        status: isReady ? 'healthy' : 'degraded',
        openwa: {
            ready: isReady,
            connected: openwaService.connected,
            authenticated: openwaService.authenticated,
            clientState: openwaService.clientState,
            sessionReason: openwaService.sessionReason,
            lastReconnect: openwaService.lastReconnect
        }
    });
}

/**
 * Operational Metrics Endpoint
 * GET /metrics
 */
async function handleMetrics(req, res) {
    const queueStats = await MemoryQueue.stats();
    
    return res.status(200).json({
        success: true,
        status: 'healthy',
        queue: queueStats,
        uptimeSeconds: openwaService.uptimeSeconds
    });
}

/**
 * Public Endpoint to serve QR Code pairing view
 * GET /qr
 */
async function handleQr(req, res) {
    if (openwaService.isReady()) {
        res.setHeader('Content-Type', 'text/html');
        return res.send(`
            <html>
                <head>
                    <title>NAZAR WhatsApp Pairing</title>
                    <style>
                        body { font-family: sans-serif; text-align: center; padding: 2rem; background: #e3eedc; color: #128c7e; }
                        .card { background: white; padding: 2rem; border-radius: 8px; display: inline-block; box-shadow: 0 4px 6px rgba(0,0,0,0.1); margin-top: 10%; }
                    </style>
                </head>
                <body>
                    <div class="card">
                         <h2>✅ WhatsApp Connected!</h2>
                         <p>The NAZAR WhatsApp client is already logged in and running.</p>
                    </div>
                </body>
            </html>
        `);
    }

    if (!openwaService.latestQr) {
        res.setHeader('Content-Type', 'text/html');
        return res.send(`
            <html>
                <head>
                    <title>NAZAR WhatsApp Pairing</title>
                    <meta http-equiv="refresh" content="3">
                    <style>
                        body { font-family: sans-serif; text-align: center; padding: 2rem; background: #f0f2f5; }
                        .card { background: white; padding: 2rem; border-radius: 8px; display: inline-block; box-shadow: 0 4px 6px rgba(0,0,0,0.1); margin-top: 10%; }
                    </style>
                </head>
                <body>
                    <div class="card">
                         <h2>⏳ Waiting for QR Code...</h2>
                         <p>The browser is starting up. This page will refresh automatically.</p>
                    </div>
                </body>
            </html>
        `);
    }

    res.setHeader('Content-Type', 'text/html');
    return res.send(`
        <html>
            <head>
                <title>NAZAR WhatsApp Pairing</title>
                <meta http-equiv="refresh" content="5">
                <style>
                    body { font-family: sans-serif; text-align: center; padding: 2rem; background: #f0f2f5; }
                    .card { background: white; padding: 2rem; border-radius: 8px; display: inline-block; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
                    img { margin: 1rem 0; width: 280px; height: 280px; border: 1px solid #ccc; }
                </style>
            </head>
            <body>
                <div class="card">
                    <h2>Scan QR Code to Link WhatsApp</h2>
                    <p>Open WhatsApp on your phone -> Linked Devices -> Link a Device, and scan the QR code below:</p>
                    <img src="${openwaService.latestQr}" alt="WhatsApp Web QR Code" />
                    <p style="color: #666; font-size: 0.8rem;">This page auto-refreshes every 5 seconds.</p>
                </div>
            </body>
        </html>
    `);
}

/**
 * Public Root Landing Page Endpoint
 * GET /
 */
async function handleRoot(req, res) {
    res.setHeader('Content-Type', 'text/html');
    return res.send(`
        <html>
            <head>
                <title>NAZAR WhatsApp Microservice</title>
                <style>
                    body { font-family: sans-serif; text-align: center; padding: 3rem; background: #f0f2f5; color: #333; }
                    .card { background: white; padding: 2.5rem; border-radius: 8px; display: inline-block; box-shadow: 0 4px 6px rgba(0,0,0,0.1); max-width: 450px; }
                    h1 { color: #128c7e; margin-bottom: 0.5rem; }
                    p { color: #666; margin-bottom: 1.5rem; line-height: 1.5; }
                    .btn { background: #128c7e; color: white; padding: 0.75rem 1.5rem; text-decoration: none; border-radius: 4px; font-weight: bold; display: inline-block; }
                    .btn:hover { background: #0b665c; }
                </style>
            </head>
            <body>
                <div class="card">
                    <h1>NAZAR WhatsApp Service</h1>
                    <p>The standalone emergency SOS dispatch microservice is running successfully on Render.</p>
                    <a href="/qr" class="btn">Pair WhatsApp Account</a>
                </div>
            </body>
        </html>
    `);
}

module.exports = {
    handleSendSos,
    handleReady,
    handleHealth,
    handleMetrics,
    handleQr,
    handleRoot
};
