const wa = require('@open-wa/wa-automate');
const path = require('path');

class OpenWaService {
    constructor() {
        this.client = null;
        this.initializing = false;
        this.connected = false;
        this.authenticated = false;
        this.clientState = 'UNINITIALIZED';
        this.lastReconnect = null;
        this.reconnectAttempts = 0;
        this.uptimeSeconds = 0;
        this.startTime = null;
        this.sessionReason = null;
        
        // Start uptime tracker
        setInterval(() => {
            if (this.startTime) {
                this.uptimeSeconds = Math.floor((Date.now() - this.startTime) / 1000);
            }
        }, 1000);
    }

    isReady() {
        return this.client !== null && this.connected && this.authenticated;
    }

    async initialize() {
        if (this.isReady() || this.initializing) {
            return;
        }

        this.initializing = true;
        this.clientState = 'INITIALIZING';
        this.sessionReason = null;
        
        const sessionPath = path.resolve(process.env.OPENWA_SESSION_PATH || '../.openwa-session');

        console.log(JSON.stringify({
            level: 'info',
            message: 'Starting asynchronous OpenWA initialization...',
            sessionPath,
            timestamp: new Date().toISOString()
        }));

        try {
            // Set Puppeteer configurations suitable for hosting environments (like Render/Docker)
            const launchConfig = {
                sessionId: 'nazar-sos-session',
                dataPath: sessionPath,
                multiDevice: true,
                useChrome: false, // Use internal chromium
                headless: true,
                qrTimeout: 0, // Never timeout wait for QR
                authTimeout: 60,
                autoClose: false,
                killProcessOnBrowserClose: true,
                throwErrorOnTosBlock: true,
                chromiumArgs: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu'
                ]
            };

            // Use system Chrome executable path if specified
            if (process.env.PUPPETEER_EXECUTABLE_PATH) {
                launchConfig.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
            }

            // Hook QR code generation updates
            launchConfig.qrCallback = (base64Qr) => {
                this.clientState = 'QR_REQUIRED';
                this.sessionReason = 'QR code scanning required to authenticate';
                console.log(JSON.stringify({
                    level: 'warn',
                    message: 'WhatsApp Web authentication QR code required. Please scan via WhatsApp mobile application.',
                    timestamp: new Date().toISOString()
                }));
            };

            this.client = await wa.create(launchConfig);
            
            this.connected = true;
            this.authenticated = true;
            this.clientState = 'CONNECTED';
            this.initializing = false;
            this.reconnectAttempts = 0;
            this.startTime = Date.now();
            this.sessionReason = null;

            console.log(JSON.stringify({
                level: 'info',
                message: 'WhatsApp OpenWA Client successfully initialized and connected!',
                timestamp: new Date().toISOString()
            }));

            // Handle connection loss events
            this.client.onStateChanged((state) => {
                this.clientState = state;
                console.log(JSON.stringify({
                    level: 'info',
                    message: `OpenWA Client connection state changed to: ${state}`,
                    timestamp: new Date().toISOString()
                }));

                if (state === 'CONFLICT' || state === 'UNLAUNCHED') {
                    this.connected = false;
                    this.authenticated = false;
                    this.handleReconnect();
                } else if (state === 'CONNECTED') {
                    this.connected = true;
                    this.authenticated = true;
                }
            });

        } catch (err) {
            this.connected = false;
            this.authenticated = false;
            this.clientState = 'ERROR';
            this.initializing = false;
            this.client = null;
            this.sessionReason = err.message;

            console.error(JSON.stringify({
                level: 'error',
                message: 'OpenWA Client initialization failed',
                error: err.message,
                timestamp: new Date().toISOString()
            }));

            // Trigger reconnection loop
            this.handleReconnect();
        }
    }

    handleReconnect() {
        if (this.initializing) return;

        // Exponential backoff strategy: 5s -> 10s -> 20s -> 40s -> max 60s
        const backoffSeconds = Math.min(5 * Math.pow(2, this.reconnectAttempts), 60);
        this.reconnectAttempts++;
        this.lastReconnect = new Date().toISOString();

        console.log(JSON.stringify({
            level: 'info',
            message: `Attempting OpenWA client reconnection in ${backoffSeconds} seconds (Attempt #${this.reconnectAttempts})...`,
            timestamp: new Date().toISOString()
        }));

        setTimeout(() => {
            this.initialize();
        }, backoffSeconds * 1000);
    }

    async close() {
        if (this.client) {
            console.log(JSON.stringify({
                level: 'info',
                message: 'Closing WhatsApp client session...',
                timestamp: new Date().toISOString()
            }));
            try {
                await this.client.close();
            } catch (err) {
                console.error(JSON.stringify({
                    level: 'error',
                    message: 'Error occurred while closing WhatsApp client',
                    error: err.message,
                    timestamp: new Date().toISOString()
                }));
            }
            this.client = null;
            this.connected = false;
            this.authenticated = false;
            this.clientState = 'DISCONNECTED';
        }
    }
}

module.exports = new OpenWaService();
