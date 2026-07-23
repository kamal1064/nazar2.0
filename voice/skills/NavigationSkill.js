/**
 * NAZAR Voice Engine Navigation Skill
 * v1.0.0
 */
import { BaseSkill } from './BaseSkill.js';

export class NavigationSkill extends BaseSkill {
    name() {
        return 'navigate';
    }

    supportedActions() {
        return ['home', 'camera', 'profile', 'settings', 'back', 'navigate'];
    }

    async execute(action, params = {}) {
        let target = action;

        // Handle generic 'navigate' action resolved by parser rules
        if (action === 'navigate') {
            target = params.target || 'home';
        }

        console.log(`[NavigationSkill] Navigating to: ${target}`);

        if (!window.NazarVoiceAPI) {
            return {
                success: false,
                spokenText: "Navigation service is unavailable.",
                nextState: "Idle",
                data: {}
            };
        }

        try {
            if (target === 'back') {
                // Navigate back
                window.history.back();
                return {
                    success: true,
                    spokenText: "Navigating back.",
                    nextState: "Idle",
                    data: {}
                };
            }

            // Perform panel switch
            window.NazarVoiceAPI.navigate(target);

            // Capitalize target for announcement
            const targetLabel = target.charAt(0).toUpperCase() + target.slice(1);
            return {
                success: true,
                spokenText: `${targetLabel} opened.`,
                nextState: "Idle",
                data: { target }
            };
        } catch (err) {
            console.error('[NavigationSkill] Execution error:', err);
            return {
                success: false,
                spokenText: "Failed to navigate.",
                nextState: "Idle",
                data: {}
            };
        }
    }
}
