/**
 * NAZAR Voice Engine — Wake Word Detector
 * v1.0.0
 *
 * Scans interim and final speech recognition transcripts for wake phrases.
 * Uses fuzzy normalization + phonetic alias matching for high reliability.
 * Detects the wake word in <100ms by scanning interim transcripts as the
 * user is still speaking — no separate WASM model required.
 *
 * Usage:
 *   import { wakeWordDetector } from './wakeWord.js';
 *   wakeWordDetector.attach(recognition); // pass Recognition instance
 */
import { voiceConfig } from '../utils/voiceConfig.js';
import { eventBus } from './eventBus.js';
import { VoiceEvents } from '../events.js';
import { logger } from '../utils/logger.js';

class WakeWordDetector {
    constructor() {
        this._enabled = false;
        this._cooldownUntil = 0; // Prevent rapid re-triggering
        this._cooldownMs = 3000;  // 3 seconds between wake events
    }

    /**
     * Attach the wake word detector to a recognition instance.
     * Called by VoiceController after recognition is initialized.
     * @param {import('./recognition.js').Recognition} recognition
     */
    attach(recognition) {
        // Subscribe to interim transcripts for early detection
        recognition.onInterimCallback = (text) => {
            if (this._enabled) this._check(text);
        };

        // Also check final transcripts in case interim was missed
        recognition.onTranscriptCallback = (text) => {
            if (this._enabled) this._check(text);
        };

        logger.voice.info('[WakeWord] Detector attached to recognition.');
    }

    /** Enable wake word listening */
    enable() {
        this._enabled = true;
        logger.voice.info('[WakeWord] Listening for wake phrase.');
    }

    /** Disable wake word listening */
    disable() {
        this._enabled = false;
    }

    /**
     * Normalize a raw transcript for matching:
     * lowercase, strip punctuation, collapse whitespace.
     * @param {string} text
     * @returns {string}
     */
    _normalize(text) {
        return text
            .toLowerCase()
            .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"']/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Check normalized transcript against all wake aliases.
     * Triggers if the transcript CONTAINS any alias (not just exact match)
     * so embedded phrases like "um hey nazar open camera" still work.
     * @param {string} rawText
     */
    _check(rawText) {
        if (!voiceConfig.flags.wakeWord) return;
        if (Date.now() < this._cooldownUntil) return;

        const normalized = this._normalize(rawText);
        const aliases = voiceConfig.conversation.wakeAliases;

        const matched = aliases.some(alias => normalized.includes(alias));

        if (matched) {
            this._cooldownUntil = Date.now() + this._cooldownMs;
            logger.voice.info('[WakeWord] Wake phrase detected in:', JSON.stringify(normalized));
            eventBus.emit(VoiceEvents.WAKE_DETECTED, { transcript: rawText });
        }
    }
}

// Export single instance
export const wakeWordDetector = new WakeWordDetector();
