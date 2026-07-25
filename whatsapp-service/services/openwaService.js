const wa = require('@open-wa/wa-automate');
const path = require('path');
const cp = require('child_process');
const fs = require('fs');

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
        this.latestQr = null;
        
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

        // Log diagnostics on startup
        let chromeVersion = 'Unknown';
        const chromePath = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable';
        try {
            chromeVersion = cp.execSync(`"${chromePath}" --version`).toString().trim();
        } catch (e) {
            try {
                chromeVersion = cp.execSync('google-chrome --version').toString().trim();
            } catch (err) {}
        }

        let puppeteerVersion = 'Unknown';
        try {
            puppeteerVersion = require('puppeteer-core/package.json').version;
        } catch (e) {
            try {
                puppeteerVersion = require('puppeteer/package.json').version;
            } catch (err) {}
        }

        let openwaVersion = 'Unknown';
        try {
            openwaVersion = require('@open-wa/wa-automate/package.json').version;
        } catch (e) {}

        console.log(JSON.stringify({
            level: 'info',
            message: 'Stage: Starting OpenWA diagnostic startup...',
            sessionPath,
            chromePath,
            chromeVersion,
            puppeteerVersion,
            openwaVersion,
            timestamp: new Date().toISOString()
        }));

        try {
            // Set configurations suitable for hosting environments (like Render/Docker)
            const launchConfig = {
                sessionId: 'nazar-sos-session',
                sessionDataPath: sessionPath,
                multiDevice: true,
                useChrome: true,
                headless: true,
                qrTimeout: 0,
                authTimeout: 120,
                autoClose: false,
                killProcessOnBrowserClose: true,
                throwErrorOnTosBlock: true,
                userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                chromiumArgs: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--disable-blink-features=AutomationControlled'
                ]
            };

            // Use system Chrome executable path if specified
            if (process.env.PUPPETEER_EXECUTABLE_PATH) {
                launchConfig.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
            }

            console.log(JSON.stringify({
                level: 'info',
                message: 'Stage: Config compiled. Waiting for browser launch...',
                timestamp: new Date().toISOString()
            }));

            // Hook QR code generation updates
            launchConfig.qrCallback = (qrCode, asciiQR, attempts) => {
                this.latestQr = qrCode;
                this.clientState = 'QR_REQUIRED';
                this.sessionReason = `QR code scanning required (Attempt #${attempts})`;
                
                console.log(JSON.stringify({
                    level: 'warn',
                    message: `Stage: QR generated. QR callback invoked. Attempt #${attempts}`,
                    timestamp: new Date().toISOString()
                }));

                // Print the ASCII QR to the terminal console
                console.log(asciiQR);
            };

            console.log(JSON.stringify({
                level: 'info',
                message: 'Stage: Spawning browser and navigating to WhatsApp Web...',
                timestamp: new Date().toISOString()
            }));

            this.client = await wa.create(launchConfig);
            
            this.connected = true;
            this.authenticated = true;
            this.clientState = 'CONNECTED';
            this.initializing = false;
            this.reconnectAttempts = 0;
            this.startTime = Date.now();
            this.sessionReason = null;
            this.latestQr = null; // Clear QR once authenticated

            console.log(JSON.stringify({
                level: 'info',
                message: 'Stage: WhatsApp OpenWA Client successfully initialized and connected!',
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
                message: 'OpenWA Client initialization failed. Wiping corrupted session directories...',
                error: err.message,
                timestamp: new Date().toISOString()
            }));

            // Wipe session data to resolve potential integrity check corruption/browser mismatch hangs
            try {
                const subDir = path.join(sessionPath, '_IGNORE_nazar-sos-session');
                const dataFile = path.join(sessionPath, 'nazar-sos-session.data.json');
                
                if (fs.existsSync(subDir)) {
                    console.log(`[openwaService] Wiping session directory to clear corruption: ${subDir}`);
                    fs.rmSync(subDir, { recursive: true, force: true });
                }
                if (fs.existsSync(dataFile)) {
                    console.log(`[openwaService] Wiping session data file to clear corruption: ${dataFile}`);
                    fs.rmSync(dataFile, { force: true });
                }
            } catch (clearErr) {
                console.error(`[openwaService] Failed to clear session directory: ${clearErr.message}`);
            }

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
