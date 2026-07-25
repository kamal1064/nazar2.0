/**
 * Formats phone numbers into standardized WhatsApp JIDs (<number>@c.us)
 * and formats coordinates into emergency URLs and message bodies.
 */

/**
 * Clean phone numbers and append @c.us JID namespace suffix
 */
function normalizePhoneNumber(rawNumber) {
    if (!rawNumber) return null;
    
    // Strip all non-numeric characters
    let cleaned = rawNumber.replace(/[^0-9]/g, '');

    // Prepend default country code if exactly 10 digits
    const defaultCountry = process.env.OPENWA_DEFAULT_COUNTRY_CODE || '91';
    if (cleaned.length === 10) {
        cleaned = defaultCountry + cleaned;
    }

    return `${cleaned}@c.us`;
}

/**
 * Generate standard Google Maps coordinates link URL
 */
function getGoogleMapsUrl(latitude, longitude) {
    return `https://www.google.com/maps?q=${latitude},${longitude}`;
}

/**
 * Construct emergency SOS text message body
 */
function constructSosMessage(name, latitude, longitude, accuracy) {
    const mapsLink = getGoogleMapsUrl(latitude, longitude);
    return `🚨 *EMERGENCY SOS ALERT* 🚨\n\n` +
           `This is an automated emergency message sent by *NAZAR* on behalf of *${name || 'User'}*.\n\n` +
           `📍 *Current Location:* \n` +
           `• Latitude: ${latitude}\n` +
           `• Longitude: ${longitude}\n` +
           `• Accuracy: ±${accuracy} meters\n\n` +
           `🔗 *Google Maps URL:* ${mapsLink}\n\n` +
           `⚠️ Please check on them immediately!`;
}

module.exports = {
    normalizePhoneNumber,
    getGoogleMapsUrl,
    constructSosMessage
};
