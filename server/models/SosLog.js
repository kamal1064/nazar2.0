const mongoose = require('mongoose');

const sosLogSchema = new mongoose.Schema({
    dispatchId: { type: String, required: true, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    timestamp: { type: Date, default: Date.now },
    location: {
        latitude: { type: Number, required: true },
        longitude: { type: Number, required: true },
        accuracy: { type: Number, required: true }
    },
    contacts: [
        {
            name: { type: String, required: true },
            phone: { type: String, required: true },
            status: { type: String, enum: ['sent', 'failed', 'skipped'], required: true },
            sentAt: { type: Date },
            durationMs: { type: Number },
            error: { type: String }
        }
    ],
    sent: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    deliveryTime: { type: Number },
    overallError: { type: String }
});

sosLogSchema.index({ userId: 1, timestamp: -1 });
sosLogSchema.index({ dispatchId: 1 });

module.exports = mongoose.model('SosLog', sosLogSchema);
