const mongoose = require('mongoose');

const scanSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false, index: true },
    imageUrl: { type: String, default: '' },
    summary: { type: String, required: true, trim: true },
    hazards: { type: [String], default: [] },
    objects: { type: [String], default: [] },
    people: { type: [String], default: [] },
    textDetected: { type: [String], default: [] },
    navigation: { type: String, default: '' },
    environment: { type: String, default: '' },
    confidence: { type: Number, default: 0.0 },
    createdAt: { type: Date, default: Date.now, index: true }
});

// Compound index for history query and pruning optimization
scanSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Scan', scanSchema);
