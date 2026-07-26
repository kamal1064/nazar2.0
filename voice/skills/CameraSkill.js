/**
 * NAZAR Voice Engine Camera Skill
 * v2.0.0
 */
import { BaseSkill } from './BaseSkill.js';
import { logger } from '../utils/logger.js';

export class CameraSkill extends BaseSkill {
    async execute(action, params = {}, context = {}) {
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
            // Check camera readiness for all actions except open itself (which initializes the camera)
            if (action !== 'open') {
                await window.NazarVoiceAPI.ensureCameraReady();
            }

            switch (action) {
                case 'open':
                    await window.NazarVoiceAPI.ensureCameraReady();
                    return {
                        success: true,
                        responseKey: 'navigate.camera.success',
                        nextState: "Idle",
                        data: {}
                    };

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

    cancel() {
        if (window.NazarVoiceAPI && typeof window.NazarVoiceAPI.stopScan === 'function') {
            window.NazarVoiceAPI.stopScan();
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
        'captureImage', 'readLastResult', 'open'
    ],
    permissions: ['camera'],
    busyDescription: 'controlling the camera'
};

