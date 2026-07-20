const mongoose = require('mongoose');

const historyItemSchema = new mongoose.Schema({
    from: { type: Number, required: true },
    to: { type: Number, required: true },
    reason: { type: String, required: true },
    time: { type: Date, default: Date.now }
}, { _id: false });

const apiKeyUsageSchema = new mongoose.Schema({
    singletonId: { type: String, default: 'default_usage', unique: true },
    activeKey: { type: Number, default: 1 },
    activeModel: { type: String, default: 'gemini-3.1-flash-lite' },
    keyUsage: { type: Map, of: Number, default: {} },
    totalScans: { type: Number, default: 0 },
    lastResetDate: { type: String, default: '' },
    lastRotation: { type: Date, default: Date.now },
    rotationReason: { type: String, default: 'Initial system startup' },
    history: { type: [historyItemSchema], default: [] }
}, { timestamps: true });

module.exports = mongoose.model('ApiKeyUsage', apiKeyUsageSchema);
