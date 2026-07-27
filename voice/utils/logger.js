/**
 * NAZAR Voice Engine Logger Utility
 * v2.0.0
 *
 * Structured, category-prefixed, session-scoped logger.
 * All voice engine modules use this instead of raw console.log calls.
 *
 * Usage:
 *   import { logger } from '../utils/logger.js';
 *   logger.voice.info('Wake detected');
 *   logger.gemini.warn('Timeout on intent call');
 *   logger.skill.debug('CameraSkill executing: startScan');
 *   logger.perf.info('Total latency: 187ms');
 */

export const LogLevels = {
    DEBUG: 0,
    INFO:  1,
    WARN:  2,
    ERROR: 3,
};

class CategoryLogger {
    /**
     * @param {string} category - Display label e.g. 'Voice', 'Gemini', 'Skill'
     * @param {Logger} parent   - The root Logger instance for shared state
     */
    constructor(category, parent) {
        this._category = category;
        this._parent   = parent;
    }

    _prefix() {
        const sid = this._parent._sessionId ? `[${this._parent._sessionId}]` : '';
        return `${sid}[${this._category}]`;
    }

    debug(...args) {
        if (this._parent.level <= LogLevels.DEBUG) {
            console.debug(this._prefix(), ...args);
        }
    }

    info(...args) {
        if (this._parent.level <= LogLevels.INFO) {
            console.info(this._prefix(), ...args);
        }
    }

    warn(...args) {
        if (this._parent.level <= LogLevels.WARN) {
            console.warn(this._prefix(), ...args);
        }
    }

    error(...args) {
        if (this._parent.level <= LogLevels.ERROR) {
            console.error(this._prefix(), ...args);
        }
    }
}

export class Logger {
    constructor() {
        this.level      = LogLevels.INFO;
        this._sessionId = null;

        // Named category loggers
        this.voice    = new CategoryLogger('Voice',    this);
        this.gemini   = new CategoryLogger('Gemini',   this);
        this.skill    = new CategoryLogger('Skill',    this);
        this.router   = new CategoryLogger('Router',   this);
        this.recovery = new CategoryLogger('Recovery', this);
        this.perf     = new CategoryLogger('Perf',     this);
        this.vision   = new CategoryLogger('Vision',   this);
        this.session  = new CategoryLogger('Session',  this);
    }

    /**
     * Set the active session ID prefix (4-char hex from SessionManager).
     * All subsequent log lines will include [XXXX] until cleared.
     * @param {string|null} id
     */
    setSessionId(id) {
        this._sessionId = id ? String(id).substring(0, 4).toUpperCase() : null;
    }

    /**
     * Set the minimum log level.
     * @param {'DEBUG'|'INFO'|'WARN'|'ERROR'} levelName
     */
    setLogLevel(levelName) {
        const target = LogLevels[levelName?.toUpperCase()];
        if (target !== undefined) {
            this.level = target;
        }
    }

    /**
     * Structured production logging without storing raw user speech.
     * @param {'Voice Started'|'Recognition Success'|'Recognition Failure'|'Groq Request'|'Groq Response Time'|'Navigation Command'|'Error'} event
     * @param {Object} [metadata]
     */
    productionLog(event, metadata = {}) {
        const safeMeta = { ...metadata };
        // Strip any raw user speech from production logs
        delete safeMeta.transcript;
        delete safeMeta.rawSpeech;
        delete safeMeta.text;
        
        console.info(`[PROD_LOG] [${event}]`, JSON.stringify(safeMeta));
    }

    // ─── Root-level convenience (no category prefix) ──────────────────────────
    debug(...args) { this.voice.debug(...args); }
    info(...args)  { this.voice.info(...args);  }
    warn(...args)  { this.voice.warn(...args);  }
    error(...args) { this.voice.error(...args); }
}

// Export single shared instance
export const logger = new Logger();
