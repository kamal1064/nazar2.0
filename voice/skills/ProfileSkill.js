/**
 * NAZAR Voice Engine Profile/Account Skill
 * v2.0.0
 */
import { BaseSkill } from './BaseSkill.js';
import { logger } from '../utils/logger.js';

export class ProfileSkill extends BaseSkill {
    async execute(action, params = {}) {
        logger.skill.info(`Executing ProfileSkill: ${action}`);

        if (!window.NazarVoiceAPI) {
            return {
                success: false,
                responseKey: 'profile.error',
                nextState: "Idle",
                data: {}
            };
        }

        try {
            switch (action) {
                case 'open':
                case 'showAccount': {
                    const btn = document.getElementById('header-account-btn') || document.getElementById('sidebar-account-btn');
                    if (btn) {
                        btn.click();
                        return {
                            success: true,
                            responseKey: 'profile.open.success',
                            nextState: "Idle",
                            data: {}
                        };
                    }
                    return {
                        success: false,
                        responseKey: 'profile.error',
                        nextState: "Idle",
                        data: {}
                    };
                }

                case 'signOut': {
                    const signOutBtn = document.getElementById('profile-dropdown-signout');
                    if (signOutBtn) {
                        signOutBtn.click();
                        return {
                            success: true,
                            responseKey: 'profile.signOut.success',
                            nextState: "Idle",
                            data: {}
                        };
                    }
                    
                    // Fallback to open dropdown first to see if button becomes available
                    const btn = document.getElementById('header-account-btn');
                    if (btn) {
                        btn.click();
                        setTimeout(() => {
                            const subSignOut = document.getElementById('profile-dropdown-signout');
                            if (subSignOut) subSignOut.click();
                        }, 200);
                        return {
                            success: true,
                            responseKey: 'profile.signOut.success',
                            nextState: "Idle",
                            data: {}
                        };
                    }
                    return {
                        success: false,
                        responseKey: 'profile.error', // generic or already signed out
                        nextState: "Idle",
                        data: {}
                    };
                }

                default:
                    return {
                        success: false,
                        responseKey: 'profile.error',
                        nextState: "Idle",
                        data: {}
                    };
            }
        } catch (err) {
            logger.skill.error('[ProfileSkill] Execution error:', err);
            return {
                success: false,
                responseKey: 'profile.error',
                nextState: "Idle",
                data: {}
            };
        }
    }
}

// Static manifest for registration and capability discovery
ProfileSkill.manifest = {
    id: 'profile',
    version: '2.0.0',
    priority: 100,
    description: 'open account panel and sign out of your account',
    commands: ['open', 'signOut', 'showAccount'],
    permissions: [],
    busyDescription: 'managing account settings'
};

