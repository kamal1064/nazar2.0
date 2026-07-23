/**
 * NAZAR Voice Engine Logger Utility
 * v1.0.0
 */
export const LogLevels = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3
};

export class Logger {
    constructor() {
        this.level = LogLevels.INFO; // Default logging level
    }

    setLogLevel(levelName) {
        const target = LogLevels[levelName.toUpperCase()];
        if (target !== undefined) {
            this.level = target;
        }
    }

    debug(...args) {
        if (this.level <= LogLevels.DEBUG) {
            console.log('[VoiceEngine DEBUG]', ...args);
        }
    }

    info(...args) {
        if (this.level <= LogLevels.INFO) {
            console.info('[VoiceEngine INFO]', ...args);
        }
    }

    warn(...args) {
        if (this.level <= LogLevels.WARN) {
            console.warn('[VoiceEngine WARN]', ...args);
        }
    }

    error(...args) {
        if (this.level <= LogLevels.ERROR) {
            console.error('[VoiceEngine ERROR]', ...args);
        }
    }
}

// Export single instance
export const logger = new Logger();
