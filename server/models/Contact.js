const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    relationship: { type: String, required: true, trim: true },
    createdAt: { type: Date, default: Date.now }
});

contactSchema.index({ userId: 1 });

module.exports = mongoose.model('Contact', contactSchema);
