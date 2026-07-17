const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    voiceEnabled: { type: Boolean, default: false },
    speechRate: { type: Number, default: 1.0 },
    speechVolume: { type: Number, default: 1.0 },
    locationSharing: { type: Boolean, default: false },
    darkMode: { type: Boolean, default: false }
}, {
    timestamps: true
});


module.exports = mongoose.model('Settings', settingsSchema);
