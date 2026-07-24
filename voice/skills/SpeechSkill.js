/**
 * NAZAR Voice Engine Speech Skill
 * v1.0.0
 *
 * Controls SpeechSynthesis playback:
 * - `repeat`: repeats the last spoken phrase
 * - `stop`: stops speaking instantly
 * - `pause`: pauses active speaking
 * - `continue`: resumes paused speaking
 */
import { BaseSkill } from './BaseSkill.js';
import { speaker } from '../core/speaker.js';
import { logger } from '../utils/logger.js';

export class SpeechSkill extends BaseSkill {
    async execute(action, params = {}) {
        logger.skill.info(`Executing SpeechSkill: ${action}`);

        try {
            switch (action) {
                case 'repeat':
                    speaker.repeat();
                    return {
                        success: true,
                        responseKey: 'speech.repeat.success',
                        nextState: 'Idle',
                        data: {}
                    };

                case 'stop':
                    speaker.cancel();
                    return {
                        success: true,
                        responseKey: 'speech.stop.success',
                        nextState: 'Idle',
                        data: {}
                    };

                case 'pause':
                    speaker.pause();
                    return {
                        success: true,
                        responseKey: 'speech.pause.success',
                        nextState: 'Idle',
                        data: {}
                    };

                case 'continue':
                    speaker.resume();
                    return {
                        success: true,
                        responseKey: 'speech.continue.success',
                        nextState: 'Idle',
                        data: {}
                    };

                default:
                    return {
                        success: false,
                        responseKey: 'recovery.generic',
                        nextState: 'Idle',
                        data: {}
                    };
            }
        } catch (err) {
            logger.skill.error('[SpeechSkill] Execution error:', err);
            return {
                success: false,
                responseKey: 'recovery.generic',
                nextState: 'Idle',
                data: {}
            };
        }
    }
}

// Static skill manifest declaration
SpeechSkill.manifest = {
    id: 'speech',
    version: '1.0.0',
    priority: 900, // Interrupt priority level
    description: 'Control speech output options',
    commands: ['repeat', 'stop', 'pause', 'continue'],
    permissions: [],
    busyDescription: 'controlling speech'
};
