/**
 * NAZAR Voice Engine — Conversation Context
 * v1.0.0
 *
 * Short-term session memory with per-field expiry timers.
 * Stores the last vision scan result, OCR text, active page, and more
 * so that follow-up questions can reuse previous results without a new scan.
 *
 * Vision Cache rule:
 *   - Reuse lastScene if it is < visionCacheTTL (60s) old
 *   - Reuse lastOCR if it is < ocrCacheTTL (120s) old
 *   - Invalidate on: expiry | "Scan again" | camera mode switch
 */
import { voiceConfig } from '../utils/voiceConfig.js';
import { logger } from '../utils/logger.js';

class ConversationContext {
    constructor() {
        this._data = {
            currentPage:         null,   // Active panel (e.g., 'camera', 'settings')
            currentCameraMode:   null,   // 'ocr' | 'scene'
            lastScanTimestamp:   null,   // Unix ms of last successful scan
            lastScene:           null,   // Gemini Vision scene description text
            lastOCR:             null,   // OCR extracted text
            lastUserGoal:        null,   // User's stated intent in natural language
            lastIntent:          null,   // Last resolved intent object
            conversationHistory: [],     // Rolling array of { role, text } turns
            lastObjectFound:     null,   // ObjectFinder result
            sessionStartTime:    null,   // Set when session starts
        };

        // Expiry timers (per-field)
        this._sceneTimer = null;
        this._ocrTimer   = null;
    }

    // ─── Field Getters ────────────────────────────────────────────────────────

    get currentPage()         { return this._data.currentPage; }
    get currentCameraMode()   { return this._data.currentCameraMode; }
    get lastScene()           { return this._data.lastScene; }
    get lastOCR()             { return this._data.lastOCR; }
    get lastUserGoal()        { return this._data.lastUserGoal; }
    get lastIntent()          { return this._data.lastIntent; }
    get conversationHistory() { return this._data.conversationHistory; }
    get lastObjectFound()     { return this._data.lastObjectFound; }
    get sessionStartTime()    { return this._data.sessionStartTime; }

    // ─── Setters ──────────────────────────────────────────────────────────────

    setPage(page) {
        this._data.currentPage = page;
    }

    setCameraMode(mode) {
        // Switching mode invalidates the vision cache
        if (mode !== this._data.currentCameraMode) {
            this.invalidateVisionCache('mode_switch');
        }
        this._data.currentCameraMode = mode;
    }

    /**
     * Store a new scene description from Gemini Vision.
     * Starts a 60-second expiry timer.
     * @param {string} sceneText
     */
    setLastScene(sceneText) {
        this._data.lastScene = sceneText;
        this._data.lastScanTimestamp = Date.now();

        // Reset scene expiry timer
        clearTimeout(this._sceneTimer);
        this._sceneTimer = setTimeout(() => {
            logger.vision.debug('[Context] Scene cache expired (60s TTL).');
            this._data.lastScene = null;
            this._data.lastScanTimestamp = null;
        }, voiceConfig.vision.cacheTTL);
    }

    /**
     * Store OCR result text.
     * Starts a 120-second expiry timer.
     * @param {string} ocrText
     */
    setLastOCR(ocrText) {
        this._data.lastOCR = ocrText;

        clearTimeout(this._ocrTimer);
        this._ocrTimer = setTimeout(() => {
            logger.vision.debug('[Context] OCR cache expired (120s TTL).');
            this._data.lastOCR = null;
        }, voiceConfig.vision.ocrCacheTTL);
    }

    setLastUserGoal(goal)     { this._data.lastUserGoal = goal; }
    setLastIntent(intent)     { this._data.lastIntent = intent; }
    setLastObjectFound(obj)   { this._data.lastObjectFound = obj; }

    /**
     * Add a turn to the rolling conversation history (max 8 turns).
     * @param {'user'|'assistant'} role
     * @param {string} text
     */
    addConversationTurn(role, text) {
        this._data.conversationHistory.push({ role, text, ts: Date.now() });
        if (this._data.conversationHistory.length > 8) {
            this._data.conversationHistory.shift();
        }
    }

    /**
     * Start a new session — sets sessionStartTime and clears history.
     */
    startSession() {
        this._data.sessionStartTime = Date.now();
        this._data.conversationHistory = [];
        this._data.lastUserGoal = null;
    }

    /**
     * Explicitly invalidate the vision cache.
     * Called by "Scan again" command or camera mode switch.
     * @param {string} reason - For logging
     */
    invalidateVisionCache(reason = 'explicit') {
        clearTimeout(this._sceneTimer);
        clearTimeout(this._ocrTimer);
        this._data.lastScene = null;
        this._data.lastOCR = null;
        this._data.lastScanTimestamp = null;
        logger.vision.info(`[Context] Vision cache invalidated. Reason: ${reason}`);
    }

    /**
     * Build a context payload safe for Gemini requests.
     * Only whitelisted fields are included — no internal state or session secrets.
     * @returns {Object}
     */
    toGeminiContext() {
        const whitelist = voiceConfig.security.contextWhitelist;
        const result = {};
        for (const key of whitelist) {
            if (this._data[key] !== null && this._data[key] !== undefined) {
                result[key] = this._data[key];
            }
        }
        return result;
    }

    /**
     * Returns a HUD-friendly snapshot of current context state.
     */
    snapshot() {
        return {
            currentPage:       this._data.currentPage,
            currentCameraMode: this._data.currentCameraMode,
            hasScene:          !!this._data.lastScene,
            hasOCR:            !!this._data.lastOCR,
            sceneAgeMs:        this._data.lastScanTimestamp ? Date.now() - this._data.lastScanTimestamp : null,
            historyDepth:      this._data.conversationHistory.length,
        };
    }
}

// Export single instance
export const conversationContext = new ConversationContext();
