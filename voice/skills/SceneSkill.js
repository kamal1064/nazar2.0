/**
 * NAZAR Voice Engine Scene Description Skill
 * v1.0.0
 */
import { BaseSkill } from './BaseSkill.js';

export class SceneSkill extends BaseSkill {
    name() {
        return 'scene';
    }

    supportedActions() {
        return ['describe', 'scan_scene'];
    }

    requiredPermissions() {
        return ['camera'];
    }

    async execute(action, params = {}) {
        console.log(`[SceneSkill] Executing: ${action}`);

        if (!window.NazarVoiceAPI) {
            return {
                success: false,
                spokenText: "Scene analysis service is unavailable.",
                nextState: "Idle",
                data: {}
            };
        }

        try {
            // 1. Force Scene description mode
            window.NazarVoiceAPI.switchScene();
            
            // 2. Start scanning
            window.NazarVoiceAPI.startScan();

            return {
                success: true,
                spokenText: "Analyzing surroundings.",
                nextState: "Scanning",
                data: {}
            };
        } catch (err) {
            console.error('[SceneSkill] Execution error:', err);
            return {
                success: false,
                spokenText: "Failed to analyze scene surroundings.",
                nextState: "Idle",
                data: {}
            };
        }
    }
}
