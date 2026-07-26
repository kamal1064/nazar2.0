/**
 * NAZAR Voice Engine Speech Recognition Wrapper
 * v2.0.0
 */
import { stateMachine } from './state.js';
import { voiceConfig } from '../utils/voiceConfig.js';
import { logger } from '../utils/logger.js';
import { eventBus } from './eventBus.js';
import { VoiceEvents } from '../events.js';
import { sessionManager } from './sessionManager.js';

export class Recognition {
    constructor() {
        this.recognition = null;
        this.isListening = false; // Backward compatibility check for other modules
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

        // Cooldown and retry parameters for network/disconnect errors (Production-grade)
        this.consecutiveErrors = 0;
        this.lastErrorTime = 0;
        this._restartTimeout = null;

        // State Machine and Lifecycle Ownership
        this.recognitionState = 'Idle'; // 'Idle', 'Starting', 'Listening', 'Stopping'
        this.sessionGeneration = 0;
        this.stopReason = null; // 'USER', 'SPEAKER', 'VISIBILITY', 'SESSION_END', 'ERROR', 'PERMISSION'
        this.failureTimes = [];
        this.lastError = null;
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

        if (!window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
            console.warn('[Recognition] Insecure context query. SpeechRecognition is restricted to HTTPS/Localhost.');
        }

        // Feature detection for continuous support
        let continuousSupported = true;
        try {
            const testRec = new SpeechRecognition();
            testRec.continuous = true;
            if (testRec.continuous !== true) {
                continuousSupported = false;
            }
        } catch (e) {
            continuousSupported = false;
        }

        // Fallback to User Agent detection for mobile devices known to ignore continuous stream persistence
        const isIOS = /iPad|iPhone|iPod/.test(navigator.platform) || (navigator.userAgent.includes("Mac") && "ontouchend" in document);
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        if (continuousSupported && (isIOS || isMobile)) {
            continuousSupported = false;
        }
        this.continuousSupported = continuousSupported;

        try {
            this.recognition = new SpeechRecognition();
            this.recognition.continuous = true;
            this.recognition.interimResults = true;
            this.recognition.lang = 'en-US';

            this.recognition.onstart = () => {
                this.recognitionState = 'Listening';
                this.isListening = true;
                this.lastTranscriptTime = Date.now();
                this.resetInactivityTimer();
                stateMachine.setEngineState('Listening');
                
                // Reset consecutive errors if it runs successfully without errors for 10s
                if (Date.now() - this.lastErrorTime > 10000) {
                    this.consecutiveErrors = 0;
                }
            };

            this.recognition.onresult = (event) => {
                this.handleResult(event);
            };

            this.recognition.onerror = (e) => {
                this.recognitionState = 'Idle'; // Error breaks the active session
                this.isListening = false;
                
                const err = e.error;
                this.lastError = err;
                
                if (err === 'no-speech') {
                    eventBus.emit(VoiceEvents.SPEECH_ERROR, { error: err });
                    return;
                }

                if (err === 'aborted') {
                    logger.voice.info('[Recognition] SpeechRecognition aborted internally.');
                    return;
                }

                // Increment failures for health monitoring
                this.failureTimes.push(Date.now());
                this.failureTimes = this.failureTimes.filter(t => Date.now() - t < 60000);

                if (this.failureTimes.length >= 5) {
                    logger.voice.error('[Recognition] Health Monitor: 5 failures in under 60 seconds. Stopping voice engine.');
                    this.stop('ERROR');
                    this.isContinuous = false;
                    
                    import('./speaker.js').then(({ speaker }) => {
                        speaker.speak("Voice recognition is experiencing persistent errors. Please check your internet connection.", { mode: 'replace' });
                    });
                    import('./conversationManager.js').then(({ conversationManager }) => {
                        conversationManager._endConversation('health_monitor_disabled');
                    });
                    return;
                }

                this.consecutiveErrors++;
                this.lastErrorTime = Date.now();

                logger.voice.warn('[Recognition] SpeechRecognition error:', err);
                eventBus.emit(VoiceEvents.SPEECH_ERROR, { error: err });
                if (this.onErrorCallback) this.onErrorCallback(err);
            };

            this.recognition.onend = () => {
                this.recognitionState = 'Idle';
                this.isListening = false;
                this.clearInactivityTimer();

                // If stopped intentionally due to speaker or session cancellation, don't auto-restart
                if (this.stopReason === 'USER' || this.stopReason === 'SESSION_END' || this.stopReason === 'PERMISSION' || this.stopReason === 'SPEAKER') {
                    logger.voice.info(`[Recognition] Intentional stop (Reason: ${this.stopReason}). Not restarting.`);
                    return;
                }

                // If hidden, don't restart here. Let VoiceController handle document visibility restore.
                if (document.hidden || this.stopReason === 'VISIBILITY') {
                    logger.voice.info('[Recognition] Tab is hidden. Pausing auto-restart.');
                    return;
                }

                // Auto-restart if in Continuous/Awake mode and unexpectedly stopped
                if (this.isContinuous && stateMachine.wakeState === 'Awake') {
                    if (this.lastError === 'not-allowed' || this.lastError === 'service-not-allowed') {
                        logger.voice.warn('[Recognition] Permission or service error. Disabling continuous restart.');
                        this.lastError = null;
                        return;
                    }

                    if (this.lastError === 'no-speech') {
                        logger.voice.info('[Recognition] No speech. Restarting continuous recognition in 500ms...');
                        this.lastError = null;
                        
                        if (this._restartTimeout) clearTimeout(this._restartTimeout);
                        const currentGen = this.sessionGeneration;
                        this._restartTimeout = setTimeout(() => {
                            if (currentGen !== this.sessionGeneration) return;
                            this.start();
                        }, 500);
                        return;
                    }

                    if (this.consecutiveErrors >= 5) {
                        logger.voice.error('[Recognition] Maximum retries reached. Stopping voice engine.');
                        this.isContinuous = false;

                        import('./speaker.js').then(({ speaker }) => {
                            speaker.speak("Voice recognition is unavailable. Please check your internet connection.", { mode: 'replace' });
                        });
                        import('./conversationManager.js').then(({ conversationManager }) => {
                            conversationManager._endConversation('max_retries_exceeded');
                        });
                    } else {
                        const delay = this._getRestartDelay();
                        
                        // Structured Logging
                        logger.voice.info(
                            `[Recognition]\n` +
                            `Session: ${sessionManager.sessionId || 'N/A'}\n` +
                            `Generation: ${this.sessionGeneration}\n` +
                            `State: ${this.recognitionState}\n` +
                            `Attempt: ${this.consecutiveErrors}/5\n` +
                            `Delay: ${delay}ms\n` +
                            `Reason: ${this.lastError || 'disconnect'}`
                        );

                        if (this._restartTimeout) clearTimeout(this._restartTimeout);
                        const currentGen = this.sessionGeneration;
                        this._restartTimeout = setTimeout(() => {
                            if (currentGen !== this.sessionGeneration) return;
                            this.start();
                        }, delay);
                    }
                } else {
                    stateMachine.setEngineState('Idle');
                    eventBus.emit(VoiceEvents.SPEECH_ENDED);
                }

                this.lastError = null;
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
            if (this.isListening) {
                this.stop('LANGUAGE_CHANGE');
                setTimeout(() => this.start(), 200);
            }
        }
    }

    validateStart() {
        if (!this.recognition) {
            return { valid: false, reason: 'SpeechRecognition not initialized' };
        }
        if (stateMachine.wakeState !== 'Awake' && !voiceConfig.flags.wakeWord) {
            return { valid: false, reason: 'WakeState is Sleeping and WakeWord is disabled' };
        }
        if (this.recognitionState !== 'Idle') {
            return { valid: false, reason: `RecognitionState is not Idle (${this.recognitionState})` };
        }
        if (stateMachine.engineState === 'Speaking') {
            return { valid: false, reason: 'Speaker is speaking' };
        }
        if (document.hidden) {
            return { valid: false, reason: 'Document is hidden' };
        }
        return { valid: true };
    }

    start() {
        if (this._restartTimeout) {
            clearTimeout(this._restartTimeout);
            this._restartTimeout = null;
        }

        if (this.recognitionState === 'Listening') {
            logger.voice.info('[Recognition] Already listening. Preserving active stream.');
            return;
        }

        const gate = this.validateStart();
        if (!gate.valid) {
            logger.voice.info(`[Recognition] Start validation failed. Reason: ${gate.reason}`);
            return;
        }

        try {
            this.sessionGeneration++;
            this.stopReason = null;
            this.recognitionState = 'Starting';
            stateMachine.setEngineState('Starting');
            this.recognition.start();
        } catch (e) {
            this.recognitionState = 'Idle';
            stateMachine.setEngineState('Idle');
            console.warn('[Recognition] Failed to start recognition:', e);
        }
    }

    stop(reason = 'USER') {
        this.sessionGeneration++;
        this.stopReason = reason;

        if (this._restartTimeout) {
            clearTimeout(this._restartTimeout);
            this._restartTimeout = null;
        }

        if (reason === 'USER' || reason === 'SESSION_END' || reason === 'PERMISSION') {
            this.isContinuous = false;
            this.consecutiveErrors = 0;
            this.failureTimes = [];
        }

        if (this.recognition && (this.recognitionState === 'Listening' || this.recognitionState === 'Starting')) {
            try {
                this.recognitionState = 'Stopping';
                this.recognition.stop();
            } catch (e) {
                this.recognitionState = 'Idle';
                console.warn('[Recognition] Error stopping recognition:', e);
            }
        }
    }

    startContinuous() {
        if (!this.continuousSupported) {
            logger.voice.warn('[Recognition] Continuous recognition unsupported. Falling back to Push-to-Talk.');
            this.isContinuous = false;
            if (!this._announcedContinuousUnsupported) {
                this._announcedContinuousUnsupported = true;
                import('./speaker.js').then(({ speaker }) => {
                    speaker.speak("Continuous voice isn't supported on this device. Switching to tap-to-talk.", { mode: 'replace' });
                });
            }
            this.start();
            return;
        }
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
        this.consecutiveErrors = 0;
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
            logger.voice.info(`[Recognition]\nTranscript:\n"${finalTranscript.trim()}"`);
            stateMachine.setEngineState('Processing');
            this.onTranscriptCallback(finalTranscript.trim());
            eventBus.emit(VoiceEvents.SPEECH_HEARD, { transcript: finalTranscript.trim() });
            
            // In Push-to-Talk mode, stop listening immediately after receiving a final result
            if (!this.isContinuous) {
                this.stop('USER');
            }
        }
    }

    resetInactivityTimer() {
        this.clearInactivityTimer();
        
        // Only run inactivity timeouts in push-to-talk single mode
        if (!this.isContinuous) {
            this.inactivityTimer = setTimeout(() => {
                logger.voice.info('[Recognition] Inactivity timeout reached. Stopping microphone.');
                this.stop('USER');
            }, voiceConfig.recognitionInactivityTimeout);
        }
    }

    clearInactivityTimer() {
        if (this.inactivityTimer) {
            clearTimeout(this.inactivityTimer);
            this.inactivityTimer = null;
        }
    }

    _getRestartDelay() {
        if (this.consecutiveErrors === 0) return 0;
        // Exponential backoff capped at 30 seconds (min 2 seconds)
        const baseDelay = Math.max(2000, Math.min(30000, Math.pow(2, this.consecutiveErrors - 1) * 2000));
        // Add random jitter between 80% and 120%
        const jitter = 0.8 + Math.random() * 0.4;
        return Math.round(baseDelay * jitter);
    }
}

// Export single instance
export const recognition = new Recognition();
