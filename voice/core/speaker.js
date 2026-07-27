/**
 * NAZAR Voice Engine Speech Synthesis Wrapper
 * v2.0.0
 */
import { stateMachine } from './state.js';
import { logger } from '../utils/logger.js';
import { voiceConfig } from '../utils/voiceConfig.js';
import { eventBus } from './eventBus.js';

export class Speaker {
    constructor() {
        this.lastSpokenText = '';
        this.activeUtterance = null;
        this._pendingQueue = []; // Queued utterances awaiting current speech end
        
        // Default settings (can be overridden by voiceSettings)
        this.volume = 1.0;
        this.pitch = 1.0;
        this.rate = 1.0;
        this.preferredVoice = null;
        this.preferredLanguage = 'en-IN';
    }

    /**
     * Set synthesis preferences
     */
    setPreferences({ volume, pitch, rate, preferredVoice, language }) {
        if (volume !== undefined) this.volume = volume;
        if (pitch !== undefined) this.pitch = pitch;
        if (rate !== undefined) this.rate = rate;
        if (preferredVoice !== undefined) this.preferredVoice = preferredVoice;
        if (language !== undefined) {
            this.preferredLanguage = language;
        }
    }

    /**
     * Breaks text into sentence chunks (delimited by . ! ? newline or 100 chars)
     * for ~500ms initial latency streaming.
     */
    chunkTextIntoSentences(text) {
        if (!text) return [];
        const rawChunks = text.split(/(?<=[.!?])\s+|\n+/);
        const result = [];
        for (let chunk of rawChunks) {
            chunk = chunk.trim();
            if (!chunk) continue;
            while (chunk.length > 100) {
                let splitIdx = chunk.lastIndexOf(' ', 100);
                if (splitIdx === -1) splitIdx = 100;
                result.push(chunk.substring(0, splitIdx).trim());
                chunk = chunk.substring(splitIdx).trim();
            }
            if (chunk) result.push(chunk);
        }
        return result.length > 0 ? result : [text.trim()];
    }

    /**
     * Speaks a given text transcript out loud with sentence-level chunking and FIFO queuing.
     * @param {string} text
     * @param {{ mode?: 'queue'|'replace'|'interrupt' }} [options]
     *   - 'queue'     (default): Append — current speech completes first.
     *   - 'replace'  : Clear pending queue; wait for current utterance to end then speak.
     *   - 'interrupt': Cancel everything immediately and speak now. Use for SOS/Stop only.
     * @returns {Promise<void>} Resolves when speech completes
     */
    speak(text, options = {}) {
        const mode = options.mode ?? voiceConfig.speech.defaultMode ?? 'queue';

        return new Promise((resolve) => {
            if (!text) { resolve(); return; }

            const chunks = this.chunkTextIntoSentences(text);
            if (chunks.length === 0) { resolve(); return; }

            const queueItems = chunks.map((chunk, index) => ({
                text: chunk,
                resolve: index === chunks.length - 1 ? resolve : () => {}
            }));

            if (mode === 'interrupt') {
                // Cancel everything immediately — used only for SOS/Stop/emergency
                this.cancel();
                this._pendingQueue = [];
                const first = queueItems.shift();
                this._pendingQueue.push(...queueItems);
                this._doSpeak(first.text, first.resolve);
            } else if (mode === 'replace') {
                // Clear pending queue but let current utterance finish naturally
                this._pendingQueue = [];
                if (this.isSpeaking()) {
                    this._pendingQueue.push(...queueItems);
                } else {
                    const first = queueItems.shift();
                    this._pendingQueue.push(...queueItems);
                    this._doSpeak(first.text, first.resolve);
                }
            } else {
                // 'queue' mode: append after all pending speech
                if (this.isSpeaking() || this._pendingQueue.length > 0) {
                    this._pendingQueue.push(...queueItems);
                } else {
                    const first = queueItems.shift();
                    this._pendingQueue.push(...queueItems);
                    this._doSpeak(first.text, first.resolve);
                }
            }
        });
    }

