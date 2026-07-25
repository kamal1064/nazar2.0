const crypto = require('crypto');
const Contact = require('../models/Contact');
const SosLog = require('../models/SosLog');

/**
 * Perform a secure fetch POST call to the Render WhatsApp service with signature,
 * timeouts, and retry logic.
 */
async function postToMicroservice(payload, requestId, attempt = 1) {
    const url = `${process.env.WHATSAPP_SERVICE_URL}/api/send-sos`;
    const apiKey = process.env.WHATSAPP_SERVICE_API_KEY;
    const timeoutMs = parseInt(process.env.WHATSAPP_REQUEST_TIMEOUT_MS || '10000', 10);

    // Compute HMAC-SHA256 signature of the payload
    const hmac = crypto.createHmac('sha256', apiKey);
    hmac.update(JSON.stringify(payload));
    const signature = hmac.digest('hex');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        console.log(JSON.stringify({
            level: 'info',
            message: `Dispatching SOS payload to WhatsApp microservice (Attempt #${attempt})`,
            dispatchId: payload.dispatchId,
            requestId,
            timestamp: new Date().toISOString()
        }));

        const response = await fetch(url, {
            signal: controller.signal,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'X-Nazar-Signature': signature,
                'X-Request-Id': requestId
            },
            body: JSON.stringify(payload)
        });

        clearTimeout(timeoutId);

        const resData = await response.json();

        // Retry once on HTTP 500 Server Errors
        if (response.status === 500 && attempt === 1) {
            console.warn(JSON.stringify({
                level: 'warn',
                message: 'WhatsApp microservice returned 500. Retrying once...',
                dispatchId: payload.dispatchId,
                requestId,
                timestamp: new Date().toISOString()
            }));
            return await postToMicroservice(payload, requestId, 2);
        }

        return {
            status: response.status,
            ok: response.ok,
            data: resData
        };

    } catch (err) {
        clearTimeout(timeoutId);

        console.error(JSON.stringify({
            level: 'error',
            message: `Request to WhatsApp microservice failed: ${err.message}`,
            dispatchId: payload.dispatchId,
            requestId,
            timestamp: new Date().toISOString()
        }));

        // Retry once on network timeouts/errors
        if (attempt === 1) {
            console.warn(JSON.stringify({
                level: 'warn',
                message: 'Network error or timeout. Retrying once...',
                dispatchId: payload.dispatchId,
                requestId,
                timestamp: new Date().toISOString()
            }));
            return await postToMicroservice(payload, requestId, 2);
        }

        return {
            status: err.name === 'AbortError' ? 408 : 502,
            ok: false,
            data: { reason: err.name === 'AbortError' ? 'WhatsApp service timeout' : err.message }
        };
    }
}

/**
 * Endpoint to receive user SOS triggers from the browser, validate parameters,
 * and enqueue them into the WhatsApp microservice.
 * POST /api/sos
 */
async function handleSosDispatch(req, res, next) {
    const requestId = req.headers['x-request-id'] || 'req-' + crypto.randomUUID();
    const { userId, latitude, longitude, accuracy, timestamp } = req.body;

    try {
        // 1. Coordinates Validation
        const lat = parseFloat(latitude);
        const lon = parseFloat(longitude);
        if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
            return res.status(400).json({
                success: false,
                message: 'Invalid coordinate parameters. Latitude must be [-90, 90] and Longitude must be [-180, 180].',
                code: 'INVALID_COORDINATES'
            });
        }

        // 2. Retrieve User Emergency Contacts from MongoDB
        const contacts = await Contact.find({ userId });
        if (!contacts || contacts.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No emergency contacts found for the user.',
                code: 'NO_CONTACTS_CONFIGURED'
            });
        }

        // Generate correlation IDs
        const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const randPart = Math.floor(1000 + Math.random() * 9000);
        const dispatchId = `SOS-${datePart}-${randPart}`;

        // 3. Persist initial 'queued' entry in MongoDB SosLog
        const initialLog = new SosLog({
            dispatchId,
            userId,
            status: 'queued',
            queuedAt: new Date(),
            location: {
                latitude: lat,
                longitude: lon,
                accuracy: accuracy || 10
            },
            contacts: contacts.map(c => ({
                name: c.name,
                phone: c.phone,
                status: 'pending'
            }))
        });
        await initialLog.save();

        // 4. Prepare microservice dispatch payload
        const payload = {
            dispatchId,
            latitude: lat,
            longitude: lon,
            accuracy: accuracy || 10,
            timestamp: timestamp || Math.floor(Date.now() / 1000),
            contacts: contacts.map(c => ({
                name: c.name,
                phone: c.phone
            }))
        };

        // 5. Post to Render WhatsApp Service
        const serviceResult = await postToMicroservice(payload, requestId);

        if (serviceResult.ok && serviceResult.status === 202) {
            // Update SosLog status to processing
            await SosLog.updateOne({ dispatchId }, { status: 'processing', startedAt: new Date() });
            
            return res.status(202).json({
                success: true,
                dispatchId,
                status: 'queued'
            });
        } else {
            // Update SosLog status to failed
            const failReason = serviceResult.data.reason || 'Failed to dispatch to WhatsApp microservice';
            await SosLog.updateOne({ dispatchId }, { 
                status: 'failed', 
                completedAt: new Date(),
                overallError: failReason
            });

            console.error(JSON.stringify({
                level: 'error',
                message: 'WhatsApp microservice dispatch rejected',
                dispatchId,
                status: serviceResult.status,
                reason: failReason,
                timestamp: new Date().toISOString()
            }));

            return res.status(serviceResult.status >= 500 ? 502 : serviceResult.status).json({
                success: false,
                reason: failReason
            });
        }

    } catch (err) {
        console.error(JSON.stringify({
            level: 'error',
            message: 'Critical exception occurred during emergency SOS dispatch',
            error: err.message,
            requestId,
            timestamp: new Date().toISOString()
        }));
        return res.status(500).json({
            success: false,
            message: 'An internal error occurred during the emergency SOS dispatch.',
            code: 'SOS_DISPATCH_CRITICAL_ERROR'
        });
    }
}

