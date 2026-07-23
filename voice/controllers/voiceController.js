import { runSelfTest } from '../utils/selfTest.js';
import { stateMachine } from '../core/state.js';
import { speaker } from '../core/speaker.js';
import { recognition } from '../core/recognition.js';
import { permissionsBroker } from '../services/permissions.js';
import { parser } from '../core/parser.js';
import { router } from '../core/router.js';
import { planner } from '../core/planner.js';
import { taskQueue } from '../core/queue.js';
import { geminiService } from '../services/gemini.js';
import { NavigationSkill } from '../skills/NavigationSkill.js';
import { SettingsSkill } from '../skills/SettingsSkill.js';
import { CameraSkill } from '../skills/CameraSkill.js';
import { OCRSkill } from '../skills/OCRSkill.js';
import { SceneSkill } from '../skills/SceneSkill.js';
import { SOSSkill } from '../skills/SOSSkill.js';
import { ProfileSkill } from '../skills/ProfileSkill.js';
import '../utils/replayHarness.js';

export class VoiceController {
    constructor() {
        this.initialized = false;
        this.hudOverlay = null;
        this.pendingGeminiConfirmation = null; // Stash intent for confirmation loop
    }

    /**
     * Boot and initialize the voice engine
     */
    async initialize() {
        if (this.initialized) return;

        console.log('[Voice Engine] Initializing NAZAR Voice Engine...');

        // 1. Run self-tests
        const diagnostics = await runSelfTest();

        // 2. Perform browser checks
        if (!diagnostics.speechSynthesis || !diagnostics.speechRecognition) {
            console.error('[Voice Engine] Voice Engine cannot initialize: Speech APIs missing.');
            stateMachine.setEngineState('Offline');
            return;
        }

        // 3. Set up listeners for Speech Recognition
        const ok = recognition.init({
            onTranscript: (text) => this.handleTranscript(text),
            onError: (err) => this.handleRecognitionError(err),
            onPriority: (cmd) => this.handlePriorityCommand(cmd)
        });

        if (!ok) {
            console.error('[Voice Engine] Failed to initialize Recognition.');
            return;
        }

        // 4. Register Pluggable Skills
        router.registerSkill(new NavigationSkill());
        router.registerSkill(new SettingsSkill());
        router.registerSkill(new CameraSkill());
        router.registerSkill(new OCRSkill());
        router.registerSkill(new SceneSkill());
        router.registerSkill(new SOSSkill());
        router.registerSkill(new ProfileSkill());

        // 5. Bind UI Event Listeners
        this.bindEvents();

        // 6. Initialize States
        stateMachine.setWakeState('Sleeping');
        stateMachine.setEngineState('Idle');

        this.initialized = true;
        console.log('[Voice Engine] NAZAR Voice Engine initialized successfully.');

        // Play vocal startup cue
        await speaker.speak("Voice engine operational");
    }

