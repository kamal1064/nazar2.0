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
        this.activeController = null;
        this.activeThinkingTimer = null;
    }

    abort() {
        if (this.activeController) {
            this.activeController.abort();
            this.activeController = null;
        }
        if (this.activeThinkingTimer) {
            clearTimeout(this.activeThinkingTimer);
            this.activeThinkingTimer = null;
        }
        const overlayEl = document.getElementById('voice-overlay-status');
        if (overlayEl && overlayEl.innerText === 'Still thinking...') overlayEl.innerText = '';
        const hudEl = document.getElementById('hud-status');
        if (hudEl && hudEl.innerText === 'Still thinking...') hudEl.innerText = 'Idle';
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

        const sanitized = this.sanitizeTranscript(text);
        if (!sanitized) return null;

        const startTime = Date.now();
        
        this.abort(); // Clear any existing active request/timer

        // Setup thinking cue timer: if Groq takes longer than 5 seconds, display "Still thinking..." without freezing UI
        let thinkingTimer = setTimeout(() => {
            if (stateMachine.engineState === 'Processing') {
                const overlayEl = document.getElementById('voice-overlay-status');
                if (overlayEl) overlayEl.innerText = 'Still thinking...';
                const hudEl = document.getElementById('hud-status');
                if (hudEl) hudEl.innerText = 'Still thinking...';
            }
        }, 5000);
        this.activeThinkingTimer = thinkingTimer;

        const controller = new AbortController();
        this.activeController = controller;
        const timeoutTimer = setTimeout(() => controller.abort(), voiceConfig.gemini.timeout || 10000);

        try {
            const contextData = conversationContext.toGeminiContext();
            
            logger.gemini.info(`Sending intent resolution request for: "${sanitized}"`);
            logger.productionLog('Groq Request', { timestamp: Date.now() });

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
            if (this.activeThinkingTimer === thinkingTimer) this.activeThinkingTimer = null;

            const duration = Date.now() - startTime;
            logger.gemini.info(`Resolution finished in ${duration}ms`);
            logger.productionLog('Groq Response Time', { durationMs: duration, status: response.status });

            if (!response.ok) {
                const errPayload = await response.json().catch(() => ({}));
                logger.gemini.warn('Server error resolving intent:', errPayload.message || response.statusText);
                logger.productionLog('Error', { source: 'Groq', status: response.status, message: errPayload.message || response.statusText });
                return { intent: null, duration };
            }

            const data = await response.json();
            return {
                intent: data.success ? data.intent : null,
                duration
            };
        } catch (err) {
            clearTimeout(thinkingTimer);
            if (this.activeThinkingTimer === thinkingTimer) this.activeThinkingTimer = null;
            const duration = Date.now() - startTime;

            if (err.name === 'AbortError') {
                logger.gemini.warn(`Request timed out or aborted.`);
                logger.productionLog('Error', { source: 'Groq', error: 'AbortError' });
            } else {
                logger.gemini.error('Request failed:', err);
                logger.productionLog('Error', { source: 'Groq', error: err.message || String(err) });
            }
            return { intent: null, duration };
        } finally {
            clearTimeout(timeoutTimer);
            if (this.activeController === controller) this.activeController = null;
        }
    }
}

// Export single instance
export const geminiService = new GeminiService();
