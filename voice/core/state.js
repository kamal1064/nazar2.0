/**
 * NAZAR Voice Engine State Machine Coordinator
 * v1.0.0
 */
export class StateMachine {
    constructor() {
        this.wakeState = 'Sleeping';     // 'Sleeping', 'Awake'
        this.engineState = 'Idle';       // 'Idle', 'Listening', 'Thinking', 'Executing', 'Speaking', 'Offline'
        
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
        console.log(`[Voice Engine State] WakeState: ${this.wakeState} -> ${newState}`);
        this.wakeState = newState;
        this.notify();
        this.updateUI();
    }

    /**
     * Update Voice Engine State
     * @param {string} newState 
     */
    setEngineState(newState) {
        if (this.engineState === newState) return;
        console.log(`[Voice Engine State] EngineState: ${this.engineState} -> ${newState}`);
        this.engineState = newState;
        this.notify();
        this.updateUI();
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

        if (this.wakeState === 'Sleeping') {
            statusDot.classList.add('status-voice-sleeping');
            if (statusText) statusText.innerText = "Voice Sleeping";
            return;
        }

        switch (this.engineState) {
            case 'Listening':
                statusDot.classList.add('status-voice-listening');
                if (statusText) statusText.innerText = "Listening...";
                break;
            case 'Thinking':
                statusDot.classList.add('status-voice-thinking');
                if (statusText) statusText.innerText = "Thinking...";
                break;
            case 'Executing':
                statusDot.classList.add('status-voice-executing');
                if (statusText) statusText.innerText = "Executing...";
                break;
            case 'Speaking':
                statusDot.classList.add('status-voice-speaking');
                if (statusText) statusText.innerText = "Speaking...";
                break;
            case 'Offline':
                statusDot.classList.add('status-voice-error');
                if (statusText) statusText.innerText = "Offline Mode";
                break;
            case 'Idle':
            default:
                statusDot.classList.add('status-voice-idle');
                if (statusText) statusText.innerText = "Ready";
                break;
        }
    }
}

// Export single instance
export const stateMachine = new StateMachine();
