const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    deviceId: { type: String, required: true, unique: true, index: true, trim: true },
    name: { type: String, default: 'Nazar User', trim: true },
    profilePicture: { type: String, default: '' },
    provider: { type: String, default: 'local' }
}, {
    timestamps: true
});

module.exports = mongoose.model('User', userSchema);
