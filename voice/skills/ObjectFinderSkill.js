/**
 * NAZAR Voice Engine — Object Finder Skill
 * v1.0.0
 *
 * Locates objects on-demand using a single captured frame and Gemini Vision.
 *
 * Flow:
 *   1. Switch to camera tab if not there
 *   2. Wait for camera stream to activate
 *   3. Capture exactly one frame
 *   4. Analyze frame with targeted prompt: "Is there a [object]?"
 *   5. Resolve location and speak confirmation
 */
import { BaseSkill } from './BaseSkill.js';
import { speaker } from '../core/speaker.js';
import { logger } from '../utils/logger.js';
import { voiceConfig } from '../utils/voiceConfig.js';
import { conversationContext } from '../core/context.js';

export class ObjectFinderSkill extends BaseSkill {
    async execute(action, params = {}, context = {}) {
        const targetObject = params.object || 'object';
        logger.skill.info(`Executing ObjectFinderSkill: find ${targetObject}`);

        if (!window.NazarVoiceAPI) {
            return {
                success: false,
                responseKey: 'ui.error',
                nextState: 'Idle',
                data: {}
            };
        }

        try {
            // Ensure camera is fully ready
            await window.NazarVoiceAPI.ensureCameraReady();
            conversationContext.setPage('camera');

            const video = document.getElementById('camera-stream');
            if (!video) {
                logger.skill.warn('[ObjectFinder] Camera stream element not found.');
                return {
                    success: false,
                    responseKey: 'recovery.cameraUnavailable',
                    nextState: 'Idle',
                    data: {}
                };
            }

            // Speak initial feedback: "Searching..."
            await speaker.speak(`Searching for your ${targetObject}...`, { mode: 'replace' });

            // 3. Capture exactly one frame
            const canvas = document.createElement('canvas');
            canvas.width = 640;
            canvas.height = 480;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const base64Img = canvas.toDataURL('image/jpeg', 0.85);

            // 4. Send targeted prompt to `/api/scan`
            const prompt = `You are a search assistant helping a visually impaired user locate their ${targetObject}.
Analyze the image and determine if a ${targetObject} is present.
If it IS present:
- Describe its spatial location (left, right, center, or front) relative to the camera.
- Estimate its distance (in meters or feet).
- Describe how they can reach it safely.
- Write this in the "summary" field.

If it IS NOT present:
- State clearly that the ${targetObject} is not detected in the frame.
- Write this in the "summary" field.

Return your response strictly adhering to the JSON schema.`;

            this.activeController = new AbortController();
            const response = await fetch('/api/scan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: localStorage.getItem("userId") || null,
                    image: base64Img,
                    ocrMode: false,
                    prompt: prompt
                }),
                signal: this.activeController.signal
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            logger.skill.info('[ObjectFinder] Scan response parsed:', data);

            // 5. Determine if object was found
            // Look in summary text or detected objects list
            const foundInObjects = data.objects && data.objects.some(obj => 
                obj.toLowerCase().includes(targetObject.toLowerCase())
            );
            const foundInSummary = data.summary && !data.summary.toLowerCase().includes('not detected') && !data.summary.toLowerCase().includes('not found') && !data.summary.toLowerCase().includes("couldn't find");

            const success = foundInObjects || foundInSummary;
            
            // Speak description directly
            await speaker.speak(data.summary, { mode: 'replace' });

            // Update context
            context.setLastScene(data.summary);
            context.setLastObjectFound({
                object: targetObject,
                found: success,
                location: data.summary,
                timestamp: Date.now()
            });

            if (success) {
                return {
                    success: true,
                    responseKey: 'permission.confirmation.yes', // generic confirmation chime/success feedback
                    nextState: 'Idle',
                    data: { found: true, summary: data.summary }
                };
            } else {
                return {
                    success: false,
                    responseKey: 'objectFinder.find.notFound', // "I couldn't find it. Move camera and say scan again."
                    nextState: 'Idle',
                    data: { found: false }
                };
            }

        } catch (err) {
            logger.skill.error('[ObjectFinderSkill] Error:', err.message);
            return {
                success: false,
                responseKey: 'objectFinder.find.error',
                nextState: 'Idle',
                data: {}
            };
        }
    }

    cancel() {
        if (this.activeController) {
            try {
                this.activeController.abort();
            } catch (e) {
                logger.skill.warn('[ObjectFinder] Cancel abort error:', e);
            }
        }
    }
}

// Static manifest
ObjectFinderSkill.manifest = {
    id: 'objectFinder',
    version: '1.0.0',
    priority: 200,
    description: 'locate and find specific objects in the camera view',
    commands: ['find', 'search'],
    permissions: ['camera'],
    busyDescription: 'searching for an object'
};
