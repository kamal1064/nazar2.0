const { sendEmergencyEmail, sendSafeEmail } = require('../services/emailService');

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

async function handleSendEmergencyEmail(req, res, next) {
    try {
        const {
            contacts,
            userName = '',
            latitude,
            longitude,
            accuracy = 10,
            googleMapsUrl,
            date = new Date().toLocaleDateString(),
            time = new Date().toLocaleTimeString(),
            battery = 'N/A',
            deviceInfo = '',
            isTest = false
        } = req.body;

        // Strict Coordinate Validation
        const lat = parseFloat(latitude);
        const lon = parseFloat(longitude);
        if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
            return res.status(400).json({
                success: false,
                message: 'Invalid location coordinates.',
                code: 'INVALID_COORDINATES'
            });
        }

        // Contact List Validation & Max 5 Limit
        if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No emergency contacts provided.',
                code: 'NO_CONTACTS_PROVIDED'
            });
        }

        const validContacts = contacts.slice(0, 5); // Limit max contacts to 5
        const mapsUrl = googleMapsUrl || `https://www.google.com/maps?q=${lat},${lon}`;
        const results = [];
        let sentCount = 0;
        let failCount = 0;

        for (const contact of validContacts) {
            const recipientEmail = (contact.email || contact.emailAddress || '').trim();
            const recipientName = (contact.name || contact.fullName || 'Emergency Contact').trim();

            if (!recipientEmail || !EMAIL_REGEX.test(recipientEmail)) {
                results.push({
                    email: recipientEmail || 'unknown',
                    name: recipientName,
                    success: false,
                    error: 'Invalid email address format'
                });
                failCount++;
                continue;
            }

            try {
                const info = await sendEmergencyEmail({
                    recipientEmail,
                    recipientName,
                    userName,
                    latitude: lat,
                    longitude: lon,
                    accuracy: Math.round(accuracy),
                    googleMapsUrl: mapsUrl,
                    date,
                    time,
                    battery,
                    deviceInfo,
                    isTest
                });

                console.log(`[EmergencyController] Email sent successfully to ${recipientEmail}`);
                results.push({
                    email: recipientEmail,
                    name: recipientName,
                    success: true,
                    messageId: info.messageId
                });
                sentCount++;
            } catch (err) {
                console.error(`[EmergencyController] Failed to send email to ${recipientEmail}:`, err.message);
                results.push({
                    email: recipientEmail,
                    name: recipientName,
                    success: false,
                    error: 'Delivery failed'
                });
                failCount++;
            }
        }

        return res.status(200).json({
            success: sentCount > 0,
            message: sentCount > 0 ? 'Emergency emails processed.' : 'Failed to send emergency emails.',
            summary: {
                total: validContacts.length,
                sent: sentCount,
                failed: failCount
            },
            results
        });
    } catch (err) {
        console.error("[EmergencyController] Internal error during emergency email dispatch:", err);
        return res.status(500).json({
            success: false,
            message: 'An internal server error occurred while sending emergency emails.',
            code: 'EMERGENCY_DISPATCH_ERROR'
        });
    }
}

async function handleSendSafeEmail(req, res, next) {
    try {
        const {
            contacts,
            userName = '',
            date = new Date().toLocaleDateString(),
            time = new Date().toLocaleTimeString()
        } = req.body;

        if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No emergency contacts provided.'
            });
        }

        const validContacts = contacts.slice(0, 5);
        const results = [];
        let sentCount = 0;
        let failCount = 0;

        for (const contact of validContacts) {
            const recipientEmail = (contact.email || contact.emailAddress || '').trim();
            const recipientName = (contact.name || contact.fullName || 'Emergency Contact').trim();

            if (!recipientEmail || !EMAIL_REGEX.test(recipientEmail)) {
                failCount++;
                continue;
            }

            try {
                const info = await sendSafeEmail({
                    recipientEmail,
                    recipientName,
                    userName,
                    date,
                    time
                });
                results.push({ email: recipientEmail, success: true });
                sentCount++;
            } catch (err) {
                console.error(`[EmergencyController] Failed to send Safe email to ${recipientEmail}:`, err.message);
                results.push({ email: recipientEmail, success: false });
                failCount++;
            }
        }

        return res.status(200).json({
            success: sentCount > 0,
            message: 'Safety update emails processed.',
            summary: { total: validContacts.length, sent: sentCount, failed: failCount },
            results
        });
    } catch (err) {
        console.error("[EmergencyController] Internal error during Safe email dispatch:", err);
        return res.status(500).json({
            success: false,
            message: 'An internal server error occurred while sending safety updates.',
            code: 'EMERGENCY_DISPATCH_ERROR'
        });
    }
}

module.exports = {
    handleSendEmergencyEmail,
    handleSendSafeEmail
};
