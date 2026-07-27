/**
 * NAZAR Voice Engine State Machine Coordinator
 * v2.0.0
 */
import { eventBus } from './eventBus.js';
import { VoiceEvents } from '../events.js';
import { logger } from '../utils/logger.js';

export class StateMachine {
    constructor() {
        this.wakeState = 'Sleeping';     // 'Sleeping', 'Awake'
        this.engineState = 'Idle';       // 'Idle', 'Listening', 'Processing', 'Speaking'
        
        this.subscribers = [];
    }

    /**
     * Subscribe to state changes
     * @param {Function} callback 
     */
    subscribe(callback) {
        this.subscribers.push(callback);
    }

    /**
     * Unsubscribe from state changes
     * @param {Function} callback 
     */
    unsubscribe(callback) {
        this.subscribers = this.subscribers.filter(sub => sub !== callback);
    }

    /**
     * Update Wake State
     * @param {string} newState 
     */
    setWakeState(newState) {
        if (this.wakeState === newState) return;
        logger.state.info(`WakeState: ${this.wakeState} -> ${newState}`);
        this.wakeState = newState;
        this.notify();
        this.updateUI();
        try {
            eventBus.emit(VoiceEvents.WAKE_STATE_CHANGED, { state: this.wakeState });
        } catch (e) {}
    }

    /**
     * Update Voice Engine State
     * Enforces strict state machine: Idle -> Listening -> Processing -> Speaking -> Idle
     * @param {string} newState 
     */
    setEngineState(newState) {
        let normalizedState = newState;
        if (newState === 'Starting' || newState === 'Thinking' || newState === 'Executing') {
            normalizedState = 'Processing';
        } else if (newState !== 'Listening' && newState !== 'Speaking' && newState !== 'Processing') {
            normalizedState = 'Idle';
        }

        if (this.engineState === normalizedState) return;
        logger.state.info(`EngineState: ${this.engineState} -> ${normalizedState} (raw: ${newState})`);
        this.engineState = normalizedState;
        this.notify();
        this.updateUI();
        try {
            eventBus.emit(VoiceEvents.ENGINE_STATE_CHANGED, { state: this.engineState });
        } catch (e) {}
    }

    notify() {
        const payload = {
            wakeState: this.wakeState,
            engineState: this.engineState
        };
        this.subscribers.forEach(callback => {
            try {
                callback(payload);
            } catch (err) {
                console.error('[StateMachine] Notification error:', err);
            }
        });
    }

    /**
     * Dynamically updates the visual status dot in index.html based on voice engine state
     */
    updateUI() {
        const statusDot = document.querySelector('.live-status-pill .status-dot');
        const statusText = document.getElementById('scan-status-text');

        if (!statusDot) return;

        // Reset class to base
        statusDot.className = 'status-dot';

        switch (this.engineState) {
            case 'Processing':
                statusDot.classList.add('status-voice-thinking');
                if (statusText) statusText.innerText = "Thinking...";
                break;
            case 'Listening':
                statusDot.classList.add('status-voice-listening');
                if (statusText) statusText.innerText = "Listening...";
                break;
            case 'Speaking':
                statusDot.classList.add('status-voice-speaking');
                if (statusText) statusText.innerText = "Speaking...";
                break;
            case 'Idle':
            default:
                statusDot.classList.add('status-voice-idle');
                if (statusText) statusText.innerText = "Tap to speak";
                break;
        }
    }
}

// Export single instance
export const stateMachine = new StateMachine();
