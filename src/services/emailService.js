const nodemailer = require('nodemailer');

/**
 * Responsible for sending real-time security alerts with embedded visual evidence.
 */

// Initialize the transporter using environment variables for security
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

/**
 * Sends a high-priority email alert with an inline situation snapshot.
 * @param {Object} data - Alert details including type, confidence, personCount, and base64 image.
 */
exports.sendEmailWithEvidence = async (data) => {
    const { type, confidence, personCount, image, timestamp, firePct } = data;

    const isFire = type === 'fire';
    const subjectLine = isFire
        ? `🔥 [FIRE ALERT] Fire Detected — ${firePct || '?'}% Coverage`
        : `🚨 [CRITICAL] ${type.toUpperCase()} ALERT: ${personCount} Person(s) Detected`;

    const detailsBlock = isFire
        ? `
            <p style="margin: 8px 0; font-size: 15px;"><strong>Threat Type:</strong> <span style="color: #fb7185;">FIRE DETECTED</span></p>
            <p style="margin: 8px 0; font-size: 15px;"><strong>Fire Coverage:</strong> ${firePct || '?'}% of frame</p>
            <p style="margin: 8px 0; font-size: 15px;"><strong>Detection Method:</strong> Pixel color analysis (RGB flame detection)</p>
        `
        : `
            <p style="margin: 8px 0; font-size: 15px;"><strong>Threat Type:</strong> <span style="color: #fb7185;">${type.toUpperCase()}</span></p>
            <p style="margin: 8px 0; font-size: 15px;"><strong>Intruders Identified:</strong> ${personCount}</p>
            <p style="margin: 8px 0; font-size: 15px;"><strong>AI Confidence Score:</strong> ${(confidence * 100).toFixed(1)}%</p>
        `;

    const headingText = isFire ? 'RAKSHAK O1: Fire Emergency' : 'RAKSHAK O1: Security Breach';
    const headingColor = isFire ? '#f97316' : '#f43f5e';
    const borderColor = isFire ? '#f97316' : '#f43f5e';

    const mailOptions = {
        from: `"🛡️ Rakshak O1 Security" <${process.env.EMAIL_USER}>`,
        to: process.env.USER_EMAIL,
        subject: subjectLine,
        html: `
            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0f172a; color: #f1f5f9; padding: 30px; border-radius: 15px; max-width: 600px; margin: auto;">
                <h1 style="color: ${headingColor}; margin: 0 0 10px 0; font-size: 26px; letter-spacing: -1px;">${headingText}</h1>
                <p style="color: #94a3b8; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 25px;">
                    Timestamp: ${new Date(timestamp).toLocaleString()}
                </p>
                
                <div style="background: rgba(255,255,255,0.05); padding: 20px; border-radius: 10px; border-left: 5px solid ${borderColor}; margin-bottom: 25px;">
                    ${detailsBlock}
                </div>

                ${image ? `
                <div style="margin-top: 20px;">
                    <p style="font-weight: bold; margin-bottom: 12px; color: #cbd5e1; font-size: 14px;">Live Evidence Snapshot:</p>
                    <div style="border: 2px solid #334155; border-radius: 12px; overflow: hidden; line-height: 0;">
                        <img src="cid:evidence_snapshot" style="width: 100%; display: block;" alt="Situation Evidence" />
                    </div>
                </div>
                ` : `
                <div style="background: #450a0a; color: #fecaca; padding: 10px; border-radius: 5px; font-size: 13px; margin-top: 20px;">
                    ⚠️ Visual evidence capture failed. Check camera status.
                </div>
                `}

                <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #1e293b; text-align: center;">
                    <p style="font-size: 11px; color: #64748b; line-height: 1.5;">
                        This is an automated encrypted dispatch from your local Rakshak O1 monitoring node.<br>
                        ${isFire ? 'Evacuate immediately and contact fire services.' : 'Please proceed with caution when responding to the location.'}
                    </p>
                </div>
            </div>
        `,
        attachments: image ? [{
            filename: 'evidence.jpg',
            path: image,
            cid: 'evidence_snapshot'
        }] : []
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log(`\x1b[35m[EMAIL SERVICE]\x1b[0m Dispatch success: ${info.messageId}`);
        return { success: true };
    } catch (error) {
        console.error(`\x1b[31m[EMAIL ERROR]\x1b[0m`, error.message);
        return { success: false, error: error.message };
    }
};