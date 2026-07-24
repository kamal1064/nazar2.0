/**
 * NAZAR Voice Engine SOS Skill
 * v2.0.0
 */
import { BaseSkill } from './BaseSkill.js';
import { logger } from '../utils/logger.js';

export class SOSSkill extends BaseSkill {
    async execute(action, params = {}) {
        logger.skill.info(`Executing SOSSkill: ${action}`);

        if (!window.NazarVoiceAPI) {
            return {
                success: false,
                responseKey: 'emergency.error',
                nextState: "Idle",
                data: {}
            };
        }

        try {
            switch (action) {
                case 'sendSOS': {
                    window.NazarVoiceAPI.sendSOS(false); // Send real SOS email
                    return {
                        success: true,
                        responseKey: 'emergency.sendSOS.confirmed',
                        nextState: "Idle",
                        data: { sosSent: true }
                    };
                }

                case 'cancelSOS': {
                    const cancelBtn = document.getElementById('cancel-sos');
                    if (cancelBtn) cancelBtn.click();
                    return {
                        success: true,
                        responseKey: 'emergency.cancelSOS.success',
                        nextState: "Idle",
                        data: { cancelled: true }
                    };
                }

                case 'shareLocation': {
                    const whereAmIBtn = document.getElementById('feature-places');
                    if (whereAmIBtn) whereAmIBtn.click();
                    return {
                        success: true,
                        responseKey: 'emergency.shareLocation.success',
                        nextState: "Idle",
                        data: {}
                    };
                }

                default:
                    return {
                        success: false,
                        responseKey: 'emergency.error',
                        nextState: "Idle",
                        data: {}
                    };
            }
        } catch (err) {
            logger.skill.error('[SOSSkill] Execution error:', err);
            return {
                success: false,
                responseKey: 'emergency.error',
                nextState: "Idle",
                data: {}
            };
        }
    }
}

// Static manifest for registration and capability discovery
SOSSkill.manifest = {
    id: 'emergency',
    version: '2.0.0',
    priority: 800, // High action priority below SpeechSkill
    description: 'trigger emergency alerts and share your current location',
    commands: ['sendSOS', 'cancelSOS', 'shareLocation'],
    permissions: [],
    busyDescription: 'sending an emergency alert'
};

