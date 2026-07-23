/**
 * NAZAR Voice Engine Skill Registry & Intent Router
 * v1.0.0
 */
import { stateMachine } from './state.js';
import { speaker } from './speaker.js';
import { permissionsBroker } from '../services/permissions.js';

export class Router {
    constructor() {
        this.skills = {};
        this.consecutiveFailures = 0;
        this.pendingRecoveryTask = null; // Stash intent here if waiting for permission approval
    }

    /**
     * Registers a new Skill plugin
     * @param {BaseSkill} skill 
     */
    registerSkill(skill) {
        const name = skill.name();
        this.skills[name] = skill;
        console.log(`[Router] Skill registered: "${name}" (v${skill.version()}, Priority: ${skill.priority()})`);
    }

    /**
     * Resolves and routes an intent to its matching registered skill
     * @param {Object} intent JSON intent matching IntentContract.v1
     */
    async executeIntent(intent) {
        if (!intent) {
            this.handleFailure('VOICE_004', "I'm sorry, I didn't understand that.");
            return;
        }

        // Find skill that can handle this intent
        const skill = Object.values(this.skills)
            .sort((a, b) => b.priority() - a.priority())
            .find(s => s.canHandle(intent));

        if (!skill) {
            console.warn('[Router] No registered skill can handle intent:', intent);
            this.handleFailure('VOICE_004', "Command not recognized.");
            return;
        }

        stateMachine.setEngineState('Executing');

        // 1. Health Checks
        const health = skill.healthCheck();
        if (health === 'Busy') {
            await speaker.speak("Assistant is busy. Please wait a moment.");
            stateMachine.setEngineState('Idle');
            return;
        } else if (health === 'Unavailable') {
            await speaker.speak("This feature is currently unavailable.");
            stateMachine.setEngineState('Idle');
            return;
        }

        // 2. Permission Validation
        const requiredPerms = skill.requiredPermissions();
        let allPermissionsApproved = true;
        let missingPermissionName = '';

        for (const perm of requiredPerms) {
            // Note: permissionsBroker currently supports 'microphone' checks.
            // We can add location checks or mock other permissions as needed.
            if (perm === 'microphone' && !permissionsBroker.isGranted()) {
                const approved = await permissionsBroker.requestMicrophonePermission();
                if (!approved) {
                    allPermissionsApproved = false;
                    missingPermissionName = 'Microphone';
                    break;
                }
            } else if (perm === 'camera') {
                const CameraPermissionManager = window.CameraPermissionManager;
                if (CameraPermissionManager && CameraPermissionManager.state !== 'granted') {
                    allPermissionsApproved = false;
                    missingPermissionName = 'Camera';
                    break;
                }
            }
        }

        if (!allPermissionsApproved) {
            // Permission Recovery Loop: Stash intent and request permission
            this.pendingRecoveryTask = intent;
            await speaker.speak(`${missingPermissionName} access is required. Please enable it to continue.`);
            stateMachine.setEngineState('Idle');
            
            // Trigger browser permission recovery flow (e.g. camera enable buttons)
            if (missingPermissionName === 'Camera' && window.CameraPermissionManager) {
                window.CameraPermissionManager.checkStatus().then(async () => {
                    if (window.CameraPermissionManager.state === 'granted') {
                        console.log('[Router] Permission recovered. Resuming stashed command...');
                        const task = this.pendingRecoveryTask;
                        this.pendingRecoveryTask = null;
                        await this.executeIntent(task);
                    }
                });
            }
            return;
        }

        // 3. Execution
        try {
            const response = await skill.execute(intent.action, intent.params);
            
            if (response.success) {
                this.consecutiveFailures = 0;
                if (response.spokenText) {
                    await speaker.speak(response.spokenText);
                }
            } else {
                this.handleFailure('VOICE_004', response.spokenText || "Something went wrong.");
            }

            stateMachine.setEngineState(response.nextState || 'Idle');
        } catch (err) {
            console.error(`[Router] Execution error in skill "${skill.name()}":`, err);
            this.handleFailure('VOICE_004', "Failed to execute command.");
            stateMachine.setEngineState('Idle');
        }
    }

    handleFailure(code, spokenError) {
        this.consecutiveFailures++;
        console.warn(`[Router] Error [${code}]. Consecutive failures: ${this.consecutiveFailures}`);

        // Recovery Mode: If consecutive errors > 3, provide help context
        if (this.consecutiveFailures > 3) {
            this.consecutiveFailures = 0; // Reset
            speaker.speak("I'm having trouble understanding. You can say Help to hear available commands.");
        } else {
            speaker.speak(spokenError);
        }
    }
}

// Export single instance
export const router = new Router();
