import { logger } from './logger.js';

class AudioVisualizer {
    constructor() {
        this._audioCtx = null;
        this._analyser = null;
        this._stream = null;
        this._animationFrameId = null;
        this._smoothedVolumes = new Array(8).fill(0);
        this._barElements = [];
    }

    async start(barElements) {
        this.stop();
        this._barElements = barElements || [];
        if (this._barElements.length === 0) return;

        try {
            // 1. Get user media stream for audio only
            this._stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            // 2. Initialize AudioContext
            this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const source = this._audioCtx.createMediaStreamSource(this._stream);
            
            // 3. Create analyser
            this._analyser = this._audioCtx.createAnalyser();
            this._analyser.fftSize = 64; // Small fftSize for fast, broad frequency bands
            source.connect(this._analyser);

            const bufferLength = this._analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);

            // 4. Animation loop with exponential smoothing
            const update = () => {
                if (!this._analyser) return;
                this._analyser.getByteFrequencyData(dataArray);

                // Map frequency bins to 8 bars
                const barCount = this._barElements.length;
                const binsPerBar = Math.floor(bufferLength / barCount) || 1;

                for (let i = 0; i < barCount; i++) {
                    let sum = 0;
                    for (let j = 0; j < binsPerBar; j++) {
                        sum += dataArray[i * binsPerBar + j] || 0;
                    }
                    const avg = sum / binsPerBar;
                    
                    // Normalize to 0.0 - 1.0 (frequency value goes up to 255)
                    const targetVolume = Math.min(Math.max(avg / 150, 0), 1.5);
                    
                    // Exponential smoothing: 30% current + 70% previous
                    this._smoothedVolumes[i] = (targetVolume * 0.3) + (this._smoothedVolumes[i] * 0.7);

                    // Apply transform scaleY dynamically
                    const element = this._barElements[i];
                    if (element) {
                        // Scale between 0.3 and 3.5
                        const scale = 0.3 + (this._smoothedVolumes[i] * 3.2);
                        element.style.transform = `scaleY(${scale})`;
                    }
                }

                this._animationFrameId = requestAnimationFrame(update);
            };

            update();
            logger.voice.info('[Visualizer] Real-time Audio Visualizer started.');
        } catch (err) {
            logger.voice.warn('[Visualizer] Failed to start media analyser, falling back to CSS pulsing:', err.message);
            // Fallback: add class '.animating' to all bars to trigger fallback CSS pulse keyframes
            this._barElements.forEach(bar => bar.classList.add('animating'));
        }
    }

    stop() {
        if (this._animationFrameId) {
            cancelAnimationFrame(this._animationFrameId);
            this._animationFrameId = null;
        }
        if (this._stream) {
            this._stream.getTracks().forEach(track => track.stop());
            this._stream = null;
        }
        if (this._audioCtx) {
            if (this._audioCtx.state !== 'closed') {
                this._audioCtx.close().catch(() => {});
            }
            this._audioCtx = null;
        }
        this._analyser = null;

        // Reset bar elements styles and classes
        if (this._barElements) {
            this._barElements.forEach(bar => {
                bar.style.transform = '';
                bar.classList.remove('animating');
            });
            this._barElements = [];
        }
        this._smoothedVolumes.fill(0);
    }
}

export const audioVisualizer = new AudioVisualizer();
