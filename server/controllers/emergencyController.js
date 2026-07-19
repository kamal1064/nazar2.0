const { sendEmergencyEmail } = require('../services/emailService');

async function handleSendEmergencyEmail(req, res, next) {
    try {
        const {
            contacts,
            userName = 'Kamal',
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

        // Validation
        if (latitude === undefined || longitude === undefined || isNaN(latitude) || isNaN(longitude)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid latitude or longitude coordinates provided.'
            });
        }

        if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No emergency contacts provided.'
            });
        }

        const mapsUrl = googleMapsUrl || `https://www.google.com/maps?q=${latitude},${longitude}`;
        const results = [];
        let sentCount = 0;
        let failCount = 0;

        for (const contact of contacts) {
            const recipientEmail = contact.email || contact.emailAddress;
            const recipientName = contact.name || contact.fullName || 'Emergency Contact';

            if (!recipientEmail || !recipientEmail.includes('@')) {
                results.push({
                    email: recipientEmail || 'unknown',
                    name: recipientName,
                    success: false,
                    error: 'Invalid or missing email address'
                });
                failCount++;
                continue;
            }

            try {
                const info = await sendEmergencyEmail({
                    recipientEmail,
                    recipientName,
                    userName,
                    latitude,
                    longitude,
                    accuracy,
                    googleMapsUrl: mapsUrl,
                    date,
                    time,
                    battery,
                    deviceInfo,
                    isTest
                });

                console.log(`[EmergencyController] Email sent to ${recipientEmail}:`, info.messageId);
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
                    error: err.message
                });
                failCount++;
            }
        }

        return res.status(200).json({
            success: sentCount > 0,
            message: sentCount > 0 ? 'Emergency emails processed successfully.' : 'Failed to send emergency emails.',
            summary: {
                total: contacts.length,
                sent: sentCount,
                failed: failCount
            },
            results
        });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    handleSendEmergencyEmail
};
