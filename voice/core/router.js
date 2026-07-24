/**
 * NAZAR Voice Engine Skill Registry & Intent Router
 * v2.0.0
 */
import { stateMachine } from './state.js';
import { speaker } from './speaker.js';
import { permissionsBroker } from '../services/permissions.js';
import { resourceLock } from './resourceLock.js';
import { logger } from '../utils/logger.js';
import { eventBus } from './eventBus.js';
import { VoiceEvents } from '../events.js';
import { recoveryManager } from './recoveryManager.js';
import { ALL_SKILLS } from '../skills/index.js';

export class Router {
    constructor() {
        this.skills = {};
        this.consecutiveFailures = 0;
        this.pendingRecoveryTask = null; // Stash intent here if waiting for permission approval
        this.activeSkill = null;
    }

    /**
     * Set up and auto-discover all barrel-exported skills on startup.
     * (v3 Improvement 3)
     */
    async initialize() {
        logger.router.info('Initializing Skill Router and auto-discovering plugins...');
        
        for (const { SkillClass, manifest } of ALL_SKILLS) {
            const instance = new SkillClass();
            
            // Auto-health check during registration (v3 Improvement 8)
            const health = instance.healthCheck();
            if (health === 'Unavailable' || health === 'Offline') {
                logger.router.warn(`Skill '${manifest.id}' registered but is currently INACTIVE (Health: ${health})`);
            }

            // Run lifecycle initialize
            try {
                await instance.initialize();
            } catch (err) {
                logger.router.error(`Failed to initialize skill '${manifest.id}':`, err.message);
            }

            this.registerSkill(instance);
        }
    }

    /**
     * Registers a new Skill plugin
     * @param {BaseSkill} skill 
     */
    registerSkill(skill) {
        const id = skill.name();
        this.skills[id] = skill;
        logger.router.info(`Skill registered: "${id}" (v${skill.version()}, Priority: ${skill.priority()})`);
        eventBus.emit(VoiceEvents.SKILL_REGISTERED, { id, version: skill.version() });
    }

    /**
     * Resolves and routes an intent to its matching registered skill.
     * Integrates background task checks and R15 Resource Mutex locking.
     * @param {Object} intent JSON intent matching IntentContract.v1
     */
    async executeIntent(intent) {
        if (!intent) {
            await recoveryManager.handle('VOICE_004', { detail: 'Empty intent' });
            return;
        }

        // Find skill that can handle this intent
        const skill = Object.values(this.skills)
            .sort((a, b) => b.priority() - a.priority())
            .find(s => s.canHandle(intent));

        if (!skill) {
            logger.router.warn('No registered skill can handle intent:', intent);
            await recoveryManager.handle('VOICE_004', { intent });
            return;
        }

        const manifest = skill.constructor.manifest || {};

        // ─── Background Task Check (Improvement 7) ───────────────────────────
        // High priority commands (>=800) always interrupt. Others check busy state.
        const currentActive = this.activeSkill;
        if (currentActive && manifest.priority < 800 && currentActive.constructor.manifest?.priority >= 800) {
            logger.router.info(`Decline low-priority skill execution ${manifest.id} because high priority ${currentActive.name()} is running.`);
            eventBus.emit(VoiceEvents.COMMAND_DEFERRED, { intent });
            return;
        }

        stateMachine.setEngineState('Executing');
        this.activeSkill = skill;
        eventBus.emit(VoiceEvents.SKILL_STARTED, { id: manifest.id, action: intent.action });

        // ─── 1. Health Checks ───────────────────────────
        const health = skill.healthCheck();
        if (health === 'Busy') {
            await speaker.speak("I'm currently busy. Please wait a moment.", { mode: 'replace' });
            this._resetExecutionState();
            return;
        } else if (health === 'Unavailable' || health === 'Offline') {
            await recoveryManager.handle(health === 'Offline' ? 'VOICE_003' : 'SKILL_ERROR', { skill: manifest.id });
            this._resetExecutionState();
            return;
        }

        // ─── 2. Permission Validation ───────────────────────────
        const requiredPerms = skill.requiredPermissions();
        let allPermissionsApproved = true;
        let missingPermissionName = '';

        for (const perm of requiredPerms) {
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
            this.pendingRecoveryTask = intent;
            await recoveryManager.handle('VOICE_005', { permission: missingPermissionName });
            this._resetExecutionState();
            return;
        }

        // ─── 3. R15 Resource Mutex Locking ───────────────────────────
        const lockedResources = [];
        for (const resource of requiredPerms) {
            const acquired = resourceLock.acquire(resource, manifest.id);
            if (!acquired) {
                const owner = resourceLock.getOwner(resource);
                const ownerDesc = this.skills[owner]?.constructor.manifest?.busyDescription || 'processing';

                // Check priority: if incoming priority is higher, force release and acquire
                if (manifest.priority > (this.skills[owner]?.constructor.manifest?.priority || 0)) {
                    logger.router.info(`Force-releasing ${resource} lock from ${owner} for higher priority ${manifest.id}`);
                    resourceLock.forceRelease(resource);
                    resourceLock.acquire(resource, manifest.id);
                    lockedResources.push(resource);
                } else {
                    // Lower priority: prompt user and defer execution
                    logger.router.warn(`Resource lock conflict on ${resource}. Owner: ${owner}, Requestor: ${manifest.id}`);
                    await speaker.speak(`I'm currently ${ownerDesc}. Please wait or cancel the current task.`, { mode: 'replace' });
                    this._resetExecutionState();
                    return;
                }
            } else {
                lockedResources.push(resource);
            }
        }

        // ─── 4. Execution ───────────────────────────
        try {
            const response = await skill.execute(intent.action, intent.params);
            
            if (response.success) {
                this.consecutiveFailures = 0;
                // Resolve responseKey via responseVariations (v3 Personality Layer)
                if (response.responseKey) {
                    const { pickResponse } = await import('../utils/responseVariations.js');
                    const variation = pickResponse(response.responseKey);
                    if (variation && variation !== 'Done.') {
                        await speaker.speak(variation, { mode: 'replace' });
                    }
                }
            } else {
                await recoveryManager.handle(response.errorCode || 'VOICE_004', { response });
            }

            stateMachine.setEngineState(response.nextState || 'Idle');
            eventBus.emit(VoiceEvents.SKILL_FINISHED, { id: manifest.id, response });
        } catch (err) {
            logger.router.error(`Execution error in skill "${manifest.id}":`, err);
            await recoveryManager.handle('SKILL_ERROR', { skill: manifest.id, error: err.message });
            stateMachine.setEngineState('Idle');
        } finally {
            // Auto-release all locks acquired by this skill
            for (const res of lockedResources) {
                resourceLock.release(res, manifest.id);
            }
            this.activeSkill = null;
        }
    }

    _resetExecutionState() {
        this.activeSkill = null;
        stateMachine.setEngineState('Idle');
    }

    /** Clean shutdown of all registered skills */
    dispose() {
        logger.router.info('Disposing all registered skills...');
        for (const skill of Object.values(this.skills)) {
            try {
                skill.dispose();
            } catch (err) {
                logger.router.error(`Error during dispose of skill ${skill.name()}:`, err.message);
            }
        }
        this.skills = {};
        this.activeSkill = null;
    }
}

// Export single instance
export const router = new Router();
