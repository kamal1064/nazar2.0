const mongoose = require('mongoose');

const sosLogSchema = new mongoose.Schema({
    dispatchId: { type: String, required: true, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['queued', 'processing', 'completed', 'failed'], default: 'queued' },
    timestamp: { type: Date, default: Date.now },
    queuedAt: { type: Date, default: Date.now },
    startedAt: { type: Date },
    completedAt: { type: Date },
    durationMs: { type: Number },
    retryCount: { type: Number, default: 0 },
    workerId: { type: String },
    location: {
        latitude: { type: Number, required: true },
        longitude: { type: Number, required: true },
        accuracy: { type: Number, required: true }
    },
    contacts: [
        {
            name: { type: String, required: true },
            phone: { type: String, required: true },
            status: { type: String, required: true },
            sentAt: { type: Date },
            durationMs: { type: Number },
            error: { type: String }
        }
    ],
    sent: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    overallError: { type: String }
});

sosLogSchema.index({ userId: 1, timestamp: -1 });
sosLogSchema.index({ dispatchId: 1 });

module.exports = mongoose.model('SosLog', sosLogSchema);
