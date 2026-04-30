/**
 * Handles incoming alert data from the frontend AI
 */


exports.handleAlert = (req, res) => {
    const { type, timestamp, metadata } = req.body;

    // 1. Log to server console
    console.log(`\x1b[41m\x1b[37m [ALERT SYSTEM] \x1b[0m Triggered: ${type.toUpperCase()}`);
    console.log(`\x1b[33m [LOG] \x1b[0m Timestamp: ${timestamp}`);

    return res.status(200).json({
        success: true,
        message: `Rakshak O1 received ${type} alert.`,
        action: "Call sequence initiated"
    });
};