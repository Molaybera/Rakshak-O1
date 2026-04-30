const mongoose = require('mongoose');

/**
 * Stores authorized personnel data and their biometric embeddings.
 * faceEmbeddings: array of arrays — each inner array is one angle's 1412-feature vector.
 * Supports multi-angle enrollment (front, left, right, up, down).
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
    faceEmbeddings: {
        type: [[Number]],
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