/**
 * NAZAR Voice Engine Speech Recognition Wrapper
 * v2.0.0
 */
import { stateMachine } from './state.js';
import { voiceConfig } from '../utils/voiceConfig.js';
import { logger } from '../utils/logger.js';
import { eventBus } from './eventBus.js';
import { VoiceEvents } from '../events.js';

export class Recognition {
    constructor() {
        this.recognition = null;
        this.isListening = false;
        this.isContinuous = false;
        this.inactivityTimer = null;
        this.lastTranscriptTime = 0;

        // Priority commands list (must bypass queue and stop speaker immediately)
        this.priorityCommands = ['stop', 'cancel', 'repeat', 'help', 'emergency stop'];

        this.onTranscriptCallback = null;
        this.onErrorCallback = null;
        this.onPriorityCallback = null;
        // Interim callback for WakeWordDetector — called on every partial result
        this.onInterimCallback = null;
    }

    /**
     * Initialize Speech Recognition instance
     * @param {Object} handlers
     */
    init({ onTranscript, onError, onPriority }) {
        this.onTranscriptCallback = onTranscript;
        this.onErrorCallback = onError;
        this.onPriorityCallback = onPriority;

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            console.warn('[Recognition] SpeechRecognition API not supported by this browser.');
            return false;
        }

        try {
            this.recognition = new SpeechRecognition();
            this.recognition.continuous = true;
            this.recognition.interimResults = true;
            this.recognition.lang = 'en-US';

            this.recognition.onstart = () => {
                this.isListening = true;
                this.lastTranscriptTime = Date.now();
                this.resetInactivityTimer();
                stateMachine.setEngineState('Listening');
            };

            this.recognition.onresult = (event) => {
                this.handleResult(event);
            };

            this.recognition.onerror = (e) => {
                // Ignore empty/no-speech errors without throwing critical alarms
                if (e.error === 'no-speech') return;
                logger.voice.warn('[Recognition] SpeechRecognition error:', e.error);
                eventBus.emit(VoiceEvents.SPEECH_ERROR, { error: e.error });
                if (this.onErrorCallback) this.onErrorCallback(e.error);
            };

            this.recognition.onend = () => {
                this.isListening = false;
                this.clearInactivityTimer();
                
                // Auto-restart if in Continuous/Awake mode and unexpectedly stopped
                if (this.isContinuous && stateMachine.wakeState === 'Awake') {
                    logger.voice.info('[Recognition] Unexpected disconnect. Restarting continuous recognition...');
                    this.start();
                } else {
                    stateMachine.setEngineState('Idle');
                    eventBus.emit(VoiceEvents.SPEECH_ENDED);
                }
            };

            return true;
        } catch (err) {
            console.error('[Recognition] Failed to initialize SpeechRecognition:', err);
            return false;
        }
    }

    setLanguage(langCode) {
        if (this.recognition) {
            this.recognition.lang = langCode;
            // Restart if currently listening to apply new language
            if (this.isListening) {
                this.stop();
                setTimeout(() => this.start(), 200);
            }
        }
    }

    start() {
        if (!this.recognition || this.isListening) return;
        try {
            this.recognition.start();
        } catch (e) {
            console.warn('[Recognition] Failed to start recognition:', e);
        }
    }

    stop() {
        if (this.recognition && this.isListening) {
            this.recognition.stop();
        }
    }

    startContinuous() {
        this.isContinuous = true;
        this.start();
    }

    startPushToTalk() {
        this.isContinuous = false;
        this.start();
    }

    /**
     * Handles text transcripts from the browser API
     * @param {SpeechRecognitionEvent} event 
     */
    handleResult(event) {
        this.lastTranscriptTime = Date.now();
        this.resetInactivityTimer();

        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
            const transcriptSegment = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
                finalTranscript += transcriptSegment;
            } else {
                interimTranscript += transcriptSegment;
            }
        }

        // Forward INTERIM transcripts to WakeWordDetector (for <100ms detection)
        if (interimTranscript && this.onInterimCallback) {
            this.onInterimCallback(interimTranscript.trim());
        }

        const activeText = (finalTranscript || interimTranscript).trim().toLowerCase();
        
        // Simple VAD filtering: Ignore extremely short accidental bursts/noises
        if (activeText.length < 2) return;

        // Check for priority interrupt words (even in interim results to react instantly!)
        const foundPriority = this.priorityCommands.find(cmd => activeText.includes(cmd));
        if (foundPriority && this.onPriorityCallback) {
            this.onPriorityCallback(foundPriority);
            return;
        }

        // Forward FINAL transcripts to the core parser
        if (finalTranscript && this.onTranscriptCallback) {
            this.onTranscriptCallback(finalTranscript.trim());
            eventBus.emit(VoiceEvents.SPEECH_HEARD, { transcript: finalTranscript.trim() });
            
            // In Push-to-Talk mode, stop listening immediately after receiving a final result
            if (!this.isContinuous) {
                this.stop();
            }
        }
    }

    resetInactivityTimer() {
        this.clearInactivityTimer();
        
        // Only run inactivity timeouts in push-to-talk single mode
        if (!this.isContinuous) {
            this.inactivityTimer = setTimeout(() => {
                logger.voice.info('[Recognition] Inactivity timeout reached. Stopping microphone.');
                this.stop();
            }, voiceConfig.recognitionInactivityTimeout);
        }
    }

    clearInactivityTimer() {
        if (this.inactivityTimer) {
            clearTimeout(this.inactivityTimer);
            this.inactivityTimer = null;
        }
    }
}

// Export single instance
export const recognition = new Recognition();
