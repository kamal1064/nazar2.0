/**
 * NAZAR Voice Engine — Session Manager
 * v1.0.0
 *
 * Centralizes voice session lifecycle:
 * - Generates 4-char hex session IDs for log correlation
 * - Manages the 3-minute idle auto-sleep timer
 * - Emits session start/end events
 * - Injects session ID into the logger on every wake
 *
 * Replaces the scattered idle-timer logic previously in memory.js
 */
import { eventBus } from './eventBus.js';
import { VoiceEvents } from '../events.js';
import { stateMachine } from './state.js';
import { logger } from '../utils/logger.js';
import { voiceConfig } from '../utils/voiceConfig.js';

class SessionManager {
    constructor() {
        this._sessionId  = null;
        this._idleTimer  = null;
        this._startTime  = null;
    }

    /** Returns the current session ID (4-char hex string) */
    get sessionId() { return this._sessionId; }

    /** Returns session duration in ms, or 0 if no active session */
    get durationMs() {
        return this._startTime ? Date.now() - this._startTime : 0;
    }

    /**
     * Start a new voice session.
     * Called when wake word is detected or assistant is manually activated.
     */
    start() {
        // Generate a new 4-char hex session ID
        this._sessionId = Math.floor(Math.random() * 0xFFFF)
            .toString(16)
            .padStart(4, '0')
            .toUpperCase();

        this._startTime = Date.now();

        // Inject session ID into logger for all subsequent log lines
        logger.setSessionId(this._sessionId);

        logger.session.info(`[SessionManager] Session started: ${this._sessionId}`);
        eventBus.emit(VoiceEvents.SESSION_STARTED, { sessionId: this._sessionId });

        this.resetIdleTimer();
    }

    /**
     * End the current session gracefully.
     */
    end(reason = 'user_command') {
        const duration = this.durationMs;
        logger.session.info(`[SessionManager] Session ${this._sessionId} ended. Duration: ${duration}ms. Reason: ${reason}`);

        eventBus.emit(VoiceEvents.SESSION_ENDED, {
            sessionId: this._sessionId,
            durationMs: duration,
            reason
        });

        this._clearIdleTimer();
        this._sessionId = null;
        this._startTime = null;
        logger.setSessionId(null);
    }

    /**
     * Reset the 3-minute idle auto-sleep countdown.
     * Called after every successful command execution.
     */
    resetIdleTimer() {
        this._clearIdleTimer();

        this._idleTimer = setTimeout(async () => {
            if (stateMachine.wakeState === 'Awake') {
                logger.session.info('[SessionManager] 3-minute idle timeout reached. Sleeping.');
                stateMachine.setWakeState('Sleeping');
                stateMachine.setEngineState('Idle');
                this.end('idle_timeout');
                eventBus.emit(VoiceEvents.SESSION_TIMEOUT, { sessionId: this._sessionId });
            }
        }, voiceConfig.idleSleep);
    }

    /** Clear any running idle timer */
    _clearIdleTimer() {
        if (this._idleTimer) {
            clearTimeout(this._idleTimer);
            this._idleTimer = null;
        }
    }

    /**
     * Returns a snapshot of the current session for HUD display.
     * @returns {{ sessionId: string|null, durationMs: number, active: boolean }}
     */
    snapshot() {
        return {
            sessionId: this._sessionId,
            durationMs: this.durationMs,
            active: !!this._sessionId,
        };
    }
}

// Export single instance
export const sessionManager = new SessionManager();
