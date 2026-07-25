const path = require('path');
const fs = require('fs');

class OpenWaService {
    constructor() {
        this.client = null;
        this.ready = false;
        this.initializing = false;
        this.reconnecting = false;
        this.lastReconnect = null;
        this.authStatus = false;
        this.isServerless = process.env.VERCEL === '1' || process.env.NODE_ENV === 'serverless';
    }

    async initialize() {
        if (this.ready || this.initializing) return;
        
        if (this.isServerless) {
            console.warn('[OpenWaService] Running in serverless environment. OpenWA service initialized in DEGRADED mode.');
            return;
        }

        this.initializing = true;
        console.log('[OpenWaService] Starting asynchronous OpenWA initialization...');

        try {
            // Dynamically require so serverless runtimes that don't install puppeteer don't crash
            const wa = require('@open-wa/wa-automate');

            const sessionId = process.env.OPENWA_SESSION_ID || 'nazar-sos-session';
            const headless = process.env.OPENWA_HEADLESS !== 'false';
            const sessionPath = process.env.OPENWA_SESSION_PATH 
                ? path.resolve(process.env.OPENWA_SESSION_PATH) 
                : path.join(process.cwd(), '../.openwa-session');

            // Ensure session directory exists
            if (!fs.existsSync(sessionPath)) {
                fs.mkdirSync(sessionPath, { recursive: true });
            }

            console.log(`[OpenWaService] Session path: ${sessionPath}`);

            this.client = await wa.create({
                sessionId: sessionId,
                headless: headless,
                userDataDir: sessionPath,
                qrTimeout: 0,
                authTimeout: 0,
                multiDevice: true,
                safeMode: true,
                disableSpins: true,
                useChrome: false
            });

            this.ready = true;
            this.initializing = false;
            this.authStatus = true;
            this.lastReconnect = new Date().toISOString();
            console.log('[OpenWaService] WhatsApp client is ready and authenticated.');

            // Listen to state changes
            this.client.onStateChanged((state) => {
                console.log(`[OpenWaService] Connection state changed to: ${state}`);
                if (state === 'CONNECTED') {
                    this.ready = true;
                    this.authStatus = true;
                } else if (state === 'DISCONNECTED' || state === 'UNPAIRED' || state === 'CONFLICT') {
                    this.ready = false;
                    this.authStatus = false;
                    this.handleDisconnect();
                }
            });

        } catch (err) {
            this.initializing = false;
            this.ready = false;
            console.error('[OpenWaService] Initialization failed:', err.message);
            this.handleDisconnect();
        }
    }

    isReady() {
        return this.ready && !!this.client;
    }

    async handleDisconnect() {
        if (this.reconnecting || this.isServerless) return;
        this.reconnecting = true;
        console.log('[OpenWaService] WhatsApp client disconnected. Starting reconnection backoff loop...');

        let delay = 5000;
        while (!this.ready && !this.initializing) {
            console.log(`[OpenWaService] Attempting to reconnect in ${delay / 1000}s...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            
            try {
                await this.initialize();
            } catch (e) {
                console.error('[OpenWaService] Reconnection attempt failed:', e.message);
            }

            // Exponential backoff limit 60s
            delay = Math.min(delay * 2, 60000);
        }
        this.reconnecting = false;
    }

    async sendLocation(to, lat, lng, caption) {
        if (!this.isReady()) {
            throw new Error('WhatsApp service client is not connected.');
        }

        const timeoutMs = parseInt(process.env.OPENWA_SEND_TIMEOUT_MS || '10000', 10);
        
        const operation = async () => {
            const delays = [0, 2000, 5000];
            let lastErr = null;

            for (let i = 0; i < delays.length; i++) {
                if (delays[i] > 0) {
                    await new Promise(resolve => setTimeout(resolve, delays[i]));
                }
                try {
                    console.log(`[OpenWaService] Sending location to ${to} (Attempt ${i + 1}/${delays.length})...`);
                    const result = await this.client.sendLocation(to, String(lat), String(lng), caption || '');
                    return result;
                } catch (err) {
                    lastErr = err;
                    console.warn(`[OpenWaService] Location send attempt ${i + 1} failed:`, err.message);
                    if (err.message && err.message.includes('JID')) break; // don't retry on invalid JIDs
                }
            }
            throw lastErr || new Error('Failed to send WhatsApp location after retries.');
        };

        return Promise.race([
            operation(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('WhatsApp send operation timed out')), timeoutMs))
        ]);
    }

    async sendMessage(to, text) {
        if (!this.isReady()) {
            throw new Error('WhatsApp service client is not connected.');
        }

        const timeoutMs = parseInt(process.env.OPENWA_SEND_TIMEOUT_MS || '10000', 10);

        const operation = async () => {
            const delays = [0, 2000, 5000];
            let lastErr = null;

            for (let i = 0; i < delays.length; i++) {
                if (delays[i] > 0) {
                    await new Promise(resolve => setTimeout(resolve, delays[i]));
                }
                try {
                    console.log(`[OpenWaService] Sending text message to ${to} (Attempt ${i + 1}/${delays.length})...`);
                    const result = await this.client.sendText(to, text);
                    return result;
                } catch (err) {
                    lastErr = err;
                    console.warn(`[OpenWaService] Text send attempt ${i + 1} failed:`, err.message);
                }
            }
            throw lastErr || new Error('Failed to send WhatsApp message after retries.');
        };

        return Promise.race([
            operation(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('WhatsApp send operation timed out')), timeoutMs))
        ]);
    }

    async shutdown() {
        if (this.client) {
            console.log('[OpenWaService] Closing WhatsApp client and releasing Chromium resources...');
            try {
                await this.client.kill();
            } catch (e) {
                console.error('[OpenWaService] Error during client shutdown:', e.message);
            }
            this.client = null;
            this.ready = false;
        }
    }
}

const openwaService = new OpenWaService();

// Handle termination signals to release Chromium resources cleanly
process.on('SIGINT', async () => {
    console.log('[Process] SIGINT received.');
    await openwaService.shutdown();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('[Process] SIGTERM received.');
    await openwaService.shutdown();
    process.exit(0);
});

module.exports = openwaService;
