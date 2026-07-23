/**
 * NAZAR Voice Engine Speech Synthesis Wrapper
 * v1.0.0
 */
import { stateMachine } from './state.js';

export class Speaker {
    constructor() {
        this.lastSpokenText = '';
        this.activeUtterance = null;
        
        // Default settings (can be overridden by voiceSettings)
        this.volume = 1.0;
        this.pitch = 1.0;
        this.rate = 1.0;
        this.preferredVoice = null;
        this.preferredLanguage = 'en-US';
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
     * Speaks a given text transcript out loud
     * @param {string} text 
     * @returns {Promise<void>} Resolves when speech completes
     */
    speak(text) {
        return new Promise((resolve, reject) => {
            if (!text) {
                resolve();
                return;
            }

            // Cancel any active speech first
            this.cancel();

            this.lastSpokenText = text;
            stateMachine.setEngineState('Speaking');

            const utterance = new SpeechSynthesisUtterance(text);
            utterance.volume = this.volume;
            utterance.pitch = this.pitch;
            utterance.rate = this.rate;
            utterance.lang = this.preferredLanguage;

            // Voice selection helper
            const voices = window.speechSynthesis.getVoices();
            if (this.preferredVoice) {
                const selectedVoice = voices.find(v => v.name === this.preferredVoice);
                if (selectedVoice) utterance.voice = selectedVoice;
            } else {
                // Default fallback options matching language
                const voicePrefix = this.preferredLanguage.startsWith('hi') ? 'Hindi' : (this.preferredLanguage.startsWith('kn') ? 'Kannada' : 'Google US English');
                const matchedVoice = voices.find(v => v.name.includes(voicePrefix) || v.lang.startsWith(this.preferredLanguage.substring(0, 2)));
                if (matchedVoice) utterance.voice = matchedVoice;
            }

            // Keep reference to prevent GC cutting speech short
            this.activeUtterance = utterance;
            window.activeUtterance = utterance;

            utterance.onend = () => {
                this.cleanupUtterance();
                stateMachine.setEngineState('Idle');
                resolve();
            };

            utterance.onerror = (e) => {
                console.warn('[Speaker] Speech error:', e);
                this.cleanupUtterance();
                stateMachine.setEngineState('Idle');
                // Don't reject to avoid unhandled promise crashes on cancellations
                resolve();
            };

            window.speechSynthesis.speak(utterance);
        });
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
     * Cancels all current and pending synthesis
     */
    cancel() {
        window.speechSynthesis.cancel();
        this.cleanupUtterance();
        if (stateMachine.engineState === 'Speaking') {
            stateMachine.setEngineState('Idle');
        }
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
