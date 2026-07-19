require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const connectDB = require('./db');
const errorHandler = require('./middleware/errorHandler');

const { verifyTransporterConnection } = require('./services/emailService');

console.log("[SERVER STARTUP]", {
  commit: process.env.VERCEL_GIT_COMMIT_SHA || 'local',
  model: process.env.GEMINI_MODEL || 'gemini-flash-latest',
  hasApiKey: !!process.env.GEMINI_API_KEY,
  hasEmailUser: !!process.env.EMAIL_USER
});

verifyTransporterConnection();

const app = express();
app.set('trust proxy', 1);

// Security and utility middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Increased for base64 image payloads

// Load routers
const usersRouter = require('./routes/users');
const scansRouter = require('./routes/scans');
const contactsRouter = require('./routes/contacts');
const settingsRouter = require('./routes/settings');
const emergencyRouter = require('./routes/emergency');

// Route bindings
app.use('/api/users', usersRouter);
app.use('/api/scan', scansRouter);
app.use('/api/emergency-contacts', contactsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/emergency', emergencyRouter);

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
        version: "v30"
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
        try {
            await connectDB();
            dbReady = true;
        } catch (err) {
            // DB unavailable (e.g. env vars not set on Vercel).
            // Log a warning but do NOT crash — routes that don't need DB will still work.
            console.warn('[Server] MongoDB unavailable — running without database:', err.message);
        }
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
