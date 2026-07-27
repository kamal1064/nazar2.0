const path = require('path');
const fs = require('fs');
const qrcodeTerminal = require('qrcode-terminal');

// Connection state enum for rich status tracking
const ConnectionState = {
    UNINITIALIZED: 'UNINITIALIZED',
    CONNECTING: 'CONNECTING',
    QR_REQUIRED: 'QR_REQUIRED',
    AUTHENTICATED: 'AUTHENTICATED',
    READY: 'READY',
    RECONNECTING: 'RECONNECTING',
    DISCONNECTED: 'DISCONNECTED',
    ERROR: 'ERROR'
};

class WhatsAppService {
    constructor() {
        this.sock = null;
        this.initializing = false;
        this.connected = false;
        this.authenticated = false;
        this.clientState = ConnectionState.UNINITIALIZED;
        this.lastReconnect = null;
        this.reconnectAttempts = 0;
        this.initFailures = 0;
        this.uptimeSeconds = 0;
        this.startTime = null;
        this.sessionReason = null;
        this.latestQr = null;
        this.saveCreds = null;

        // Module references loaded asynchronously (Baileys is ESM-only)
        this._baileys = null;
        this._boom = null;
        this._qrcode = null;
        this._pino = null;

        // Start uptime tracker
        setInterval(() => {
            if (this.startTime) {
                this.uptimeSeconds = Math.floor((Date.now() - this.startTime) / 1000);
            }
        }, 1000);
    }

    isReady() {
        return this.sock !== null && this.connected && this.authenticated;
    }

    /**
     * Lazily load ESM-only dependencies via dynamic import().
     * This allows the rest of the project to remain CommonJS.
     */
    async _loadDependencies() {
        if (!this._baileys) {
            this._baileys = await import('@whiskeysockets/baileys');
        }
        if (!this._boom) {
            this._boom = await import('@hapi/boom');
        }
        if (!this._qrcode) {
            this._qrcode = await import('qrcode');
        }
        if (!this._pino) {
            this._pino = await import('pino');
        }
    }

