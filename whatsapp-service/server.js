require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const sosRoutes = require('./routes/sosRoutes');
const whatsappService = require('./services/whatsappService');
const { MemoryQueue } = require('./services/queueService');

const app = express();
const PORT = process.env.WHATSAPP_SERVICE_PORT || process.env.PORT || 5000;
let isShuttingDown = false;

// Structured logging helper
function logStructured(level, message, meta = {}) {
    console.log(JSON.stringify({
        level,
        message,
        ...meta,
        timestamp: new Date().toISOString()
    }));
}

// Middleware to reject requests during shutdown
app.use((req, res, next) => {
    if (isShuttingDown) {
        return res.status(503).json({
            success: false,
            reason: 'Service is shutting down and no longer accepting new requests.'
        });
    }
    next();
});

app.use(bodyParser.json({ limit: '5mb' }));
app.use('/', sosRoutes);

// Catch-all route handler
app.use((req, res) => {
    res.status(404).json({ success: false, reason: 'Endpoint not found' });
});

// Start listening
const server = app.listen(PORT, () => {
    logStructured('info', `WhatsApp SOS Microservice operational on port ${PORT} in ${process.env.NODE_ENV || 'production'} mode.`);
    
    // Start WhatsApp Baileys client asynchronously in the background
    whatsappService.initialize().catch((err) => {
        logStructured('error', 'Background WhatsApp client startup failed', { error: err.message });
    });
});

// Graceful Shutdown Handler
async function handleGracefulShutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;
    
    logStructured('info', `Received ${signal}. Starting enterprise graceful shutdown process...`);

    // 1. Stop taking new requests from the load balancer
    server.close(() => {
        logStructured('info', 'HTTP server stopped accepting new connections.');
    });

    // 2. Wait for currently processing queue jobs to drain
    const checkInterval = 1000;
    const maxWaitTime = 15000; // 15 seconds max wait
    let elapsedWait = 0;

    while (elapsedWait < maxWaitTime) {
        const stats = await MemoryQueue.stats();
        if (stats.processing === 0 && stats.pending === 0) {
            logStructured('info', 'All enqueued and active SOS dispatch jobs have finished processing.');
            break;
        }

        logStructured('info', 'Waiting for active queue jobs to complete...', {
            pendingJobs: stats.pending,
            activeJobs: stats.processing
        });

        await new Promise((resolve) => setTimeout(resolve, checkInterval));
        elapsedWait += checkInterval;
    }

    if (elapsedWait >= maxWaitTime) {
        logStructured('warn', 'Graceful shutdown timeout exceeded. Force-terminating remaining jobs.');
    }

    // 3. Close the WhatsApp Baileys connection
    await whatsappService.close();

    logStructured('info', 'Graceful shutdown sequence complete. Exiting process.');
    process.exit(0);
}

process.on('SIGTERM', () => handleGracefulShutdown('SIGTERM'));
process.on('SIGINT', () => handleGracefulShutdown('SIGINT'));
