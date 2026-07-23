/**
 * NAZAR Voice Engine OCR Skill
 * v1.0.0
 */
import { BaseSkill } from './BaseSkill.js';

export class OCRSkill extends BaseSkill {
    name() {
        return 'ocr';
    }

    supportedActions() {
        return ['read', 'scan_text'];
    }

    requiredPermissions() {
        return ['camera'];
    }

    async execute(action, params = {}) {
        console.log(`[OCRSkill] Executing: ${action}`);

        if (!window.NazarVoiceAPI) {
            return {
                success: false,
                spokenText: "OCR service is unavailable.",
                nextState: "Idle",
                data: {}
            };
        }

        try {
            // 1. Force OCR text mode
            window.NazarVoiceAPI.switchOCR();
            
            // 2. Start scanning
            window.NazarVoiceAPI.startScan();

            return {
                success: true,
                spokenText: "Reading text.",
                nextState: "Scanning",
                data: {}
            };
        } catch (err) {
            console.error('[OCRSkill] Execution error:', err);
            return {
                success: false,
                spokenText: "Failed to read text.",
                nextState: "Idle",
                data: {}
            };
        }
    }
}
