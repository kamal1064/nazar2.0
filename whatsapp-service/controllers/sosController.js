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

module.exports = {
    handleSendSos,
    handleReady,
    handleHealth,
    handleMetrics
};
