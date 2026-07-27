/**
 * NAZAR Voice Engine Controller
 * v2.0.0
 *
 * Bootstraps and coordinates the entire voice engine.
 * Decoupled wiring via eventBus subscriptions.
 */
import { stateMachine } from '../core/state.js';
import { speaker } from '../core/speaker.js';
import { recognition } from '../core/recognition.js';
import { permissionsBroker } from '../services/permissions.js';
import { parser } from '../core/parser.js';
import { router } from '../core/router.js';
import { taskQueue } from '../core/queue.js';
import { geminiService } from '../services/gemini.js';
import { fuzzyMatcher } from '../core/fuzzyMatcher.js';
import { sessionManager } from '../core/sessionManager.js';
import { conversationContext } from '../core/context.js';
import { conversationManager } from '../core/conversationManager.js';
import { recoveryManager } from '../core/recoveryManager.js';
import { CommandPriority } from '../core/priority.js';
import { audioCues } from '../core/audioCues.js';
import { voiceConfig } from '../utils/voiceConfig.js';
import { logger } from '../utils/logger.js';
import { eventBus } from '../core/eventBus.js';
import { VoiceEvents } from '../events.js';
import { voiceAnalytics } from '../utils/voiceAnalytics.js';
import { commandHistory } from '../utils/commandHistory.js';
import { wakeWordDetector } from '../core/wakeWord.js';

export class VoiceController {
    constructor() {
        this.initialized = false;
        
        // Intent-aware deduplication
        this._lastIntentKey = null;
        this._lastIntentTime = 0;

        // UI references
        this._overlayEl = null;
        this._overlayStatusEl = null;
        this._overlayTranscriptEl = null;
        this._voiceBtnEl = null;
        this._voiceBtnEls = [];
    }

    /**
     * Boot and initialize the voice engine
     */
    async initialize() {
        if (this.initialized) return;

        logger.voice.info('Initializing NAZAR Voice Engine v2.0.0...');

        // 1. Initialize Pluggable Skill Registry
        await router.initialize();

        // 2. Initialize Speech Recognition
        const ok = recognition.init({
            onTranscript: (text) => this.handleTranscript(text),
            onInterim: (text) => this.handleInterimTranscript(text),
            onError: (err) => this.handleRecognitionError(err),
            onPriority: (cmd) => this.handlePriorityCommand(cmd)
        });

        if (!ok) {
            logger.voice.error('Speech recognition initialization failed. APIs unsupported.');
            this._cacheUIElements();
            if (this._voiceBtnEls) {
                this._voiceBtnEls.forEach(btn => {
                    const baseClass = btn.id === 'mobile-header-voice-btn' ? 'global-voice-btn mobile-header-voice-btn' : 'global-voice-btn';
                    btn.className = `${baseClass} state-disabled`;
                    btn.setAttribute('aria-label', 'Voice assistant unsupported');
                    btn.setAttribute('disabled', 'true');
                });
            }
            await recoveryManager.handle('VOICE_002');
            return;
        }

        // 3. Attach Wake Word Detector
        wakeWordDetector.attach(recognition);
        if (voiceConfig.flags.wakeWord) {
            wakeWordDetector.enable();
        }

        // 4. Cache UI DOM elements
        this._cacheUIElements();

        // 5. Register Event Bus Listeners (Event-Driven State Matching)
        this._registerEvents();

        // 6. Set initial state
        stateMachine.setWakeState('Sleeping');
        stateMachine.setEngineState('Idle');

        // Check online status initially
        this._updateNetworkStatus(navigator.onLine);

        // Start passive background listening if wake word enabled
        if (voiceConfig.flags.wakeWord) {
            recognition.startContinuous();
        }

        // 7. Deterministic beforeunload cleanup
        window.addEventListener('beforeunload', () => {
            this.cleanup();
        });

        // Run Voice Engine Self Test
        logger.voice.info('[Voice Self Test]\n' +
            `✓ Recognition available: ${!!recognition.recognition}\n` +
            `✓ Speech synthesis available: ${!!window.speechSynthesis}\n` +
            `✓ Intent parser loaded: ${!!parser}\n` +
            `✓ Router initialized: ${!!router}\n` +
            `✓ Camera bridge available: ${!!(window.NazarVoiceAPI && window.NazarVoiceAPI.ensureCameraReady)}\n` +
            `✓ Gemini configured: ${!!(voiceConfig && voiceConfig.flags && voiceConfig.flags.functionCalling)}\n` +
            `✓ Voice Engine Ready: true`
        );

        this.initialized = true;
        logger.voice.info('NAZAR Voice Engine booted successfully.');

        // Play subtle success chime
        await audioCues.play('success');
    }