    async initialize() {
        if (this.initializing) {
            console.log(JSON.stringify({
                level: 'warn',
                message: 'WhatsApp client initialization already in progress. Skipping duplicate call.',
                timestamp: new Date().toISOString()
            }));
            return;
        }

        this.initializing = true;
        this.clientState = ConnectionState.CONNECTING;
        this.sessionReason = null;

        const authPath = path.resolve(process.env.BAILEYS_AUTH_PATH || '../.baileys-auth');

        try {
            // Load ESM dependencies
            await this._loadDependencies();

            const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers } = this._baileys;
            const pino = this._pino.default || this._pino;
            const QRCode = this._qrcode.default || this._qrcode;

            // Ensure auth directory exists
            if (!fs.existsSync(authPath)) {
                fs.mkdirSync(authPath, { recursive: true });
            }

            const { state, saveCreds } = await useMultiFileAuthState(authPath);
            this.saveCreds = saveCreds;

            // Fetch latest version info for logging
            let baileysVersionInfo = {};
            try {
                baileysVersionInfo = await fetchLatestBaileysVersion();
            } catch (e) {
                // Non-critical, continue without version info
            }

            console.log(JSON.stringify({
                level: 'info',
                message: 'Stage: Starting WhatsApp Baileys service...',
                authPath,
                baileysVersion: baileysVersionInfo.version || 'Unknown',
                isLatest: baileysVersionInfo.isLatest,
                platform: process.platform,
                nodeVersion: process.version,
                timestamp: new Date().toISOString()
            }));

            // Create the WebSocket connection
            const logger = pino({ level: process.env.WA_LOG_LEVEL || 'silent' });

            this.sock = makeWASocket({
                auth: state,
                logger,
                browser: Browsers.ubuntu('Chrome'),
                connectTimeoutMs: 60000,
                defaultQueryTimeoutMs: 30000,
                syncFullHistory: false,
                generateHighQualityLinkPreview: false,
                getMessage: async (key) => {
                    // We don't store message history — return undefined
                    return undefined;
                }
            });

            console.log(JSON.stringify({
                level: 'info',
                message: 'Stage: Baileys socket created, waiting for connection...',
                timestamp: new Date().toISOString()
            }));

            // Connection state handler
            this.sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;

                // QR code generated — convert to data URL for /qr endpoint and print in terminal
                if (qr) {
                    try {
                        this.latestQr = await QRCode.toDataURL(qr);
                    } catch (e) {
                        this.latestQr = null;
                    }
                    this.clientState = ConnectionState.QR_REQUIRED;
                    this.sessionReason = 'QR code scanning required. Visit /qr or scan from terminal.';

                    console.log(JSON.stringify({
                        level: 'warn',
                        message: 'Stage: QR code generated. Scan with WhatsApp -> Linked Devices -> Link a Device.',
                        timestamp: new Date().toISOString()
                    }));

                    // Print small QR code directly in the terminal
                    qrcodeTerminal.generate(qr, { small: true });
                }

                if (connection === 'connecting') {
                    this.clientState = ConnectionState.CONNECTING;
                    console.log(JSON.stringify({
                        level: 'info',
                        message: 'Connecting to WhatsApp...',
                        timestamp: new Date().toISOString()
                    }));
                }

                if (connection === 'open') {
                    this.connected = true;
                    this.authenticated = true;
                    this.clientState = ConnectionState.READY;
                    this.initializing = false;
                    this.reconnectAttempts = 0;
                    this.initFailures = 0;
                    this.startTime = Date.now();
                    this.sessionReason = null;
                    this.latestQr = null;

                    console.log(JSON.stringify({
                        level: 'info',
                        message: 'Stage: WhatsApp client successfully connected and ready!',
                        timestamp: new Date().toISOString()
                    }));
                }

                if (connection === 'close') {
                    this.connected = false;
                    this.authenticated = false;
                    this.clientState = ConnectionState.DISCONNECTED;
                    // Do not null the socket; let Baileys handle reconnection
                    // this.sock = null;

                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    const reason = lastDisconnect?.error?.message || 'Unknown';

                    console.log(JSON.stringify({
                        level: 'warn',
                        message: `WhatsApp connection closed. Status code: ${statusCode}, Reason: ${reason}`,
                        timestamp: new Date().toISOString()
                    }));

                    // Handle each disconnect reason explicitly
                    this._handleDisconnect(statusCode, authPath);
                }
            });

            // Persist credential updates (key rotations, session tokens)
            this.sock.ev.on('creds.update', saveCreds);

        } catch (err) {
            this.connected = false;
            this.authenticated = false;
            this.clientState = ConnectionState.ERROR;
            this.initializing = false;
            this.sock = null;
            this.sessionReason = err.message;

            // Classify error type
            let isInfrastructureFailure = false;

            if (err.code === 'ENOENT' || err.code === 'ECONNRESET' || err.code === 'ECONNREFUSED') {
                isInfrastructureFailure = true;
            }

            if (!isInfrastructureFailure) {
                this.initFailures++;
            }

            console.error(JSON.stringify({
                level: 'error',
                message: `WhatsApp client initialization failed. (Consecutive failures: ${this.initFailures}, Infrastructure failure: ${isInfrastructureFailure})`,
                error: err.message,
                timestamp: new Date().toISOString()
            }));

            // Wipe auth data after 3 consecutive session failures
            if (!isInfrastructureFailure && this.initFailures >= 3) {
                console.log(`[whatsappService] Failure threshold reached (${this.initFailures}). Wiping auth directory...`);
                try {
                    if (fs.existsSync(authPath)) {
                        fs.rmSync(authPath, { recursive: true, force: true });
                    }
                    this.initFailures = 0;
                } catch (clearErr) {
                    console.error(`[whatsappService] Failed to clear auth directory: ${clearErr.message}`);
                }
            }

            this.handleReconnect();
        }
    }

    /**
     * Map each DisconnectReason to a specific recovery action.
     * Note: We rely on Baileys' internal reconnection mechanism for most cases.
     * We only clear auth for specific reasons and let Baileys reconnect.
     */
    _handleDisconnect(statusCode, authPath) {
        const { DisconnectReason } = this._baileys;

        switch (statusCode) {
            case DisconnectReason.loggedOut:
                // User explicitly unlinked device from WhatsApp mobile
                console.log(JSON.stringify({
                    level: 'warn',
                    message: 'Device was logged out from WhatsApp. Clearing auth and requiring fresh QR scan.',
                    timestamp: new Date().toISOString()
                }));
                try {
                    if (fs.existsSync(authPath)) {
                        fs.rmSync(authPath, { recursive: true, force: true });
                    }
                } catch (e) {
                    console.error(`[whatsappService] Failed to clear auth after logout: ${e.message}`);
                }
                this.sessionReason = 'Logged out. Fresh QR scan required.';
                // Let Baileys reconnect with cleared auth (will trigger QR)
                break;

            case DisconnectReason.badSession:
                // Corrupted session files
                console.log(JSON.stringify({
                    level: 'warn',
                    message: 'Bad session detected. Clearing auth and reconnecting...',
                    timestamp: new Date().toISOString()
                }));
                try {
                    if (fs.existsSync(authPath)) {
                        fs.rmSync(authPath, { recursive: true, force: true });
                    }
                } catch (e) {
                    console.error(`[whatsappService] Failed to clear auth after bad session: ${e.message}`);
                }
                // Let Baileys reconnect with cleared auth
                break;

            case DisconnectReason.restartRequired:
                console.log(JSON.stringify({
                    level: 'info',
                    message: 'Restart required by WhatsApp. Reconnecting...',
                    timestamp: new Date().toISOString()
                }));
                // Let Baileys handle restart
                break;

            case DisconnectReason.connectionClosed:
            case DisconnectReason.connectionLost:
            case DisconnectReason.timedOut:
                console.log(JSON.stringify({
                    level: 'info',
                    message: `Transient disconnect (code: ${statusCode}). Reconnecting...`,
                    timestamp: new Date().toISOString()
                }));
                // Let Baileys handle reconnect
                break;

            case DisconnectReason.connectionReplaced:
                console.log(JSON.stringify({
                    level: 'warn',
                    message: 'Connection replaced by another session. Not reconnecting automatically.',
                    timestamp: new Date().toISOString()
                }));
                this.sessionReason = 'Connection replaced by another active session.';
                // Don't auto-reconnect — another instance is running
                break;

            case DisconnectReason.multideviceMismatch:
                console.log(JSON.stringify({
                    level: 'warn',
                    message: 'Multi-device mismatch. Clearing auth and reconnecting...',
                    timestamp: new Date().toISOString()
                }));
                try {
                    if (fs.existsSync(authPath)) {
                        fs.rmSync(authPath, { recursive: true, force: true });
                    }
                } catch (e) {
                    console.error(`[whatsappService] Failed to clear auth after mismatch: ${e.message}`);
                }
                // Let Baileys reconnect with cleared auth
                break;

            default:
                console.log(JSON.stringify({
                    level: 'warn',
                    message: `Unknown disconnect reason (code: ${statusCode}). Reconnecting...`,
                    timestamp: new Date().toISOString()
                }));
                // Let Baileys handle reconnect
                break;
        }
    }

    handleReconnect() {
        if (this.initializing) return;

        this.reconnectAttempts++;
        this.lastReconnect = new Date().toISOString();
        this.clientState = ConnectionState.RECONNECTING;

        // Alert operations if consecutive reconnection attempts exceed the threshold
        if (this.reconnectAttempts >= 25) {
            console.error(JSON.stringify({
                level: 'error',
                message: '[WhatsApp] Repeated initialization failures detected. Automatic recovery continues, but manual investigation is recommended.',
                reconnectAttempts: this.reconnectAttempts,
                initFailures: this.initFailures,
                timestamp: new Date().toISOString()
            }));
        }

        // Exponential backoff + circuit breaker strategy
        let backoffSeconds = 5;
        if (this.reconnectAttempts <= 3) {
            // First 3 attempts: standard exponential backoff (5s, 10s, 20s)
            backoffSeconds = 5 * Math.pow(2, this.reconnectAttempts - 1);
        } else if (this.reconnectAttempts <= 5) {
            // Attempt 4 & 5: Wait 1 minute (60 seconds)
            backoffSeconds = 60;
        } else {
            // Attempt 6+: Wait 5 minutes (300 seconds)
            backoffSeconds = 300;
        }

        // Apply +/-20% randomized jitter to prevent thundering herd behavior
        const jitterRatio = 0.8 + Math.random() * 0.4;
        const finalDelayMs = Math.round(backoffSeconds * jitterRatio * 1000);

        console.log(JSON.stringify({
            level: 'info',
            message: `Attempting WhatsApp client reconnection in ${(finalDelayMs / 1000).toFixed(1)} seconds (Attempt #${this.reconnectAttempts}, Base delay: ${backoffSeconds}s)...`,
            timestamp: new Date().toISOString()
        }));

        setTimeout(() => {
            this.initialize();
        }, finalDelayMs);
    }

    // --- Wrapper API -------------------------------------------------------

    /**
     * Send a text message to a WhatsApp JID.
     * @param {string} jid - The recipient JID (e.g. 919876543210@s.whatsapp.net)
     * @param {string} text - The message text
     * @returns {Promise<object>} - The sent message proto
     */
    async sendText(jid, text) {
        if (!this.isReady()) {
            throw new Error('WhatsApp service is not connected.');
        }
        return this.sock.sendMessage(jid, { text });
    }

    /**
     * Send a location message to a WhatsApp JID.
     * @param {string} jid - The recipient JID
     * @param {number} latitude - Degrees latitude
     * @param {number} longitude - Degrees longitude
     * @param {string} [description] - Location name/description
     * @returns {Promise<object>} - The sent message proto
     */
    async sendLocation(jid, latitude, longitude, description) {
        if (!this.isReady()) {
            throw new Error('WhatsApp service is not connected.');
        }
        return this.sock.sendMessage(jid, {
            location: {
                degreesLatitude: parseFloat(latitude),
                degreesLongitude: parseFloat(longitude),
                name: description || undefined
            }
        });
    }

    // --- Shutdown -----------------------------------------------------------

    async close() {
        if (this.sock) {
            console.log(JSON.stringify({
                level: 'info',
                message: 'Closing WhatsApp client session...',
                timestamp: new Date().toISOString()
            }));
            try {
                this.sock.end(undefined);
            } catch (err) {
                console.error(JSON.stringify({
                    level: 'error',
                    message: 'Error occurred while closing WhatsApp client',
                    error: err.message,
                    timestamp: new Date().toISOString()
                }));
            }
            this.sock = null;
            this.connected = false;
            this.authenticated = false;
            this.clientState = ConnectionState.DISCONNECTED;
        }
    }
}

module.exports = new WhatsAppService();
