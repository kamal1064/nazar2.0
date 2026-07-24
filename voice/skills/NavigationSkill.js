/**
 * NAZAR Voice Engine Navigation Skill
 * v2.0.0
 */
import { BaseSkill } from './BaseSkill.js';
import { logger } from '../utils/logger.js';

export class NavigationSkill extends BaseSkill {
    async execute(action, params = {}) {
        let target = action;

        // Handle generic 'navigate' action resolved by parser rules
        if (action === 'navigate') {
            target = params.target || 'home';
        }

        logger.skill.info(`Executing NavigationSkill target: ${target}`);

        if (!window.NazarVoiceAPI) {
            return {
                success: false,
                responseKey: 'navigate.error',
                nextState: "Idle",
                data: {}
            };
        }

        try {
            if (target === 'back') {
                window.history.back();
                return {
                    success: true,
                    responseKey: 'navigate.back.success',
                    nextState: "Idle",
                    data: {}
                };
            }

            // Perform panel switch
            window.NazarVoiceAPI.navigate(target);

            return {
                success: true,
                responseKey: `navigate.${target}.success`,
                nextState: "Idle",
                data: { target }
            };
        } catch (err) {
            logger.skill.error('[NavigationSkill] Execution error:', err);
            return {
                success: false,
                responseKey: 'navigate.error',
                nextState: "Idle",
                data: {}
            };
        }
    }
}

// Static manifest for registration and capability discovery
NavigationSkill.manifest = {
    id: 'navigate',
    version: '2.0.0',
    priority: 500,
    description: 'navigate the application screens',
    commands: ['home', 'camera', 'profile', 'settings', 'back', 'navigate'],
    permissions: [],
    busyDescription: 'navigating application pages'
};