/**
 * Secure Callback endpoint to receive processed delivery results from the WhatsApp microservice.
 * POST /api/sos/callback
 */
async function handleSosCallback(req, res, next) {
    const receivedSignature = req.headers['x-nazar-signature'];
    const apiKey = process.env.WHATSAPP_SERVICE_API_KEY;

    if (!apiKey) {
        return res.status(500).json({ success: false, reason: 'Callback secret configuration error' });
    }

    // 1. Verify HMAC Signature
    try {
        const hmac = crypto.createHmac('sha256', apiKey);
        hmac.update(JSON.stringify(req.body));
        const calculatedSignature = hmac.digest('hex');

        if (receivedSignature !== calculatedSignature) {
            return res.status(401).json({ success: false, reason: 'Invalid signature payload' });
        }
    } catch (err) {
        return res.status(500).json({ success: false, reason: 'Signature verification calculation failure' });
    }

    const { dispatchId, status, reason, startedAt, completedAt, durationMs, retryCount, workerId, results } = req.body;

    try {
        // 2. Fetch log document
        const log = await SosLog.findOne({ dispatchId });
        if (!log) {
            return res.status(404).json({ success: false, reason: `No SOS log found matching dispatchId: ${dispatchId}` });
        }

        // 3. Idempotency Check: Ignore duplicate callbacks if status is already finalized
        if (['completed', 'failed'].includes(log.status)) {
            console.log(JSON.stringify({
                level: 'info',
                message: 'Duplicate callback received. Ignored finalized SOS log.',
                dispatchId,
                timestamp: new Date().toISOString()
            }));
            return res.status(200).json({ success: true, status: 'ignored' });
        }

        // 4. Update timeline lifecycle fields
        log.status = status;
        if (startedAt) log.startedAt = new Date(startedAt);
        if (completedAt) log.completedAt = new Date(completedAt);
        if (durationMs) log.durationMs = durationMs;
        if (retryCount !== undefined) log.retryCount = retryCount;
        if (workerId) log.workerId = workerId;
        if (reason) log.overallError = reason;

        // 5. Update recipient delivery statuses
        let sentCount = 0;
        let failCount = 0;

        if (results && results.length > 0) {
            log.contacts = log.contacts.map(c => {
                const match = results.find(r => r.phone === c.phone);
                if (match) {
                    if (match.status === 'delivered' || match.status === 'fallback_link_delivered') {
                        sentCount++;
                    } else {
                        failCount++;
                    }
                    return {
                        name: c.name,
                        phone: c.phone,
                        status: match.status,
                        sentAt: completedAt ? new Date(completedAt) : new Date(),
                        error: match.reason || null
                    };
                }
                return c;
            });
        }

        log.sent = sentCount;
        log.failed = failCount;

        await log.save();

        console.log(JSON.stringify({
            level: 'info',
            message: `SOS log successfully updated from microservice callback`,
            dispatchId,
            status,
            sent: sentCount,
            failed: failCount,
            timestamp: new Date().toISOString()
        }));

        return res.status(200).json({ success: true });

    } catch (err) {
        console.error(JSON.stringify({
            level: 'error',
            message: 'Callback handling exception occurred',
            error: err.message,
            dispatchId,
            timestamp: new Date().toISOString()
        }));
        return res.status(500).json({ success: false, reason: 'Failed to process callback updates' });
    }
}

module.exports = {
    handleSosDispatch,
    handleSosCallback
};
