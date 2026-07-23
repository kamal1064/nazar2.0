/**
 * NAZAR Client-side Gemini Intent Resolution Proxy
 * v1.0.0
 */
import { voiceConfig } from '../utils/voiceConfig.js';
import { speaker } from '../core/speaker.js';
import { stateMachine } from '../core/state.js';

export class GeminiService {
    constructor() {
        this.sessionId = this.getOrCreateSessionId();
    }

    /**
     * Obtains or generates a unique session ID persisted in sessionStorage
     * @returns {string}
     */
    getOrCreateSessionId() {
        let sid = sessionStorage.getItem('nazar_voice_session_id');
        if (!sid) {
            sid = 'session_' + Math.random().toString(36).substring(2, 15) + '_' + Date.now();
            sessionStorage.setItem('nazar_voice_session_id', sid);
        }
        return sid;
    }

    /**
     * Resolves natural language text to a structured intent using the server API
     * @param {string} text User spoken transcription
     * @returns {Promise<Object|null>} The resolved intent payload, or null if error
     */
    async resolveIntent(text) {
        stateMachine.setEngineState('Thinking');

        // Setup thinking cue timer: if Gemini takes longer than 700ms, announce "One moment..."
        let thinkingAnnounced = false;
        const thinkingTimer = setTimeout(() => {
            if (stateMachine.engineState === 'Thinking') {
                thinkingAnnounced = true;
                speaker.speak("One moment...");
            }
        }, voiceConfig.thinkingDelay);

        const controller = new AbortController();
        const timeoutTimer = setTimeout(() => controller.abort(), voiceConfig.geminiTimeout);

        try {
            const response = await fetch('/api/voice/intent', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    text,
                    sessionId: this.sessionId
                }),
                signal: controller.signal
            });

            // Clear thinking feedback timer immediately
            clearTimeout(thinkingTimer);

            if (!response.ok) {
                const errPayload = await response.json().catch(() => ({}));
                console.warn('[GeminiService] Server error resolving intent:', errPayload.message || response.statusText);
                return null;
            }

            const data = await response.json();
            return data.success ? data.intent : null;
        } catch (err) {
            clearTimeout(thinkingTimer);
            if (err.name === 'AbortError') {
                console.warn('[GeminiService] Intent resolution timed out.');
            } else {
                console.error('[GeminiService] Request failed:', err);
            }
            return null;
        } finally {
            clearTimeout(timeoutTimer);
        }
    }
}

// Export single instance
export const geminiService = new GeminiService();
