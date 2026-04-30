/**
 * This service handles the logic for triggering automated voice alerts.
 */

// API credentials for Twilio)
const CALL_CONFIG = {
    provider: 'Twilio (Simulation Mode)',
    retryLimit: 3
};

/**
 * Triggers a voice call simulation based on the alert type
 * @param {string} alertType - 'intrusion', 'fire', or 'activity'
 */
exports.triggerEmergencyCall = async (alertType) => {
    // 1. Identify the script based on alert type (as per 'Role: System Logic' doc)
    let message = "";
    switch (alertType.toLowerCase()) {
        case 'intrusion':
            message = "Alert. Intrusion detected. Please check immediately.";
            break;
        case 'fire':
            message = "Alert. Fire hazard detected. Immediate attention required.";
            break;
        case 'activity':
            message = "Alert. Unusual activity detected.";
            break;
        default:
            message = "Alert. System event detected.";
    }

    console.log(`\n\x1b[36m[VOICE ENGINE]\x1b[0m Preparing Message: "${message}"`);

    // 2. Simulate API Call processing delay
    return new Promise((resolve) => {
        setTimeout(() => {
            console.log(`\x1b[32m[CALL STATUS]\x1b[0m Call successfully dispatched via ${CALL_CONFIG.provider}`);
            console.log(`\x1b[32m[DESTINATION]\x1b[0m +91 (User Verified Number)\n`);
            
            resolve({
                success: true,
                message: message,
                provider: CALL_CONFIG.provider,
                timestamp: new Date().toISOString()
            });
        }, 1500); // 1.5s simulation delay
    });
};