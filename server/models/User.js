const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
    profilePicture: { type: String, default: '' },
    provider: { type: String, default: 'local' }
}, {
    timestamps: true
});

module.exports = mongoose.model('User', userSchema);
