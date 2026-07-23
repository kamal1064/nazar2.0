/**
 * NAZAR Voice Engine Camera Skill
 * v1.0.0
 */
import { BaseSkill } from './BaseSkill.js';

export class CameraSkill extends BaseSkill {
    name() {
        return 'camera';
    }

    supportedActions() {
        return [
            'startScan', 'stopScan',
            'switchTextMode', 'switchSceneMode',
            'switch_ocr', 'switch_scene',
            'captureImage', 'readLastResult'
        ];
    }

    requiredPermissions() {
        return ['camera'];
    }

    async execute(action, params = {}) {
        console.log(`[CameraSkill] Executing: ${action}`);

        if (!window.NazarVoiceAPI) {
            return {
                success: false,
                spokenText: "Camera service is unavailable.",
                nextState: "Idle",
                data: {}
            };
        }

        try {
            switch (action) {
                case 'startScan':
                    window.NazarVoiceAPI.startScan();
                    return {
                        success: true,
                        spokenText: "Scanning started.",
                        nextState: "Scanning",
                        data: {}
                    };

                case 'stopScan':
                    window.NazarVoiceAPI.stopScan();
                    return {
                        success: true,
                        spokenText: "Scanning stopped.",
                        nextState: "Idle",
                        data: {}
                    };

                case 'switchTextMode':
                case 'switch_ocr':
                    window.NazarVoiceAPI.switchOCR();
                    return {
                        success: true,
                        spokenText: "Text mode activated.",
                        nextState: "Idle",
                        data: { mode: 'ocr' }
                    };

                case 'switchSceneMode':
                case 'switch_scene':
                    window.NazarVoiceAPI.switchScene();
                    return {
                        success: true,
                        spokenText: "Scene mode activated.",
                        nextState: "Idle",
                        data: { mode: 'scene' }
                    };

                case 'captureImage':
                    window.NazarVoiceAPI.startScan();
                    return {
                        success: true,
                        spokenText: "Image captured.",
                        nextState: "Scanning",
                        data: {}
                    };

                case 'readLastResult':
                    window.NazarVoiceAPI.repeat();
                    return {
                        success: true,
                        spokenText: "", // Feedback handled by app's repeat
                        nextState: "Idle",
                        data: {}
                    };

                default:
                    return {
                        success: false,
                        spokenText: "Action not supported.",
                        nextState: "Idle",
                        data: {}
                    };
            }
        } catch (err) {
            console.error('[CameraSkill] Execution error:', err);
            return {
                success: false,
                spokenText: "Camera control failed.",
                nextState: "Idle",
                data: {}
            };
        }
    }
}
