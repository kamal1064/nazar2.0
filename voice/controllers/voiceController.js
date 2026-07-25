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
            
            // Wake triggers start continuous listening silently (prompt delay handled in ConversationManager)
            recognition.startContinuous();
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

        // Bind interactive triggers on DOM elements
        this._bindUIInteractions();
    }

    _bindUIInteractions() {
        // Tapping / Double Tapping global button
        if (this._voiceBtnEl) {
            let clickTimeout = null;
            this._voiceBtnEl.addEventListener('click', (e) => {
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
        logger.voice.info('[VoiceController] Cancelling voice session.');
        sessionManager.end('user_manual_stop');
        recognition.stop();
        speaker.cancel();
        
        stateMachine.setWakeState('Sleeping');
        stateMachine.setEngineState('Idle');

        this._updateVoiceButtonUI('Idle');
        this._updateOverlayUI('Idle');
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
            sessionManager.end('user_manual_stop');
            recognition.stop();
            speaker.cancel();
            stateMachine.setWakeState('Sleeping');
            stateMachine.setEngineState('Idle');
        }
    }

    /** Wires Push-to-Talk action */
    async startPushToTalk() {
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
        recognition.stop();
    }

    /**
     * Resolves natural speech to local/remote intents sequentially.
     * Tracks stage-level performance metrics.
     */
    async handleTranscript(text) {
        logger.voice.info(`Command heard: "${text}"`);
        
        if (this._overlayTranscriptEl) {
            this._overlayTranscriptEl.innerText = `"${text}"`;
        }

        // Cancel session immediately if exit phrase spoken
        if (text.toLowerCase().trim() === 'stop' || text.toLowerCase().trim() === 'cancel') {
            this.cancelSession();
            return;
        }

        // Check if user spoke an exit phrase
        if (conversationManager.isExitPhrase(text)) {
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
        intent = parser.parse(text, activeLang);
        if (!intent) {
            intent = parser.parseRegex(text, activeLang);
        }
        stages.localParseMs = Date.now() - tStartParse;

        // Stage 2: Fuzzy local parsing (Layer 2.5)
        if (!intent && voiceConfig.flags.fuzzyMatcher) {
            const tStartFuzzy = Date.now();
            intent = fuzzyMatcher.match(text);
            stages.fuzzyMatchMs = Date.now() - tStartFuzzy;
        }

        // Stage 3: Gemini remote Function Calling (Layer 3)
        if (!intent && voiceConfig.flags.functionCalling && navigator.onLine) {
            const tStartGemini = Date.now();
            const geminiRes = await geminiService.resolveIntent(text);
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
            const tStartSkill = Date.now();
            
            // Record statistics
            voiceAnalytics.recordCommand(intent.source, intent.skill, true);
            
            // Feed into Task Queue (safely queued)
            taskQueue.push(intent);

            stages.skillExecutionMs = Date.now() - tStartSkill;
        } else {
            logger.voice.warn(`Command failed to resolve: "${text}"`);
            voiceAnalytics.recordCommand('unknown', 'unknown', false);
            this.triggerErrorState();
            await recoveryManager.handle('VOICE_004');
        }

        stages.totalMs = Date.now() - startTime;
        
        // Log timing stats
        commandHistory.add({
            transcript: text,
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
        if (error === 'not-allowed') {
            stateMachine.setEngineState('Offline');
            recoveryManager.handle('VOICE_001');
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
