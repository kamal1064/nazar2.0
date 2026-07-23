/**
 * NAZAR Voice Engine Profile/Account Skill
 * v1.0.0
 */
import { BaseSkill } from './BaseSkill.js';

export class ProfileSkill extends BaseSkill {
    name() {
        return 'profile';
    }

    supportedActions() {
        return ['open', 'signOut', 'showAccount'];
    }

    async execute(action, params = {}) {
        console.log(`[ProfileSkill] Executing: ${action}`);

        if (!window.NazarVoiceAPI) {
            return {
                success: false,
                spokenText: "Profile service is unavailable.",
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
                            spokenText: "Account panel opened.",
                            nextState: "Idle",
                            data: {}
                        };
                    }
                    return {
                        success: false,
                        spokenText: "Could not open account panel.",
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
                            spokenText: "Signed out successfully.",
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
                            spokenText: "Signing out.",
                            nextState: "Idle",
                            data: {}
                        };
                    }
                    return {
                        success: false,
                        spokenText: "You are not signed in.",
                        nextState: "Idle",
                        data: {}
                    };
                }

                default:
                    return {
                        success: false,
                        spokenText: "Account action not supported.",
                        nextState: "Idle",
                        data: {}
                    };
            }
        } catch (err) {
            console.error('[ProfileSkill] Execution error:', err);
            return {
                success: false,
                spokenText: "Account management action failed.",
                nextState: "Idle",
                data: {}
            };
        }
    }
}