    bindEvents() {
        const voiceBtn = document.getElementById('header-voice-btn');
        if (voiceBtn) {
            voiceBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.toggleWakeState();
            });
        }

        // Sliders & HUD bindings
        const rateSlider = document.getElementById('slider-voice-rate');
        const volSlider = document.getElementById('slider-voice-volume');
        const hudToggle = document.getElementById('toggle-dev-hud');
        const devHud = document.getElementById('developer-hud');
        const closeHud = document.getElementById('close-hud-btn');

        if (rateSlider) {
            // Load initial value
            if (window.NazarVoiceAPI) {
                rateSlider.value = window.NazarVoiceAPI.getSettings().speechRate || 1.0;
                speaker.setPreferences({ rate: parseFloat(rateSlider.value) });
            }
            rateSlider.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                speaker.setPreferences({ rate: val });
                if (window.NazarVoiceAPI) {
                    window.NazarVoiceAPI.saveSetting('speechRate', val);
                }
            });
        }

        if (volSlider) {
            // Load initial value
            if (window.NazarVoiceAPI) {
                volSlider.value = window.NazarVoiceAPI.getSettings().speechVolume || 1.0;
                speaker.setPreferences({ volume: parseFloat(volSlider.value) });
            }
            volSlider.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                speaker.setPreferences({ volume: val });
                if (window.NazarVoiceAPI) {
                    window.NazarVoiceAPI.saveSetting('speechVolume', val);
                }
            });
        }

        const setHudVisibility = (visible) => {
            if (devHud) devHud.style.display = visible ? 'block' : 'none';
            if (hudToggle) hudToggle.checked = visible;
        };

        if (hudToggle) {
            hudToggle.addEventListener('change', (e) => {
                setHudVisibility(e.target.checked);
            });
        }

        if (closeHud) {
            closeHud.addEventListener('click', () => {
                setHudVisibility(false);
            });
        }

        // Expose HUD Logger globally so callbacks can invoke it
        window.NazarVoiceHUD = {
            updateTranscript: (text) => {
                const tEl = document.getElementById('hud-transcript');
                if (tEl) tEl.innerText = text;
            },
            logTelemetry: (intent) => {
                const iEl = document.getElementById('hud-intent');
                const cEl = document.getElementById('hud-confidence');
                const sEl = document.getElementById('hud-source');
                const lEl = document.getElementById('hud-telemetry-list');

                if (iEl) iEl.innerText = `${intent.skill}.${intent.action}`;
                if (cEl) cEl.innerText = `${(intent.confidence * 100).toFixed(0)}%`;
                if (sEl) sEl.innerText = intent.source || 'gemini';

                if (lEl) {
                    const li = document.createElement('li');
                    li.innerText = `[${intent.source || 'gemini'}] ${intent.skill}.${intent.action} (${(intent.confidence * 100).toFixed(0)}%)`;
                    lEl.appendChild(li);
                    lEl.scrollTop = lEl.scrollHeight;
                }
            }
        };
    }

    /**
     * Toggle WakeState (Awake <-> Sleeping)
     */
    async toggleWakeState() {
        if (stateMachine.wakeState === 'Sleeping') {
            // Wake Flow
            stateMachine.setWakeState('Awake');
            await speaker.speak("Hello. How can I help you?");
            
            // Request permissions if not already checked, then start recognition
            const granted = await permissionsBroker.requestMicrophonePermission();
            if (granted) {
                recognition.startContinuous();
            } else {
                await speaker.speak("Microphone permission is required to accept voice commands.");
                stateMachine.setEngineState('Offline');
            }
        } else {
            // Sleep Flow
            await speaker.speak("Voice assistant stopped.");
            recognition.stop();
            speaker.cancel();
            stateMachine.setWakeState('Sleeping');
            stateMachine.setEngineState('Idle');
        }
    }

    /**
     * Triggers a Push-to-Talk single session
     */
    async startPushToTalk() {
        if (stateMachine.wakeState === 'Sleeping') {
            stateMachine.setWakeState('Awake');
        }
        
        const granted = await permissionsBroker.requestMicrophonePermission();
        if (granted) {
            recognition.startPushToTalk();
        } else {
            await speaker.speak("Microphone permission is required.");
        }
    }

    stopListening() {
        recognition.stop();
    }

    /**
     * Callback when a final transcript is heard
     */
    async handleTranscript(text) {
        console.log(`[Voice Engine Controller] Heard: "${text}"`);
        
        if (window.NazarVoiceHUD) {
            window.NazarVoiceHUD.updateTranscript(text);
        }

        // Get active language from settings or fallback to English
        let activeLang = 'en-US';
        if (window.NazarVoiceAPI) {
            const settings = window.NazarVoiceAPI.getSettings();
            activeLang = settings.preferredLanguage || 'en-US';
        }

        // 1. Check for active Gemini confirmation loop
        if (this.pendingGeminiConfirmation) {
            const cleanText = text.trim().toLowerCase();
            if (cleanText.includes('yes') || cleanText.includes('confirm') || cleanText.includes('हाँ') || cleanText.includes('ಹೌದು')) {
                const intent = this.pendingGeminiConfirmation;
                this.pendingGeminiConfirmation = null;
                await speaker.speak("Executing command.");
                taskQueue.push(intent);
                return;
            } else if (cleanText.includes('no') || cleanText.includes('cancel') || cleanText.includes('नहीं') || cleanText.includes('ಬೇಡ')) {
                this.pendingGeminiConfirmation = null;
                await speaker.speak("Command cancelled.");
                stateMachine.setEngineState('Idle');
                return;
            }
        }

        // 2. Check for active emergency SOS confirmation loop
        const sosSkill = router.skills['emergency'];
        if (sosSkill && sosSkill.pendingConfirmation) {
            const cleanText = text.trim().toLowerCase();
            if (cleanText.includes('yes') || cleanText.includes('confirm') || cleanText.includes('हाँ') || cleanText.includes('ಹೌದು')) {
                taskQueue.push({ skill: 'emergency', action: 'confirmSOS', params: {}, confidence: 1.0, source: 'local_confirm' });
                return;
            } else if (cleanText.includes('no') || cleanText.includes('cancel') || cleanText.includes('नहीं') || cleanText.includes('ಬೇಡ')) {
                taskQueue.push({ skill: 'emergency', action: 'cancelSOS', params: {}, confidence: 1.0, source: 'local_cancel' });
                return;
            }
        }

        // 3. Generate execution plan for compound commands
        const plan = planner.plan(text, activeLang);

        if (plan.length > 0) {
            console.log('[Voice Engine Controller] Resolved local plan:', plan);
            // Push all resolved steps sequentially onto the queue
            plan.forEach(task => taskQueue.push(task));
        } else {
            console.log('[Voice Engine Controller] No local matches. Falling back to Gemini intent resolution...');
            
            // Resolve natural language via Gemini
            const resolvedIntent = await geminiService.resolveIntent(text);

            if (resolvedIntent) {
                console.log('[Voice Engine Controller] Resolved Gemini intent:', resolvedIntent);
                
                // Enforce Confidence Bands
                const conf = resolvedIntent.confidence || 0.0;
                
                if (conf >= 0.90) {
                    // Band A: Execute Immediately
                    taskQueue.push(resolvedIntent);
                } else if (conf >= 0.70) {
                    // Band B: Execute and Log in developer HUD
                    if (window.NazarVoiceHUD) {
                        window.NazarVoiceHUD.logTelemetry(resolvedIntent);
                    }
                    taskQueue.push(resolvedIntent);
                } else if (conf >= 0.50) {
                    // Band C: Vocal Confirmation Loop
                    this.pendingGeminiConfirmation = resolvedIntent;
                    const question = this.getConfirmationQuestion(resolvedIntent);
                    await speaker.speak(question);
                } else {
                    // Band D: Vocal Deny Feedback
                    await speaker.speak("I didn't understand that.");
                    stateMachine.setEngineState('Idle');
                }
            } else {
                await speaker.speak("I had trouble resolving that command. Please try again.");
                stateMachine.setEngineState('Idle');
            }
        }
    }

    /**
     * Formulates user-friendly confirmation questions based on resolved intent
     */
    getConfirmationQuestion(intent) {
        if (intent.skill === 'navigate') {
            const target = intent.params.target || 'home';
            return `Did you mean to open ${target}?`;
        }
        if (intent.skill === 'camera') {
            if (intent.action === 'startScan') return "Did you mean to start scanning surroundings?";
            if (intent.action === 'switchTextMode' || intent.action === 'switch_ocr') return "Did you mean to switch to text reading mode?";
            if (intent.action === 'switchSceneMode' || intent.action === 'switch_scene') return "Did you mean to switch to scene description mode?";
        }
        if (intent.skill === 'emergency') {
            if (intent.action === 'sendSOS') return "Did you mean to send an emergency SOS?";
        }
        // General fallback format
        return `Did you mean to run the command to ${intent.action.replace(/([A-Z])/g, ' $1').toLowerCase()}?`;
    }

    /**
     * Callback when a SpeechRecognition error is thrown
     */
    handleRecognitionError(error) {
        console.warn('[Voice Engine Controller] Recognition error callback:', error);
        
        // If microphone is blocked, alert visually and vocally
        if (error === 'not-allowed') {
            stateMachine.setEngineState('Offline');
            speaker.speak("Microphone access blocked. Please enable permissions.");
        }
    }

    /**
     * Callback for priority commands (Stop, Cancel, Repeat, Help)
     * These commands bypass the parser/queue and execute immediately.
     */
    handlePriorityCommand(command) {
        console.log(`[Voice Engine Controller] PRIORITY INTERRUPT: "${command}"`);
        
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
}

// Instantiate and expose globally so app.js can bridge gestures to it
window.NazarVoiceController = new VoiceController();

// Automatically initialize the voice engine on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    // Wait a short moment to ensure app.js has completed its layout setups
    setTimeout(() => {
        window.NazarVoiceController.initialize().catch(err => {
            console.error('[Voice Engine] Auto-initialization failed:', err);
        });
    }, 150);
});
