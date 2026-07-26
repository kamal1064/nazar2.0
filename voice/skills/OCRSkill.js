/**
 * NAZAR Voice Engine OCR Skill
 * v2.0.0
 */
import { BaseSkill } from './BaseSkill.js';
import { logger } from '../utils/logger.js';

export class OCRSkill extends BaseSkill {
    async execute(action, params = {}, context = {}) {
        logger.skill.info(`Executing OCRSkill: ${action}`);

        if (!window.NazarVoiceAPI) {
            return {
                success: false,
                responseKey: 'ocr.error',
                nextState: "Idle",
                data: {}
            };
        }

        try {
            // Wait for camera to be fully ready before proceeding
            await window.NazarVoiceAPI.ensureCameraReady();

            // 1. Force OCR text mode
            window.NazarVoiceAPI.switchOCR();
            
            // 2. Start scanning
            window.NazarVoiceAPI.startScan();

            return {
                success: true,
                responseKey: 'ocr.read.success',
                nextState: "Scanning",
                data: {}
            };
        } catch (err) {
            logger.skill.error('[OCRSkill] Execution error:', err);
            return {
                success: false,
                responseKey: 'ocr.error',
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
OCRSkill.manifest = {
    id: 'ocr',
    version: '2.0.0',
    priority: 200,
    description: 'read printed text and documents using optical character recognition',
    commands: ['read', 'scan_text'],
    permissions: ['camera'],
    busyDescription: 'reading text'
};

