/**
 * NAZAR Voice Engine — Shared AudioContext Manager
 * v1.0.0
 *
 * Manages a single AudioContext instance, ensuring it is only created
 * after a user gesture to comply with browser autoplay policies.
 * Provides a shared AudioContext for audio cues and visualisation.
 *
 * Usage:
 *   import { audioContextManager } from './audioContextManager.js';
 *   const ctx = await audioContextManager.getContext();
 */

export class AudioContextManager {
    constructor() {
        this._ctx = null;
        // This promise resolves when the AudioContext is ready (created and resumed if needed)
        this._readyPromise = null;
        // Track if we have seen a user gesture
        this._gestureReceived = false;
        // Bind the gesture listener
        this._handleGesture = this._handleGesture.bind(this);
        // Start listening for gestures immediately
        this._startGestureListening();
    }

    /**
     * Start listening for user gestures (touchstart, mousedown, keydown)
     * We use multiple events to cover various interaction types.
     */
    _startGestureListening() {
        // Use capture phase to catch events early
        ['touchstart', 'mousedown', 'keydown'].forEach(event => {
            window.addEventListener(event, this._handleGesture, { once: true, capture: true });
        });
    }

    /**
     * Handle a user gesture - we only need the first one.
     */
    _handleGesture() {
        if (this._gestureReceived) return;
        this._gestureReceived = true;
        // Remove listeners (we only need the first gesture)
        ['touchstart', 'mousedown', 'keydown'].forEach(event => {
            window.removeEventListener(event, this._handleGesture, { capture: true });
        });
        // If we were waiting to create the AudioContext, now we can resolve
        if (this._readyPromise) {
            this._createAudioContext();
        }
    }

    /**
     * Create the AudioContext if not already created.
     * @private
     */
    _createAudioContext() {
        if (this._ctx) return; // Already created
        try {
            this._ctx = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.error('[AudioContextManager] Failed to create AudioContext:', e);
            this._ctx = null;
        }
    }

    /**
     * Get the AudioContext, creating it if necessary after a user gesture.
     * If no gesture has been received yet, this method will wait for one.
     * @returns {Promise<AudioContext|null>}
     */
    async getContext() {
        // If we already have a context, return it (after ensuring it's not suspended)
        if (this._ctx) {
            if (this._ctx.state === 'suspended') {
                await this._ctx.resume().catch(() => {});
            }
            return this._ctx;
        }

        // If we haven't received a gesture yet, wait for one
        if (!this._gestureReceived) {
            // If we don't have a ready promise yet, create one
            if (!this._readyPromise) {
                this._readyPromise = new Promise((resolve) => {
                    // We'll resolve when gesture is received and context is created
                    const checkAndResolve = () => {
                        if (this._gestureReceived) {
                            this._createAudioContext();
                            if (this._ctx) {
                                // Resume if suspended
                                this._ctx.resume().catch(() => {});
                                resolve(this._ctx);
                            } else {
                                resolve(null);
                            }
                        }
                    };
                    // Listen for gesture to resolve
                    this._handleGesture = () => {
                        this._gestureReceived = true;
                        ['touchstart', 'mousedown', 'keydown'].forEach(event => {
                            window.removeEventListener(event, this._handleGesture, { capture: true });
                        });
                        checkAndResolve();
                    };
                    ['touchstart', 'mousedown', 'keydown'].forEach(event => {
                        window.addEventListener(event, this._handleGesture, { once: true, capture: true });
                    });
                });
            }
            return this._readyPromise;
        }

        // We have received a gesture but context not yet created (should not happen if we call create on gesture)
        // Create it now
        this._createAudioContext();
        if (this._ctx) {
            await this._ctx.resume().catch(() => {});
        }
        return this._ctx;
    }

    /**
     * Resume the AudioContext if it is suspended.
     * @returns {Promise<void>}
     */
    async resume() {
        if (this._ctx && this._ctx.state === 'suspended') {
            await this._ctx.resume().catch(() => {});
        }
    }

    /**
     * Close the AudioContext and set to null.
     * Useful for cleanup.
     */
    close() {
        if (this._ctx) {
            this._ctx.close().catch(() => {});
            this._ctx = null;
        }
    }
}

// Export a single shared instance
export const audioContextManager = new AudioContextManager();