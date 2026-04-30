const User = require('../model/userSchema');

/**
 * Manages identity data in MongoDB Atlas.
 */

// Handle new face enrollment
exports.enrollUser = async (req, res) => {
    try {
        const { name, faceEmbedding } = req.body;

        if (!name || !faceEmbedding) {
            return res.status(400).json({ success: false, message: "Name and Biometrics required." });
        }

        const newUser = new User({
            name,
            faceEmbedding,
            isAuthorized: true
        });

        await newUser.save();
        console.log(`\x1b[32m[IDENTITY]\x1b[0m New user enrolled: ${name}`);

        res.status(201).json({ success: true, message: "User authorized successfully." });
    } catch (error) {
        console.error(`\x1b[31m[ENROLLMENT ERROR]\x1b[0m`, error.message);
        res.status(500).json({ success: false, message: "Database error during enrollment." });
    }
};

// List all authorized personnel
exports.listUsers = async (req, res) => {
    try {
        // Fetch the face signature too so the monitor can match against it.
        const users = await User.find({}, 'name role isAuthorized createdAt faceEmbedding');
        res.status(200).json(users);
    } catch (error) {
        console.error(`\x1b[31m[FETCH ERROR]\x1b[0m`, error.message);
        res.status(500).json({ success: false, message: "Could not retrieve user list." });
    }
};