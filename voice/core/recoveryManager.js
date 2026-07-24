/**
 * NAZAR Voice Engine — Recovery Manager
 * v1.0.0
 *
 * Central handler for all failure recovery. Skills return error codes —
 * this module maps them to spoken guidance and logs structured errors.
 * No skill file contains hardcoded error strings.
 *
 * Usage:
 *   import { recoveryManager } from './recoveryManager.js';
 *   recoveryManager.handle('VOICE_001'); // speaks + logs
 */
import { speaker } from './speaker.js';
import { logger } from '../utils/logger.js';
import { eventBus } from './eventBus.js';
import { VoiceEvents } from '../events.js';

/**
 * Error code → recovery response map.
 * Each entry defines the spoken text and whether to offer a retry prompt.
 */
const RECOVERY_MAP = {
    // Hardware
    VOICE_001: {
        spoken: "I couldn't access the microphone. Please check that it's connected and allowed in your browser settings.",
        offerRetry: false,
    },
    // Browser support
    VOICE_002: {
        spoken: "Voice services aren't supported in this browser. Please use Chrome or Edge for the best experience.",
        offerRetry: false,
    },
    // Network
    VOICE_003: {
        spoken: "I'm offline right now. Navigation, settings, and voice controls still work — but scanning and AI features need internet.",
        offerRetry: false,
    },
    // Intent/parsing failure
    VOICE_004: {
        spoken: "I didn't understand that. Could you try saying it a different way?",
        offerRetry: false,
    },
    // Permission denied
    VOICE_005: {
        spoken: "I need permission to access the camera. To enable it: click the lock icon in your browser's address bar, find Camera, and set it to Allow.",
        offerRetry: true,
    },

    // Situational errors (not in errorCodes.js — added here for new skills)
    CAMERA_UNAVAILABLE: {
        spoken: "I couldn't access the camera. Would you like me to try again?",
        offerRetry: true,
    },
    GEMINI_UNAVAILABLE: {
        spoken: "I'm temporarily unable to analyze images. Local commands like navigation and settings still work.",
        offerRetry: false,
    },
    GEMINI_TIMEOUT: {
        spoken: "My connection seems slow. Please try again.",
        offerRetry: true,
    },
    SKILL_ERROR: {
        spoken: "Something went wrong. Please try again.",
        offerRetry: false,
    },
    NO_SPEECH: {
        spoken: "I didn't hear anything. Say 'Hey Nazar' when you're ready.",
        offerRetry: false,
    },
    RESOURCE_CONFLICT: {
        spoken: "I'm already working on something. Please wait a moment.",
        offerRetry: false,
    },
    OBJECT_NOT_FOUND: {
        spoken: "I couldn't find it. Move your camera slightly and say 'Scan again'.",
        offerRetry: false,
    },
    LOW_CONFIDENCE: {
        spoken: "I'm not sure I understood. Could you say that again?",
        offerRetry: false,
    },
};

class RecoveryManager {
    /**
     * Handle an error code — speak recovery guidance and emit an event.
     * @param {string} code - e.g. 'VOICE_001', 'CAMERA_UNAVAILABLE'
     * @param {Object} [meta] - Additional context for logging
     */
    async handle(code, meta = {}) {
        const entry = RECOVERY_MAP[code];

        if (!entry) {
            logger.recovery.warn('[Recovery] Unknown error code:', code, meta);
            await speaker.speak("Something unexpected happened. Please try again.", { mode: 'replace' });
            return;
        }

        logger.recovery.info(`[Recovery] Handling ${code}:`, meta);

        // Speak the recovery message
        await speaker.speak(entry.spoken, { mode: 'replace' });

        eventBus.emit(VoiceEvents.COMMAND_FAILED, { code, ...meta });
    }

    /**
     * Returns the spoken text for a given error code (for building responses).
     * @param {string} code
     * @returns {string}
     */
    getSpokenText(code) {
        return RECOVERY_MAP[code]?.spoken ?? "Something went wrong.";
    }

    /**
     * Returns whether the error code offers a retry.
     * @param {string} code
     * @returns {boolean}
     */
    offersRetry(code) {
        return RECOVERY_MAP[code]?.offerRetry ?? false;
    }
}

// Export single instance
export const recoveryManager = new RecoveryManager();
