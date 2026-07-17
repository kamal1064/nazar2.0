const mongoose = require('mongoose');

const scanSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    imageUrl: { type: String, required: true },
    detectedObjects: { type: Array, default: [] },
    aiDescription: { type: String, required: true, trim: true },
    createdAt: { type: Date, default: Date.now }
});

scanSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Scan', scanSchema);