    _cacheUIElements() {
        this._overlayEl = document.getElementById('voice-overlay');
        this._overlayStatusEl = document.getElementById('voice-overlay-status');
        this._overlaySubtitleEl = document.getElementById('voice-overlay-subtitle');
        this._overlayTranscriptEl = document.getElementById('voice-overlay-transcript');
        this._voiceBtnEls = Array.from(document.querySelectorAll('.global-voice-btn'));
        this._voiceBtnEl = document.getElementById('global-voice-btn');
        this._voiceReadyToast = document.getElementById('voice-ready-toast');
        this._visualizerBars = Array.from(document.querySelectorAll('.voice-wave-bar'));
        this._overlayBackdrop = document.getElementById('voice-overlay-backdrop');
        this._overlayDismissBtn = document.getElementById('voice-overlay-dismiss');
    }

    _registerEvents() {
        // Handle Wake word detected
        eventBus.on(VoiceEvents.WAKE_DETECTED, async ({ transcript }) => {
            logger.voice.info(`Wake word triggered. Wake transcript: "${transcript}"`);
            voiceAnalytics.recordWake();
            if (navigator.vibrate) navigator.vibrate(20);
            
            // Wake session start
            sessionManager.start();
            conversationManager.newSession();
            conversationContext.startSession();

            stateMachine.setWakeState('Awake');
            await audioCues.play('wake');
            
            // If already listening, do not call start again. Simply let it continue.
            if (recognition.recognitionState !== 'Listening' && recognition.recognitionState !== 'Starting') {
                recognition.startContinuous();
            } else {
                logger.voice.info('[VoiceController] SpeechRecognition already active. Preserving active stream.');
            }
        });

        // Setup session wake word state management
        eventBus.on(VoiceEvents.SESSION_STARTED, () => {
            wakeWordDetector.disable();
            logger.voice.info('[VoiceController] Session started. Disabling wake-word detector.');
        });

        eventBus.on(VoiceEvents.SESSION_ENDED, () => {
            if (voiceConfig.flags.wakeWord) {
                wakeWordDetector.enable();
                logger.voice.info('[VoiceController] Session ended. Enabling wake-word detector.');
            }
        });

        // Handle initial prompt speaking variation from ConversationManager
        eventBus.on('conversation.speakPrompt', async () => {
            const { pickResponse } = await import('../utils/responseVariations.js');
            await speaker.speak(pickResponse('wake.greeting'), { mode: 'replace' });
        });

        // Handle fade out overlay event from ConversationManager timeout
        eventBus.on('conversation.fadeOverlay', () => {
            if (this._overlayEl) {
                this._overlayEl.style.opacity = '0';
                setTimeout(() => {
                    this._overlayEl.style.display = 'none';
                    this._overlayEl.style.opacity = '';
                }, 250);
            }
        });

        // Handle progressive speech captions matching character index boundaries
        eventBus.on('speech.boundary', ({ text }) => {
            if (stateMachine.engineState === 'Speaking' && this._overlayTranscriptEl) {
                this._overlayTranscriptEl.innerText = text;
            }
        });

        // Handle offline/online state
        window.addEventListener('online', () => this._updateNetworkStatus(true));
        window.addEventListener('offline', () => this._updateNetworkStatus(false));

        // Handle permission changes
        eventBus.on(VoiceEvents.PERMISSION_RECOVERED, async ({ resource }) => {
            logger.voice.info(`Permissions recovered for resource: ${resource}. Restarting listening.`);
            await audioCues.play('success');
            if (stateMachine.wakeState === 'Awake') {
                recognition.startContinuous();
            }
        });

        // Keep local page state synced in Context
        eventBus.on(VoiceEvents.SKILL_FINISHED, ({ id, response }) => {
            if (id === 'navigate' && response.data?.target) {
                conversationContext.setPage(response.data.target);
                logger.productionLog('Navigation Command', { target: response.data.target });
            }
            if (id === 'camera' && response.data?.mode) {
                conversationContext.setCameraMode(response.data.mode);
            }
            
            // Push conversation loops (Anything else?)
            conversationManager.onCommandCompleted();
        });

        // Mutex conflict notification
        eventBus.on(VoiceEvents.RESOURCE_CONFLICT, async ({ resource, owner }) => {
            logger.router.warn(`Resource lock conflict. ${resource} locked by ${owner}`);
            await audioCues.play('error');
        });

        // Trigger Audio Cues on state changes
        eventBus.on(VoiceEvents.ENGINE_STATE_CHANGED, async ({ state }) => {
            this._updateVoiceButtonUI(state);
            this._updateOverlayUI(state);
            this._updateHudUI();

            if (state === 'Processing' || state === 'Thinking') {
                await audioCues.play('thinking');
            } else if (state === 'Listening') {
                await audioCues.play('listening');
            }
        });

        eventBus.on(VoiceEvents.SPEECH_INTERIM, ({ transcript }) => {
            this.handleInterimTranscript(transcript);
        });

        eventBus.on(VoiceEvents.SPEECH_ENDED, async () => {
            await audioCues.play('stopped');
        });

        eventBus.on(VoiceEvents.COMMAND_STARTED, async () => {
            await audioCues.play('success');
        });

        // Clean up locks on command completion safety-net
        eventBus.on(VoiceEvents.COMMAND_COMPLETED, () => {
            if (navigator.vibrate) navigator.vibrate(20);
            this._updateHudUI();
            sessionManager.resetIdleTimer();
        });

        // Setup slider settings loading
        const rateSlider = document.getElementById('slider-voice-rate');
        const volSlider = document.getElementById('slider-voice-volume');

        if (rateSlider && window.NazarVoiceAPI) {
            rateSlider.value = window.NazarVoiceAPI.getSettings().speechRate || 1.0;
            speaker.setPreferences({ rate: parseFloat(rateSlider.value) });
            rateSlider.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                speaker.setPreferences({ rate: val });
                window.NazarVoiceAPI.saveSetting('speechRate', val);
            });
        }

        if (volSlider && window.NazarVoiceAPI) {
            volSlider.value = window.NazarVoiceAPI.getSettings().speechVolume || 1.0;
            speaker.setPreferences({ volume: parseFloat(volSlider.value) });
            volSlider.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                speaker.setPreferences({ volume: val });
                window.NazarVoiceAPI.saveSetting('speechVolume', val);
            });
        }

        // Tab visibility handlers (debounced by 300ms)
        this._visibilityTimeout = null;
        this._wasVoiceActiveBeforeHide = false;
        document.addEventListener('visibilitychange', () => {
            if (this._visibilityTimeout) {
                clearTimeout(this._visibilityTimeout);
            }
            this._visibilityTimeout = setTimeout(async () => {
                if (document.hidden) {
                    logger.voice.info('[VoiceController] Page hidden. Pausing recognition.');
                    this._wasVoiceActiveBeforeHide = (stateMachine.wakeState === 'Awake');
                    if (this._wasVoiceActiveBeforeHide) {
                        recognition.stop('VISIBILITY');
                    }
                } else {
                    if (this._wasVoiceActiveBeforeHide && stateMachine.wakeState === 'Awake') {
                        if (navigator.permissions) {
                            try {
                                const permission = await navigator.permissions.query({ name: 'microphone' });
                                if (permission.state !== 'granted') {
                                    logger.voice.warn('[VoiceController] Visibility change: Microphone permission not granted. Not resuming.');
                                    return;
                                }
                            } catch (err) {
                                // Fallback
                            }
                        }
                        logger.voice.info('[VoiceController] Page visible and active. Resuming recognition.');
                        recognition.startContinuous();
                    }
                    this._wasVoiceActiveBeforeHide = false;
                }
            }, 300);
        });

        // Keep speech recognition active during TTS playback for barge-in support (V2 Architecture)
        eventBus.on('speech.started', () => {
            if (stateMachine.wakeState === 'Awake') {
                logger.voice.info('[VoiceController] Speech playback started (recognition active for barge-in).');
            }
        });

        eventBus.on('speech.finished', () => {
            if (stateMachine.wakeState === 'Awake') {
                logger.voice.info('[VoiceController] Speech playback completed.');
            }
        });

        eventBus.on('speech.cancelled', () => {
            logger.voice.info('[VoiceController] Speech playback cancelled.');
        });

        // Bind interactive triggers on DOM elements
        this._bindUIInteractions();
    }

    _bindUIInteractions() {
        // Tapping / Double Tapping global button
        if (this._voiceBtnEls && this._voiceBtnEls.length > 0) {
            this._voiceBtnEls.forEach(btn => {
                let clickTimeout = null;
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    if (clickTimeout) {
                        clearTimeout(clickTimeout);
                        clickTimeout = null;
                        logger.voice.info('[VoiceController] Double click detected. Cancelling session.');
                        this.cancelSession();
                    } else {
                        clickTimeout = setTimeout(() => {
                            clickTimeout = null;
                            this.handleGlobalButtonTap();
                        }, 250);
                    }
                });

                // Keyboard accessibility (Space/Enter focused triggers)
                btn.addEventListener('keydown', (e) => {
                    if (e.key === ' ' || e.key === 'Enter') {
                        e.preventDefault();
                        this.handleGlobalButtonTap();
                    }
                });
            });
        }

        // Dismiss via backdrop click
        if (this._overlayBackdrop) {
            this._overlayBackdrop.addEventListener('click', () => {
                logger.voice.info('[VoiceController] Clicked backdrop. Dismissing.');
                this.cancelSession();
            });
        }

        // Dismiss via stop button click
        if (this._overlayDismissBtn) {
            this._overlayDismissBtn.addEventListener('click', () => {
                logger.voice.info('[VoiceController] Clicked stop button. Dismissing.');
                this.cancelSession();
            });
        }

        // Keyboard Escape & shortcut binds
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && stateMachine.wakeState === 'Awake') {
                logger.voice.info('[VoiceController] Pressed Escape. Dismissing.');
                this.cancelSession();
            }
            if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'v') {
                e.preventDefault();
                logger.voice.info('[VoiceController] Global Ctrl+Shift+V keyboard trigger activated.');
                this.handleGlobalButtonTap();
            }
        });

        // Android back button / navigation state pop dismissal
        window.addEventListener('popstate', () => {
            if (stateMachine.wakeState === 'Awake') {
                logger.voice.info('[VoiceController] History popstate back triggered. Dismissing.');
                this.cancelSession();
            }
        });

        // Init discoverability toast PWA once per update version
        this._initDiscoverabilityToast();
    }

    _initDiscoverabilityToast() {
        if (!this._voiceReadyToast) return;

        const savedVersion = parseInt(localStorage.getItem('voiceToastVersion') || '0', 10);
        if (savedVersion < 6) {
            this._voiceReadyToast.style.display = 'block';
            
            const fadeTimeout = setTimeout(() => {
                if (this._voiceReadyToast) this._voiceReadyToast.style.display = 'none';
            }, 3500);

            const dismissToast = () => {
                clearTimeout(fadeTimeout);
                if (this._voiceReadyToast) this._voiceReadyToast.style.display = 'none';
                document.removeEventListener('click', dismissToast);
                document.removeEventListener('keydown', dismissToast);
            };

            setTimeout(() => {
                document.addEventListener('click', dismissToast);
                document.addEventListener('keydown', dismissToast);
            }, 150);

            localStorage.setItem('voiceToastVersion', '6');
        }
    }

    onTabSwitched(tabId) {
        if (this._voiceBtnEls) {
            this._voiceBtnEls.forEach(btn => btn.classList.toggle('camera-layout-offset', tabId === 'camera'));
        }
        this._updateHudUI();
    }

    async handleGlobalButtonTap() {
        if (navigator.vibrate) navigator.vibrate(20);

        // Gesture unlock for SpeechSynthesis on mobile/Safari
        if (window.speechSynthesis) {
            try {
                window.speechSynthesis.speak(new SpeechSynthesisUtterance(''));
            } catch (e) {
                logger.voice.warn('[VoiceController] SpeechSynthesis gesture unlock failed:', e);
            }
        }

        if (!this.initialized) {
            logger.voice.error('Voice assistant not initialized / SpeechRecognition not supported.');
            await recoveryManager.handle('VOICE_002');
            return;
        }

        const isWake = stateMachine.wakeState === 'Awake';
        if (isWake) {
            this.cancelSession();
        } else {
            logger.voice.info('[VoiceController] Global button manual trigger.');
            sessionManager.start();
            conversationManager.newSession();
            conversationContext.startSession();

            stateMachine.setWakeState('Awake');
            await audioCues.play('wake');
            
            const granted = await permissionsBroker.requestMicrophonePermission();
            if (granted) {
                recognition.startContinuous();
            } else {
                await recoveryManager.handle('VOICE_001');
                this.cancelSession();
            }
        }
    }

    cancelSession() {
        logger.voice.info('[VoiceController] Cancelling voice session (Deterministic Cleanup).');
        
        // 1. Set session inactive
        stateMachine.setWakeState('Sleeping');
        
        // 2 & 5. Stop recognition (increments generation, stops recognition, clears retry timer, clears retry counts)
        recognition.stop('SESSION_END');
        
        // 3 & 4. Cancel speech synthesis
        speaker.cancel();
        
        // 6. Reset conversation state and clear silence/prompt timers
        conversationManager._cancelTimers();
        conversationManager._active = false;
        conversationManager._depth = 0;
        
        // Clear local voiceController timeouts
        if (this._visibilityTimeout) {
            clearTimeout(this._visibilityTimeout);
            this._visibilityTimeout = null;
        }
        if (this._clickTimeout) {
            clearTimeout(this._clickTimeout);
            this._clickTimeout = null;
        }
        
        // 8. Return engine to Idle
        stateMachine.setEngineState('Idle');
        
        // 7. End session Manager cleanly
        sessionManager.end('user_manual_stop');

        this._updateVoiceButtonUI('Idle');
        this._updateOverlayUI('Idle');
    }

    cleanup() {
        logger.voice.info('[VoiceController] Performing page unload cleanup.');
        stateMachine.setWakeState('Sleeping');
        recognition.stop('SESSION_END');
        speaker.cancel();
        conversationManager._cancelTimers();
        
        if (this._visibilityTimeout) {
            clearTimeout(this._visibilityTimeout);
            this._visibilityTimeout = null;
        }
        if (this._clickTimeout) {
            clearTimeout(this._clickTimeout);
            this._clickTimeout = null;
        }
        stateMachine.setEngineState('Idle');
    }

    _updateNetworkStatus(isOnline) {
        if (isOnline) {
            eventBus.emit(VoiceEvents.ENGINE_ONLINE);
            logger.voice.info('Voice assistant is online.');
        } else {
            eventBus.emit(VoiceEvents.ENGINE_OFFLINE);
            logger.voice.warn('Voice assistant is offline. Graceful degradation active.');
            recoveryManager.handle('VOICE_003');
        }
    }

    /** Set up microphone toggles based on click */
    async toggleWakeState() {
        if (!this.initialized) {
            logger.voice.error('Voice assistant not initialized / SpeechRecognition not supported.');
            await recoveryManager.handle('VOICE_002');
            return;
        }

        if (stateMachine.wakeState === 'Sleeping') {
            sessionManager.start();
            conversationManager.newSession();
            conversationContext.startSession();

            stateMachine.setWakeState('Awake');
            await audioCues.play('wake');

            const granted = await permissionsBroker.requestMicrophonePermission();
            if (granted) {
                recognition.startContinuous();
            } else {
                await recoveryManager.handle('VOICE_001');
            }
        } else {
            this.cancelSession();
        }
    }

    /** Wires Push-to-Talk action */
    async startPushToTalk() {
        if (!this.initialized) {
            logger.voice.error('Voice assistant not initialized / SpeechRecognition not supported.');
            await recoveryManager.handle('VOICE_002');
            return;
        }

        if (stateMachine.wakeState === 'Sleeping') {
            stateMachine.setWakeState('Awake');
        }
        const granted = await permissionsBroker.requestMicrophonePermission();
        if (granted) {
            recognition.startPushToTalk();
        } else {
            await recoveryManager.handle('VOICE_001');
        }
    }

    stopListening() {
        recognition.stop('USER');
    }

    handleInterimTranscript(text) {
        if (!text || stateMachine.wakeState === 'Sleeping') return;
        const clean = text.trim();
        if (!clean) return;
        if (this._overlayTranscriptEl) {
            this._overlayTranscriptEl.innerHTML = `<div style="font-size: 0.75em; opacity: 0.7; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px;">You said:</div><div style="font-size: 1.3em; font-weight: 600; color: #fff;">"${clean}"</div>`;
        }
        const hudTranscript = document.getElementById('hud-transcript');
        if (hudTranscript) hudTranscript.innerText = clean;
    }

    /**
     * Resolves natural speech to local/remote intents sequentially.
     * Tracks stage-level performance metrics.
     */
    async handleTranscript(text) {
        try {
            await this._processVoiceIntent(text);
        } catch (err) {
            logger.voice.error('[VoiceController] Uncaught exception in voice processing pipeline:', err);
            logger.productionLog('Error', { source: 'VoicePipeline', error: err.message || String(err) });
            stateMachine.setEngineState('Idle');
            await audioCues.play('error');
            await speaker.speak("Sorry, something went wrong.", { mode: 'replace' });
        }
    }

    async _processVoiceIntent(text) {
        const isWake = stateMachine.wakeState === 'Awake';
        
        let cleanText = text;
        let hasWakeWord = false;

        // Strip any leading wake word / phonetic variation (e.g., "Hey Nazar", "He Nazar", "Hi Nazar", "Okay Nazar", "Ok Nazar", "Wake up Nazar", "Nazar")
        const wakeRegex = /^(?:(?:hey|he|hi|okay|ok|wake\s+up|a|ey|o)\s+)?nazar(?:[\s,!.?-]+|$)/i;
        if (wakeRegex.test(cleanText.trim())) {
            hasWakeWord = true;
            cleanText = cleanText.trim().replace(wakeRegex, '').trim();
        } else {
            // Fallback check against wakeAliases array
            const aliases = voiceConfig.conversation.wakeAliases || ['hey nazar', 'nazar'];
            const lowerText = cleanText.toLowerCase().trim();
            for (const alias of aliases) {
                const normalizedAlias = alias.toLowerCase().trim();
                if (lowerText.startsWith(normalizedAlias)) {
                    cleanText = cleanText.substring(cleanText.toLowerCase().indexOf(normalizedAlias) + normalizedAlias.length).trim();
                    hasWakeWord = true;
                    break;
                }
            }
        }

        // If the session is sleeping and there's no wake word, ignore the transcript
        if (!isWake && !hasWakeWord) {
            logger.voice.debug('[VoiceController] Ignoring transcript in Sleeping state (no wake word).');
            return;
        }

        // If it was sleeping but had the wake word, we wake up (safety net in case event was delayed)
        if (!isWake && hasWakeWord) {
            logger.voice.info('[VoiceController] Wake word detected in final transcript. Waking up assistant.');
            sessionManager.start();
            conversationManager.newSession();
            conversationContext.startSession();
            stateMachine.setWakeState('Awake');
            await audioCues.play('wake');
        }

        // Clean leading/trailing punctuation (like commas, periods, question marks)
        cleanText = cleanText.replace(/^[.,\/#!$%\^&\*;:{}=\-_`~()?"'\s]+|[.,\/#!$%\^&\*;:{}=\-_`~()?"'\s]+$/g, '').trim();

        if (!cleanText) {
            logger.voice.info('[VoiceController] Cleaned transcript is empty (wake phrase only). Waiting for command...');
            return;
        }

        logger.voice.info(`[1] Transcript: "${cleanText}"`);
        logger.voice.info(`[Clean Transcript]\nClean Transcript:\n"${cleanText}"`);

        // Reset silence timer in ConversationManager
        conversationManager.handleInput(cleanText);

        if (this._overlayTranscriptEl) {
            this._overlayTranscriptEl.innerHTML = `<div style="font-size: 0.75em; opacity: 0.7; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px;">You said:</div><div style="font-size: 1.3em; font-weight: 600; color: #fff;">"${cleanText}"</div>`;
        }

        // Cancel session immediately if exit phrase spoken
        if (cleanText.toLowerCase().trim() === 'stop' || cleanText.toLowerCase().trim() === 'cancel') {
            this.cancelSession();
            return;
        }

        // Check if user spoke an exit phrase
        if (conversationManager.isExitPhrase(cleanText)) {
            await conversationManager.handleExit();
            return;
        }

        const stages = {
            wakeDetectionMs: 0,
            localParseMs: 0,
            fuzzyMatchMs: 0,
            geminiRTTMs: 0,
            skillExecutionMs: 0,
            speechStartMs: 0,
            totalMs: 0
        };

        const startTime = Date.now();
        let activeLang = 'en-US';

        if (window.NazarVoiceAPI) {
            activeLang = window.NazarVoiceAPI.getSettings().preferredLanguage || 'en-US';
        }

        let intent = null;

        // Stage 1: Exact / Regex Local parsing (Layers 1 & 2)
        const tStartParse = Date.now();
        intent = parser.parse(cleanText, activeLang);
        if (!intent) {
            intent = parser.parseRegex(cleanText, activeLang);
        }
        stages.localParseMs = Date.now() - tStartParse;

        // Stage 2: Fuzzy local parsing (Layer 2.5)
        if (!intent && voiceConfig.flags.fuzzyMatcher) {
            const tStartFuzzy = Date.now();
            intent = fuzzyMatcher.match(cleanText);
            stages.fuzzyMatchMs = Date.now() - tStartFuzzy;
        }

        // Check local confidence threshold (0.90)
        if (intent && intent.confidence < 0.90) {
            logger.voice.info(`[VoiceController] Local intent confidence ${intent.confidence} below threshold 0.90. Fallback to Gemini.`);
            intent = null;
        }

        logger.voice.info(`[2] Parsed: ${intent ? `${intent.skill}.${intent.action} (confidence: ${intent.confidence})` : 'No local match'}`);
        if (intent) {
            logger.voice.info(`[3] Local Command: ${intent.skill}.${intent.action}`);
        }

        // Stage 2.8: Ambiguity / Fragment Check before calling LLM
        const words = cleanText.split(/\s+/);
        const ambiguousFragments = ['in other', 'of the', 'and then', 'to be', 'on the', 'it is', 'this is', 'that is', 'for the', 'at the', 'by the', 'from the', 'with the', 'in a', 'for a', 'to a', 'other', 'another', 'something', 'anything', 'nothing', 'someone', 'anyone', 'no one', 'everywhere', 'nowhere', 'somewhere', 'anywhere', 'somehow', 'anyhow', 'anyway', 'anyways', 'however', 'whenever', 'whatever', 'whichever', 'whoever', 'whomever', 'whosever', 'um', 'uh', 'ah', 'er', 'the', 'and', 'or', 'so'];
        const isFragment = ambiguousFragments.includes(cleanText.toLowerCase()) || (words.length === 1 && cleanText.length <= 3 && !['sos', 'cam', 'top', 'run', 'fix', 'say', 'yes', 'no', 'ok', 'out', 'off', 'on'].includes(cleanText.toLowerCase()));
        
        if (!intent && isFragment) {
            logger.voice.warn(`[VoiceController] Transcript "${cleanText}" flagged as ambiguous/fragment. Bypassing LLM.`);
            logger.productionLog('Ambiguity Rejection', { transcript: cleanText });
            await speaker.speak("Sorry, I didn't understand. Can you repeat that?", { mode: 'replace' });
            this._resetExecutionState();
            return;
        }

        // Stage 3: Gemini remote Function Calling (Layer 3)
        if (!intent && voiceConfig.flags.functionCalling && navigator.onLine) {
            logger.voice.info(`[4] Sending to Groq: "${cleanText}"`);
            const tStartGemini = Date.now();
            const geminiRes = await geminiService.resolveIntent(cleanText);
            intent = geminiRes.intent;
            stages.geminiRTTMs = geminiRes.duration;
            logger.voice.info(`[5] Groq Response: ${intent ? `${intent.skill}.${intent.action}` : 'Failed to resolve'}`);
        }

        // Enforce intent-based 500ms command deduplication (Revision R3)
        if (intent) {
            const intentKey = `${intent.skill}.${intent.action}`;
            if (intentKey === this._lastIntentKey && Date.now() - this._lastIntentTime < (voiceConfig.conversation.dedupWindowMs || 500)) {
                logger.voice.warn(`Deduplicated command ignored: ${intentKey}`);
                eventBus.emit(VoiceEvents.COMMAND_DUPLICATE, { intentKey });
                return;
            }
            this._lastIntentKey = intentKey;
            this._lastIntentTime = Date.now();
        }

        // 4. Dispatch resolved intent with Execution Lock Check & Emergency Bypass
        if (intent) {
            const incomingPriority = router.skills[intent.skill]?.constructor.manifest?.priority || 0;
            if ((stateMachine.engineState === 'Processing' || stateMachine.engineState === 'Executing') && router.activeSkill && incomingPriority < CommandPriority.EMERGENCY) {
                logger.voice.info('[VoiceController] Execution lock active. Declining concurrent command.');
                await speaker.speak("I'm still completing your previous request.", { mode: 'replace' });
                return;
            }

            logger.voice.info(`[6] Executing: ${intent.skill}.${intent.action}`);
            logger.voice.info(`[Intent]\n${intent.skill}.${intent.action}`);
            const tStartSkill = Date.now();
            
            // Record statistics
            voiceAnalytics.recordCommand(intent.source, intent.skill, true);
            
            // Feed into Task Queue (safely queued)
            taskQueue.push(intent);

            stages.skillExecutionMs = Date.now() - tStartSkill;
            logger.voice.info(`[7] Finished: ${intent.skill}.${intent.action}`);
        } else {
            logger.voice.warn(`Command failed to resolve: "${cleanText}"`);
            voiceAnalytics.recordCommand('unknown', 'unknown', false);
            this.triggerErrorState();
            await recoveryManager.handle('VOICE_004');
        }

        stages.totalMs = Date.now() - startTime;
        
        commandHistory.add({
            transcript: cleanText,
            skill: intent ? intent.skill : 'unknown',
            action: intent ? intent.action : 'unknown',
            source: intent ? intent.source : 'failed',
            success: !!intent,
            stages
        });
    }




    async triggerErrorState() {
        if (!this._voiceBtnEls) return;
        
        this._voiceBtnEls.forEach(btn => {
            const baseClass = btn.id === 'mobile-header-voice-btn' ? 'global-voice-btn mobile-header-voice-btn' : 'global-voice-btn';
            btn.className = `${baseClass} state-error`;
            const micIcon = btn.querySelector('.voice-icon-mic');
            const errorIcon = btn.querySelector('.voice-icon-error');
            if (micIcon) micIcon.style.display = 'none';
            if (errorIcon) errorIcon.style.display = 'block';
        });

        const announcer = document.getElementById('aria-live-announcer');
        if (announcer) announcer.innerText = 'Voice error occurred';

        await audioCues.play('error');

        // Reset display after shake concludes
        setTimeout(() => {
            if (stateMachine.engineState === 'Idle') {
                this._updateVoiceButtonUI('Idle');
            }
        }, 1200);
    }

    handleRecognitionError(error) {
        logger.voice.warn('Recognition error callback triggered:', error);
        this.triggerErrorState();
        
        switch (error) {
            case 'not-allowed':
                stateMachine.setEngineState('Offline');
                recoveryManager.handle('VOICE_001'); // microphone permission error
                break;
            case 'audio-capture':
                speaker.speak("I couldn't access the microphone. Please check your connection and settings.", { mode: 'replace' });
                break;
            case 'service-not-allowed':
                speaker.speak("Voice service is not allowed or supported by this browser.", { mode: 'replace' });
                this.cancelSession();
                break;
            case 'network':
                // Handled internally in recognition backoff retry
                break;
            default:
                break;
        }
    }

    handlePriorityCommand(command) {
        logger.voice.info(`Priority interrupt received: "${command}"`);
        if (command === 'stop') {
            taskQueue.interruptStop();
        } else if (command === 'cancel') {
            taskQueue.interruptCancel();
        } else if (command === 'emergency stop') {
            taskQueue.interruptEmergency();
        } else if (command === 'repeat') {
            speaker.repeat();
        }
    }

    // ─── UI Overlay Sync ───────────────────────────────────────────────────────
    // ─── UI Overlay Sync ───────────────────────────────────────────────────────
    _updateVoiceButtonUI(state) {
        if (!this._voiceBtnEls) return;
        
        // Match camera panel state if active
        const isCamera = document.getElementById('camera-panel')?.classList.contains('active-panel');

        this._voiceBtnEls.forEach(btn => {
            btn.classList.toggle('camera-layout-offset', isCamera);

            const baseClass = btn.id === 'mobile-header-voice-btn' ? 'global-voice-btn mobile-header-voice-btn' : 'global-voice-btn';
            btn.className = baseClass;

            const micIcon = btn.querySelector('.voice-icon-mic');
            const errorIcon = btn.querySelector('.voice-icon-error');
            if (micIcon) micIcon.style.display = 'block';
            if (errorIcon) errorIcon.style.display = 'none';

            if (state === 'Listening') {
                btn.classList.add('state-listening');
                btn.setAttribute('aria-label', 'Listening...');
                btn.title = 'Listening...';
            } else if (state === 'Processing' || state === 'Thinking') {
                btn.classList.add('state-processing');
                btn.setAttribute('aria-label', 'Thinking...');
                btn.title = 'Thinking...';
            } else if (state === 'Speaking') {
                btn.classList.add('state-speaking');
                btn.setAttribute('aria-label', 'Speaking...');
                btn.title = 'Speaking...';
            } else {
                btn.classList.add('state-idle');
                btn.setAttribute('aria-label', 'Open Voice Assistant');
                btn.title = 'Open Voice Assistant';
            }
        });
    }

    _updateOverlayUI(state) {
        if (!this._overlayEl || !voiceConfig.flags.overlay) return;

        const announcer = document.getElementById('aria-live-announcer');

        if (state === 'Listening' || state === 'Processing' || state === 'Thinking' || state === 'Speaking') {
            this._overlayEl.style.display = 'flex';
            this._overlayEl.setAttribute('aria-hidden', 'false');

            if (this._overlayStatusEl) {
                this._overlayStatusEl.innerText = state === 'Listening' ? 'Listening...' 
                                               : (state === 'Processing' || state === 'Thinking') ? 'Thinking...' 
                                               : 'Speaking...';
            }
            if (this._overlaySubtitleEl) {
                this._overlaySubtitleEl.innerText = state === 'Listening' ? 'Speak after the tone' 
                                                  : (state === 'Processing' || state === 'Thinking') ? 'Processing command...'
                                                  : 'Playing response...';
            }

            if (announcer) {
                announcer.innerText = state === 'Listening' ? 'Listening' 
                                    : (state === 'Processing' || state === 'Thinking') ? 'Thinking' 
                                    : 'Speaking';
            }

            // Sync large overlay icons
            const icons = {
                listening: document.getElementById('overlay-icon-listening'),
                processing: document.getElementById('overlay-icon-processing'),
                speaking: document.getElementById('overlay-icon-speaking'),
                error: document.getElementById('overlay-icon-error')
            };

            Object.entries(icons).forEach(([key, el]) => {
                if (el) {
                    el.style.display = ((state === 'Listening' && key === 'listening') ||
                                       ((state === 'Processing' || state === 'Thinking') && key === 'processing') ||
                                       (state === 'Speaking' && key === 'speaking')) ? 'block' : 'none';
                }
            });

            // Start/Stop Audio Analyser (animate waveform in both Listening and Speaking)
            if (state === 'Listening' || state === 'Speaking') {
                import('../utils/audioVisualizer.js').then(({ audioVisualizer }) => {
                    audioVisualizer.start(this._visualizerBars);
                });
            } else {
                import('../utils/audioVisualizer.js').then(({ audioVisualizer }) => {
                    audioVisualizer.stop();
                });
            }
        } else {
            this._overlayEl.style.display = 'none';
            this._overlayEl.setAttribute('aria-hidden', 'true');
            if (this._overlayTranscriptEl) this._overlayTranscriptEl.innerText = '';
            
            import('../utils/audioVisualizer.js').then(({ audioVisualizer }) => {
                audioVisualizer.stop();
            });

            if (announcer) announcer.innerText = 'Voice assistant stopped';
        }
    }

    _updateHudUI() {
        if (!voiceConfig.flags.devHud) return;

        const session = sessionManager.snapshot();
        const report = voiceAnalytics.getReport();

        const sEl = document.getElementById('hud-session-id');
        const wEl = document.getElementById('hud-wake-state');
        const aEl = document.getElementById('hud-active-skill');
        const lEl = document.getElementById('hud-avg-latency');
        const kEl = document.getElementById('hud-api-key');
        const qEl = document.getElementById('hud-quota-used');
        const wcEl = document.getElementById('hud-wake-count');
        const nEl = document.getElementById('hud-network');
        const hEl = document.getElementById('hud-skill-health');

        if (sEl) sEl.innerText = session.sessionId || '-';
        if (wEl) wEl.innerText = stateMachine.wakeState || 'Sleeping';
        if (aEl) aEl.innerText = router.activeSkill ? router.activeSkill.name() : '-';
        if (lEl) lEl.innerText = report.avgTotalMs ? report.avgTotalMs.toFixed(0) : '-';
        if (wcEl) wcEl.innerText = report.wakeWordDetections;
        if (nEl) nEl.innerText = navigator.onLine ? 'Online' : 'Offline';

        // Read active skills state
        if (hEl) {
            const list = Object.values(router.skills).map(s => `${s.name()}:${s.healthCheck()}`);
            hEl.innerText = list.join(', ');
        }

        // Read API quota status from express endpoint asynchronously
        if (document.getElementById('developer-hud').style.display === 'block') {
            fetch('/api/health')
                .then(r => r.json())
                .then(data => {
                    if (data.success) {
                        if (kEl) kEl.innerText = `#${data.activeApiKeyIndex || 1}`;
                        if (qEl) qEl.innerText = data.remainingToday !== undefined ? (495 - data.remainingToday) : '-';
                    }
                })
                .catch(() => {});
        }
    }
}

// Instantiate and expose globally
window.NazarVoiceController = new VoiceController();

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        window.NazarVoiceController.initialize().catch(err => {
            console.error('[Voice Controller] Auto-initialization failed:', err);
        });
    }, 150);
});
