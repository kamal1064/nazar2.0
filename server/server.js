require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const connectDB = require('./db');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// Security and utility middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Increased for base64 image payloads

// Load routers
const usersRouter = require('./routes/users');
const scansRouter = require('./routes/scans');
const contactsRouter = require('./routes/contacts');
const settingsRouter = require('./routes/settings');

// Route bindings
app.use('/api/users', usersRouter);
app.use('/api/scans', scansRouter);
app.use('/api/scan', scansRouter);
app.use('/api/emergency-contacts', contactsRouter);
app.use('/api/settings', settingsRouter);

// Base healthcheck route
const healthHandler = (req, res) => {
    const mongoose = require('mongoose');
    const dbConnected = mongoose.connection.readyState === 1;
    const geminiAvailable = !!process.env.GEMINI_API_KEY;
    res.status(200).json({
        success: true,
        database: dbConnected ? "connected" : "disconnected",
        gemini: geminiAvailable ? "available" : "unavailable",
        timestamp: new Date().toISOString(),
        version: "v18"
    });
};
app.get('/health', healthHandler);
app.get('/api/health', healthHandler);

// Global Error Handler Middleware
app.use(errorHandler);

// Serverless export for Vercel — connectDB is called per cold-start and
// reuses the cached connection on subsequent invocations (see db.js).
let dbReady = false;

const ensureDB = async () => {
    if (!dbReady) {
        await connectDB();
        dbReady = true;
    }
};

// Wrap the Express app so DB is connected before handling requests
const handler = async (req, res) => {
    await ensureDB();
    return app(req, res);
};

// Export for Vercel serverless runtime
module.exports = handler;

// Start local dev server when run directly (not imported by Vercel)
if (require.main === module) {
    const PORT = process.env.PORT || 5000;
    connectDB()
        .then(() => {
            app.listen(PORT, () => {
                console.log(`[Server] Nazar backend operational on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode.`);
            });
        })
        .catch(err => {
            console.error('[Server] Critical connection startup failure:', err.message);
            process.exit(1);
        });
}
