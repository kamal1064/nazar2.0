/**
 * NAZAR Voice Engine Sequential Task Queue
 * v2.0.0
 */
import { router } from './router.js';
import { speaker } from './speaker.js';
import { stateMachine } from './state.js';
import { logger } from '../utils/logger.js';
import { eventBus } from './eventBus.js';
import { VoiceEvents } from '../events.js';

export class TaskQueue {
    constructor() {
        this.queue = [];
        this.isProcessing = false;
        this.activeTask = null;
    }

    /**
     * Pushes a task intent onto the execution queue
     * @param {Object} task JSON intent matching IntentContract.v1
     */
    push(task) {
        if (!task) return;
        this.queue.push(task);
        logger.router.info(`Task pushed to queue. Current size: ${this.queue.length}`);
        eventBus.emit(VoiceEvents.COMMAND_QUEUED, { task });
        
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
            this.activeTask = null;
            if (stateMachine.engineState === 'Processing' || stateMachine.engineState === 'Executing') {
                stateMachine.setEngineState('Idle');
            }
            return;
        }

        this.isProcessing = true;
        this.activeTask = this.queue.shift();

        try {
            logger.router.info(`Executing sequential task: ${this.activeTask.skill}.${this.activeTask.action}`);
            eventBus.emit(VoiceEvents.COMMAND_STARTED, { task: this.activeTask });
            
            await router.executeIntent(this.activeTask);
            
            eventBus.emit(VoiceEvents.COMMAND_COMPLETED, { task: this.activeTask });
        } catch (err) {
            logger.router.error('Task execution error:', err);
            eventBus.emit(VoiceEvents.COMMAND_FAILED, { task: this.activeTask, error: err.message || String(err) });
        } finally {
            this.activeTask = null;
            if (this.queue.length === 0) {
                this.isProcessing = false;
                if (stateMachine.engineState === 'Processing' || stateMachine.engineState === 'Executing') {
                    stateMachine.setEngineState('Idle');
                }
            } else {
                setTimeout(() => this.processNext(), 100);
            }
        }
    }

    /**
     * Clears all pending tasks in the queue
     */
    clear() {
        this.queue = [];
        this.isProcessing = false;
        this.activeTask = null;
        logger.router.info('Execution queue cleared.');
    }

    /**
     * Interrupt Mode: Stop
     * Halts speech output only
     */
    interruptStop() {
        logger.router.info('Priority Interrupt: STOP speech.');
        speaker.cancel();
        eventBus.emit(VoiceEvents.SPEECH_PRIORITY, { type: 'stop' });
    }

    /**
     * Interrupt Mode: Cancel
     * Clears the execution queue and cancels speech
     */
    interruptCancel() {
        logger.router.info('Priority Interrupt: CANCEL current queue.');
        
        // Call cancel() on currently active skill if it supports it
        if (this.activeTask && router.skills[this.activeTask.skill]) {
            try {
                router.skills[this.activeTask.skill].cancel();
            } catch (err) {
                logger.router.error(`Failed to cancel skill ${this.activeTask.skill}:`, err.message);
            }
        }

        this.clear();
        speaker.cancel();
        speaker.speak("Okay, cancelled.", { mode: 'replace' });
        stateMachine.setEngineState('Idle');
        eventBus.emit(VoiceEvents.SPEECH_PRIORITY, { type: 'cancel' });
    }

    /**
     * Interrupt Mode: Emergency Stop
     * Resets queue, speech, camera scanning, and puts assistant to sleep
     */
    interruptEmergency() {
        logger.router.info('Priority Interrupt: EMERGENCY STOP.');
        
        // Cancel active skill
        if (this.activeTask && router.skills[this.activeTask.skill]) {
            try {
                router.skills[this.activeTask.skill].cancel();
            } catch (err) {
                logger.router.error(`Failed to cancel skill ${this.activeTask.skill}:`, err.message);
            }
        }

        this.clear();
        speaker.cancel();
        
        if (window.NazarVoiceAPI) {
            try {
                window.NazarVoiceAPI.stopScan();
            } catch (err) {
                logger.router.warn('Failed to stop scan on emergency shutdown:', err.message);
            }
        }

        stateMachine.setWakeState('Sleeping');
        stateMachine.setEngineState('Idle');
        eventBus.emit(VoiceEvents.SPEECH_PRIORITY, { type: 'emergency' });
    }
}

// Export single instance
export const taskQueue = new TaskQueue();
