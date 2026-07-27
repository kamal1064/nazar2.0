/**
 * NAZAR Client-side Session Memory & Idle Timeout coordinator
 * v1.0.0
 */
import { stateMachine } from './state.js';
import { voiceConfig } from '../utils/voiceConfig.js';
import { recognition } from './recognition.js';
import { speaker } from './speaker.js';
import { logger } from '../utils/logger.js';

export class SessionMemory {
    constructor() {
        this.idleTimer = null;
        
        // Listen to WakeState changes to manage inactivity timeout
        stateMachine.subscribe((state) => {
            if (state === 'Awake') {
                this.resetIdleTimer();
            } else {
                this.clearIdleTimer();
            }
        });
    }

    /**
     * Resets the inactivity sleep countdown
     */
    resetIdleTimer() {
        this.clearIdleTimer();

        this.idleTimer = setTimeout(async () => {
            if (stateMachine.wakeState === 'Awake') {
                logger.voice.info('[SessionMemory] 3-minute idle inactivity timeout reached. Putting engine to sleep.');
                
                await speaker.speak("Going to sleep to conserve battery.");
                recognition.stop();
                speaker.cancel();
                stateMachine.setWakeState('Sleeping');
                stateMachine.setEngineState('Idle');
            }
        }, voiceConfig.idleSleep);
    }

    /**
     * Clears any active sleep timeout
     */
    clearIdleTimer() {
        if (this.idleTimer) {
            clearTimeout(this.idleTimer);
            this.idleTimer = null;
        }
    }
}

// Export single instance
export const sessionMemory = new SessionMemory();
