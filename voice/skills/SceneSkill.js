/**
 * NAZAR Voice Engine Scene Description Skill
 * v2.0.0
 */
import { BaseSkill } from './BaseSkill.js';
import { logger } from '../utils/logger.js';
import { conversationContext } from '../core/context.js';
import { speaker } from '../core/speaker.js';

export class SceneSkill extends BaseSkill {
    async execute(action, params = {}) {
        logger.skill.info(`Executing SceneSkill: ${action}`);

        if (!window.NazarVoiceAPI) {
            return {
                success: false,
                responseKey: 'scene.error',
                nextState: "Idle",
                data: {}
            };
        }

        try {
            // Check vision cache (60s TTL)
            const cache = conversationContext.lastScene;
            const forceNew = params.scan_again || action === 'scan_again';
            
            if (cache && !forceNew) {
                logger.vision.info('[SceneSkill] Vision cache hit. Reusing description.');
                await speaker.speak(cache, { mode: 'replace' });
                return {
                    success: true,
                    responseKey: 'scene.describe.cacheHit',
                    nextState: "Idle",
                    data: { cached: true, summary: cache }
                };
            }

            // Invalidate cache before starting a new scan
            conversationContext.invalidateVisionCache('new_scan_triggered');

            // 1. Force Scene description mode
            window.NazarVoiceAPI.switchScene();
            
            // 2. Start scanning
            window.NazarVoiceAPI.startScan();

            return {
                success: true,
                responseKey: 'scene.describe.success',
                nextState: "Scanning",
                data: { cached: false }
            };
        } catch (err) {
            logger.skill.error('[SceneSkill] Execution error:', err);
            return {
                success: false,
                responseKey: 'scene.error',
                nextState: "Idle",
                data: {}
            };
        }
    }
}

// Static manifest for registration and capability discovery
SceneSkill.manifest = {
    id: 'scene',
    version: '2.0.0',
    priority: 200,
    description: 'describe your surroundings and environmental hazards',
    commands: ['describe', 'scan_scene', 'scan_again'],
    permissions: ['camera'],
    busyDescription: 'describing surroundings'
};

