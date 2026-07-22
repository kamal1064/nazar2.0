const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    deviceId: { type: String, required: false, unique: true, sparse: true, trim: true },
    email: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
    password: { type: String, select: false },
    googleId: { type: String, unique: true, sparse: true },
    name: { type: String, default: 'Nazar User', trim: true },
    profilePicture: { type: String, default: '' },
    provider: { type: String, default: 'local' },
    resetPasswordToken: { type: String, select: false },
    resetPasswordExpires: { type: Date, select: false },
    lastLogin: { type: Date, default: Date.now },
    emailVerified: { type: Boolean, default: false }
}, {
    timestamps: true
});

module.exports = mongoose.model('User', userSchema);
