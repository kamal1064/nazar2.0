/**
 * NAZAR Voice Engine — Audio Cue Manager
 * v1.0.0
 *
 * Synthesizes accessibility earcons using the Web Audio API.
 * Zero external files. All tones generated programmatically.
 *
 * Usage:
 *   import { audioCues } from './audioCues.js';
 *   await audioCues.play('wake');
 */
import { voiceConfig } from '../utils/voiceConfig.js';
import { logger } from '../utils/logger.js';

class AudioCueManager {
    constructor() {
        this._ctx = null;
    }

    /** Lazily initialize AudioContext on first use (browser policy: must be user-gesture triggered) */
    _getContext() {
        if (!this._ctx || this._ctx.state === 'closed') {
            try {
                this._ctx = new (window.AudioContext || window.webkitAudioContext)();
            } catch (e) {
                logger.voice.warn('[AudioCues] AudioContext unavailable:', e.message);
                return null;
            }
        }
        // Resume if suspended (mobile auto-suspend)
        if (this._ctx.state === 'suspended') {
            this._ctx.resume().catch(() => {});
        }
        return this._ctx;
    }

    /**
     * Play a named audio cue.
     * @param {'wake'|'listening'|'success'|'error'|'thinking'} name
     * @returns {Promise<void>}
     */
    async play(name) {
        if (!voiceConfig.flags.audioCues) return;
        const cfg = voiceConfig.speech.audioCues;

        const ctx = this._getContext();
        if (!ctx) return;

        try {
            switch (name) {
                case 'wake':
                    // Ascending two-tone chime — signals assistant is active
                    await this._tone(ctx, 520, 0.12, cfg.wakeVolume);
                    await this._tone(ctx, 780, 0.18, cfg.wakeVolume);
                    break;

                case 'listening':
                    // Short rising beep — mic is open
                    await this._tone(ctx, 440, 0.10, cfg.successVolume);
                    break;

                case 'success':
                    // Gentle two-note confirmation chord
                    await this._tone(ctx, 523, 0.10, cfg.successVolume); // C5
                    await this._tone(ctx, 659, 0.12, cfg.successVolume); // E5
                    break;

                case 'error':
                    // Soft descending tone
                    await this._tone(ctx, 350, 0.15, cfg.errorVolume);
                    await this._tone(ctx, 280, 0.15, cfg.errorVolume);
                    break;

                case 'thinking':
                    // Subtle single blip
                    await this._tone(ctx, 400, 0.08, cfg.successVolume * 0.5);
                    break;

                default:
                    logger.voice.warn('[AudioCues] Unknown cue name:', name);
            }
        } catch (err) {
            logger.voice.warn('[AudioCues] Playback error for cue', name, ':', err.message);
        }
    }

    /**
     * Generate a single tone using OscillatorNode.
     * @param {AudioContext} ctx
     * @param {number} frequency - Hz
     * @param {number} durationSeconds
     * @param {number} volume - 0.0 to 1.0
     * @returns {Promise<void>}
     */
    _tone(ctx, frequency, durationSeconds, volume) {
        return new Promise((resolve) => {
            try {
                const osc    = ctx.createOscillator();
                const gainNode = ctx.createGain();

                osc.type      = 'sine';
                osc.frequency.setValueAtTime(frequency, ctx.currentTime);

                // Fade in/out to avoid clicks
                gainNode.gain.setValueAtTime(0, ctx.currentTime);
                gainNode.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.01);
                gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + durationSeconds);

                osc.connect(gainNode);
                gainNode.connect(ctx.destination);

                osc.start(ctx.currentTime);
                osc.stop(ctx.currentTime + durationSeconds + 0.02);
                osc.onended = () => resolve();
            } catch (err) {
                resolve(); // Never reject — audio cues are non-critical
            }
        });
    }
}

// Export single instance
export const audioCues = new AudioCueManager();
