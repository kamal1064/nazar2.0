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
        this.initFailures = 0;
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
            if (process.platform === 'win32') {
                const regOut = cp.execSync('reg query "HKEY_CURRENT_USER\\Software\\Google\\Chrome\\BLBeacon" /v version').toString();
                const match = regOut.match(/version\s+REG_SZ\s+([\d.]+)/i);
                if (match) chromeVersion = match[1];
            } else {
                chromeVersion = cp.execSync(`"${chromePath}" --version`).toString().trim();
            }
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

        // Dynamically extract major Chrome version for the User-Agent
        let chromeMajorVersion = '144';
        const versionMatch = chromeVersion.match(/(\d+)\.\d+\.\d+\.\d+/);
        if (versionMatch) {
            chromeMajorVersion = versionMatch[1];
        }

        // Match user agent operating system platform to avoid fingerprinting blockages during phone linking
        const isWin = process.platform === 'win32';
        const isMac = process.platform === 'darwin';
        let platformStr = 'X11; Linux x86_64';
        if (isWin) {
            platformStr = 'Windows NT 10.0; Win64; x64';
        } else if (isMac) {
            platformStr = 'Macintosh; Intel Mac OS X 10_15_7';
        }
        const dynamicUserAgent = `Mozilla/5.0 (${platformStr}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeMajorVersion}.0.0.0 Safari/537.36`;

        console.log(JSON.stringify({
            level: 'info',
            message: 'Stage: Starting OpenWA diagnostic startup...',
            sessionPath,
            chromePath,
            chromeVersion,
            puppeteerVersion,
            openwaVersion,
            detectedUserAgent: dynamicUserAgent,
            timestamp: new Date().toISOString()
        }));

        try {
            const isLinux = process.platform === 'linux';
            // Set configurations suitable for hosting environments (like Render/Docker)
            const launchConfig = {
                sessionId: 'nazar-sos-session',
                sessionDataPath: sessionPath,
                multiDevice: true,
                useChrome: !process.env.PUPPETEER_EXECUTABLE_PATH,
                headless: process.env.OPENWA_HEADLESS === 'true',
                qrTimeout: 0,
                timeout: 120,                       // 120s default timeout for Puppeteer operations instead of 30s
                authTimeout: 300,                  // Increased to allow slow/constrained environments to initialize
                waitForRipeSessionTimeout: 120,     // Wait up to 120s for session page readiness
                oorTimeout: 120,                    // Out of reach check timeout
                autoClose: false,
                killProcessOnBrowserClose: true,
                throwErrorOnTosBlock: true,
                userAgent: process.env.OPENWA_USER_AGENT || dynamicUserAgent,
                chromiumArgs: isLinux ? [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--no-first-run',
                    '--no-default-browser-check',
                    '--disable-background-networking',
                    '--disable-background-timer-throttling',
                    '--disable-renderer-backgrounding'
                ] : []
            };

            // Use system Chrome executable path if specified
            if (process.env.PUPPETEER_EXECUTABLE_PATH) {
                launchConfig.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
            }

            // Startup diagnostics logging (excluding private data/tokens)
            console.log(JSON.stringify({
                level: 'info',
                message: 'OpenWA SOS Microservice - Diagnostic Startup Config',
                config: {
                    sessionId: launchConfig.sessionId,
                    sessionDataPath: launchConfig.sessionDataPath,
                    headless: launchConfig.headless,
                    multiDevice: launchConfig.multiDevice,
                    useChrome: launchConfig.useChrome,
                    executablePath: launchConfig.executablePath || 'default',
                    authTimeout: `${launchConfig.authTimeout}s`,
                    qrTimeout: `${launchConfig.qrTimeout}s`,
                    waitForRipeSessionTimeout: `${launchConfig.waitForRipeSessionTimeout}s`,
                    oorTimeout: `${launchConfig.oorTimeout}s`,
                    containerArgs: 'enabled'
                },
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
            this.initFailures = 0; // Reset consecutive failures on success
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

            // Classify error type: separate browser launch failures from session/authentication issues
            let isBrowserLaunchFailure = false;

            // 1. Check known error codes
            if (err.code === 'ENOENT' || err.code === 'ECONNRESET' || err.code === 'ECONNREFUSED') {
                isBrowserLaunchFailure = true;
            }

            // 2. Check stack/module origin (Puppeteer launcher code vs OpenWA session logic)
            if (err.stack && (err.stack.includes('Puppeteer') || err.stack.includes('Launcher') || err.stack.includes('BrowserRunner'))) {
                if (!err.message.includes('Timeout') && !err.message.includes('Waiting')) {
                    isBrowserLaunchFailure = true;
                }
            }

            // 3. Fallback message pattern matching
            if (!isBrowserLaunchFailure) {
                const lowerMsg = err.message.toLowerCase();
                if (lowerMsg.includes('failed to launch') || 
                    lowerMsg.includes('xvfb') || 
                    lowerMsg.includes('chrome') || 
                    lowerMsg.includes('chromium') || 
                    lowerMsg.includes('browser process')) {
                    if (!lowerMsg.includes('timeout') && !lowerMsg.includes('waiting')) {
                        isBrowserLaunchFailure = true;
                    }
                }
            }

            // Only increment consecutive session failures if it wasn't a browser/driver launch crash
            if (!isBrowserLaunchFailure) {
                this.initFailures++;
            }

            console.error(JSON.stringify({
                level: 'error',
                message: `OpenWA Client initialization failed. (Consecutive session failures: ${this.initFailures}, Browser launch failure: ${isBrowserLaunchFailure})`,
                error: err.message,
                timestamp: new Date().toISOString()
            }));

            // Wipe session data to resolve potential corruption ONLY after 3 consecutive session failures
            if (!isBrowserLaunchFailure && this.initFailures >= 3) {
                console.log(`[openwaService] Session failure threshold reached (${this.initFailures}). Wiping session directories...`);
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
                    this.initFailures = 0; // Reset counter after clean
                } catch (clearErr) {
                    console.error(`[openwaService] Failed to clear session directory: ${clearErr.message}`);
                }
            }

            // Trigger reconnection loop
            this.handleReconnect();
        }
    }

    handleReconnect() {
        if (this.initializing) return;

        this.reconnectAttempts++;
        this.lastReconnect = new Date().toISOString();

        // 1. Alert operations if consecutive reconnection attempts exceed the threshold
        if (this.reconnectAttempts >= 25) {
            console.error(JSON.stringify({
                level: 'error',
                message: '[OpenWA] Repeated initialization failures detected. Automatic recovery continues, but manual investigation is recommended.',
                reconnectAttempts: this.reconnectAttempts,
                initFailures: this.initFailures,
                timestamp: new Date().toISOString()
            }));
        }

        // 2. Exponential backoff + circuit breaker strategy
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

        // 3. Apply ±20% randomized jitter to prevent thundering herd behavior
        const jitterRatio = 0.8 + Math.random() * 0.4;
        const finalDelayMs = Math.round(backoffSeconds * jitterRatio * 1000);

        console.log(JSON.stringify({
            level: 'info',
            message: `Attempting OpenWA client reconnection in ${(finalDelayMs / 1000).toFixed(1)} seconds (Attempt #${this.reconnectAttempts}, Base delay: ${backoffSeconds}s)...`,
            timestamp: new Date().toISOString()
        }));

        setTimeout(() => {
            this.initialize();
        }, finalDelayMs);
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
