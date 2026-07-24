/**
 * NAZAR Client-side Gemini Intent Resolution Proxy
 * v2.0.0
 */
import { voiceConfig } from '../utils/voiceConfig.js';
import { speaker } from '../core/speaker.js';
import { stateMachine } from '../core/state.js';
import { logger } from '../utils/logger.js';
import { conversationContext } from '../core/context.js';
import { sessionManager } from '../core/sessionManager.js';

export class GeminiService {
    constructor() {
        this.sessionId = null;
    }

    /**
     * Sanitizes raw transcription text to prevent injection characters
     * and enforce character length boundaries.
     * @param {string} text
     * @returns {string}
     */
    sanitizeTranscript(text) {
        const sec = voiceConfig.security;
        return text
            .trim()
            .substring(0, sec.maxTranscriptLength || 500)
            .replace(sec.stripPattern || /[<>{}]/g, '')
            .replace(/\s+/g, ' ');
    }

    /**
     * Resolves natural language text to a structured intent using the server API.
     * Tracks timing metrics for performance budget verification.
     * @param {string} text User spoken transcription
     * @returns {Promise{Object|null}} Resolved intent or null if error. Also returns RTT timing.
     */
    async resolveIntent(text) {
        if (!voiceConfig.flags.functionCalling) return null;

        stateMachine.setEngineState('Thinking');

        const sanitized = this.sanitizeTranscript(text);
        const startTime = Date.now();

        // Setup thinking cue timer: if Gemini takes longer than configured delay, speak cue
        let thinkingTimer = setTimeout(() => {
            if (stateMachine.engineState === 'Thinking') {
                speaker.speak("One moment...", { mode: 'replace' });
            }
        }, voiceConfig.speech.thinkingDelay || 700);

        const controller = new AbortController();
        const timeoutTimer = setTimeout(() => controller.abort(), voiceConfig.gemini.timeout || 10000);

        try {
            const contextData = conversationContext.toGeminiContext();
            
            logger.gemini.info(`Sending intent resolution request for: "${sanitized}"`);

            const response = await fetch('/api/voice/intent', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    text: sanitized,
                    sessionId: sessionManager.sessionId,
                    context: contextData
                }),
                signal: controller.signal
            });

            // Clear thinking feedback timer immediately
            clearTimeout(thinkingTimer);

            const duration = Date.now() - startTime;
            logger.gemini.info(`Resolution finished in ${duration}ms`);

            if (!response.ok) {
                const errPayload = await response.json().catch(() => ({}));
                logger.gemini.warn('Server error resolving intent:', errPayload.message || response.statusText);
                return { intent: null, duration };
            }

            const data = await response.json();
            return {
                intent: data.success ? data.intent : null,
                duration
            };
        } catch (err) {
            clearTimeout(thinkingTimer);
            const duration = Date.now() - startTime;

            if (err.name === 'AbortError') {
                logger.gemini.warn(`Request timed out after ${voiceConfig.gemini.timeout}ms.`);
            } else {
                logger.gemini.error('Request failed:', err);
            }
            return { intent: null, duration };
        } finally {
            clearTimeout(timeoutTimer);
        }
    }
}

// Export single instance
export const geminiService = new GeminiService();
