const Contact = require('../models/Contact');
const SosLog = require('../models/SosLog');
const openwaService = require('../services/openwaService');
const { formatPhoneNumber, formatRichSosMessage } = require('../utils/locationFormatter');

async function handleSosDispatch(req, res, next) {
    const startTime = Date.now();

    try {
        const { userId, latitude, longitude, accuracy } = req.body;

        // Generate a unique delivery dispatchId: SOS-YYYYMMDD-RAND4
        const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const randPart = Math.floor(1000 + Math.random() * 9000);
        const dispatchId = `SOS-${datePart}-${randPart}`;

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

        // 2. Circuit Breaker Check
        if (!openwaService.isReady()) {
            if (openwaService.isServerless) {
                return res.status(503).json({
                    success: false,
                    reason: 'WhatsApp service unavailable in serverless environment.',
                    environment: 'vercel',
                    retryable: false
                });
            } else {
                return res.status(503).json({
                    success: false,
                    reason: 'WhatsApp service unavailable',
                    environment: 'local',
                    retryable: true
                });
            }
        }

        // 3. Query User Emergency Contacts
        const contacts = await Contact.find({ userId });
        if (!contacts || contacts.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No emergency contacts found for the user.',
                code: 'NO_CONTACTS_CONFIGURED'
            });
        }

        // 4. Format SOS message details
        const alertMessageText = formatRichSosMessage(lat, lon, accuracy || 10, Date.now());

        // Concurrency settings
        const maxConcurrent = parseInt(process.env.OPENWA_MAX_CONCURRENT_SENDS || '4', 10);
        const results = [];
        let sentCount = 0;
        let failCount = 0;

        // Clean & validate contacts list
        const processedContacts = contacts.map(c => {
            const jid = formatPhoneNumber(c.phone);
            return {
                dbContact: c,
                jid,
                name: c.name,
                phone: c.phone
            };
        });

        // Split into chunks of size maxConcurrent
        const chunks = [];
        for (let i = 0; i < processedContacts.length; i += maxConcurrent) {
            chunks.push(processedContacts.slice(i, i + maxConcurrent));
        }

        // Process chunks sequentially
        for (const chunk of chunks) {
            const chunkPromises = chunk.map(async (contactInfo) => {
                const contactStart = Date.now();
                const { name, phone, jid } = contactInfo;

                if (!jid) {
                    results.push({
                        name,
                        phone,
                        status: 'skipped',
                        sentAt: new Date(),
                        durationMs: Date.now() - contactStart,
                        error: 'Invalid phone number format'
                    });
                    failCount++;
                    return;
                }

                try {
                    // Try to send native location card
                    try {
                        await openwaService.sendLocation(jid, lat, lon, 'NAZAR SOS Emergency');
                        // Send text body companion
                        await openwaService.sendMessage(jid, alertMessageText);
                    } catch (locationErr) {
                        console.warn(`[SosController] Native location send failed to ${name}. Retrying with Google Maps link fallback...`, locationErr.message);
                        
                        // Fallback text alert (incorporates maps URL)
                        await openwaService.sendMessage(jid, alertMessageText);
                    }

                    results.push({
                        name,
                        phone,
                        status: 'sent',
                        sentAt: new Date(),
                        durationMs: Date.now() - contactStart
                    });
                    sentCount++;

                } catch (sendErr) {
                    console.error(`[SosController] WhatsApp alert failed to send to ${name}:`, sendErr.message);
                    results.push({
                        name,
                        phone,
                        status: 'failed',
                        sentAt: new Date(),
                        durationMs: Date.now() - contactStart,
                        error: sendErr.message || 'Send failed'
                    });
                    failCount++;
                }
            });

            await Promise.allSettled(chunkPromises);
        }

        const totalDuration = Date.now() - startTime;

        // 5. Persist SosLog Audit entry in MongoDB
        const log = new SosLog({
            dispatchId,
            userId,
            timestamp: new Date(),
            location: {
                latitude: lat,
                longitude: lon,
                accuracy: accuracy || 10
            },
            contacts: results.map(r => ({
                name: r.name,
                phone: r.phone,
                status: r.status,
                sentAt: r.sentAt,
                durationMs: r.durationMs,
                error: r.error
            })),
            sent: sentCount,
            failed: failCount,
            deliveryTime: totalDuration
        });

        await log.save();

        console.log(`[SOS] User ID: ${userId} | Dispatch ID: ${dispatchId} | Time: ${new Date().toISOString()} | Lat/Lng: ${lat}/${lon} | Contacts: ${contacts.length} | Sent: ${sentCount} | Failed: ${failCount} | Duration: ${totalDuration}ms`);

        return res.status(200).json({
            dispatchId,
            success: sentCount > 0,
            sent: sentCount,
            failed: failCount,
            contacts: results.map(r => ({
                name: r.name,
                phone: r.phone,
                status: r.status === 'skipped' ? 'failed' : r.status,
                reason: r.error || null
            }))
        });

    } catch (err) {
        console.error('[SosController] Critical failure during emergency dispatch:', err);
        return res.status(500).json({
            success: false,
            message: 'An internal error occurred during the emergency SOS dispatch.',
            code: 'SOS_DISPATCH_CRITICAL_ERROR',
            overallError: err.message
        });
    }
}

module.exports = {
    handleSosDispatch
};
