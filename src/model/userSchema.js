const mongoose = require('mongoose');

/**
 * Stores authorized personnel data and their biometric embeddings.
 */
const UserSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    role: {
        type: String,
        default: 'member'
    },
    faceEmbedding: {
        type: [Number],
        required: true
    },
    isAuthorized: {
        type: Boolean,
        default: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('User', UserSchema);