/**
 * NAZAR Voice Engine Camera Skill
 * v2.0.0
 */
import { BaseSkill } from './BaseSkill.js';
import { logger } from '../utils/logger.js';

export class CameraSkill extends BaseSkill {
    async execute(action, params = {}) {
        logger.skill.info(`Executing CameraSkill: ${action}`);

        if (!window.NazarVoiceAPI) {
            return {
                success: false,
                responseKey: 'camera.error',
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
                        responseKey: 'camera.startScan.success',
                        nextState: "Scanning",
                        data: {}
                    };

                case 'stopScan':
                    window.NazarVoiceAPI.stopScan();
                    return {
                        success: true,
                        responseKey: 'camera.stopScan.success',
                        nextState: "Idle",
                        data: {}
                    };

                case 'switchTextMode':
                case 'switch_ocr':
                    window.NazarVoiceAPI.switchOCR();
                    return {
                        success: true,
                        responseKey: 'camera.switch_ocr.success',
                        nextState: "Idle",
                        data: { mode: 'ocr' }
                    };

                case 'switchSceneMode':
                case 'switch_scene':
                    window.NazarVoiceAPI.switchScene();
                    return {
                        success: true,
                        responseKey: 'camera.switch_scene.success',
                        nextState: "Idle",
                        data: { mode: 'scene' }
                    };

                case 'captureImage':
                    window.NazarVoiceAPI.startScan();
                    return {
                        success: true,
                        responseKey: 'camera.startScan.success',
                        nextState: "Scanning",
                        data: {}
                    };

                case 'readLastResult':
                    window.NazarVoiceAPI.repeat();
                    return {
                        success: true,
                        responseKey: 'speech.repeat.success',
                        nextState: "Idle",
                        data: {}
                    };

                default:
                    return {
                        success: false,
                        responseKey: 'camera.error',
                        nextState: "Idle",
                        data: {}
                    };
            }
        } catch (err) {
            logger.skill.error('[CameraSkill] Execution error:', err);
            return {
                success: false,
                responseKey: 'camera.error',
                nextState: "Idle",
                data: {}
            };
        }
    }
}

// Static manifest for registration and capability discovery
CameraSkill.manifest = {
    id: 'camera',
    version: '2.0.0',
    priority: 200,
    description: 'control camera, start scanning, switch mode, or capture image',
    commands: [
        'startScan', 'stopScan',
        'switchTextMode', 'switchSceneMode',
        'switch_ocr', 'switch_scene',
        'captureImage', 'readLastResult'
    ],
    permissions: ['camera'],
    busyDescription: 'controlling the camera'
};

