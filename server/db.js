const mongoose = require('mongoose');
const { maskMongoUri } = require('./config');

let isConnected = false;

const connectDB = async () => {
    if (isConnected) {
        console.log('[DB] Reusing existing MongoDB connection.');
        return mongoose.connection;
    }

    try {
        const maskedUri = maskMongoUri(process.env.MONGODB_URI);
        console.log(`[DB] Initiating new MongoDB connection to ${maskedUri}...`);
        const db = await mongoose.connect(process.env.MONGODB_URI, {
            dbName: process.env.MONGODB_DB_NAME || 'nazar'
        });
        isConnected = db.connections[0].readyState === 1;
        console.log('[DB] Connected successfully to MongoDB Atlas.');
        return db.connection;
    } catch (err) {
        console.error('[DB] Connection error:', err.message);
        throw err;
    }
};

module.exports = connectDB;
