const mongoose = require('mongoose');

/**
 * Rakshak O1 - Alert Schema
 */
const AlertSchema = new mongoose.Schema({
    type: {
        type: String,
        required: true,
        enum: ['intrusion', 'fire', 'activity', 'spoofing']
    },
    timestamp: {
        type: Date,
        default: Date.now
    },
    status: {
        type: String,
        default: 'dispatched'
    },
    confidence: {
        type: Number
    },
    livenessScore: {
        type: Number
    },
    personCount: {
        type: Number,
        default: 1
    },
    evidenceImage: {
        type: String 
    },
    metadata: {
        deviceId: { type: String, default: "CAM_01" },
        location: { type: String, default: "Main Entrance" }
    }
});

module.exports = mongoose.model('Alert', AlertSchema);