const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    confidence: { type: Number, required: true, default: 1.0 }
});

const scanSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false, index: true },
    imageUrl: { type: String, default: '' },
    summary: { type: String, required: true, trim: true },
    hazards: [itemSchema],
    objects: [itemSchema],
    people: [itemSchema],
    textDetected: { type: [String], default: [] },
    navigation: { type: String, default: '' },
    environment: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now, index: true }
});

// Compound index for history query and pruning optimization
scanSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Scan', scanSchema);
