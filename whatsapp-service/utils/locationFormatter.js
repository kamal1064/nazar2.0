/**
 * Formats phone numbers into standardized WhatsApp JIDs (<number>@c.us)
 * and formats coordinates into emergency URLs and message bodies.
 */

/**
 * Clean phone numbers and append @s.whatsapp.net JID namespace suffix.
 * Validates length and strips invalid characters.
 */
function normalizePhoneNumber(rawNumber) {
    if (!rawNumber) return null;
    
    // Strip all non-numeric characters (including +, spaces, dashes)
    let cleaned = rawNumber.replace(/[^0-9]/g, '');

    // Prepend default country code if exactly 10 digits
    const defaultCountry = process.env.WA_DEFAULT_COUNTRY_CODE || process.env.OPENWA_DEFAULT_COUNTRY_CODE || '91';
    if (cleaned.length === 10) {
        cleaned = defaultCountry + cleaned;
    }

    // Validate: WhatsApp JIDs are typically 10-15 digits (country code + number)
    if (cleaned.length < 10 || cleaned.length > 15) {
        return null;
    }

    return `${cleaned}@s.whatsapp.net`;
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
