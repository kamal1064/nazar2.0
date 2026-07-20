const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    deviceId: { type: String, required: true, unique: true, index: true, trim: true },
    email: { type: String, sparse: true, default: undefined },
    name: { type: String, default: 'Nazar User', trim: true },
    profilePicture: { type: String, default: '' },
    provider: { type: String, default: 'local' }
}, {
    timestamps: true
});

// Sparse unique index for email so documents without an email never collide on { email: null }
userSchema.index({ email: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('User', userSchema);
