const config = require('./config');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const connectDB = require('./db');
const errorHandler = require('./middleware/errorHandler');
const requestId = require('./middleware/requestId');

const { verifyTransporterConnection } = require('./services/emailService');

console.log("[SERVER STARTUP]", {
  commit: process.env.VERCEL_GIT_COMMIT_SHA || 'local',
  model: config.geminiModel,
  hasApiKey: !!process.env.GEMINI_API_KEY_1,
  hasEmailUser: !!config.emailUser
});

// Process Safety Event Handlers
process.on('uncaughtException', (err) => {
    console.error(`[PROCESS CRITICAL] Uncaught Exception [${new Date().toISOString()}]:`, err.message);
    if (err.stack) console.error(err.stack.split('\n').slice(0, 5).join('\n'));
});

process.on('unhandledRejection', (reason, promise) => {
    console.error(`[PROCESS WARNING] Unhandled Rejection at:`, promise, `reason:`, reason?.message || reason);
});

verifyTransporterConnection();

const app = express();
app.set('trust proxy', 1);

// Security and utility middleware
app.use(requestId);
app.use(helmet());
app.use(cors());
app.use(cookieParser());
app.use(express.json({ limit: '10mb' })); // Increased for base64 image payloads

// Load routers
const authRouter = require('./routes/auth');
const usersRouter = require('./routes/users');
const scansRouter = require('./routes/scans');
const contactsRouter = require('./routes/contacts');
const settingsRouter = require('./routes/settings');
const sosRouter = require('./routes/sosRoutes');
const adminRouter = require('./routes/admin');
const voiceRouter = require('./routes/voice');
const keyRotationService = require('./services/keyRotationService');

// Route bindings
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/scan', scansRouter);
app.use('/api/emergency-contacts', contactsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/sos', sosRouter);
app.use('/api/admin', adminRouter);
app.use('/api/voice', voiceRouter);

// Base healthcheck route
const healthHandler = async (req, res) => {
    const mongoose = require('mongoose');
    const dbConnected = mongoose.connection.readyState === 1;
    const analytics = await keyRotationService.getAnalyticsState();
    
    let openwaStatus = 'offline';
    if (process.env.WHATSAPP_SERVICE_URL) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            
            const response = await fetch(`${process.env.WHATSAPP_SERVICE_URL}/ready`, {
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            
            if (response.ok) {
                const data = await response.json();
                if (data.ready) {
                    openwaStatus = 'ready';
                }
            }
        } catch (err) {
            console.warn('[Server Health Check] Failed to query WhatsApp microservice readiness:', err.message);
        }
    }

    res.status(200).json({
        success: true,
        status: dbConnected && openwaStatus === 'ready' ? "healthy" : "degraded",
        version: "1.0.0",
        mongodb: dbConnected ? "connected" : "disconnected",
        gemini: process.env.GEMINI_API_KEY_1 ? "available" : "unavailable",
        openwa: openwaStatus,
        uptimeSeconds: Math.floor(process.uptime()),
        activeApiKey: analytics.activeKey,
        configuredKeys: analytics.configuredKeys,
        availableKeys: analytics.availableKeys,
        remainingToday: analytics.remainingToday,
        totalCapacity: analytics.totalCapacity,
        totalScans: analytics.totalScans,
        timestamp: new Date().toISOString()
    });
};
app.get('/health', healthHandler);
app.get('/api/health', healthHandler);

// Handle unhandled 404 routes
app.use((req, res, next) => {
    res.status(404).json({
        success: false,
        message: 'Resource not found.',
        code: 'NOT_FOUND',
        requestId: req.id || 'req_unknown'
    });
});

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
            console.warn(`[Server] MongoDB connection failed at startup. Running without database on port ${PORT}:`, err.message);
            app.listen(PORT, () => {
                console.log(`[Server] Nazar backend operational on port ${PORT} in offline/no-db mode.`);
            });
        });
}
