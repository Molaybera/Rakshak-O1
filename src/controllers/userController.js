const User = require('../model/userSchema');

/**
 * Manages identity data in MongoDB Atlas.
 */

// Handle new face enrollment (multi-angle: array of embedding arrays)
exports.enrollUser = async (req, res) => {
    try {
        const { name, faceEmbeddings, faceEmbedding } = req.body;

        // Support both new multi-angle format and legacy single-embedding format
        let embeddings;
        if (faceEmbeddings && Array.isArray(faceEmbeddings) && faceEmbeddings.length > 0) {
            embeddings = faceEmbeddings;
        } else if (faceEmbedding && Array.isArray(faceEmbedding) && faceEmbedding.length > 0) {
            // Legacy: wrap single embedding in an array
            embeddings = [faceEmbedding];
        } else {
            return res.status(400).json({ success: false, message: "Name and Biometrics required." });
        }

        if (!name) {
            return res.status(400).json({ success: false, message: "Name is required." });
        }

        const newUser = new User({
            name,
            faceEmbeddings: embeddings,
            isAuthorized: true
        });

        await newUser.save();
        console.log(`\x1b[32m[IDENTITY]\x1b[0m New user enrolled: ${name} (${embeddings.length} angle(s))`);

        res.status(201).json({ success: true, message: `${name} authorized with ${embeddings.length} angle(s).` });
    } catch (error) {
        console.error(`\x1b[31m[ENROLLMENT ERROR]\x1b[0m`, error.message);
        res.status(500).json({ success: false, message: "Database error during enrollment." });
    }
};

// List all authorized personnel
exports.listUsers = async (req, res) => {
    try {
        const users = await User.find({}, 'name role isAuthorized createdAt faceEmbeddings');
        res.status(200).json(users);
    } catch (error) {
        console.error(`\x1b[31m[FETCH ERROR]\x1b[0m`, error.message);
        res.status(500).json({ success: false, message: "Could not retrieve user list." });
    }
};

// Delete an authorized user by ID
exports.deleteUser = async (req, res) => {
    try {
        const { id } = req.params;
        const deleted = await User.findByIdAndDelete(id);
        if (!deleted) {
            return res.status(404).json({ success: false, message: "User not found." });
        }
        console.log(`\x1b[33m[IDENTITY]\x1b[0m User removed: ${deleted.name}`);
        res.status(200).json({ success: true, message: `${deleted.name} has been deauthorized.` });
    } catch (error) {
        console.error(`\x1b[31m[DELETE ERROR]\x1b[0m`, error.message);
        res.status(500).json({ success: false, message: "Database error during deletion." });
    }
};