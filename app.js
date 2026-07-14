/* NAZAR Premium Accessibility App - High-Performance Optimized JS Vision Engine */

document.addEventListener('DOMContentLoaded', () => {
    
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
            cloudAiEnabled: false,
            florenceEndpoint: '',
            voiceCommandsEnabled: false,
            speechOutputEnabled: true,
            vibrationAlertsEnabled: true,
            darkModeEnabled: false
        },

        load() {
            this.state.cloudAiEnabled = localStorage.getItem('nazar-cloud-ai') === 'true';
            this.state.florenceEndpoint = localStorage.getItem('nazar-florence-endpoint') || '';
            this.state.voiceCommandsEnabled = localStorage.getItem('nazar-voice-commands') === 'true';
            this.state.speechOutputEnabled = localStorage.getItem('nazar-speech-output') !== 'false';
            this.state.vibrationAlertsEnabled = localStorage.getItem('nazar-vibration-alerts') !== 'false';
            this.state.darkModeEnabled = localStorage.getItem('nazar-dark-mode') === 'true';
        },

        save(key, value) {
            this.state[key] = value;
            localStorage.setItem(`nazar-${this.kebabCase(key)}`, value);
            this.syncStatusBadge();
        },

        kebabCase(str) {
            return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
        },

        initUI() {
            this.load();
            
            const toggleCloudAi = document.getElementById('toggle-cloud-ai');
            const inputEndpoint = document.getElementById('input-florence-endpoint');
            const toggleVoice = document.getElementById('toggle-voice-commands');
            const toggleSpeech = document.getElementById('toggle-speech-output');
            const toggleVibrate = document.getElementById('toggle-vibration-alerts');
            const toggleDark = document.getElementById('toggle-dark-mode');

            if (toggleCloudAi) {
                toggleCloudAi.checked = this.state.cloudAiEnabled;
                toggleCloudAi.addEventListener('change', (e) => {
                    this.save('cloudAiEnabled', e.target.checked);
                    SpeechService.announce(e.target.checked ? "Cloud AI description enabled" : "Cloud AI description disabled");
                });
            }

            if (inputEndpoint) {
                inputEndpoint.value = this.state.florenceEndpoint;
                inputEndpoint.addEventListener('input', (e) => {
                    this.save('florenceEndpoint', e.target.value.trim());
                });
            }

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

            this.syncStatusBadge();
        },

        syncStatusBadge() {
            const badge = document.getElementById('cloud-ai-status-badge');
            if (!badge) return;

            if (this.state.cloudAiEnabled) {
                if (this.state.florenceEndpoint) {
                    badge.innerText = "Active Proxy";
                    badge.className = "status-indicator-badge status-connected";
                } else {
                    badge.innerText = "Config Required";
                    badge.className = "status-indicator-badge status-error";
                }
            } else {
                badge.innerText = "Inactive";
                badge.className = "status-indicator-badge";
            }
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
            utterance.rate = 1.0;
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
        
        // Single offscreen canvas reused throughout camera session to reduce memory thrashing
        canvas: document.createElement('canvas'),

        async start() {
            this.stopRequested = false;
            if (this.isStarting) return;
            this.isStarting = true;

            const startCamTime = performance.now();
            const video = document.getElementById('camera-stream');
            const fallback = document.getElementById('camera-fallback-img');
            if (!video) {
                this.isStarting = false;
                return;
            }

            try {
                const mediaStream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'environment' }
                });

                if (this.stopRequested) {
                    mediaStream.getTracks().forEach(track => track.stop());
                    this.isStarting = false;
                    return;
                }

                this.stream = mediaStream;
                video.srcObject = this.stream;
                video.style.display = 'block';
                if (fallback) fallback.style.display = 'none';

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
            } catch (err) {
                console.warn("MediaDevices camera access failed, fallback active.", err);
                video.style.display = 'none';
                if (fallback) fallback.style.display = 'block';
                
                if (!this.stopRequested) {
                    setTimeout(() => {
                        if (!this.stopRequested) {
                            DetectionService.start(fallback);
                        }
                    }, 1000);
                }
            } finally {
                this.isStarting = false;
            }
        },

        stop() {
            this.stopRequested = true;
            DetectionService.stop();

            const video = document.getElementById('camera-stream');
            const fallback = document.getElementById('camera-fallback-img');
            
            if (this.stream) {
                this.stream.getTracks().forEach(track => track.stop());
                this.stream = null;
            }
            if (video) {
                video.srcObject = null;
                video.style.display = 'none';
            }
            if (fallback) fallback.style.display = 'block';
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
                this.start();
            }
        },

        // Fast image processing and frame resizing (compressed to standard 640x480 size)
        captureFrame() {
            const video = document.getElementById('camera-stream');
            const fallback = document.getElementById('camera-fallback-img');
            
            const maxW = 640;
            const maxH = 480;

            let sourceEl = null;
            let srcWidth = 0;
            let srcHeight = 0;

            if (video && video.style.display !== 'none' && video.readyState === video.HAVE_ENOUGH_DATA) {
                sourceEl = video;
                srcWidth = video.videoWidth;
                srcHeight = video.videoHeight;
            } else if (fallback) {
                sourceEl = fallback;
                srcWidth = fallback.naturalWidth;
                srcHeight = fallback.naturalHeight;
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

                // Worker Startup Safety Timeout: If worker fails to load model in 4 seconds, fallback to main thread
                setTimeout(() => {
                    if (!this.isWorkerReady && !this.workerLoadFailed) {
                        console.warn("Worker initialization timed out. Triggering main-thread fallback.");
                        this.fallbackToMainThread();
                    }
                }, 4000);

            } catch (err) {
                console.warn("Browser Web Worker instantiation blocked. Using main thread fallback: ", err);
                this.fallbackToMainThread();
            }
        },

        fallbackToMainThread() {
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

    // --- 5. FLORENCE SERVICE (Inference client + Description Caching) ---
    const FlorenceService = {
        lastDetectionsStr: '',
        lastDescription: '',
        lastDescriptionTimestamp: 0,

        async describe(canvas) {
            if (!canvas) return "No image captured.";

            // Cloud AI mode enabled
            if (SettingsService.state.cloudAiEnabled && SettingsService.state.florenceEndpoint) {
                // Optimization Check: Smart Description Caching (8-second window)
                const currentDetectionsStr = DetectionService.activeDetections
                    .map(d => `${d.class}_${d.bbox[0].toFixed(0)}`)
                    .sort()
                    .join(',');

                const now = Date.now();
                if (this.lastDetectionsStr === currentDetectionsStr && 
                    this.lastDescription && 
                    (now - this.lastDescriptionTimestamp < 8000)) {
                    console.log("Reusing cached scene description (no environment change).");
                    return this.lastDescription;
                }

                // Setup request timeouts
                const controller = new AbortController();
                const timeoutId = setTimeout(() => {
                    controller.abort();
                }, 8000); // 8 second timeout

                try {
                    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
                    
                    const response = await fetch(SettingsService.state.florenceEndpoint, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/octet-stream'
                        },
                        body: blob,
                        signal: controller.signal
                    });

                    clearTimeout(timeoutId);

                    if (!response.ok) throw new Error(`HTTP error ${response.status}`);
                    
                    const data = await response.json();
                    let description = '';

                    if (data && data.description) {
                        description = data.description;
                    } else if (data && typeof data === 'string') {
                        description = data;
                    } else {
                        throw new Error("Invalid description format.");
                    }

                    // Save to cache
                    this.lastDetectionsStr = currentDetectionsStr;
                    this.lastDescription = description;
                    this.lastDescriptionTimestamp = Date.now();

                    return description;

                } catch (err) {
                    clearTimeout(timeoutId);
                    
                    if (err.name === 'AbortError') {
                        console.warn("Cloud description request timed out.");
                        SpeechService.announce("Cloud description request timed out. Using local detection mode.");
                    } else {
                        console.error("Cloud Florence-2 API failure: ", err);
                        SpeechService.announce("Cloud AI unavailable. Using local detection mode.");
                    }
                    
                    return this.generateLocalDescription();
                }
            } else {
                return this.generateLocalDescription();
            }
        },

        generateLocalDescription() {
            const detections = DetectionService.activeDetections;
            if (!detections || detections.length === 0) {
                return "Path is clear. No obstacles detected ahead.";
            }

            const elWidth = 640;
            const sentences = detections.map(pred => {
                const boxX = pred.bbox[0];
                const boxW = pred.bbox[2];
                const centerX = boxX + boxW / 2;

                let direction = "ahead";
                if (centerX < elWidth * 0.35) {
                    direction = "on your left";
                } else if (centerX > elWidth * 0.65) {
                    direction = "on your right";
                }

                let friendlyLabel = pred.class;
                if (['car', 'bus', 'truck'].includes(pred.class)) {
                    friendlyLabel = "vehicle";
                }

                return `${friendlyLabel.charAt(0).toUpperCase() + friendlyLabel.slice(1)} detected ${direction}`;
            });

            return sentences.join(". ") + ".";
        }
    };

    // --- 5.1 VISION SERVICE ADAPTER (Scalable abstraction layer) ---
    const VisionServiceAdapter = {
        async describeImage(canvas) {
            // Interface abstraction for future AI integration (Gemini, etc.)
            return await FlorenceService.describe(canvas);
        }
    };

    // --- 6. VOICE COMMAND SERVICE (Web Speech Recognition API) ---
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

                if (transcript.includes("describe surroundings") || transcript.includes("describe")) {
                    this.updateUI("Voice command recognized");
                    triggerDescribeSurroundings();
                } else if (transcript.includes("repeat description") || transcript.includes("repeat")) {
                    this.updateUI("Voice command recognized");
                    SpeechService.repeat();
                } else if (transcript.includes("stop speaking") || transcript.includes("stop")) {
                    this.updateUI("Voice command recognized");
                    SpeechService.stop();
                } else {
                    this.updateUI("Command not recognized");
                    SpeechService.announce("Command not recognized. Please try again.");
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

    function switchTab(tabId) {
        state.currentTab = tabId;

        if (tabId === 'camera') {
            const wrapper = document.querySelector('.camera-panel-wrapper');
            if (wrapper && !document.getElementById('camera-fallback-img')) {
                const img = document.createElement('img');
                img.id = 'camera-fallback-img';
                img.src = 'street_scene.png';
                img.alt = 'Simulated city environment viewfinder';
                img.className = 'camera-bg-image';
                wrapper.insertBefore(img, document.getElementById('camera-stream') || wrapper.firstChild);
            }
            CameraService.start();
        } else {
            CameraService.stop();
            VoiceCommandService.stop();
        }

        navItems.forEach(item => {
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

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            switchTab(item.getAttribute('data-target'));
        });
    });

    let isAnalyzing = false;

    async function triggerDescribeSurroundings() {
        if (isAnalyzing) return;
        isAnalyzing = true;

        const describeBtn = document.getElementById('describe-btn');
        const announceStatus = document.getElementById('announce-status');
        const announceTitle = document.getElementById('announce-title');
        const announceDistance = document.getElementById('announce-distance');

        if (describeBtn) {
            describeBtn.disabled = true;
            describeBtn.innerText = "Analyzing surroundings...";
            describeBtn.style.opacity = '0.7';
        }
        if (announceStatus) {
            announceStatus.innerText = "Analyzing...";
            announceStatus.classList.add('active');
        }
        if (announceTitle) announceTitle.innerText = "Capturing viewport frame...";
        if (announceDistance) announceDistance.innerText = "";

        SpeechService.announce("Analyzing surroundings.");

        const canvas = CameraService.captureFrame();
        
        setTimeout(async () => {
            const description = await VisionServiceAdapter.describeImage(canvas);

            if (announceTitle) announceTitle.innerText = description;
            
            const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            if (announceDistance) announceDistance.innerText = `Analysis complete at ${timestamp}`;
            
            if (announceStatus) {
                announceStatus.innerText = "Complete";
                announceStatus.classList.remove('active');
            }

            if (describeBtn) {
                describeBtn.disabled = false;
                describeBtn.innerText = "Describe Surroundings";
                describeBtn.style.opacity = '1';
            }

            SpeechService.announce(description);
            isAnalyzing = false;
        }, 100);
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
                
                SpeechService.announce("Assistant activated. Point your camera to begin local scanning.");
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
    const sosModal = document.getElementById('sos-modal');
    const drawerOverlay = document.getElementById('drawer-overlay');
    const drawerContent = document.getElementById('drawer-content');
    const drawerCloseBtn = document.getElementById('drawer-close');
    const notificationBtn = document.getElementById('notification-btn');

    if (cancelSosBtn) {
        cancelSosBtn.addEventListener('click', () => {
            sosModal.classList.remove('modal-active');
            SpeechService.announce("SOS cancelled.");
        });
    }
    if (confirmSosBtn) {
        confirmSosBtn.addEventListener('click', () => {
            confirmSosBtn.innerText = "SOS Dispatched!";
            confirmSosBtn.style.backgroundColor = 'var(--success)';
            SpeechService.announce("SOS alert has been sent. Rescue services notified.");
            setTimeout(() => {
                sosModal.classList.remove('modal-active');
                confirmSosBtn.innerText = "Trigger SOS (5)";
                confirmSosBtn.style.backgroundColor = 'var(--danger)';
            }, 1500);
        });
    }

    // Activity Drawer close
    function closeActivityDrawer() {
        drawerOverlay.classList.remove('drawer-active');
        drawerContent.style.transform = 'translateY(100%)';
    }
    if (drawerCloseBtn) drawerCloseBtn.addEventListener('click', closeActivityDrawer);
    if (drawerOverlay) drawerOverlay.addEventListener('click', closeActivityDrawer);
    if (notificationBtn) {
        notificationBtn.addEventListener('click', () => {
            drawerOverlay.classList.add('drawer-active');
            drawerContent.style.transform = 'translateY(0)';
            SpeechService.announce("Opening activity logs.");
        });
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
            document.getElementById('start-assistant-btn'),
            document.querySelector('.nav-item[data-target="camera"]')
        ];

        targets.forEach(el => {
            if (el) {
                // Initialize model warmup immediately when the user clicks any camera page link
                el.addEventListener('click', triggerWarmup, { once: true });
            }
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

    // Initial greeting narration (delayed to 15s to clear initial paint and TTI audits)
    setTimeout(() => {
        SpeechService.announce("Welcome to Nazar, your AI navigation companion. Ready to assist.");
    }, 15000);
});
