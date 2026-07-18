const mongoose = require('mongoose');

const validateObjectId = (id) => {
    return mongoose.Types.ObjectId.isValid(id);
};

const userValidator = (req, res, next) => {
    const { deviceId } = req.body;
    if (!deviceId || typeof deviceId !== 'string' || !deviceId.trim()) {
        return res.status(400).json({ success: false, message: 'Invalid or missing deviceId' });
    }
    next();
};

const contactValidator = (req, res, next) => {
    const { userId, name, phone, relationship } = req.body;
    if (!userId || !validateObjectId(userId)) {
        return res.status(400).json({ success: false, message: 'Invalid or missing userId' });
    }
    if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ success: false, message: 'Invalid or missing contact name' });
    }
    if (!phone || typeof phone !== 'string' || !phone.trim() || phone.length < 5) {
        return res.status(400).json({ success: false, message: 'Invalid or missing contact phone number' });
    }
    if (!relationship || typeof relationship !== 'string' || !relationship.trim()) {
        return res.status(400).json({ success: false, message: 'Invalid or missing contact relationship' });
    }
    next();
};

const settingsValidator = (req, res, next) => {
    const { voiceEnabled, speechRate, speechVolume, locationSharing, darkMode, continuousScanning, preferredScanMode } = req.body;
    
    if (voiceEnabled !== undefined && typeof voiceEnabled !== 'boolean') {
        return res.status(400).json({ success: false, message: 'voiceEnabled must be a boolean' });
    }
    if (speechRate !== undefined && (typeof speechRate !== 'number' || speechRate < 0.1 || speechRate > 5.0)) {
        return res.status(400).json({ success: false, message: 'speechRate must be a number between 0.1 and 5.0' });
    }
    if (speechVolume !== undefined && (typeof speechVolume !== 'number' || speechVolume < 0.0 || speechVolume > 1.0)) {
        return res.status(400).json({ success: false, message: 'speechVolume must be a number between 0.0 and 1.0' });
    }
    if (locationSharing !== undefined && typeof locationSharing !== 'boolean') {
        return res.status(400).json({ success: false, message: 'locationSharing must be a boolean' });
    }
    if (darkMode !== undefined && typeof darkMode !== 'boolean') {
        return res.status(400).json({ success: false, message: 'darkMode must be a boolean' });
    }
    if (continuousScanning !== undefined && typeof continuousScanning !== 'boolean') {
        return res.status(400).json({ success: false, message: 'continuousScanning must be a boolean' });
    }
    if (preferredScanMode !== undefined && !['scene', 'ocr'].includes(preferredScanMode)) {
        return res.status(400).json({ success: false, message: 'preferredScanMode must be scene or ocr' });
    }
    next();
};

module.exports = {
    userValidator,
    contactValidator,
    settingsValidator,
    validateObjectId
};
