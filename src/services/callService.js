const twilio = require('twilio');

/**
 * Rakshak O1 - Phone Call Dispatcher
 * Initiates an automated phone call using Twilio when a critical event occurs.
 */

// Initialize Twilio client if credentials are provided
let client = null;
try {
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
        client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    } else {
        console.warn("\x1b[33m [TWILIO WARNING] \x1b[0m Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN in .env. Phone alerts are disabled.");
    }
} catch (e) {
    console.warn("\x1b[33m [TWILIO WARNING] \x1b[0m Failed to initialize Twilio client.");
}

exports.dispatchCall = async (alertType) => {
    if (!client) return { success: false, message: "Twilio not configured" };

    const toPhone = process.env.TWILIO_TO_NUMBER || process.env.TWILIO_TO_PHONE;
    const fromPhone = process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_FROM_PHONE;

    if (!toPhone || !fromPhone) {
        console.warn("\x1b[33m [TWILIO WARNING] \x1b[0m Missing TWILIO_TO_NUMBER or TWILIO_FROM_NUMBER. Cannot place call.");
        return { success: false, message: "Missing phone numbers" };
    }

    // Determine the spoken message based on alert type
    let spokenMessage = "Alert! The Rakshak system has detected a critical event. Please check the cameras immediately.";

    if (alertType === 'fire') {
        spokenMessage = "Warning! The Rakshak system has detected a fire hazard at the monitored location. Please respond immediately, check your mail to see the picture.";
    } else if (alertType === 'intrusion' || alertType === 'spoofing') {
        spokenMessage = "Alert! The Rakshak system has detected an unknown individual or intrusion at the monitored location. Please respond immediately, check your mail to see the picture.";
    }

    // Define the TwiML script to speak the message twice
    const twimlScript = `
        <Response>
            <Say voice="alice">${spokenMessage}</Say>
            <Pause length="1"/>
            <Say voice="alice">${spokenMessage}</Say>
        </Response>
    `;

    try {
        console.log(`\x1b[36m [TWILIO] \x1b[0m Initiating automated phone call to ${toPhone}...`);

        const call = await client.calls.create({
            twiml: twimlScript,
            to: toPhone,
            from: fromPhone
        });

        console.log(`\x1b[32m [TWILIO] \x1b[0m Call dispatched successfully. Call SID: ${call.sid}`);
        return { success: true, sid: call.sid };
    } catch (error) {
        console.error(`\x1b[31m [TWILIO ERROR] \x1b[0m Failed to dispatch call:`, error.message);
        return { success: false, message: error.message };
    }
};
