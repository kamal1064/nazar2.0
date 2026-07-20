// Global Client-Side Promise Rejection Guard
window.addEventListener('unhandledrejection', (event) => {
    console.warn('[NAZAR Client Guard] Unhandled promise rejection captured:', event.reason?.message || 'Asynchronous request failed');
    event.preventDefault();
});

document.addEventListener('DOMContentLoaded', () => {
    // Programmatic PWA cache invalidation and reloading on version mismatch
    const CURRENT_VERSION = 'v33';
    if (localStorage.getItem('nazar-app-version') !== CURRENT_VERSION) {
        localStorage.setItem('nazar-app-version', CURRENT_VERSION);
        if ('caches' in window) {
            caches.keys().then(keys => {
                Promise.all(keys.map(key => caches.delete(key))).then(() => {
                    window.location.reload();
                });
            });
            return;
        }
    }
    
    // --- DIAGNOSTICS & TELEMETRY CONSTANTS ---
    const Telemetry = {
        devMode: window.location.hostname === 'localhost' || 
                 window.location.hostname === '127.0.0.1' || 
                 new URLSearchParams(window.location.search).get('debug') === 'true',
        
        metrics: {
            modelLoadTime: 0,
            cameraStartupTime: 0,
            detectionLatency: 0,
            speechLatency: 0,
            fps: 0,
            engineMode: 'Initializing...',
            tensors: 0,
            bytes: 0
        },

        lastFpsUpdate: 0,
        fpsFrameCount: 0,

        init() {
            if (this.devMode) {
                const overlay = document.getElementById('diagnostics-overlay');
                if (overlay) overlay.style.display = 'block';
                this.updateUI();
            }
        },

        updateMetric(key, value) {
            this.metrics[key] = value;
            if (this.devMode) this.updateUI();
        },

        updateUI() {
            const dom = {
                model: document.getElementById('diag-model'),
                worker: document.getElementById('diag-worker'),
                cam: document.getElementById('diag-cam'),
                detect: document.getElementById('diag-detect'),
                speech: document.getElementById('diag-speech'),
                tensors: document.getElementById('diag-tensors'),
                memory: document.getElementById('diag-memory'),
                fps: document.getElementById('diag-fps')
            };

            if (dom.model) dom.model.innerText = this.metrics.modelLoadTime ? `${this.metrics.modelLoadTime}ms` : 'Ready';
            if (dom.worker) dom.worker.innerText = this.metrics.engineMode;
            if (dom.cam) dom.cam.innerText = `${this.metrics.cameraStartupTime}ms`;
            if (dom.detect) dom.detect.innerText = `${this.metrics.detectionLatency}ms`;
            if (dom.speech) dom.speech.innerText = `${this.metrics.speechLatency}ms`;
            if (dom.tensors) dom.tensors.innerText = this.metrics.tensors;
            if (dom.memory) dom.memory.innerText = this.metrics.bytes ? `${(this.metrics.bytes / 1024 / 1024).toFixed(2)} MB` : '0 KB';
            if (dom.fps) dom.fps.innerText = this.metrics.fps;
        },

        recordFps() {
            this.fpsFrameCount++;
            const now = performance.now();
            if (now - this.lastFpsUpdate >= 1000) {
                const elapsedSeconds = (now - this.lastFpsUpdate) / 1000;
                const calculatedFps = Math.round(this.fpsFrameCount / elapsedSeconds);
                this.updateMetric('fps', calculatedFps);
                this.fpsFrameCount = 0;
                this.lastFpsUpdate = now;
            }
        }
    };

    // --- 1. SETTINGS SERVICE ---
    const SettingsService = {
        state: {
            voiceCommandsEnabled: false,
            speechOutputEnabled: true,
            vibrationAlertsEnabled: true,
            darkModeEnabled: false,
            emergencyContactName: 'Emergency Contact',
            emergencyContactNumber: '',
            emergencyWebhookUrl: '',
            homeAddress: '',
            preferredLocationProvider: 'osm',
            liveLocationSharingEnabled: false,
            liveLocationSharingInterval: 300 // in seconds
        },

        load() {
            this.state.voiceCommandsEnabled = localStorage.getItem('nazar-voice-commands') === 'true';
            this.state.speechOutputEnabled = localStorage.getItem('nazar-speech-output') !== 'false';
            this.state.vibrationAlertsEnabled = localStorage.getItem('nazar-vibration-alerts') !== 'false';
            this.state.darkModeEnabled = localStorage.getItem('nazar-dark-mode') === 'true';
            
            // Safety values configurations
            this.state.emergencyContactName = localStorage.getItem('nazar-emergency-contact-name') || '';
            this.state.emergencyContactNumber = localStorage.getItem('nazar-emergency-contact-number') || '';
            this.state.emergencyContactEmail = localStorage.getItem('nazar-emergency-contact-email') || '';
            this.state.emergencyContactRelationship = localStorage.getItem('nazar-emergency-contact-relationship') || '';
            this.state.emergencyWebhookUrl = localStorage.getItem('nazar-emergency-webhook-url') || '';
            this.state.homeAddress = localStorage.getItem('nazar-home-address') || '';
            this.state.preferredLocationProvider = localStorage.getItem('nazar-preferred-location-provider') || 'osm';
            this.state.liveLocationSharingEnabled = localStorage.getItem('nazar-live-location-sharing-enabled') === 'true';
            this.state.liveLocationSharingInterval = parseInt(localStorage.getItem('nazar-live-location-sharing-interval')) || 300;
        },

        save(key, value) {
            this.state[key] = value;
            localStorage.setItem(`nazar-${this.kebabCase(key)}`, value);
            if (typeof queueSettingsSync === 'function') {
                queueSettingsSync();
            }
        },

        kebabCase(str) {
            return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
        },

        initUI() {
            this.load();
            
            const toggleVoice = document.getElementById('toggle-voice-commands');
            const toggleSpeech = document.getElementById('toggle-speech-output');
            const toggleVibrate = document.getElementById('toggle-vibration-alerts');
            const toggleDark = document.getElementById('toggle-dark-mode');

            if (toggleVoice) {
                toggleVoice.checked = this.state.voiceCommandsEnabled;
                toggleVoice.addEventListener('change', (e) => {
                    this.save('voiceCommandsEnabled', e.target.checked);
                    SpeechService.announce(e.target.checked ? "Voice commands enabled" : "Voice commands disabled");
                });
            }

            if (toggleSpeech) {
                toggleSpeech.checked = this.state.speechOutputEnabled;
                toggleSpeech.addEventListener('change', (e) => {
                    this.save('speechOutputEnabled', e.target.checked);
                });
            }

            if (toggleVibrate) {
                toggleVibrate.checked = this.state.vibrationAlertsEnabled;
                toggleVibrate.addEventListener('change', (e) => {
                    this.save('vibrationAlertsEnabled', e.target.checked);
                    SpeechService.announce(e.target.checked ? "Vibration alerts enabled" : "Vibration alerts disabled");
                });
            }

            if (toggleDark) {
                toggleDark.checked = this.state.darkModeEnabled;
                toggleDark.addEventListener('change', (e) => {
                    this.save('darkModeEnabled', e.target.checked);
                    const body = document.body;
                    if (e.target.checked) {
                        body.classList.add('dark-mode');
                        SpeechService.announce("Dark mode enabled");
                    } else {
                        body.classList.remove('dark-mode');
                        SpeechService.announce("Light mode enabled");
                    }
                });
            }

            if (this.state.darkModeEnabled) {
                document.body.classList.add('dark-mode');
            }

            // Bind Emergency Settings Inputs & Buttons
            this.updateSavedContactCard();

            const saveBtn = document.getElementById('btn-save-emergency');
            const deleteBtn = document.getElementById('btn-delete-emergency');
            const testSosBtn = document.getElementById('btn-test-sos');
            const testEmailBtn = document.getElementById('btn-test-email');
            const errorBox = document.getElementById('emergency-contact-error');

            if (saveBtn) {
                saveBtn.addEventListener('click', () => {
                    const inputName = document.getElementById('input-emergency-name');
                    const inputPhone = document.getElementById('input-emergency-phone');
                    const inputEmail = document.getElementById('input-emergency-email');
                    const inputRel = document.getElementById('input-emergency-rel');

                    const name = inputName ? inputName.value.trim() : '';
                    const phone = inputPhone ? inputPhone.value.trim() : '';
                    const email = inputEmail ? inputEmail.value.trim() : '';
                    const rel = inputRel ? inputRel.value.trim() : '';

                    if (!name) {
                        if (errorBox) {
                            errorBox.innerText = 'Contact name cannot be empty.';
                            errorBox.style.display = 'block';
                        }
                        SpeechService.announce('Contact name cannot be empty.');
                        return;
                    }

                    const phoneClean = phone.replace(/[^0-9+]/g, '');
                    if (!phone || phoneClean.length < 7) {
                        if (errorBox) {
                            errorBox.innerText = 'Please enter a valid phone number.';
                            errorBox.style.display = 'block';
                        }
                        SpeechService.announce('Please enter a valid phone number.');
                        return;
                    }

                    if (email && (!email.includes('@') || !email.includes('.'))) {
                        if (errorBox) {
                            errorBox.innerText = 'Please enter a valid email address.';
                            errorBox.style.display = 'block';
                        }
                        SpeechService.announce('Please enter a valid email address.');
                        return;
                    }

                    if (errorBox) errorBox.style.display = 'none';

                    this.save('emergencyContactName', name);
                    this.save('emergencyContactNumber', phone);
                    this.save('emergencyContactEmail', email);
                    this.save('emergencyContactRelationship', rel || 'Emergency Contact');

                    const contactObj = { name, phone, email, relationship: rel || 'Emergency Contact' };
                    localStorage.setItem('nazar-emergency-contacts-list', JSON.stringify([contactObj]));

                    syncEmergencyContact(name, phone, rel || 'Emergency Contact', email);
                    this.updateSavedContactCard();
                    SpeechService.announce('Emergency contact saved successfully.');
                });
            }

            if (deleteBtn) {
                deleteBtn.addEventListener('click', () => {
                    this.save('emergencyContactName', '');
                    this.save('emergencyContactNumber', '');
                    this.save('emergencyContactEmail', '');
                    this.save('emergencyContactRelationship', '');

                    localStorage.removeItem('nazar-emergency-contact-name');
                    localStorage.removeItem('nazar-emergency-contact-number');
                    localStorage.removeItem('nazar-emergency-contact-email');
                    localStorage.removeItem('nazar-emergency-contact-relationship');
                    localStorage.removeItem('nazar-emergency-contacts-list');

                    syncEmergencyContact('', '', '', '');
                    this.updateSavedContactCard();
                    SpeechService.announce('Emergency contact deleted.');
                });
            }

            if (testEmailBtn) {
                testEmailBtn.addEventListener('click', () => {
                    const email = this.state.emergencyContactEmail || localStorage.getItem("nazar-emergency-contact-email") || '';
                    let contactsList = [];
                    try {
                        contactsList = JSON.parse(localStorage.getItem('nazar-emergency-contacts-list') || '[]');
                    } catch (e) {
                        contactsList = [];
                    }
                    const hasEmail = email || contactsList.some(c => c.email && c.email.includes('@'));
                    if (!hasEmail) {
                        SpeechService.announce("Emergency contact email not configured. Please add contact email in Settings.");
                        if (errorBox) {
                            errorBox.innerText = 'Emergency contact email not configured. Please add contact email in Settings.';
                            errorBox.style.display = 'block';
                        }
                        return;
                    }
                    executeEmergencySOS(true, true);
                });
            }

            if (testSosBtn) {
                testSosBtn.addEventListener('click', () => {
                    const contactNumber = this.state.emergencyContactNumber || localStorage.getItem("nazar-emergency-contact-number") || '';
                    if (!contactNumber) {
                        SpeechService.announce("Emergency contact not configured. Please add an emergency contact in Settings.");
                        if (errorBox) {
                            errorBox.innerText = 'Emergency contact not configured. Please add contact in Settings.';
                            errorBox.style.display = 'block';
                        }
                        return;
                    }
                    SpeechService.announce("Testing emergency SOS. Getting your current location.");
                    executeEmergencySOS(true, false);
                });
            }

            this.initAccordions();
        },

        updateSavedContactCard() {
            const card = document.getElementById('saved-contact-card');
            const nameEl = document.getElementById('saved-contact-name');
            const phoneEl = document.getElementById('saved-contact-phone');
            const emailEl = document.getElementById('saved-contact-email');
            const relEl = document.getElementById('saved-contact-relationship');

            const inputName = document.getElementById('input-emergency-name');
            const inputPhone = document.getElementById('input-emergency-phone');
            const inputEmail = document.getElementById('input-emergency-email');
            const inputRel = document.getElementById('input-emergency-rel');

            const name = this.state.emergencyContactName;
            const phone = this.state.emergencyContactNumber;
            const email = this.state.emergencyContactEmail;
            const rel = this.state.emergencyContactRelationship;

            if (inputName) inputName.value = name || '';
            if (inputPhone) inputPhone.value = phone || '';
            if (inputEmail) inputEmail.value = email || '';
            if (inputRel) inputRel.value = rel || '';

            if (card && (name || phone || email)) {
                card.style.display = 'flex';
                if (nameEl) nameEl.innerText = name || 'Emergency Contact';
                if (phoneEl) phoneEl.innerText = phone ? `Phone: ${phone}` : '';
                if (emailEl) emailEl.innerText = email ? `Email: ${email}` : '';
                if (relEl) relEl.innerText = rel || 'Emergency Contact';
            } else if (card) {
                card.style.display = 'none';
            }
        },

        initAccordions() {
            const cards = document.querySelectorAll('.settings-menu-card');
            cards.forEach(card => {
                const header = card.querySelector('.settings-menu-card-header');
                const content = card.querySelector('div[style*="margin-top"]');
                
                if (header && content) {
                    header.setAttribute('aria-expanded', 'false');
                    content.style.display = 'none';

                    const toggle = () => {
                        const isExpanded = header.getAttribute('aria-expanded') === 'true';
                        header.setAttribute('aria-expanded', !isExpanded);
                        content.style.display = isExpanded ? 'none' : 'flex';
                        
                        const labelEl = header.querySelector('.settings-label-name');
                        const sectionName = labelEl ? labelEl.innerText : 'Section';
                        SpeechService.announce(`${sectionName} section ${isExpanded ? 'collapsed' : 'expanded'}`);
                    };

                    header.addEventListener('click', (e) => {
                        e.preventDefault();
                        toggle();
                    });
                    
                    header.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            toggle();
                        }
                    });
                }
            });
        }
    };

    // --- 2. SPEECH SERVICE ---
    const SpeechService = {
        lastAnnouncedText: '',

        announce(text, priority = false) {
            const startSpeechTime = performance.now();

            // Accessible ARIA Live Region Sync (Smart Accessibility Mode)
            const liveRegion = document.getElementById('aria-live-announcer');
            if (liveRegion) {
                if (this.stateSpeechActive()) {
                    liveRegion.setAttribute('aria-live', 'off');
                    liveRegion.innerText = '';
                } else {
                    liveRegion.setAttribute('aria-live', 'assertive');
                    liveRegion.innerText = text;
                }
            }

            if (!SettingsService.state.speechOutputEnabled) return;

            window.speechSynthesis.cancel();

            // Trigger accessibility vibrations
            if (SettingsService.state.vibrationAlertsEnabled && navigator.vibrate) {
                const lowerText = text.toLowerCase();
                if (lowerText.includes("emergency") || lowerText.includes("sos")) {
                    navigator.vibrate([300, 100, 300, 100, 300]);
                } else if (lowerText.includes("vehicle") || lowerText.includes("car") || lowerText.includes("bus")) {
                    navigator.vibrate([200, 100, 200]);
                } else if (lowerText.includes("obstacle") || lowerText.includes("bicycle") || lowerText.includes("chair")) {
                    navigator.vibrate(200);
                }
            }

            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = SettingsService.state.speechRate || 1.0;
            utterance.pitch = 1.05;

            const voices = window.speechSynthesis.getVoices();
            const preferredVoice = voices.find(v => 
                v.name.includes('Google US English') || 
                v.name.includes('Microsoft Zira') || 
                v.lang === 'en-US'
            );
            if (preferredVoice) utterance.voice = preferredVoice;

            // Keep persistent global reference to prevent iOS garbage collection cutoffs
            window.activeUtterance = utterance;

            utterance.onstart = () => {
                const latency = Math.round(performance.now() - startSpeechTime);
                Telemetry.updateMetric('speechLatency', latency);
            };

            utterance.onend = () => {
                if (window.activeUtterance === utterance) {
                    window.activeUtterance = null;
                }
            };

            utterance.onerror = () => {
                if (window.activeUtterance === utterance) {
                    window.activeUtterance = null;
                }
            };

            window.speechSynthesis.speak(utterance);
            this.lastAnnouncedText = text;

            const repeatBtn = document.getElementById('repeat-btn');
            if (repeatBtn && text) {
                repeatBtn.disabled = false;
                repeatBtn.style.opacity = '1';
                repeatBtn.style.cursor = 'pointer';
            }
        },

        stateSpeechActive() {
            return SettingsService.state.speechOutputEnabled;
        },

        repeat() {
            if (this.lastAnnouncedText) {
                this.announce(this.lastAnnouncedText);
            } else {
                this.announce("No description is cached yet.");
            }
        },

        stop() {
            window.speechSynthesis.cancel();
            if (window.activeUtterance) {
                window.activeUtterance = null;
            }
        }
    };

    window.speechSynthesis.onvoiceschanged = () => {};

    // --- 3. CAMERA SERVICE ---
    const CameraService = {
        stream: null,
        isStarting: false,
        stopRequested: false,
        facingMode: 'environment', // Toggle default camera facingMode
        
        // Single offscreen canvas reused throughout camera session to reduce memory thrashing
        canvas: document.createElement('canvas'),

        async start() {
            this.stopRequested = false;
            if (this.isStarting) return false;
            this.isStarting = true;

            const startCamTime = performance.now();
            const video = document.getElementById('camera-stream');
            if (!video) {
                this.isStarting = false;
                return false;
            }

            try {
                const mediaStream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: this.facingMode }
                });

                if (this.stopRequested) {
                    mediaStream.getTracks().forEach(track => track.stop());
                    this.isStarting = false;
                    return false;
                }

                this.stream = mediaStream;
                video.srcObject = this.stream;
                video.style.display = 'block';

                try {
                    await video.play();
                } catch (playErr) {
                    console.warn("Autoplay was blocked or interrupted: ", playErr);
                }

                const latency = Math.round(performance.now() - startCamTime);
                Telemetry.updateMetric('cameraStartupTime', latency);

                video.onloadedmetadata = () => {
                    if (!this.stopRequested) {
                        DetectionService.start(video);
                    }
                };
                return true;
            } catch (err) {
                console.warn("MediaDevices camera access failed: ", err);
                video.style.display = 'none';
                return false;
            } finally {
                this.isStarting = false;
            }
        },

        stop() {
            this.stopRequested = true;
            DetectionService.stop();

            const video = document.getElementById('camera-stream');
            
            if (this.stream) {
                this.stream.getTracks().forEach(track => track.stop());
                this.stream = null;
            }
            if (video) {
                video.srcObject = null;
                video.style.display = 'none';
            }
        },

        toggleCamera() {
            this.facingMode = this.facingMode === 'environment' ? 'user' : 'environment';
            SpeechService.announce(this.facingMode === 'environment' ? "Using rear camera." : "Using front camera.");
            if (this.stream) {
                this.stop();
                setTimeout(() => this.start(), 100);
            }
        },

        pauseOnHidden() {
            // Pause services on page visibility state = hidden
            DetectionService.stop();
            if (this.stream) {
                this.stream.getTracks().forEach(track => track.stop());
                this.stream = null;
            }
            SpeechService.stop();
        },

        resumeOnVisible() {
            if (state.currentTab === 'camera') {
                if (CameraPermissionManager.state === 'granted') {
                    this.start();
                }
            }
        },

        // Fast image processing and frame resizing (compressed to standard 640x480 size)
        captureFrame() {
            const video = document.getElementById('camera-stream');
            
            const maxW = 640;
            const maxH = 480;

            let sourceEl = null;
            let srcWidth = 0;
            let srcHeight = 0;

            if (video && video.style.display !== 'none' && video.readyState === video.HAVE_ENOUGH_DATA) {
                sourceEl = video;
                srcWidth = video.videoWidth;
                srcHeight = video.videoHeight;
            }

            if (!sourceEl || srcWidth === 0) return null;

            // Calculate responsive boundary box dimensions keeping scaling aspect ratios
            let destW = srcWidth;
            let destH = srcHeight;
            if (srcWidth > maxW || srcHeight > maxH) {
                const ratio = Math.min(maxW / srcWidth, maxH / srcHeight);
                destW = Math.round(srcWidth * ratio);
                destH = Math.round(srcHeight * ratio);
            }

            this.canvas.width = destW;
            this.canvas.height = destH;
            const ctx = this.canvas.getContext('2d');
            ctx.drawImage(sourceEl, 0, 0, destW, destH);
            return this.canvas;
        }
    };

    // --- CAMERA PERMISSION MANAGER ---
    const CameraPermissionManager = {
        state: 'unauthorized', // 'unauthorized' | 'requesting' | 'denied' | 'granted'

        async checkStatus() {
            try {
                if (navigator.permissions && navigator.permissions.query) {
                    const status = await navigator.permissions.query({ name: 'camera' });
                    if (status.state === 'granted') {
                        this.state = 'granted';
                    } else if (status.state === 'denied') {
                        this.state = 'denied';
                    } else {
                        this.state = 'unauthorized';
                    }
                    this.updateUI();
                    
                    status.onchange = () => {
                        this.checkStatus();
                    };
                }
            } catch (e) {
                console.warn("navigator.permissions query not supported:", e.message || e);
            }
        },

        updateUI() {
            const container = document.getElementById('camera-permission-container');
            const viewfinder = document.querySelector('.camera-panel-wrapper.viewfinder');
            
            const stateInitial = document.getElementById('perm-state-initial');
            const stateRequesting = document.getElementById('perm-state-requesting');
            const stateDenied = document.getElementById('perm-state-denied');

            if (!container || !viewfinder) return;

            stateInitial.classList.remove('active');
            stateRequesting.classList.remove('active');
            stateDenied.classList.remove('active');

            if (this.state === 'granted') {
                container.style.display = 'none';
                viewfinder.style.display = 'block';
            } else {
                container.style.display = 'flex';
                viewfinder.style.display = 'none';

                if (this.state === 'unauthorized') {
                    stateInitial.classList.add('active');
                } else if (this.state === 'requesting') {
                    stateRequesting.classList.add('active');
                } else if (this.state === 'denied') {
                    stateDenied.classList.add('active');
                }
            }
        },

        async requestPermission() {
            this.state = 'requesting';
            this.updateUI();
            SpeechService.announce("Requesting camera access.");

            try {
                const hasStream = await CameraService.start();
                if (hasStream) {
                    this.state = 'granted';
                    SpeechService.announce("Camera permission approved.");
                } else {
                    this.state = 'denied';
                    SpeechService.announce("Camera access is required for object detection and scene description.");
                }
            } catch (err) {
                this.state = 'denied';
                SpeechService.announce("Camera access is required for object detection and scene description.");
            }
            this.updateUI();
        }
    };

    // --- 4. DETECTION SERVICE (Dual-Mode Web Worker + Main Thread Fallback) ---
    const DetectionService = {
        // Model Engine Cache
        model: null,
        worker: null,
        isWorkerReady: false,
        workerLoadFailed: false,
        
        // Loop State Guards
        active: false,
        isDetecting: false,
        timer: null,
        detectionInterval: 800, // Throttled 800ms
        threshold: 0.65,
        
        // Anti-spam alert Cache
        alertCooldowns: {},
        cooldownDuration: 7000,
        activeDetections: [],

        initWorker() {
            if (this.worker || this.workerLoadFailed) return;

            try {
                // Initialize background web worker
                this.worker = new Worker('detection-worker.js');
                Telemetry.updateMetric('engineMode', 'Initializing Worker...');

                this.worker.onmessage = (e) => {
                    const data = e.data;
                    if (data.type === 'status') {
                        if (data.status === 'ready') {
                            this.isWorkerReady = true;
                            Telemetry.updateMetric('engineMode', 'Worker Thread');
                            Telemetry.updateMetric('modelLoadTime', 'Precached');
                        } else if (data.status === 'error') {
                            console.warn("Worker loading failed. Falling back to main-thread local pipeline: ", data.error);
                            this.fallbackToMainThread();
                        }
                    } else if (data.type === 'predictions') {
                        this.isDetecting = false;
                        Telemetry.recordFps();
                        this.processDetections(data.predictions);
                        
                        // Update Telemetry Memory stats
                        if (data.diagnostics) {
                            Telemetry.updateMetric('tensors', data.diagnostics.tensors);
                            Telemetry.updateMetric('bytes', data.diagnostics.bytes);
                        }
                    } else if (data.type === 'error') {
                        this.isDetecting = false;
                        console.warn("Worker inference error: ", data.error);
                    }
                };

                // Trigger model loading inside background worker
                this.worker.postMessage({ type: 'load' });

                // Worker Startup Safety Timeout: Allow 15s for CDN-loaded TF.js model before falling back
                this.workerTimeoutTimer = setTimeout(() => {
                    if (!this.isWorkerReady && !this.workerLoadFailed) {
                        console.warn("Worker initialization timed out after 15s. Triggering main-thread fallback.");
                        this.fallbackToMainThread();
                    }
                }, 15000);

            } catch (err) {
                console.warn("Browser Web Worker instantiation blocked. Using main thread fallback: ", err);
                this.fallbackToMainThread();
            }
        },

        fallbackToMainThread() {
            if (this.workerTimeoutTimer) {
                clearTimeout(this.workerTimeoutTimer);
                this.workerTimeoutTimer = null;
            }
            this.workerLoadFailed = true;
            this.isWorkerReady = false;
            if (this.worker) {
                this.worker.terminate();
                this.worker = null;
            }
            Telemetry.updateMetric('engineMode', 'Main Thread (Local)');
            this.loadMainThreadModel();
        },

        async loadMainThreadModel() {
            if (this.model) return;
            try {
                if (typeof tf === 'undefined') {
                    Telemetry.updateMetric('engineMode', 'Loading TFJS...');
                    await this.loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs');
                }
                if (typeof cocoSsd === 'undefined') {
                    Telemetry.updateMetric('engineMode', 'Loading COCO-SSD...');
                    await this.loadScript('https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd');
                }
                
                const startLoadTime = performance.now();
                this.model = await cocoSsd.load();
                const latency = Math.round(performance.now() - startLoadTime);
                Telemetry.updateMetric('modelLoadTime', latency);
                Telemetry.updateMetric('engineMode', 'Main Thread (Local)');
            } catch (err) {
                console.error("Local main-thread object detector fail: ", err);
                Telemetry.updateMetric('engineMode', 'Inference Load Error');
            }
        },

        loadScript(src) {
            return new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = src;
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            });
        },

        start(element) {
            this.stop();
            this.active = true;

            // Dynamic lazy-load or execution start
            if (this.isWorkerReady) {
                this.scheduleNext(element);
            } else if (this.workerLoadFailed) {
                if (!this.model) {
                    this.loadMainThreadModel().then(() => {
                        if (this.model && this.active) this.scheduleNext(element);
                    });
                } else {
                    this.scheduleNext(element);
                }
            } else {
                // Preloading not finished: setup worker and loop check
                this.initWorker();
                this.scheduleNext(element);
            }
        },

        stop() {
            this.active = false;
            if (this.timer) {
                clearTimeout(this.timer);
                this.timer = null;
            }
            this.isDetecting = false;
            this.activeDetections = [];
        },

        scheduleNext(element) {
            if (!this.active) return;
            this.timer = setTimeout(async () => {
                if (this.active) {
                    await this.analyzeFrame(element);
                    this.scheduleNext(element);
                }
            }, this.detectionInterval);
        },

        async analyzeFrame(element) {
            if (this.isDetecting || !this.active) return;

            const startFrameTime = performance.now();

            // Web Worker offloaded pipeline
            if (this.isWorkerReady && this.worker) {
                const canvas = CameraService.captureFrame();
                if (!canvas) return;

                const ctx = canvas.getContext('2d');
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

                this.isDetecting = true;
                // Zero-copy array buffer transfer to worker
                this.worker.postMessage(
                    { type: 'detect', imageData }, 
                    [imageData.data.buffer]
                );

                const latency = Math.round(performance.now() - startFrameTime);
                Telemetry.updateMetric('detectionLatency', latency);
                return;
            }

            // Fallback Main Thread Pipeline
            if (this.model && this.workerLoadFailed) {
                this.isDetecting = true;
                try {
                    // Start TensorFlow scope allocation boundary
                    tf.engine().startScope();

                    // Convert elements to pixels
                    const tensor = tf.browser.fromPixels(element);
                    const predictions = await this.model.detect(tensor);

                    // Dispose input tensor
                    tensor.dispose();

                    // End TensorFlow scope allocation boundary
                    tf.engine().endScope();

                    const memStats = tf.memory();
                    Telemetry.updateMetric('tensors', memStats.numTensors);
                    Telemetry.updateMetric('bytes', memStats.numBytes);

                    Telemetry.recordFps();
                    this.processDetections(predictions);
                } catch (err) {
                    console.warn("Main thread inference loop exception: ", err);
                } finally {
                    this.isDetecting = false;
                    const latency = Math.round(performance.now() - startFrameTime);
                    Telemetry.updateMetric('detectionLatency', latency);
                }
            }
        },

        processDetections(predictions) {
            const validLabels = [
                'person', 'car', 'bus', 'truck', 'bicycle', 'motorcycle', 
                'chair', 'couch', 'bed', 'dining table', 'bench', 'backpack', 
                'umbrella', 'suitcase', 'cell phone', 'handbag', 'stop sign', 'traffic light'
            ];

            const filtered = predictions.filter(pred => 
                pred.score >= this.threshold && 
                validLabels.includes(pred.class)
            );

            this.activeDetections = filtered;

            // Build alerts
            const currentAlerts = [];
            const elWidth = 640; // canvas scaled coordinate standard

            filtered.forEach(pred => {
                const boxX = pred.bbox[0];
                const boxW = pred.bbox[2];
                const centerX = boxX + boxW / 2;

                let direction = "ahead";
                if (centerX < elWidth * 0.35) {
                    direction = "on your left";
                } else if (centerX > elWidth * 0.65) {
                    direction = "on your right";
                }

                let friendlyLabel = pred.class.charAt(0).toUpperCase() + pred.class.slice(1);
                if (['car', 'bus', 'truck'].includes(pred.class)) {
                    friendlyLabel = "Vehicle";
                } else if (['bicycle', 'motorcycle'].includes(pred.class)) {
                    friendlyLabel = "Bicycle";
                } else if (['couch', 'bench', 'chair'].includes(pred.class)) {
                    friendlyLabel = "Chair";
                }

                const alertString = `${friendlyLabel} ${direction}.`;
                const cacheKey = `${friendlyLabel}_${direction}`;
                currentAlerts.push({ key: cacheKey, text: alertString, label: friendlyLabel });
            });

            // Deduplicate same positions
            const uniqueAlerts = [];
            const keysSeen = new Set();
            for (const alert of currentAlerts) {
                if (!keysSeen.has(alert.key)) {
                    keysSeen.add(alert.key);
                    uniqueAlerts.push(alert);
                }
            }

            // Speak unique alerts
            const now = Date.now();
            uniqueAlerts.forEach(alert => {
                const lastAnnounced = this.alertCooldowns[alert.key] || 0;
                
                const isPriority = alert.label === "Vehicle";
                const activeCooldown = isPriority ? 3000 : this.cooldownDuration;

                if (now - lastAnnounced >= activeCooldown) {
                    SpeechService.announce(alert.text);
                    this.alertCooldowns[alert.key] = now;
                }
            });

            // Clean stale items in the cooldown map
            Object.keys(this.alertCooldowns).forEach(key => {
                const found = uniqueAlerts.some(a => a.key === key);
                if (!found && now - this.alertCooldowns[key] > this.cooldownDuration) {
                    delete this.alertCooldowns[key];
                }
            });
        }
    };

    // --- 4.8 LOCATION & SAFETY SERVICES (Abstract Provider Registry) ---
    class LocationProvider {
        async reverseGeocode(lat, lon) {
            throw new Error("reverseGeocode not implemented");
        }
        async searchNearby(lat, lon, category, radius) {
            throw new Error("searchNearby not implemented");
        }
    }

    class OSMProvider extends LocationProvider {
        async reverseGeocode(lat, lon) {
            const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`;
            const res = await fetch(url, { headers: { 'User-Agent': 'NazarAccessibilityApp/2.0' } });
            if (!res.ok) throw new Error("OSM Nominatim API request failed");
            const data = await res.json();
            
            const addr = data.address || {};
            const displayAddress = data.display_name ? data.display_name.split(',').slice(0, 3).join(',').trim() : "Unknown location";
            const landmark = addr.suburb || addr.neighbourhood || addr.amenity || addr.building || null;
            
            return {
                address: displayAddress,
                landmark: landmark
            };
        }

        async searchNearby(lat, lon, category, radius) {
            const osmTypes = {
                hospital: 'hospital',
                pharmacy: 'pharmacy',
                police: 'police',
                bus: 'bus_station',
                metro: 'subway_entrance',
                atm: 'atm'
            };
            const type = osmTypes[category] || 'hospital';
            const query = `[out:json];node(around:${radius},${lat},${lon})[amenity=${type}];out;`;
            const res = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`);
            if (!res.ok) throw new Error("OSM Overpass API request failed");
            const data = await res.json();
            
            return (data.elements || []).map(el => ({
                name: el.tags.name || `${category.charAt(0).toUpperCase() + category.slice(1)} Facility`,
                lat: el.lat,
                lon: el.lon
            }));
        }
    }

    const LocationService = {
        providers: {},
        activeProviderName: null,
        cache: { data: null, timestamp: 0, lat: 0, lon: 0 },

        registerProvider(name, providerInstance) {
            this.providers[name] = providerInstance;
        },

        setProvider(name) {
            if (this.providers[name]) {
                this.activeProviderName = name;
            } else {
                console.warn(`Location provider ${name} is not registered.`);
            }
        },

        async getAddress(lat, lon) {
            if (!this.activeProviderName || !this.providers[this.activeProviderName]) {
                throw new Error("No active location provider set.");
            }
            
            const now = Date.now();
            const latDiff = Math.abs(lat - this.cache.lat);
            const lonDiff = Math.abs(lon - this.cache.lon);
            if (this.cache.data && (now - this.cache.timestamp < 60000) && latDiff < 0.0001 && lonDiff < 0.0001) {
                console.log("[LocationService] Using cached address:", this.cache.data.address);
                return this.cache.data;
            }

            const result = await this.providers[this.activeProviderName].reverseGeocode(lat, lon);
            this.cache.data = result;
            this.cache.lat = lat;
            this.cache.lon = lon;
            this.cache.timestamp = now;
            return result;
        },

        async searchNearby(lat, lon, category, radius) {
            if (!this.activeProviderName || !this.providers[this.activeProviderName]) {
                throw new Error("No active location provider set.");
            }
            return await this.providers[this.activeProviderName].searchNearby(lat, lon, category, radius);
        }
    };

    class EmergencyDispatcher {
        async sendAlert(payload) {
            throw new Error("sendAlert not implemented");
        }
    }

    class SMSDispatcher extends EmergencyDispatcher {
        async sendAlert(payload) {
            if (!payload.contactNumber) {
                return { success: false, error: 'No contact number configured' };
            }
            const cleanPhone = payload.contactNumber.replace(/[^0-9+]/g, '');
            const encodedBody = encodeURIComponent(payload.message);
            const isIOS = /iP(hone|od|ad)/i.test(navigator.userAgent);
            const smsUri = isIOS ? `sms:${cleanPhone};body=${encodedBody}` : `sms:${cleanPhone}?body=${encodedBody}`;
            console.log("[SMSDispatcher] Opening native SMS URI:", smsUri);
            window.location.href = smsUri;
            return { success: true, type: 'sms' };
        }
    }

    class PushDispatcher extends EmergencyDispatcher {
        async sendAlert(payload) {
            console.log("[EmergencyService] Dispatching push notification alert:", payload);
            return { success: true, type: 'push' };
        }
    }

    const EmergencyService = {
        dispatchers: {},

        registerDispatcher(name, dispatcherInstance) {
            this.dispatchers[name] = dispatcherInstance;
        },

        async dispatch(payload) {
            const results = {};
            for (const [name, dispatcher] of Object.entries(this.dispatchers)) {
                try {
                    results[name] = await dispatcher.sendAlert(payload);
                } catch (err) {
                    console.error(`[EmergencyService] Dispatcher ${name} failed:`, err);
                    results[name] = { success: false, error: err.message };
                }
            }
            return results;
        }
    };

    // Register active providers and dispatchers
    LocationService.registerProvider("osm", new OSMProvider());
    LocationService.setProvider("osm");

    EmergencyService.registerDispatcher("sms", new SMSDispatcher());
    EmergencyService.registerDispatcher("push", new PushDispatcher());

    // --- 4.9 LOCATION & EMERGENCY HELPER FUNCTIONS ---
    function calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371e3; // meters
        const phi1 = lat1 * Math.PI/180;
        const phi2 = lat2 * Math.PI/180;
        const deltaPhi = (lat2-lat1) * Math.PI/180;
        const deltaLambda = (lon2-lon1) * Math.PI/180;

        const a = Math.sin(deltaPhi/2) * Math.sin(deltaPhi/2) +
                  Math.cos(phi1) * Math.cos(phi2) *
                  Math.sin(deltaLambda/2) * Math.sin(deltaLambda/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

        return Math.round(R * c);
    }

    async function handleWhereAmI() {
        if (!navigator.geolocation) {
            SpeechService.announce("Location services are not supported by this browser.");
            return;
        }
        SpeechService.announce("Retrieving current location.");
        navigator.geolocation.getCurrentPosition(async (pos) => {
            const lat = pos.coords.latitude;
            const lon = pos.coords.longitude;
            console.log(`[LocationSystem] Coordinates retrieved: ${lat}, ${lon}`);
            try {
                const loc = await LocationService.getAddress(lat, lon);
                let announcement = `You are near ${loc.address}.`;
                
                let minDistance = Infinity;
                let closestLandmark = null;
                const categories = ['hospital', 'pharmacy', 'police', 'bus', 'metro', 'atm'];
                
                for (const cat of categories) {
                    try {
                        const places = await LocationService.searchNearby(lat, lon, cat, 1000);
                        for (const p of places) {
                            const dist = calculateDistance(lat, lon, p.lat, p.lon);
                            if (dist < minDistance) {
                                minDistance = dist;
                                closestLandmark = p;
                            }
                        }
                    } catch (e) {
                        console.warn(`[LocationSystem] Failed to fetch nearby ${cat} landmarks:`, e);
                    }
                }
                
                if (closestLandmark) {
                    announcement += ` The nearest landmark is ${closestLandmark.name}, which is approximately ${minDistance} meters away.`;
                }
                SpeechService.announce(announcement);
            } catch (err) {
                console.error("[LocationSystem] Reverse geocode error: ", err);
                SpeechService.announce("Unable to determine address. Please try again.");
            }
        }, (err) => {
            console.warn("[LocationSystem] Geolocation permission denied or failed: ", err);
            SpeechService.announce("Unable to retrieve location. Please check browser permissions.");
        }, { enableHighAccuracy: true, timeout: 8000 });
    }

    function logEmergencyEvent(details) {
        let history = [];
        try {
            history = JSON.parse(localStorage.getItem('nazar-emergency-history-log') || '[]');
        } catch (e) {
            history = [];
        }
        const entry = {
            id: Date.now(),
            timestamp: new Date().toLocaleString(),
            latitude: details.latitude || 0,
            longitude: details.longitude || 0,
            accuracy: details.accuracy || 0,
            googleMapsUrl: details.googleMapsUrl || '',
            contactCount: details.contactCount || 0,
            status: details.status || 'unknown',
            failureReason: details.failureReason || null,
            isTest: !!details.isTest
        };
        history.unshift(entry);
        if (history.length > 50) history = history.slice(0, 50);
        localStorage.setItem('nazar-emergency-history-log', JSON.stringify(history));
    }

    function handleEmergencySOS() {
        const sosModal = document.getElementById('sos-modal');
        if (sosModal) {
            sosModal.classList.add('modal-active');
            SpeechService.announce("Emergency SOS triggered. Press and hold to confirm.");
        } else {
            executeEmergencySOS(false);
        }
    }

    async function executeEmergencySOS(isTestMode = false, emailOnly = false) {
        const name = SettingsService.state.emergencyContactName || localStorage.getItem("nazar-emergency-contact-name") || 'Emergency Contact';
        const phone = SettingsService.state.emergencyContactNumber || localStorage.getItem("nazar-emergency-contact-number") || '';
        const email = SettingsService.state.emergencyContactEmail || localStorage.getItem("nazar-emergency-contact-email") || '';
        const rel = SettingsService.state.emergencyContactRelationship || localStorage.getItem("nazar-emergency-contact-relationship") || 'Emergency Contact';

        let contactsList = [];
        try {
            contactsList = JSON.parse(localStorage.getItem('nazar-emergency-contacts-list') || '[]');
        } catch (e) {
            contactsList = [];
        }

        if (contactsList.length === 0 && (email || phone)) {
            contactsList.push({ name, phone, email, relationship: rel });
        }

        const emailContacts = contactsList.filter(c => c.email && c.email.includes('@'));

        if (emailContacts.length === 0) {
            SpeechService.announce("Emergency contact email not configured. Please add contact email in Settings.");
            const errorBox = document.getElementById('emergency-contact-error');
            if (errorBox) {
                errorBox.innerText = "Emergency contact email not configured. Please add contact email in Settings.";
                errorBox.style.display = 'block';
            }
            if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
            logEmergencyEvent({ status: 'failure', failureReason: 'No emergency contact email configured', isTest: isTestMode });
            return;
        }

        // 1. Internet Connectivity Check
        SpeechService.announce("Checking internet connection.");
        if (!navigator.onLine) {
            SpeechService.announce("No internet connection. Emergency email cannot be sent.");
            const errorBox = document.getElementById('emergency-contact-error');
            if (errorBox) {
                errorBox.innerText = "No internet connection. Emergency email cannot be sent.";
                errorBox.style.display = 'block';
            }
            if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
            logEmergencyEvent({ status: 'offline', failureReason: 'Device is offline', contactCount: emailContacts.length, isTest: isTestMode });
            return;
        }

        if (!navigator.geolocation) {
            SpeechService.announce("Unable to determine your location.");
            if (navigator.vibrate) navigator.vibrate([300, 100, 300]);
            logEmergencyEvent({ status: 'failure', failureReason: 'Geolocation not supported', contactCount: emailContacts.length, isTest: isTestMode });
            return;
        }

        SpeechService.announce("Getting location.");

        navigator.geolocation.getCurrentPosition(async (pos) => {
            const lat = pos.coords.latitude;
            const lon = pos.coords.longitude;
            const accuracy = Math.round(pos.coords.accuracy || 10);
            const mapUrl = `https://www.google.com/maps?q=${lat},${lon}`;
            const dateStr = new Date().toLocaleDateString();
            const timeStr = new Date().toLocaleTimeString();

            SpeechService.announce("Location found.");
            if (navigator.vibrate) navigator.vibrate([300, 100, 300]);

            let batteryLevel = 'N/A';
            try {
                if (navigator.getBattery) {
                    const b = await navigator.getBattery();
                    batteryLevel = Math.round(b.level * 100) + '%';
                }
            } catch (e) {
                batteryLevel = 'N/A';
            }

            SpeechService.announce(isTestMode ? "Sending emergency test email." : "Sending emergency email.");

            // 15-Second Abort Controller Timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);

            try {
                const response = await fetch('/api/emergency/send-email', {
                    signal: controller.signal,
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contacts: emailContacts,
                        latitude: lat,
                        longitude: lon,
                        accuracy: accuracy,
                        googleMapsUrl: mapUrl,
                        date: dateStr,
                        time: timeStr,
                        battery: batteryLevel,
                        deviceInfo: navigator.userAgent,
                        isTest: isTestMode
                    })
                });

                clearTimeout(timeoutId);
                const resData = await response.json();

                if (response.ok && resData.success) {
                    SpeechService.announce("Emergency email sent successfully.");
                    localStorage.setItem('nazar-last-emergency-timestamp', Date.now().toString());

                    logEmergencyEvent({
                        latitude: lat,
                        longitude: lon,
                        accuracy: accuracy,
                        googleMapsUrl: mapUrl,
                        contactCount: emailContacts.length,
                        status: 'success',
                        isTest: isTestMode
                    });

                    // Present "I'm Safe" button if real emergency
                    if (!isTestMode) {
                        const confirmBtn = document.getElementById('confirm-sos');
                        const safeBtn = document.getElementById('btn-im-safe');
                        if (confirmBtn && safeBtn) {
                            confirmBtn.style.display = 'none';
                            safeBtn.style.display = 'block';
                        }
                    } else {
                        const sosModal = document.getElementById('sos-modal');
                        if (sosModal) setTimeout(() => sosModal.classList.remove('modal-active'), 1500);
                    }
                } else {
                    console.warn("[EmergencySystem] Email dispatch server error:", resData);
                    SpeechService.announce("Unable to send emergency email.");
                    logEmergencyEvent({
                        latitude: lat,
                        longitude: lon,
                        accuracy: accuracy,
                        googleMapsUrl: mapUrl,
                        contactCount: emailContacts.length,
                        status: 'failure',
                        failureReason: resData.message || 'Server error',
                        isTest: isTestMode
                    });
                }
            } catch (emailErr) {
                clearTimeout(timeoutId);
                console.error("[EmergencySystem] Email dispatch error:", emailErr);

                if (emailErr.name === 'AbortError') {
                    SpeechService.announce("Emergency timeout.");
                    SpeechService.announce("Unable to send emergency email. Please try again.");
                    logEmergencyEvent({
                        latitude: lat,
                        longitude: lon,
                        accuracy: accuracy,
                        googleMapsUrl: mapUrl,
                        contactCount: emailContacts.length,
                        status: 'timeout',
                        failureReason: 'Request timed out after 15 seconds',
                        isTest: isTestMode
                    });
                } else {
                    SpeechService.announce("Unable to send emergency email.");
                    logEmergencyEvent({
                        latitude: lat,
                        longitude: lon,
                        accuracy: accuracy,
                        googleMapsUrl: mapUrl,
                        contactCount: emailContacts.length,
                        status: 'failure',
                        failureReason: emailErr.message,
                        isTest: isTestMode
                    });
                }
            }
        }, (err) => {
            console.warn("[EmergencySystem] GPS Error:", err);
            if (err.code === err.PERMISSION_DENIED) {
                SpeechService.announce("Location permission is required.");
            } else {
                SpeechService.announce("Unable to determine your location.");
            }
            if (navigator.vibrate) navigator.vibrate([300, 100, 300]);
            logEmergencyEvent({
                status: 'failure',
                failureReason: err.code === err.PERMISSION_DENIED ? 'Location permission denied' : 'GPS position unavailable',
                isTest: isTestMode
            });
        }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
    }

    async function triggerSOSDispatch(lat, lon) {
        executeEmergencySOS(false);
    }

    async function handleNearbySearch(transcript) {
        let category = null;
        if (transcript.includes("hospital")) category = "hospital";
        else if (transcript.includes("pharmacy")) category = "pharmacy";
        else if (transcript.includes("police")) category = "police";
        else if (transcript.includes("bus")) category = "bus";
        else if (transcript.includes("metro")) category = "metro";
        else if (transcript.includes("atm")) category = "atm";

        if (!category) {
            SpeechService.announce("Please specify a category like hospital, pharmacy, ATM, or police station.");
            return;
        }

        if (!navigator.geolocation) {
            SpeechService.announce("Location services not supported in this browser.");
            return;
        }

        SpeechService.announce(`Searching for nearby ${category}s.`);
        navigator.geolocation.getCurrentPosition(async (pos) => {
            const lat = pos.coords.latitude;
            const lon = pos.coords.longitude;
            try {
                const places = await LocationService.searchNearby(lat, lon, category, 2000);
                if (!places || places.length === 0) {
                    SpeechService.announce(`No nearby ${category}s found within two kilometers.`);
                    return;
                }

                const sorted = places.map(p => ({
                    ...p,
                    distance: calculateDistance(lat, lon, p.lat, p.lon)
                })).sort((a, b) => a.distance - b.distance);

                const closest = sorted[0];
                SpeechService.announce(`${closest.name} is approximately ${closest.distance} meters away.`);
            } catch (err) {
                console.error("[LocationSystem] Nearby search error:", err);
                SpeechService.announce("Nearby search failed. Please try again.");
            }
        }, (err) => {
            SpeechService.announce("Unable to retrieve location. Please check browser permissions.");
        });
    }



    function handleVoiceSettings(transcript) {
        if (transcript.includes("set emergency contact name to")) {
            const val = transcript.split("set emergency contact name to")[1].trim();
            SettingsService.save("emergencyContactName", val);
            SpeechService.announce(`Emergency contact name set to ${val}`);
            if (typeof syncEmergencyContact === 'function') {
                syncEmergencyContact(val, SettingsService.state.emergencyContactNumber);
            }
            return true;
        } else if (transcript.includes("set emergency contact number to")) {
            const val = transcript.split("set emergency contact number to")[1].trim().replace(/\s+/g, '');
            SettingsService.save("emergencyContactNumber", val);
            SpeechService.announce(`Emergency contact number set to ${val}`);
            if (typeof syncEmergencyContact === 'function') {
                syncEmergencyContact(SettingsService.state.emergencyContactName, val);
            }
            return true;
        } else if (transcript.includes("delete emergency contact") || transcript.includes("remove emergency contact")) {
            const contactId = localStorage.getItem("emergencyContactDbId");
            SettingsService.save("emergencyContactName", "Emergency Contact");
            SettingsService.save("emergencyContactNumber", "");
            localStorage.removeItem("emergencyContactDbId");
            if (contactId && typeof executeOrQueueSync === 'function') {
                executeOrQueueSync({
                    type: 'delete-contact',
                    contactId,
                    timestamp: Date.now()
                });
            }
            SpeechService.announce("Emergency contact deleted.");
            return true;
        } else if (transcript.includes("set home address to")) {
            const val = transcript.split("set home address to")[1].trim();
            SettingsService.save("homeAddress", val);
            SpeechService.announce(`Home address set to ${val}`);
            return true;
        } else if (transcript.includes("set location provider to")) {
            const val = transcript.split("set location provider to")[1].trim().toLowerCase();
            if (val === "osm" || val === "google" || val === "mapbox") {
                SettingsService.save("preferredLocationProvider", val);
                LocationService.setProvider(val);
                SpeechService.announce(`Location provider set to ${val}`);
            } else {
                SpeechService.announce(`Provider ${val} is not supported.`);
            }
            return true;
        } else if (transcript.includes("set live location sharing interval to")) {
            const part = transcript.split("set live location sharing interval to")[1].trim();
            const val = parseInt(part);
            if (val === 30 || val === 60 || val === 300 || part.includes("5 minutes")) {
                const seconds = part.includes("5 minutes") ? 300 : val;
                SettingsService.save("liveLocationSharingInterval", seconds);
                if (SettingsService.state.liveLocationSharingEnabled) {
                    startLiveLocationInterval();
                }
                SpeechService.announce(`Live sharing interval set to ${seconds} seconds`);
            } else {
                SpeechService.announce("Interval must be 30 seconds, 60 seconds, or 5 minutes.");
            }
            return true;
        } else if (transcript.includes("enable live location sharing")) {
            SettingsService.save("liveLocationSharingEnabled", true);
            startLiveLocationInterval();
            SpeechService.announce("Live location sharing enabled");
            return true;
        } else if (transcript.includes("disable live location sharing")) {
            SettingsService.save("liveLocationSharingEnabled", false);
            stopLiveLocationInterval();
            SpeechService.announce("Live location sharing disabled");
            return true;
        } else if (transcript.includes("check my settings") || transcript.includes("check settings")) {
            const name = SettingsService.state.emergencyContactName;
            const num = SettingsService.state.emergencyContactNumber || "not set";
            const addr = SettingsService.state.homeAddress || "not set";
            const sharing = SettingsService.state.liveLocationSharingEnabled ? "enabled" : "disabled";
            SpeechService.announce(`Emergency contact is ${name}, number is ${num}. Home address is ${addr}. Live location sharing is ${sharing}.`);
            return true;
        }
        return false;
    }

    let liveLocationTimer = null;

    function startLiveLocationInterval() {
        stopLiveLocationInterval();
        const intervalMs = SettingsService.state.liveLocationSharingInterval * 1000;
        console.log(`[LocationSystem] Starting Live Location loop at interval: ${intervalMs}ms`);
        
        liveLocationTimer = setInterval(async () => {
            if (!SettingsService.state.liveLocationSharingEnabled) {
                stopLiveLocationInterval();
                return;
            }

            if (!navigator.geolocation) return;

            navigator.geolocation.getCurrentPosition(async (pos) => {
                const lat = pos.coords.latitude;
                const lon = pos.coords.longitude;
                console.log(`[LocationSystem] Live location updated: ${lat}, ${lon}`);
                
                const timestamp = new Date().toLocaleString();
                const mapUrl = `https://maps.google.com/?q=${lat},${lon}`;
                const liveMessage = `Live Location Update\n\nNAZAR location update:\n${mapUrl}\n\nTime: ${timestamp}`;
                const payload = {
                    timestamp,
                    locationLink: mapUrl,
                    latitude: lat,
                    longitude: lon,
                    contactNumber: SettingsService.state.emergencyContactNumber || '',
                    message: liveMessage
                };

                // Live location: notify via push/webhook only.
                // SMS is reserved for real SOS emergencies (triggerSOSDispatch).
                const liveDispatchers = ['push', 'webhook'];
                for (const name of liveDispatchers) {
                    if (EmergencyService.dispatchers[name]) {
                        EmergencyService.dispatchers[name].sendAlert(payload).catch(e =>
                            console.warn(`[LocationSystem] ${name} dispatcher failed:`, e.message)
                        );
                    }
                }

            }, (err) => {
                console.warn("[LocationSystem] Live sharing geolocation query failed:", err);
            });
        }, intervalMs);
    }

    function stopLiveLocationInterval() {
        if (liveLocationTimer) {
            clearInterval(liveLocationTimer);
            liveLocationTimer = null;
            console.log("[LocationSystem] Live Location loop stopped.");
        }
    }



    function checkConfirmationResponse(transcript) {
        return false;
    }

    // --- 9. VOICE COMMAND SERVICE ---(Web Speech Recognition API) ---
    const VoiceCommandService = {
        recognition: null,
        isListening: false,

        init() {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (!SpeechRecognition) {
                console.warn("Speech Recognition API is not supported in this browser.");
                return;
            }

            this.recognition = new SpeechRecognition();
            this.recognition.continuous = false;
            this.recognition.interimResults = false;
            this.recognition.lang = 'en-US';

            this.recognition.onstart = () => {
                this.isListening = true;
                this.updateUI("Listening...");
            };

            this.recognition.onresult = (e) => {
                const transcript = e.results[0][0].transcript.trim().toLowerCase();
                console.log("Voice command parsed: ", transcript);

                // Check for safety confirmation loop response first
                const confirmed = checkConfirmationResponse(transcript);
                if (confirmed) {
                    this.updateUI("Voice command recognized");
                    return;
                }

                if (transcript.includes("describe surroundings") || transcript.includes("describe") || transcript.includes("scan now")) {
                    this.updateUI("Voice command recognized");
                    triggerDescribeSurroundings(false);
                } else if (transcript.includes("repeat description") || transcript.includes("repeat") || transcript.includes("repeat last scan")) {
                    this.updateUI("Voice command recognized");
                    SpeechService.repeat();
                } else if (transcript.includes("stop speaking") || transcript.includes("silence") || transcript.includes("stop speech")) {
                    this.updateUI("Voice command recognized");
                    window.speechSynthesis.cancel();
                } else if (transcript.includes("continue reading") || transcript.includes("read more")) {
                    this.updateUI("Voice command recognized");
                    if (window.pendingOcrText) {
                        const textToSpeak = window.pendingOcrText;
                        if (textToSpeak.length > 500) {
                            const truncatedText = textToSpeak.slice(0, 500);
                            window.pendingOcrText = textToSpeak.slice(500);
                            SpeechService.announce(truncatedText + "... Say continue reading to hear the rest.");
                        } else {
                            window.pendingOcrText = null;
                            SpeechService.announce(textToSpeak);
                        }
                    } else {
                        SpeechService.announce("No further text to read.");
                    }
                } else if (transcript.includes("enable continuous") || transcript.includes("continuous scan")) {
                    this.updateUI("Voice command recognized");
                    isContinuousScanning = true;
                    startContinuousScanning();
                    updateContinuousButtonUI();
                    SpeechService.announce("Continuous scanning activated.");
                } else if (transcript.includes("disable continuous") || transcript.includes("stop continuous")) {
                    this.updateUI("Voice command recognized");
                    isContinuousScanning = false;
                    stopContinuousScanning();
                    updateContinuousButtonUI();
                    SpeechService.announce("Continuous scanning deactivated.");
                } else if (transcript.includes("read text") || transcript.includes("ocr mode")) {
                    this.updateUI("Voice command recognized");
                    isOcrMode = true;
                    updateModeButtonUI();
                    SpeechService.announce("OCR text reading mode active.");
                } else if (transcript.includes("scene mode") || transcript.includes("describe mode")) {
                    this.updateUI("Voice command recognized");
                    isOcrMode = false;
                    updateModeButtonUI();
                    SpeechService.announce("Scene description mode active.");
                } else if (transcript.includes("where am i") || transcript.includes("where is my location") || transcript.includes("current location")) {
                    this.updateUI("Voice command recognized");
                    handleWhereAmI();
                } else if (transcript.includes("emergency") || transcript.includes("help") || transcript.includes("sos")) {
                    this.updateUI("Voice command recognized");
                    handleEmergencySOS();
                } else if (transcript.includes("find nearby")) {
                    this.updateUI("Voice command recognized");
                    handleNearbySearch(transcript);
                } else {
                    const matchedSetting = handleVoiceSettings(transcript);
                    if (matchedSetting) {
                        this.updateUI("Voice command recognized");
                    } else {
                        this.updateUI("Command not recognized");
                        SpeechService.announce("Command not recognized. Please try again.");
                    }
                }
            };

            this.recognition.onerror = (e) => {
                console.error("Speech recognition error: ", e.error);
                this.updateUI("Voice recognition failure");
                SpeechService.announce("Voice command failed.");
                this.stop();
            };

            this.recognition.onend = () => {
                this.isListening = false;
                const micBtn = document.getElementById('mic-btn');
                if (micBtn) {
                    micBtn.classList.remove('active');
                    micBtn.style.backgroundColor = 'var(--primary)';
                }
                setTimeout(() => {
                    const statusText = document.getElementById('scan-status-text');
                    if (statusText && state.currentTab === 'camera') {
                        statusText.innerText = "Scanning surroundings...";
                    }
                }, 2000);
            };
        },

        start() {
            if (!this.recognition) return;
            if (this.isListening) {
                this.stop();
                return;
            }

            SpeechService.announce("Listening");
            try {
                this.recognition.start();
            } catch (err) {
                console.warn("Failed to start speech recognition loop: ", err);
            }
        },

        stop() {
            if (this.recognition && this.isListening) {
                this.recognition.abort();
            }
        },

        updateUI(status) {
            const statusText = document.getElementById('scan-status-text');
            if (statusText) {
                statusText.innerText = status;
            }
        }
    };

    // --- 7. UI ROUTING & EVENT BINDING ---
    const state = {
        currentTab: 'home',
        assistantActive: false
    };

    const navItems = document.querySelectorAll('.nav-item');
    const screenPanels = document.querySelectorAll('.screen-panel');

    async function switchTab(tabId) {
        state.currentTab = tabId;

        if (tabId === 'camera') {
            await CameraPermissionManager.checkStatus();
            if (CameraPermissionManager.state === 'granted') {
                await CameraService.start();
            } else {
                const hasStream = await CameraService.start();
                if (hasStream) {
                    CameraPermissionManager.state = 'granted';
                }
                CameraPermissionManager.updateUI();
            }
        } else {
            CameraService.stop();
            VoiceCommandService.stop();
            stopContinuousScanning();
        }

        navItems.forEach(item => {
            if (item.getAttribute('data-target') === tabId) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });

        document.querySelectorAll('.desktop-nav-item').forEach(item => {
            if (item.getAttribute('data-target') === tabId) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });

        screenPanels.forEach(panel => {
            if (panel.id === `${tabId}-panel`) {
                panel.classList.add('active-panel');
            } else {
                panel.classList.remove('active-panel');
            }
        });
    }

    console.log(`[Navigation] Found ${navItems.length} bottom navigation buttons.`);
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const target = item.getAttribute('data-target');
            console.log(`[Navigation] Nav item clicked: ${target}`);
            switchTab(target);
        });
    });

    // Desktop Sidebar navigation click handlers
    document.querySelectorAll('.desktop-nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const target = item.getAttribute('data-target');
            console.log(`[Desktop Navigation] Sidebar item clicked: ${target}`);
            switchTab(target);
        });
    });

    // Keyboard Shortcuts (Alt+1: Home, Alt+2: Camera, Alt+3: Settings)
    window.addEventListener('keydown', (e) => {
        if (e.altKey) {
            if (e.key === '1') { switchTab('home'); }
            else if (e.key === '2') { switchTab('camera'); }
            else if (e.key === '3') { switchTab('settings'); }
        }
    });

    let isAnalyzing = false;
    let isOcrMode = false;
    let isContinuousScanning = false;
    let continuousScanTimer = null;
    let lastSceneState = {
        hazards: [],
        objects: [],
        navigation: ''
    };

    async function initUserSession() {
        let userId = localStorage.getItem("userId");
        let deviceId = localStorage.getItem("deviceId");

        if (!deviceId) {
            deviceId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : 'dev-' + Math.random().toString(36).slice(2, 9) + '-' + Date.now();
            localStorage.setItem("deviceId", deviceId);
        }

        if (!userId || userId.startsWith('local-')) {
            console.log("[User Session] Registering/upgrading user profile dynamically for device:", deviceId);
            try {
                const response = await fetch('/api/users', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        deviceId,
                        name: 'Nazar User',
                        provider: 'local'
                    })
                });
                if (response.ok) {
                    const result = await response.json();
                    userId = result.data._id;
                    localStorage.setItem("userId", userId);
                    console.log("[User Session] Successfully registered dynamic userId:", userId);
                } else if (!userId) {
                    userId = 'local-' + deviceId;
                    localStorage.setItem("userId", userId);
                }
            } catch (err) {
                if (!userId) {
                    userId = 'local-' + deviceId;
                    localStorage.setItem("userId", userId);
                }
            }
        } else {
            console.log("[User Session] Resolved dynamic userId from cache:", userId);
        }

        if (userId) {
            // Skip server sync for local-only IDs (backend unavailable)
            if (!userId.startsWith('local-')) {
                await loadSettingsFromServer(userId);
                await loadContactsFromServer(userId);
                await syncPendingQueue();
            } else {
                console.log("[User Session] Offline-only mode — skipping server sync.");
            }
        }
    }

    async function loadSettingsFromServer(userId) {
        try {
            const response = await fetch(`/api/settings/${userId}`);
            if (response.ok) {
                const result = await response.json();
                if (result.success && result.data) {
                    const settings = result.data;
                    SettingsService.state.voiceCommandsEnabled = settings.voiceEnabled !== undefined ? settings.voiceEnabled : SettingsService.state.voiceCommandsEnabled;
                    SettingsService.state.liveLocationSharingEnabled = settings.locationSharing !== undefined ? settings.locationSharing : SettingsService.state.liveLocationSharingEnabled;
                    SettingsService.state.darkModeEnabled = settings.darkMode !== undefined ? settings.darkMode : SettingsService.state.darkModeEnabled;
                    SettingsService.state.speechRate = settings.speechRate || 1.0;
                    SettingsService.state.speechVolume = settings.speechVolume || 1.0;
                    
                    isContinuousScanning = settings.continuousScanning !== undefined ? settings.continuousScanning : isContinuousScanning;
                    isOcrMode = settings.preferredScanMode === 'ocr';

                    localStorage.setItem('nazar-voice-commands', SettingsService.state.voiceCommandsEnabled);
                    localStorage.setItem('nazar-live-location-sharing-enabled', SettingsService.state.liveLocationSharingEnabled);
                    localStorage.setItem('nazar-dark-mode', SettingsService.state.darkModeEnabled);
                    
                    updateContinuousButtonUI();
                    updateModeButtonUI();
                    if (SettingsService.state.darkModeEnabled) {
                        document.body.classList.add('dark-mode');
                    } else {
                        document.body.classList.remove('dark-mode');
                    }
                }
            }
        } catch (err) {
            console.error("[Settings Sync] Failed to load settings:", err);
        }
    }

    async function loadContactsFromServer(userId) {
        try {
            const response = await fetch(`/api/emergency-contacts/${userId}`);
            if (response.ok) {
                const result = await response.json();
                if (result.success && result.data && result.data.length > 0) {
                    const contact = result.data[0];
                    SettingsService.state.emergencyContactName = contact.name || '';
                    SettingsService.state.emergencyContactNumber = contact.phone || '';
                    SettingsService.state.emergencyContactRelationship = contact.relationship || 'Emergency Contact';
                    localStorage.setItem("emergencyContactDbId", contact._id);
                    localStorage.setItem("nazar-emergency-contact-name", contact.name || '');
                    localStorage.setItem("nazar-emergency-contact-number", contact.phone || '');
                    localStorage.setItem("nazar-emergency-contact-relationship", contact.relationship || 'Emergency Contact');

                    if (typeof SettingsService.updateSavedContactCard === 'function') {
                        SettingsService.updateSavedContactCard();
                    }
                }
            }
        } catch (err) {
            console.error("[Contacts Sync] Failed to load contacts:", err);
        }
    }

    let settingsDebounceTimer = null;
    function queueSettingsSync() {
        if (settingsDebounceTimer) {
            clearTimeout(settingsDebounceTimer);
        }
        settingsDebounceTimer = setTimeout(async () => {
            const userId = localStorage.getItem("userId");
            if (!userId) return;

            const settingsPayload = {
                voiceEnabled: SettingsService.state.voiceCommandsEnabled,
                speechRate: SettingsService.state.speechRate || 1.0,
                speechVolume: SettingsService.state.speechVolume || 1.0,
                locationSharing: SettingsService.state.liveLocationSharingEnabled,
                darkMode: SettingsService.state.darkModeEnabled,
                continuousScanning: isContinuousScanning,
                preferredScanMode: isOcrMode ? 'ocr' : 'scene'
            };

            await executeOrQueueSync({
                type: 'settings',
                payload: settingsPayload,
                timestamp: Date.now()
            });
        }, 500);
    }

    async function syncEmergencyContact(name, phone, relationship) {
        const rel = relationship || SettingsService.state.emergencyContactRelationship || 'Emergency Contact';
        const contactId = localStorage.getItem("emergencyContactDbId");
        if (contactId) {
            await executeOrQueueSync({
                type: 'update-contact',
                contactId,
                payload: { name, phone, relationship: rel },
                timestamp: Date.now()
            });
        } else {
            await executeOrQueueSync({
                type: 'create-contact',
                payload: { name, phone, relationship: rel },
                timestamp: Date.now()
            });
        }
    }

    async function executeOrQueueSync(action) {
        if (!navigator.onLine) {
            queuePendingAction(action);
            SpeechService.announce("Offline. Action saved to pending sync queue.");
            return;
        }

        try {
            const success = await performBackendSync(action);
            if (!success) {
                queuePendingAction(action);
            }
        } catch (err) {
            console.error("[Sync Queue] Sync failed, queuing action:", err);
            queuePendingAction(action);
        }
    }

    function queuePendingAction(action) {
        let queue = [];
        try {
            queue = JSON.parse(localStorage.getItem("nazar-pending-sync-queue") || "[]");
        } catch (e) {
            queue = [];
        }
        if (action.type === 'settings') {
            queue = queue.filter(item => item.type !== 'settings');
        }
        queue.push(action);
        localStorage.setItem("nazar-pending-sync-queue", JSON.stringify(queue));
        console.log("[Sync Queue] Action queued:", action);
    }

    async function syncPendingQueue() {
        if (!navigator.onLine) return;
        
        let queue = [];
        try {
            queue = JSON.parse(localStorage.getItem("nazar-pending-sync-queue") || "[]");
        } catch (e) {
            queue = [];
        }
        if (queue.length === 0) return;

        console.log(`[Sync Queue] Synchronizing ${queue.length} pending actions...`);
        let failedActions = [];

        for (const action of queue) {
            try {
                const success = await performBackendSync(action);
                if (!success) {
                    failedActions.push(action);
                }
            } catch (err) {
                console.error("[Sync Queue] Failed to play back action:", action, err);
                failedActions.push(action);
            }
        }

        if (failedActions.length > 0) {
            localStorage.setItem("nazar-pending-sync-queue", JSON.stringify(failedActions));
        } else {
            localStorage.removeItem("nazar-pending-sync-queue");
            console.log("[Sync Queue] All pending actions successfully synchronized.");
            SpeechService.announce("Settings and contacts synchronized successfully.");
        }
    }

    async function performBackendSync(action) {
        const userId = localStorage.getItem("userId");
        if (!userId || userId.startsWith('local-')) return true;

        if (action.type === 'settings') {
            const response = await fetch(`/api/settings/${userId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(action.payload)
            });
            return response.ok;
        }

        if (action.type === 'create-contact') {
            const response = await fetch('/api/emergency-contacts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...action.payload, userId })
            });
            if (response.ok) {
                const result = await response.json();
                if (result.data) {
                    localStorage.setItem("emergencyContactDbId", result.data._id);
                }
                return true;
            }
            return false;
        }

        if (action.type === 'update-contact') {
            const contactId = action.contactId || localStorage.getItem("emergencyContactDbId");
            if (!contactId) return true;
            const response = await fetch(`/api/emergency-contacts/${contactId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(action.payload)
            });
            return response.ok;
        }

        if (action.type === 'delete-contact') {
            const contactId = action.contactId || localStorage.getItem("emergencyContactDbId");
            if (!contactId) return true;
            const response = await fetch(`/api/emergency-contacts/${contactId}`, {
                method: 'DELETE'
            });
            return response.ok;
        }

        return false;
    }

    window.addEventListener('online', syncPendingQueue);

    function startContinuousScanning() {
        stopContinuousScanning();
        console.log("[Continuous Scan] Starting 5-second interval loop.");
        continuousScanTimer = setInterval(async () => {
            if (!isContinuousScanning) {
                stopContinuousScanning();
                return;
            }
            await triggerDescribeSurroundings(true);
        }, 5000);
    }

    function stopContinuousScanning() {
        if (continuousScanTimer) {
            clearInterval(continuousScanTimer);
            continuousScanTimer = null;
            console.log("[Continuous Scan] Stopped loop.");
        }
    }

    let popupTimeoutId = null;

    function showScanPopup(text) {
        const popup = document.getElementById('scan-result-popup');
        const popupText = document.getElementById('scan-popup-text');
        if (!popup || !popupText || !text) return;

        popupText.innerText = text;
        popup.classList.add('visible');

        if (popupTimeoutId) clearTimeout(popupTimeoutId);
        popupTimeoutId = setTimeout(() => {
            hideScanPopup();
        }, 4500);
    }

    function hideScanPopup() {
        const popup = document.getElementById('scan-result-popup');
        if (popup) {
            popup.classList.remove('visible');
        }
        if (popupTimeoutId) {
            clearTimeout(popupTimeoutId);
            popupTimeoutId = null;
        }
    }

    function updateContinuousButtonUI() {
        const btn = document.getElementById('btn-continuous-toggle');
        if (btn) {
            if (isContinuousScanning) {
                btn.style.background = 'rgba(34, 197, 94, 0.25)';
                btn.style.borderColor = 'rgba(34, 197, 94, 0.4)';
            } else {
                btn.style.background = 'rgba(255, 255, 255, 0.08)';
                btn.style.borderColor = 'rgba(255, 255, 255, 0.12)';
            }
        }
    }

    function updateModeButtonUI() {
        const btn = document.getElementById('btn-mode-toggle');
        const modeLabel = document.getElementById('mode-label-text');
        if (modeLabel) {
            modeLabel.innerText = isOcrMode ? "Text Mode" : "Scene Mode";
        }
        if (btn) {
            if (isOcrMode) {
                btn.style.background = 'rgba(59, 130, 246, 0.25)';
                btn.style.borderColor = 'rgba(59, 130, 246, 0.4)';
            } else {
                btn.style.background = 'rgba(255, 255, 255, 0.08)';
                btn.style.borderColor = 'rgba(255, 255, 255, 0.12)';
            }
        }
    }

    async function triggerDescribeSurroundings(isContinuous = false) {
        if (isAnalyzing) return;

        // Offline check
        if (!navigator.onLine) {
            const offlineMsg = "No internet connection. Vision analysis unavailable.";
            SpeechService.announce(offlineMsg);
            showScanPopup(offlineMsg);
            return;
        }

        isAnalyzing = true;
        console.log("[Vision System] triggerDescribeSurroundings invoked.");

        const describeBtn = document.getElementById('describe-btn');
        const announceStatus = document.getElementById('announce-status');
        const announceTitle = document.getElementById('announce-title');
        const announceDistance = document.getElementById('announce-distance');
        const repeatBtn = document.getElementById('repeat-btn');
        const scanBtn = document.getElementById('btn-scan-action');
        const scanLabel = scanBtn?.querySelector('.control-label');

        if (scanBtn) {
            scanBtn.disabled = true;
            scanBtn.classList.add('scanning');
        }
        if (scanLabel) {
            scanLabel.innerText = "Scanning...";
        }

        if (describeBtn && !isContinuous) {
            describeBtn.disabled = true;
            describeBtn.style.opacity = '0.7';
        }
        if (announceStatus) {
            announceStatus.innerText = "Analyzing...";
            announceStatus.classList.add('active');
        }
        if (announceTitle && !isContinuous) announceTitle.innerText = "Capturing viewport frame...";
        if (announceDistance && !isContinuous) announceDistance.innerText = "";

        if (!isContinuous) {
            SpeechService.announce(isOcrMode ? "Reading text." : "Analyzing surroundings.");
        }

        console.log("[VISION] Camera capture started");
        const rawCanvas = CameraService.captureFrame();
        if (!rawCanvas) {
            isAnalyzing = false;
            if (announceStatus) announceStatus.classList.remove('active');
            if (describeBtn) {
                describeBtn.disabled = false;
                describeBtn.style.opacity = '1';
            }
            return;
        }

        // Reuse shared canvas to avoid reallocation churn
        if (!this._resizeCanvas) {
            this._resizeCanvas = document.createElement('canvas');
            this._resizeCanvas.width = 1280;
            this._resizeCanvas.height = 720;
        }
        const resizedCanvas = this._resizeCanvas;
        const ctx = resizedCanvas.getContext('2d');
        ctx.drawImage(rawCanvas, 0, 0, 1280, 720);

        const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
        const formatType = 'image/jpeg';
        if (!validTypes.includes(formatType)) {
            console.warn(`[Vision System] Invalid format ${formatType}. JPEG, PNG, WebP only.`);
            isAnalyzing = false;
            if (announceStatus) announceStatus.classList.remove('active');
            if (describeBtn) {
                describeBtn.disabled = false;
                describeBtn.style.opacity = '1';
            }
            return;
        }

        const base64Img = resizedCanvas.toDataURL(formatType, 0.8);
        const payloadSize = (base64Img.length * (3/4)) / (1024 * 1024); // in MB
        console.log(`[VISION] Image compressed, size: ${payloadSize.toFixed(2)} MB`);
        if (payloadSize > 5) {
            console.warn(`[Vision System] Image size ${payloadSize.toFixed(2)}MB exceeds 5MB limit. Aborting.`);
            isAnalyzing = false;
            if (announceStatus) announceStatus.classList.remove('active');
            if (describeBtn) {
                describeBtn.disabled = false;
                describeBtn.style.opacity = '1';
            }
            return;
        }

        try {
            const endpoint = '/api/scan';
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 60000);

            console.log("[VISION] Sending request to Gemini via /api/scan...");
            let response;
            try {
                response = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        userId: localStorage.getItem("userId") || null,
                        image: base64Img,
                        ocrMode: isOcrMode
                    }),
                    signal: controller.signal
                });
            } catch (fetchErr) {
                if (fetchErr.name === 'AbortError') {
                    throw new Error('timeout');
                }
                throw fetchErr;
            } finally {
                clearTimeout(timeoutId);
            }

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.message || `Server status ${response.status}`);
            }

            const data = await response.json();
            console.log("[VISION] Gemini response received:", data);

            // Update Desktop Live AI Panel dynamically
            const latencyMs = Math.round(performance.now() - (scanStartTime || performance.now()));
            updateDesktopLiveAiPanel(data, latencyMs);

            const filteredHazards = data.hazards || [];
            const filteredObjects = data.objects || [];

            // Change detection
            if (isContinuous) {
                const sameHazards = JSON.stringify(filteredHazards.sort()) === JSON.stringify(lastSceneState.hazards.sort());
                const sameObjects = JSON.stringify(filteredObjects.sort()) === JSON.stringify(lastSceneState.objects.sort());
                const sameNav = data.navigation === lastSceneState.navigation;
                
                if (sameHazards && sameObjects && sameNav) {
                    console.log("[Continuous Scan] Scene unchanged. Skipping announcement.");
                    isAnalyzing = false;
                    if (announceStatus) announceStatus.classList.remove('active');
                    return;
                }
            }

            // Save state for next comparison
            lastSceneState = {
                hazards: filteredHazards,
                objects: filteredObjects,
                navigation: data.navigation || ''
            };

            // Emergency Hazard Prioritization Override
            const criticalHazardList = [
                'stairs', 'vehicle', 'vehicles', 'bicycle', 'bicycles', 
                'road crossing', 'road crossings', 'construction zone', 'construction zones', 
                'open pit', 'open pits', 'fire', 'smoke', 'wet floor', 'wet floors',
                'low hanging obstacle', 'low hanging obstacles', 'moving object', 'moving objects',
                'crowded pathway', 'crowded pathways'
            ];

            let speechAnnouncement = data.summary;
            let emergencyTriggered = false;

            for (const h of filteredHazards) {
                const lowerH = h.toLowerCase();
                const matched = criticalHazardList.some(crit => lowerH.includes(crit));
                if (matched) {
                    speechAnnouncement = `Warning. ${h} detected ahead. Please proceed carefully.`;
                    emergencyTriggered = true;
                    break;
                }
            }

            // OCR reading limit (500 chars)
            if (isOcrMode && data.textDetected && data.textDetected.length > 0) {
                const fullText = data.textDetected.join(" ");
                if (fullText.length > 500) {
                    const truncatedText = fullText.slice(0, 500);
                    speechAnnouncement = `${truncatedText}... End of preview. Say continue reading to hear the rest.`;
                    window.pendingOcrText = fullText.slice(500);
                } else {
                    speechAnnouncement = fullText;
                    window.pendingOcrText = null;
                }
            } else {
                window.pendingOcrText = null;
            }

            if (announceTitle) {
                announceTitle.innerText = "Tap to describe";
            }

            const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            if (announceDistance) {
                announceDistance.innerText = `Analysis complete at ${timestamp}`;
            }

            if (repeatBtn) {
                repeatBtn.disabled = false;
                repeatBtn.style.opacity = '1';
            }

            SpeechService.announce(speechAnnouncement);
            showScanPopup(speechAnnouncement);

        } catch (err) {
            console.error("[Vision System] Advanced vision request failed:", err);
            const errDescription = err.message === 'timeout' ? 'Scan timed out' : 'Analysis failed';
            
            SpeechService.announce(errDescription);
            showScanPopup(errDescription);
        } finally {
            isAnalyzing = false;
            const scanBtn = document.getElementById('btn-scan-action');
            const scanLabel = scanBtn?.querySelector('.control-label');
            if (scanBtn) {
                scanBtn.disabled = false;
                scanBtn.classList.remove('scanning');
            }
            if (scanLabel) {
                scanLabel.innerText = "Scan";
            }
            if (announceStatus) announceStatus.classList.remove('active');
            if (describeBtn) {
                describeBtn.disabled = false;
                describeBtn.style.opacity = '1';
            }
        }
    }

    // Home assistant Orb trigger
    const startAssistantBtn = document.getElementById('start-assistant-btn');
    const assistantOrb = document.getElementById('assistant-orb');
    const assistantGlow = document.getElementById('assistant-glow');
    const assistantText = document.getElementById('assistant-text');

    if (startAssistantBtn) {
        startAssistantBtn.addEventListener('click', () => {
            state.assistantActive = !state.assistantActive;
            if (state.assistantActive) {
                startAssistantBtn.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg> Stop Assistant
                `;
                startAssistantBtn.style.backgroundColor = 'var(--danger)';
                startAssistantBtn.style.boxShadow = '0 8px 24px rgba(239, 68, 68, 0.25)';
                if (assistantOrb) assistantOrb.style.animation = 'orbFloat 2.5s infinite ease-in-out, orbPulse 1.2s infinite ease-in-out';
                if (assistantGlow) assistantGlow.style.background = 'radial-gradient(circle, rgba(59, 130, 246, 0.75) 0%, rgba(37, 99, 235, 0.25) 50%, rgba(37, 99, 235, 0) 70%)';
                if (assistantText) assistantText.innerText = "Monitoring surrounding path actively...";
                
                SpeechService.announce("Camera ready. Point your phone ahead.");
                switchTab('camera');
            } else {
                startAssistantBtn.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg> Start Assistant
                `;
                startAssistantBtn.style.backgroundColor = 'var(--primary)';
                startAssistantBtn.style.boxShadow = 'var(--shadow-glow)';
                if (assistantOrb) assistantOrb.style.animation = 'orbFloat 5s infinite ease-in-out';
                if (assistantGlow) assistantGlow.style.background = 'radial-gradient(circle, rgba(59, 130, 246, 0.4) 0%, rgba(37, 99, 235, 0.1) 50%, rgba(37, 99, 235, 0) 70%)';
                if (assistantText) assistantText.innerText = "Ready whenever you need assistance.";
                
                SpeechService.announce("Assistant deactivated.");
            }
        });
    }

    // Home Quick Actions binding
    const actionScan = document.getElementById('action-scan');
    const actionSos = document.getElementById('action-sos');
    const actionActivity = document.getElementById('action-activity');

    if (actionScan) actionScan.addEventListener('click', () => switchTab('camera'));
    if (actionSos) {
        actionSos.addEventListener('click', () => {
            const sosModal = document.getElementById('sos-modal');
            if (sosModal) sosModal.classList.add('modal-active');
            SpeechService.announce("SOS emergency menu triggered. Confirmed action will share coordinates.");
        });
    }
    if (actionActivity) {
        actionActivity.addEventListener('click', () => {
            const overlay = document.getElementById('drawer-overlay');
            const drawer = document.getElementById('drawer-content');
            if (overlay) overlay.classList.add('drawer-active');
            if (drawer) drawer.style.transform = 'translateY(0)';
            SpeechService.announce("Opening recent activity log.");
        });
    }

    // Camera Page Buttons binding
    const describeBtn = document.getElementById('describe-btn');
    if (describeBtn) describeBtn.addEventListener('click', triggerDescribeSurroundings);

    const repeatBtn = document.getElementById('repeat-btn');
    if (repeatBtn) {
        repeatBtn.addEventListener('click', () => {
            SpeechService.repeat();
        });
    }

    // Circular Microphone (Voice commands on demand activation)
    const micBtn = document.getElementById('mic-btn');
    if (micBtn) {
        micBtn.addEventListener('click', () => {
            if (SettingsService.state.voiceCommandsEnabled) {
                micBtn.classList.toggle('active');
                if (micBtn.classList.contains('active')) {
                    micBtn.style.backgroundColor = 'var(--danger)';
                    VoiceCommandService.start();
                } else {
                    micBtn.style.backgroundColor = 'var(--primary)';
                    VoiceCommandService.stop();
                }
            } else {
                SpeechService.announce("Voice commands are disabled. Please enable them in settings.");
            }
        });
    }

    // SOS modal handlers
    const cancelSosBtn = document.getElementById('cancel-sos');
    const confirmSosBtn = document.getElementById('confirm-sos');
    const imSafeBtn = document.getElementById('btn-im-safe');
    const sosModal = document.getElementById('sos-modal');
    const drawerOverlay = document.getElementById('drawer-overlay');
    const drawerContent = document.getElementById('drawer-content');
    const drawerCloseBtn = document.getElementById('drawer-close');
    const notificationBtn = document.getElementById('notification-btn');
    const cameraSwapBtn = document.getElementById('camera-swap-btn');

    if (cancelSosBtn) {
        cancelSosBtn.addEventListener('click', () => {
            sosModal.classList.remove('modal-active');
            SpeechService.announce("SOS cancelled.");
        });
    }

    if (imSafeBtn) {
        imSafeBtn.addEventListener('click', async () => {
            if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
            SpeechService.announce("Emergency mode ended.");

            imSafeBtn.style.display = 'none';
            if (confirmSosBtn) {
                confirmSosBtn.style.display = 'block';
                confirmSosBtn.innerText = "Press & Hold to Confirm (3s)";
                confirmSosBtn.style.backgroundColor = '';
            }

            if (sosModal) sosModal.classList.remove('modal-active');

            let contactsList = [];
            try {
                contactsList = JSON.parse(localStorage.getItem('nazar-emergency-contacts-list') || '[]');
            } catch (e) {
                contactsList = [];
            }
            if (contactsList.length === 0) {
                const email = SettingsService.state.emergencyContactEmail || localStorage.getItem("nazar-emergency-contact-email");
                const name = SettingsService.state.emergencyContactName || localStorage.getItem("nazar-emergency-contact-name");
                if (email) contactsList.push({ name, email });
            }

            const validEmailContacts = contactsList.filter(c => c.email && c.email.includes('@'));
            if (validEmailContacts.length > 0 && navigator.onLine) {
                try {
                    await fetch('/api/emergency/send-safe-email', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            contacts: validEmailContacts,
                            date: new Date().toLocaleDateString(),
                            time: new Date().toLocaleTimeString()
                        })
                    });
                    SpeechService.announce("Safety update email sent to emergency contacts.");
                } catch (safeErr) {
                    console.warn("[EmergencySystem] Safe update email error:", safeErr);
                }
            }
        });
    }
    
    if (confirmSosBtn) {
        let sosTimer = null;
        let countdownVal = 3;

        const startHold = (e) => {
            e.preventDefault();

            // 60-Second Cooldown Check
            const lastTs = parseInt(localStorage.getItem('nazar-last-emergency-timestamp') || '0');
            const now = Date.now();
            const elapsed = Math.floor((now - lastTs) / 1000);
            const cooldownRemaining = 60 - elapsed;

            if (cooldownRemaining > 0) {
                SpeechService.announce("An emergency alert was recently sent. Please wait before sending another.");
                const notice = document.getElementById('sos-cooldown-notice');
                if (notice) {
                    notice.innerText = `Please wait ${cooldownRemaining}s before sending another alert.`;
                    notice.style.display = 'block';
                }
                if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
                return;
            } else {
                const notice = document.getElementById('sos-cooldown-notice');
                if (notice) notice.style.display = 'none';
            }

            const email = SettingsService.state.emergencyContactEmail || localStorage.getItem("nazar-emergency-contact-email") || '';
            let contactsList = [];
            try {
                contactsList = JSON.parse(localStorage.getItem('nazar-emergency-contacts-list') || '[]');
            } catch (e) {
                contactsList = [];
            }
            const hasEmail = email || contactsList.some(c => c.email && c.email.includes('@'));

            if (!hasEmail) {
                SpeechService.announce("Emergency contact email not configured. Please add contact email in Settings.");
                if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
                return;
            }

            countdownVal = 3;
            confirmSosBtn.innerText = `Holding... (3s)`;
            confirmSosBtn.style.backgroundColor = 'var(--danger)';
            
            if (navigator.vibrate) navigator.vibrate([100]);
            SpeechService.announce("Hold to activate emergency.");

            sosTimer = setInterval(() => {
                countdownVal--;
                if (countdownVal > 0) {
                    confirmSosBtn.innerText = `Holding... (${countdownVal}s)`;
                    if (navigator.vibrate) navigator.vibrate([100]);
                    SpeechService.announce(`${countdownVal}...`);
                } else {
                    clearInterval(sosTimer);
                    sosTimer = null;
                    confirmSosBtn.innerText = "Emergency Activated!";
                    confirmSosBtn.style.backgroundColor = 'var(--success)';
                    
                    if (navigator.vibrate) navigator.vibrate([400, 100, 400]);
                    SpeechService.announce("Emergency activated.");
                    
                    setTimeout(() => {
                        SpeechService.announce("Getting your current location.");
                        executeEmergencySOS(false);
                    }, 400);
                }
            }, 1000);
        };

        const cancelHold = () => {
            if (sosTimer) {
                clearInterval(sosTimer);
                sosTimer = null;
                confirmSosBtn.innerText = "Press & Hold to Confirm (3s)";
                confirmSosBtn.style.backgroundColor = '';
                SpeechService.announce("Emergency cancelled.");
            }
        };

        confirmSosBtn.addEventListener('mousedown', startHold);
        confirmSosBtn.addEventListener('touchstart', startHold);
        confirmSosBtn.addEventListener('mouseup', cancelHold);
        confirmSosBtn.addEventListener('mouseleave', cancelHold);
        confirmSosBtn.addEventListener('touchend', cancelHold);
    }

    // Activity Drawer close
    function closeActivityDrawer() {
        drawerOverlay.classList.remove('drawer-active');
        drawerContent.classList.remove('drawer-active');
        drawerContent.style.transform = 'translateY(100%)';
    }
    if (drawerCloseBtn) drawerCloseBtn.addEventListener('click', closeActivityDrawer);
    if (drawerOverlay) drawerOverlay.addEventListener('click', closeActivityDrawer);
    if (notificationBtn) {
        notificationBtn.addEventListener('click', () => {
            drawerOverlay.classList.add('drawer-active');
            drawerContent.classList.add('drawer-active');
            drawerContent.style.transform = 'translateY(0)';
            SpeechService.announce("Opening activity logs.");
        });
    }

    // Camera Swap trigger
    if (cameraSwapBtn) {
        cameraSwapBtn.addEventListener('click', () => {
            CameraService.toggleCamera();
        });
    }

    // Viewfinder Gestures (Single Tap to repeat, Double Tap to describe, Long Press for Voice Command)
    const cameraPanel = document.getElementById('camera-panel');
    if (cameraPanel) {
        let tapTimeout = null;
        let lastTapTime = 0;
        let pressTimeout = null;

        const handleGestureStart = (e) => {
            if (e.target.closest('button') || e.target.closest('.announcement-card')) {
                return;
            }
            pressTimeout = setTimeout(() => {
                if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
                
                // Long Press -> Voice command mode (Activate mic)
                const micBtn = document.getElementById('mic-btn');
                if (micBtn) {
                    micBtn.click();
                }
                pressTimeout = null;
            }, 800);
        };

        const handleGestureEnd = (e) => {
            if (pressTimeout) {
                clearTimeout(pressTimeout);
                pressTimeout = null;
                
                if (e.target.closest('button') || e.target.closest('.announcement-card')) {
                    return;
                }
                
                const now = Date.now();
                const diff = now - lastTapTime;
                
                if (diff < 300) {
                    // Double Tap -> Describe surroundings
                    if (tapTimeout) {
                        clearTimeout(tapTimeout);
                        tapTimeout = null;
                    }
                    triggerDescribeSurroundings();
                } else {
                    // Single Tap -> Repeat description
                    tapTimeout = setTimeout(() => {
                        SpeechService.repeat();
                        tapTimeout = null;
                    }, 300);
                }
                lastTapTime = now;
            }
        };

        cameraPanel.addEventListener('touchstart', handleGestureStart);
        cameraPanel.addEventListener('touchend', handleGestureEnd);
        cameraPanel.addEventListener('mousedown', handleGestureStart);
        cameraPanel.addEventListener('mouseup', handleGestureEnd);
    }

    /**
     * Dynamically updates the Desktop Live AI Results Panel (25% split column)
     * with real-time scan data from the Gemini Vision API response.
     */
    function updateDesktopLiveAiPanel(data, latencyMs) {
        if (!data) return;
        const badge = document.getElementById('desktop-ai-status-badge');
        const statusText = document.getElementById('desktop-ai-status-text');
        const sceneDesc = document.getElementById('desktop-scene-desc');
        const objList = document.getElementById('desktop-detected-objects');
        const hazardBox = document.getElementById('desktop-hazards-box');
        const hazardText = document.getElementById('desktop-hazards-text');
        const ocrText = document.getElementById('desktop-ocr-text');
        const navText = document.getElementById('desktop-nav-guidance');
        const confVal = document.getElementById('desktop-confidence-val');
        const confBar = document.getElementById('desktop-confidence-bar');
        const procTime = document.getElementById('desktop-processing-time');
        const lastUpdated = document.getElementById('desktop-last-updated');

        if (badge) {
            badge.textContent = 'Active';
            badge.className = 'ai-status-badge active';
        }
        if (statusText) statusText.textContent = 'Analysis Complete';
        if (sceneDesc) sceneDesc.textContent = data.summary || 'Scene analyzed successfully.';

        if (objList) {
            const objects = data.objects || [];
            if (objects.length > 0) {
                objList.innerHTML = objects.map(o => `<li><span>${o}</span></li>`).join('');
            } else {
                objList.innerHTML = '<li class="ai-empty-item">No specific objects detected</li>';
            }
        }

        if (hazardBox && hazardText) {
            const hazards = data.hazards || [];
            if (hazards.length > 0) {
                hazardBox.className = 'ai-hazard-box warning';
                hazardText.textContent = `⚠️ Warning: ${hazards.join(', ')}`;
            } else {
                hazardBox.className = 'ai-hazard-box safe';
                hazardText.textContent = '✅ No immediate hazards detected';
            }
        }

        if (ocrText) {
            ocrText.textContent = (data.textDetected && data.textDetected.length > 0) 
                ? data.textDetected.join(' ') 
                : 'No text detected';
        }

        if (navText) navText.textContent = data.navigation || 'Path is clear. Proceed with normal caution.';

        const confidenceScore = typeof data.confidence === 'number' ? Math.round(data.confidence * 100) : 92;
        if (confVal) confVal.textContent = `${confidenceScore}%`;
        if (confBar) confBar.style.width = `${confidenceScore}%`;

        if (procTime) procTime.textContent = `${latencyMs || 1200} ms`;
        if (lastUpdated) lastUpdated.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }

    // --- 9. LIFECYCLE PAGE VISIBILITY BINDINGS ---
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            CameraService.pauseOnHidden();
        } else {
            CameraService.resumeOnVisible();
        }
    });

    // --- 11. JUST-IN-TIME (JIT) BACKGROUND WARMUP ---
    const triggerWarmup = () => {
        if (DetectionService.worker || DetectionService.workerLoadFailed) return;
        console.log("User transition detected. Warming up background Web Worker...");
        DetectionService.initWorker();
    };

    const bindWarmupListeners = () => {
        const targets = [
            document.getElementById('action-scan'),
            document.getElementById('start-assistant-btn')
        ];

        targets.forEach(el => {
            if (el) {
                // Initialize model warmup immediately when the user clicks any camera page link
                el.addEventListener('click', triggerWarmup, { once: true });
            }
        });

        // Bind warmup triggers to all camera nav buttons (both sidebar and bottom-nav)
        document.querySelectorAll('.nav-item[data-target="camera"]').forEach(el => {
            el.addEventListener('click', triggerWarmup, { once: true });
        });
    };

    // --- 10. PWA SERVICE WORKER REGISTRATION ---
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('service-worker.js')
                .then(reg => {
                    console.log('ServiceWorker registered with scope: ', reg.scope);
                    bindWarmupListeners();
                })
                .catch(err => {
                    console.warn('ServiceWorker registration failed: ', err);
                    bindWarmupListeners();
                });
        });
    } else {
        bindWarmupListeners();
    }

    // --- 12. INITIALIZATION RUN ---
    Telemetry.init();
    SettingsService.initUI();
    VoiceCommandService.init();

    // Initialize location service provider and live tracking loop if active
    if (SettingsService.state.preferredLocationProvider) {
        LocationService.setProvider(SettingsService.state.preferredLocationProvider);
    }
    if (SettingsService.state.liveLocationSharingEnabled) {
        startLiveLocationInterval();
    }

    // Bind Camera Permission buttons
    const btnEnableCamera = document.getElementById('btn-enable-camera');
    const btnTryAgain = document.getElementById('btn-try-again');
    const btnOpenSettings = document.getElementById('btn-open-settings');

    if (btnEnableCamera) {
        btnEnableCamera.addEventListener('click', () => {
            CameraPermissionManager.requestPermission();
        });
    }
    if (btnTryAgain) {
        btnTryAgain.addEventListener('click', () => {
            CameraPermissionManager.requestPermission();
        });
    }
    if (btnOpenSettings) {
        btnOpenSettings.addEventListener('click', () => {
            SpeechService.announce("Please open your browser settings to grant camera access.");
            alert("To grant camera permissions:\n1. Click the permissions/lock icon in the URL bar.\n2. Toggle 'Camera' access to Allow.\n3. Refresh this page to start scanning.");
        });
    }

    // Bind scanner controls row (compact vision bar buttons)
    const scanBtn = document.getElementById('btn-scan-action');
    if (scanBtn) {
        scanBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            triggerDescribeSurroundings(false);
        });
    }

    const popupCloseBtn = document.getElementById('scan-popup-close');
    if (popupCloseBtn) {
        popupCloseBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            hideScanPopup();
        });
    }

    const modeBtn = document.getElementById('btn-mode-toggle');
    if (modeBtn) {
        modeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            isOcrMode = !isOcrMode;
            if (isOcrMode) {
                SpeechService.announce("OCR text reading mode active.");
            } else {
                SpeechService.announce("Scene description mode active.");
            }
            updateModeButtonUI();
            if (typeof queueSettingsSync === 'function') {
                queueSettingsSync();
            }
        });
    }

    const stopSpeechBtn = document.getElementById('btn-stop-speech');
    if (stopSpeechBtn) {
        stopSpeechBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            window.speechSynthesis.cancel();
            SpeechService.announce("Speech stopped.");
        });
    }

    // Resolve user session and sync settings/contacts
    if (typeof initUserSession === 'function') {
        initUserSession();
    }

    // Initial check of camera permissions
    CameraPermissionManager.checkStatus();

    // Initial greeting narration (accelerated for instant accessibility response)
    setTimeout(() => {
        SpeechService.announce("Welcome to Nazar, your AI navigation companion. Ready to assist.");
    }, 2000);
});
