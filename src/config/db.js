const mongoose = require('mongoose');

/**
 * This file handles the connection to the MongoDB Atlas cluster.
 */

const MONGO_URI = process.env.MONGO_URI;

/**
 * Initializes the connection to MongoDB Atlas
 */
const connectDB = async () => {
    try {
        const conn = await mongoose.connect(MONGO_URI, {
            // Options for modern Mongoose versions
            autoIndex: true,
        });

        console.log(`\x1b[32m[DATABASE]\x1b[0m Connected to MongoDB Atlas: ${conn.connection.host}`);
        
        // Handle connection events
        mongoose.connection.on('error', err => {
            console.error(`\x1b[31m[DATABASE ERROR]\x1b[0m ${err.message}`);
        });

        mongoose.connection.on('disconnected', () => {
            console.log('\x1b[33m[DATABASE]\x1b[0m MongoDB disconnected');
        });

    } catch (error) {
        console.error(`\x1b[31m[DATABASE ERROR]\x1b[0m Connection failed:`, error.message);
        process.exit(1);
    }
};

const closeDB = async () => {
    await mongoose.connection.close();
    console.log('\x1b[33m[DATABASE]\x1b[0m Connection closed through app termination');
};

module.exports = {
    connectDB,
    closeDB
};