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
app.use(express.json());

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

const PORT = process.env.PORT || 5000;

// Initialize Database connection then start listener
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
