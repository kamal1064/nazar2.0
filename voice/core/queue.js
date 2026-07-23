/**
 * NAZAR Voice Engine Sequential Task Queue
 * v1.0.0
 */
import { router } from './router.js';
import { speaker } from './speaker.js';
import { stateMachine } from './state.js';

export class TaskQueue {
    constructor() {
        this.queue = [];
        this.isProcessing = false;
    }

    /**
     * Pushes a task intent onto the execution queue
     * @param {Object} task JSON intent matching IntentContract.v1
     */
    push(task) {
        if (!task) return;
        this.queue.push(task);
        console.log(`[TaskQueue] Task pushed to queue. Current size: ${this.queue.length}`);
        
        if (!this.isProcessing) {
            this.processNext();
        }
    }

    /**
     * Executes the next task in the queue sequentially
     */
    async processNext() {
        if (this.queue.length === 0) {
            this.isProcessing = false;
            // Return back to Idle if execution completes
            if (stateMachine.engineState === 'Executing') {
                stateMachine.setEngineState('Idle');
            }
            return;
        }

        this.isProcessing = true;
        const task = this.queue.shift();

        try {
            console.log(`[TaskQueue] Executing sequential task: ${task.skill}.${task.action}`);
            await router.executeIntent(task);
        } catch (err) {
            console.error('[TaskQueue] Task execution error:', err);
        }

        // Delay briefly before starting next task to allow speech cues to complete
        setTimeout(() => this.processNext(), 100);
    }

    /**
     * Clears all pending tasks in the queue
     */
    clear() {
        this.queue = [];
        this.isProcessing = false;
        console.log('[TaskQueue] Execution queue cleared.');
    }

    /**
     * Interrupt Mode: Stop
     * Halts speech output only
     */
    interruptStop() {
        console.log('[TaskQueue] Priority Interrupt: STOP speech.');
        speaker.cancel();
    }

    /**
     * Interrupt Mode: Cancel
     * Clears the execution queue and cancels speech
     */
    interruptCancel() {
        console.log('[TaskQueue] Priority Interrupt: CANCEL current queue.');
        this.clear();
        speaker.cancel();
        stateMachine.setEngineState('Idle');
    }

    /**
     * Interrupt Mode: Emergency Stop
     * Resets queue, speech, camera scanning, and puts assistant to sleep
     */
    interruptEmergency() {
        console.log('[TaskQueue] Priority Interrupt: EMERGENCY STOP.');
        this.clear();
        speaker.cancel();
        
        if (window.NazarVoiceAPI) {
            try {
                window.NazarVoiceAPI.stopScan();
            } catch (err) {
                console.warn('[TaskQueue] Failed to stop scan on emergency shutdown:', err);
            }
        }

        stateMachine.setWakeState('Sleeping');
        stateMachine.setEngineState('Idle');
    }
}

// Export single instance
export const taskQueue = new TaskQueue();
