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
            onError: (err) => this.handleRecognitionError(err),
            onPriority: (cmd) => this.handlePriorityCommand(cmd)
        });

        if (!ok) {
            logger.voice.error('Speech recognition initialization failed. APIs unsupported.');
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

            if (state === 'Thinking') {
                await audioCues.play('thinking');
            } else if (state === 'Listening') {
                await audioCues.play('listening');
            }
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

        // Pause/resume recognition during speech playback (Speaker decoupling)
        eventBus.on('speech.started', () => {
            if (stateMachine.wakeState === 'Awake') {
                logger.voice.info('[VoiceController] Speech playback started. Pausing recognition.');
                recognition.stop('SPEAKER');
            }
        });

        eventBus.on('speech.finished', () => {
            if (stateMachine.wakeState === 'Awake') {
                logger.voice.info('[VoiceController] Speech playback completed. Resuming recognition.');
                recognition.startContinuous();
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
        if (this._voiceBtnEl) {
            this._clickTimeout = null;
            this._voiceBtnEl.addEventListener('click', (e) => {
                e.preventDefault();
                if (this._clickTimeout) {
                    clearTimeout(this._clickTimeout);
                    this._clickTimeout = null;
                    logger.voice.info('[VoiceController] Double click detected. Cancelling session.');
                    this.cancelSession();
                } else {
                    this._clickTimeout = setTimeout(() => {
                        this._clickTimeout = null;
                        this.handleGlobalButtonTap();
                    }, 250);
                }
            });

            // Keyboard accessibility (Space/Enter focused triggers)
            this._voiceBtnEl.addEventListener('keydown', (e) => {
                if (e.key === ' ' || e.key === 'Enter') {
                    e.preventDefault();
                    this.handleGlobalButtonTap();
                }
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
        if (this._voiceBtnEl) {
            this._voiceBtnEl.classList.toggle('camera-layout-offset', tabId === 'camera');
        }
        this._updateHudUI();
    }

    async handleGlobalButtonTap() {
        if (navigator.vibrate) navigator.vibrate(20);

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
            
            recognition.startContinuous();
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

    /**
     * Resolves natural speech to local/remote intents sequentially.
     * Tracks stage-level performance metrics.
     */
    async handleTranscript(text) {
        const isWake = stateMachine.wakeState === 'Awake';
        
        let cleanText = text;
        const aliases = voiceConfig.conversation.wakeAliases || ['hey nazar', 'nazar'];
        
        // Find if the text starts with a wake alias
        let hasWakeWord = false;
        const lowerText = cleanText.toLowerCase().trim();
        for (const alias of aliases) {
            const normalizedAlias = alias.toLowerCase().trim();
            if (lowerText.startsWith(normalizedAlias)) {
                // Strip the alias and any whitespace/newline following it
                cleanText = cleanText.substring(cleanText.toLowerCase().indexOf(normalizedAlias) + normalizedAlias.length).trim();
                hasWakeWord = true;
                break;
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

        if (!cleanText) {
            logger.voice.info('[VoiceController] Cleaned transcript is empty (wake phrase only). Waiting for command...');
            return;
        }

        logger.voice.info(`[Clean Transcript]\nClean Transcript:\n"${cleanText}"`);
        logger.voice.info(`[Conversation]\nReceived:\n"${cleanText}"`);

        if (this._overlayTranscriptEl) {
            this._overlayTranscriptEl.innerText = `"${cleanText}"`;
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
            wakeDetectionMs: 0, // Not applicable here
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

        // Stage 3: Gemini remote Function Calling (Layer 3)
        if (!intent && voiceConfig.flags.functionCalling && navigator.onLine) {
            const tStartGemini = Date.now();
            const geminiRes = await geminiService.resolveIntent(cleanText);
            intent = geminiRes.intent;
            stages.geminiRTTMs = geminiRes.duration;
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

        // 4. Dispatch resolved intent
        if (intent) {
            logger.voice.info(`[Intent]\n${intent.skill}.${intent.action}`);
            const tStartSkill = Date.now();
            
            // Record statistics
            voiceAnalytics.recordCommand(intent.source, intent.skill, true);
            
            // Feed into Task Queue (safely queued)
            taskQueue.push(intent);

            stages.skillExecutionMs = Date.now() - tStartSkill;
        } else {
            logger.voice.warn(`Command failed to resolve: "${cleanText}"`);
            voiceAnalytics.recordCommand('unknown', 'unknown', false);
            this.triggerErrorState();
            await recoveryManager.handle('VOICE_004');
        }

        stages.totalMs = Date.now() - startTime;
        
        // Log timing stats
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
        if (!this._voiceBtnEl) return;
        
        this._voiceBtnEl.className = 'global-voice-btn state-error';
        const micIcon = this._voiceBtnEl.querySelector('.voice-icon-mic');
        const errorIcon = this._voiceBtnEl.querySelector('.voice-icon-error');
        if (micIcon) micIcon.style.display = 'none';
        if (errorIcon) errorIcon.style.display = 'block';

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
    _updateVoiceButtonUI(state) {
        if (!this._voiceBtnEl) return;
        
        // Match camera panel state if active
        const isCamera = document.getElementById('camera-panel')?.classList.contains('active-panel');
        this._voiceBtnEl.classList.toggle('camera-layout-offset', isCamera);

        this._voiceBtnEl.className = 'global-voice-btn';
        const micIcon = this._voiceBtnEl.querySelector('.voice-icon-mic');
        const errorIcon = this._voiceBtnEl.querySelector('.voice-icon-error');
        if (micIcon) micIcon.style.display = 'block';
        if (errorIcon) errorIcon.style.display = 'none';

        if (state === 'Listening') {
            this._voiceBtnEl.classList.add('state-listening');
            this._voiceBtnEl.setAttribute('aria-label', 'Listening active. Click to cancel');
        } else if (state === 'Thinking') {
            this._voiceBtnEl.classList.add('state-processing');
            this._voiceBtnEl.setAttribute('aria-label', 'Assistant processing');
        } else if (state === 'Speaking') {
            this._voiceBtnEl.classList.add('state-speaking');
            this._voiceBtnEl.setAttribute('aria-label', 'Assistant speaking. Click to cancel');
        } else {
            this._voiceBtnEl.classList.add('state-idle');
            this._voiceBtnEl.setAttribute('aria-label', 'Activate voice assistant');
        }
    }

    _updateOverlayUI(state) {
        if (!this._overlayEl || !voiceConfig.flags.overlay) return;

        const announcer = document.getElementById('aria-live-announcer');

        if (state === 'Listening' || state === 'Thinking' || state === 'Speaking') {
            this._overlayEl.style.display = 'flex';
            this._overlayEl.setAttribute('aria-hidden', 'false');

            if (this._overlayStatusEl) {
                this._overlayStatusEl.innerText = state === 'Listening' ? 'Listening...' 
                                               : state === 'Thinking' ? 'Processing...' 
                                               : 'Speaking...';
            }
            if (this._overlaySubtitleEl) {
                this._overlaySubtitleEl.innerText = state === 'Listening' ? 'Speak after the tone' : '';
            }

            if (announcer) {
                announcer.innerText = state === 'Listening' ? 'Listening' 
                                    : state === 'Thinking' ? 'Processing' 
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
                                       (state === 'Thinking' && key === 'processing') ||
                                       (state === 'Speaking' && key === 'speaking')) ? 'block' : 'none';
                }
            });

            // Start/Stop Audio Analyser
            if (state === 'Listening') {
                import('../utils/audioVisualizer.js').then(({ audioVisualizer }) => {
                    audioVisualizer.start(this._visualizerBars);
                });
            } else {
                import('../utils/audioVisualizer.js').then(({ audioVisualizer }) => {
                    audioVisualizer.stop();
                });
            }
            
            if (state === 'Listening' || state === 'Thinking') {
                if (this._overlayTranscriptEl) this._overlayTranscriptEl.innerText = '...';
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