    /**
     * Internal: create and start an utterance. When done, process pending queue.
     * @param {string} text
     * @param {Function} resolve
     */
    _doSpeak(text, resolve) {
        logger.voice.info("[TTS]\nSpeaking:\n" + JSON.stringify(text));
        this.lastSpokenText = text;
        stateMachine.setEngineState('Speaking');
        eventBus.emit('speech.started');

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.volume = this.volume;
        utterance.pitch = this.pitch;
        utterance.rate = this.rate;
        utterance.lang = this.preferredLanguage;

        // Voice selection
        const voices = window.speechSynthesis.getVoices();
        if (this.preferredVoice) {
            const selected = voices.find(v => v.name === this.preferredVoice);
            if (selected) utterance.voice = selected;
        } else {
            const prefix = this.preferredLanguage.startsWith('hi') ? 'Hindi'
                         : this.preferredLanguage.startsWith('kn') ? 'Kannada'
                         : 'Google US English';
            const matched = voices.find(v => v.name.includes(prefix) || v.lang.startsWith(this.preferredLanguage.substring(0, 2)));
            if (matched) utterance.voice = matched;
        }

        this.activeUtterance = utterance;
        window.activeUtterance = utterance;

        let boundaryFired = false;
        utterance.onboundary = (e) => {
            if (e.name === 'word') {
                boundaryFired = true;
                const remainingText = text.substring(e.charIndex);
                const nextSpaceIndex = remainingText.indexOf(' ');
                const endIndex = nextSpaceIndex === -1 ? text.length : e.charIndex + nextSpaceIndex;
                const progressiveText = text.substring(0, endIndex);
                eventBus.emit('speech.boundary', { text: progressiveText });
            }
        };

        utterance.onstart = () => {
            // Check after 300ms if boundary event fired. If not, emit full text as fallback.
            setTimeout(() => {
                if (!boundaryFired) {
                    eventBus.emit('speech.boundary', { text });
                }
            }, 300);
        };

        utterance.onend = () => {
            this.cleanupUtterance();
            // Process next item in queue
            if (this._pendingQueue.length > 0) {
                const next = this._pendingQueue.shift();
                this._doSpeak(next.text, next.resolve);
            } else {
                stateMachine.setEngineState('Idle');
                eventBus.emit('speech.finished');
            }
            resolve();
        };

        utterance.onerror = (e) => {
            logger.voice.warn('[Speaker] Speech error:', e?.error);
            this.cleanupUtterance();
            if (this._pendingQueue.length > 0) {
                const next = this._pendingQueue.shift();
                this._doSpeak(next.text, next.resolve);
            } else {
                stateMachine.setEngineState('Idle');
                eventBus.emit('speech.finished');
            }
            resolve(); // Don't reject — prevents unhandled promise crashes on cancel
        };

        window.speechSynthesis.speak(utterance);
    }

    cleanupUtterance() {
        this.activeUtterance = null;
        if (window.activeUtterance) {
            window.activeUtterance = null;
        }
    }

    /**
     * Pauses synthesis speaking
     */
    pause() {
        if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
            window.speechSynthesis.pause();
            stateMachine.setEngineState('Idle');
        }
    }

    /**
     * Resumes synthesis speaking
     */
    resume() {
        if (window.speechSynthesis.paused) {
            stateMachine.setEngineState('Speaking');
            window.speechSynthesis.resume();
        }
    }

    /**
     * Cancels ALL current and pending synthesis immediately.
     * Only use for high-priority interrupts (SOS, Stop).
     * For normal interrupts, prefer mode: 'replace'.
     */
    cancel() {
        window.speechSynthesis.cancel();
        this._pendingQueue = [];
        this.cleanupUtterance();
        if (stateMachine.engineState === 'Speaking') {
            stateMachine.setEngineState('Idle');
        }
        eventBus.emit('speech.cancelled');
    }

    /**
     * Repeats the last spoken phrase
     */
    repeat() {
        if (this.lastSpokenText) {
            this.speak(this.lastSpokenText);
        }
    }

    isSpeaking() {
        return window.speechSynthesis.speaking;
    }
}

// Export single instance
export const speaker = new Speaker();
