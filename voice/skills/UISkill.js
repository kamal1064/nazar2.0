/**
 * NAZAR Voice Engine UI & Navigation Assistance Skill
 * v1.0.0
 *
 * Handles UI interactions like scrolling, opening drawers, help descriptions,
 * and dynamic capability discovery.
 */
import { BaseSkill } from './BaseSkill.js';
import { speaker } from '../core/speaker.js';
import { router } from '../core/router.js';
import { logger } from '../utils/logger.js';

export class UISkill extends BaseSkill {
    async execute(action, params = {}) {
        logger.skill.info(`Executing UISkill: ${action}`);

        try {
            switch (action) {
                case 'scrollDown':
                    window.scrollBy({ top: window.innerHeight * 0.5, behavior: 'smooth' });
                    return {
                        success: true,
                        responseKey: 'ui.scrollDown.success',
                        nextState: 'Idle',
                        data: {}
                    };

                case 'scrollUp':
                    window.scrollBy({ top: -window.innerHeight * 0.5, behavior: 'smooth' });
                    return {
                        success: true,
                        responseKey: 'ui.scrollUp.success',
                        nextState: 'Idle',
                        data: {}
                    };

                case 'openMenu': {
                    const menuBtn = document.getElementById('mobile-menu-btn');
                    if (menuBtn) {
                        menuBtn.click();
                        return {
                            success: true,
                            responseKey: 'ui.openMenu.success',
                            nextState: 'Idle',
                            data: {}
                        };
                    }
                    return {
                        success: false,
                        responseKey: 'ui.error',
                        nextState: 'Idle',
                        data: {}
                    };
                }

                case 'closeMenu': {
                    const closeBtn = document.getElementById('hamburger-drawer-close');
                    if (closeBtn) {
                        closeBtn.click();
                        return {
                            success: true,
                            responseKey: 'ui.closeMenu.success',
                            nextState: 'Idle',
                            data: {}
                        };
                    }
                    return {
                        success: false,
                        responseKey: 'ui.error',
                        nextState: 'Idle',
                        data: {}
                    };
                }

                case 'openHelp':
                case 'whatCanISay': {
                    // Dynamic Capability Discovery: read all registered manifests
                    const descriptions = Object.values(router.skills)
                        .filter(s => s.constructor.manifest?.description)
                        .map(s => s.constructor.manifest.description.toLowerCase());

                    if (descriptions.length > 0) {
                        const uniqueDescriptions = [...new Set(descriptions)];
                        const spokenText = `I can help you with the following: ${uniqueDescriptions.join(', ')}.`;
                        
                        // Speak this custom text since it's dynamic
                        await speaker.speak(spokenText, { mode: 'replace' });
                        return {
                            success: true,
                            responseKey: 'ui.openHelp.success',
                            nextState: 'Idle',
                            data: { capabilities: uniqueDescriptions }
                        };
                    }
                    return {
                        success: false,
                        responseKey: 'ui.error',
                        nextState: 'Idle',
                        data: {}
                    };
                }

                default:
                    return {
                        success: false,
                        responseKey: 'recovery.generic',
                        nextState: 'Idle',
                        data: {}
                    };
            }
        } catch (err) {
            logger.skill.error('[UISkill] Execution error:', err);
            return {
                success: false,
                responseKey: 'ui.error',
                nextState: 'Idle',
                data: {}
            };
        }
    }
}

// Static manifest for dynamic registration and capability discovery
UISkill.manifest = {
    id: 'ui',
    version: '1.0.0',
    priority: 500,
    description: 'control user interface options and navigate menu items',
    commands: ['scrollDown', 'scrollUp', 'openMenu', 'closeMenu', 'openHelp', 'whatCanISay'],
    permissions: [],
    busyDescription: 'interacting with the page'
};
