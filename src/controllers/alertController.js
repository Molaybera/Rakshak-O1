const Alert = require('../model/alertSchema');
const emailService = require('../services/emailService');

/**
 * Rakshak O1 - Alert Controller
 * Synchronizes AI detections with MongoDB Atlas and the Email Dispatcher.
 */
exports.handleAlert = async (req, res) => {
    try {
        const { type, confidence, livenessScore, personCount, image, metadata, firePct } = req.body;

        // Visual console log for the developer
        console.log(`\x1b[41m\x1b[37m [THREAT DETECTED] \x1b[0m ${type.toUpperCase()} | ${type === 'fire' ? `Coverage: ${firePct}%` : `People: ${personCount || 1}`}`);

        // 1. Save Alert to MongoDB Atlas
        // We save the base64 'image' string into 'evidenceImage'
        const newAlert = new Alert({
            type: type.toLowerCase(),
            confidence: confidence || 0.9,
            livenessScore: livenessScore || 1.0,
            personCount: personCount || 1,
            evidenceImage: image, 
            status: 'processing',
            metadata: metadata || { deviceId: "CAM_01", location: "Main Entrance" }
        });

        const savedAlert = await newAlert.save();
        console.log(`\x1b[32m [DATABASE] \x1b[0m Alert persisted. Evidence size: ${image ? Math.round(image.length / 1024) : 0} KB`);

        // 2. Dispatch Email with Inline Evidence Snapshot
        const emailResponse = await emailService.sendEmailWithEvidence({
            type: savedAlert.type,
            confidence: savedAlert.confidence,
            personCount: savedAlert.personCount,
            image: image, // Base64 snapshot
            timestamp: savedAlert.timestamp,
            firePct: firePct || 0
        });

        // 3. Update Database status after dispatch attempt
        await Alert.findByIdAndUpdate(savedAlert._id, { 
            status: emailResponse.success ? 'dispatched' : 'email_failed' 
        });

        return res.status(200).json({
            success: true,
            alertId: savedAlert._id,
            emailStatus: emailResponse.success ? 'Sent' : 'Failed',
            personCount: savedAlert.personCount
        });

    } catch (error) {
        console.error(`\x1b[31m [CONTROLLER ERROR] \x1b[0m`, error.message);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error during alert processing"
        });
    }
};