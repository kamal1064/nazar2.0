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
import { parser } from './parser.js';

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
     * Log diagnostic information for debugging recognition issues
     * @param {string} context - Context string for the log
     * @private
     */
    _logDiagnostics(context) {
        try {
            const diagnosis = {
                context,
                timestamp: Date.now(),
                recognitionState: this.recognitionState,
                isListening: this.isListening,
                isContinuous: this.isContinuous,
                sessionGeneration: this.sessionGeneration,
                stopReason: this.stopReason,
                language: this.recognition ? this.recognition.lang : 'unknown',
                continuousSupported: this.continuousSupported,
                interimResults: this.recognition ? this.recognition.interimResults : 'unknown',
                maxAlternatives: this.recognition ? this.recognition.maxAlternatives : 'unknown',
                navigatorOnLine: navigator.onLine,
                visibilityState: document.visibilityState,
                userAgent: navigator.userAgent,
                isSecureContext: window.isSecureContext,
                // Note: We cannot directly check microphone permission state without API, but we can note if we have attempted to start
                lastError: this.lastError,
                consecutiveErrors: this.consecutiveErrors
            };
            logger.voice.info(`[Recognition Diagnostics] ${JSON.stringify(diagnosis)}`);
        } catch (e) {
            logger.voice.warn('[Recognition] Failed to log diagnostics:', e);
        }
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
            this.recognition.lang = voiceConfig.recognition.language || 'en-IN';

            this.recognition.onstart = () => {
                this.recognitionState = 'Listening';
                this.isListening = true;
                this.lastTranscriptTime = Date.now();
                this.resetInactivityTimer();
                stateMachine.setEngineState('Listening');
                eventBus.emit(VoiceEvents.SPEECH_STARTED);
                logger.productionLog('Voice Started', { timestamp: Date.now() });
                
                // Reset consecutive errors if it runs successfully without errors for 10s
                if (Date.now() - this.lastErrorTime > 10000) {
                    this.consecutiveErrors = 0;
                }
            };

            this.recognition.onresult = (event) => {
                this.handleResult(event);
            };

            this.recognition.onerror = (e) => {
                // Log diagnostics when an error occurs
                this._logDiagnostics(`[Recognition] onerror fired: ${e.error}`);

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

                logger.productionLog('Recognition Failure', { error: err });
                logger.productionLog('Error', { source: 'Recognition', error: err });

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
                if (this.stopReason === 'USER' || this.stopReason === 'SESSION_END' || this.stopReason === 'PERMISSION' || this.stopReason === 'SPEAKER' || this.stopReason === 'LOW_CONFIDENCE' || this.stopReason === 'LANGUAGE_CHANGE') {
                    logger.voice.info(`[Recognition] Intentional stop (Reason: ${this.stopReason}). Not restarting.`);
                    eventBus.emit(VoiceEvents.SPEECH_ENDED);
                    return;
                }

                // If hidden, don't restart here. Let VoiceController handle document visibility restore.
                if (document.hidden || this.stopReason === 'VISIBILITY') {
                    logger.voice.info('[Recognition] Tab is hidden. Pausing auto-restart.');
                    eventBus.emit(VoiceEvents.SPEECH_ENDED);
                    return;
                }

                // Auto-restart if in Continuous/Awake mode and unexpectedly stopped
                if (this.isContinuous && stateMachine.wakeState === 'Awake') {
                    if (this.lastError === 'not-allowed' || this.lastError === 'service-not-allowed') {
                        logger.voice.warn('[Recognition] Permission or service error. Disabling continuous restart.');
                        this.lastError = null;
                        eventBus.emit(VoiceEvents.SPEECH_ENDED);
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

                    if (this.consecutiveErrors >= 3) {
                        logger.voice.error('[Recognition] 3 consecutive recognition failures reached. Stopping auto-restart loop.');
                        this.isContinuous = false;

                        import('./speaker.js').then(({ speaker }) => {
                            speaker.speak("Please tap the microphone.", { mode: 'replace' });
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
                            `Attempt: ${this.consecutiveErrors}/3\n` +
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

        // Log diagnostics before starting
        this._logDiagnostics('[Recognition] About to call start()');

        try {
            this.sessionGeneration++;
            this.stopReason = null;
            this.recognitionState = 'Starting';
            stateMachine.setEngineState('Starting');
            logger.voice.info('[Recognition] Calling recognition.start()...');
            this.recognition.start();
        } catch (e) {
            this.recognitionState = 'Idle';
            stateMachine.setEngineState('Idle');

            const errorName = e?.name || 'UnknownError';
            logger.voice.error(`[Recognition Start Failed] ${errorName}: ${e?.message}`);
            console.error('[Recognition Start Failed]', e);
            console.error(e?.stack);

            // Handle known SpeechRecognition errors gracefully
            if (errorName === 'InvalidStateError') {
                logger.voice.warn('[Recognition] InvalidStateError — recognition was already started or in an invalid state.');
            } else if (errorName === 'NotAllowedError') {
                logger.voice.warn('[Recognition] NotAllowedError — microphone permission denied by browser.');
                eventBus.emit(VoiceEvents.SPEECH_ERROR, { error: 'not-allowed' });
            } else if (errorName === 'AbortError') {
                logger.voice.warn('[Recognition] AbortError — recognition was aborted before starting.');
            } else if (errorName === 'NotSupportedError') {
                logger.voice.warn('[Recognition] NotSupportedError — SpeechRecognition not supported in this context.');
            }
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
        this.resetInactivityTimer();
        this.lastTranscriptTime = Date.now();

        let interimTranscript = '';
        let finalTranscript = '';
        let totalConf = 0;
        let confCount = 0;

        for (let i = event.resultIndex; i < event.results.length; ++i) {
            const res = event.results[i];
            if (res.isFinal) {
                finalTranscript += res[0].transcript;
                if (res[0].confidence > 0) {
                    totalConf += res[0].confidence;
                    confCount++;
                }
            } else {
                interimTranscript += res[0].transcript;
            }
        }

        const currentText = (finalTranscript || interimTranscript).trim();
        if (currentText) {
            eventBus.emit(VoiceEvents.SPEECH_INTERIM, { transcript: currentText });
        }

        // Forward INTERIM transcripts to WakeWordDetector (for <100ms detection)
        if (interimTranscript && this.onInterimCallback) {
            this.onInterimCallback(interimTranscript.trim());
        }

        const activeText = currentText.toLowerCase();
        
        // Simple VAD filtering: Ignore extremely short accidental bursts/noises
        if (activeText.length < 2) return;

        // Check for priority interrupt words (even in interim results to react instantly!)
        const foundPriority = this.priorityCommands.find(cmd => activeText.includes(cmd));
        if (foundPriority && this.onPriorityCallback) {
            this.onPriorityCallback(foundPriority);
            return;
        }

        // Barge-in reset: if user speaks (>2 chars) while NAZAR is speaking or thinking, abort Groq & cancel TTS!
        if (stateMachine.engineState === 'Speaking' || (stateMachine.engineState === 'Processing' && finalTranscript)) {
            logger.voice.info(`[Barge-in] User utterance detected during ${stateMachine.engineState}. Triggering Complete Barge-In Reset.`);
            import('./speaker.js').then(({ speaker }) => speaker.cancel());
            import('../services/gemini.js').then(({ geminiService }) => geminiService.abort());
            stateMachine.setEngineState('Listening');
        }

        // Forward FINAL transcripts to the core parser
        if (finalTranscript && this.onTranscriptCallback) {
            const cleanFinal = finalTranscript.trim();
            const isLocalCommand = !!parser.parse(cleanFinal);

            if (!isLocalCommand && confCount > 0) {
                const avgConf = totalConf / confCount;
                const minThreshold = voiceConfig.performance.confidence.minConfidence || 0.40;
                if (avgConf < minThreshold) {
                    logger.voice.warn(`[Recognition] Low confidence on non-local command (${(avgConf * 100).toFixed(1)}% < ${(minThreshold * 100).toFixed(0)}%). Requesting repeat.`);
                    this.stop('LOW_CONFIDENCE');
                    import('./speaker.js').then(({ speaker }) => {
                        speaker.speak("I didn't quite catch that. Could you repeat it?", { mode: 'replace' });
                    });
                    import('./audioCues.js').then(({ audioCues }) => {
                        audioCues.play('error');
                    });
                    return;
                }
            }

            logger.voice.info(`[Recognition]\nTranscript:\n"${cleanFinal}"`);
            logger.productionLog('Recognition Success', { length: cleanFinal.length });
            stateMachine.setEngineState('Processing');
            try {
                const res = this.onTranscriptCallback(cleanFinal);
                if (res && typeof res.catch === 'function') {
                    res.catch(err => logger.voice.error('[Recognition] Unhandled promise in transcript callback:', err));
                }
            } catch (err) {
                logger.voice.error('[Recognition] Error calling transcript callback:', err);
            }
            eventBus.emit(VoiceEvents.SPEECH_HEARD, { transcript: cleanFinal });
            
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
