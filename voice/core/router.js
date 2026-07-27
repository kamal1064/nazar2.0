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
import { sessionManager } from './sessionManager.js';
import { CommandPriority } from './priority.js';

export class Router {
    constructor() {
        this.skills = {};
        this.consecutiveFailures = 0;
        this.pendingRecoveryTask = null; // Stash intent here if waiting for permission approval
        this.activeSkill = null;
        this._isCommandLocked = false;
    }

    get isCommandLocked() {
        return this._isCommandLocked || !!this.activeSkill;
    }

    lockCommand(skill) {
        this._isCommandLocked = true;
        this.activeSkill = skill || null;
    }

    /**
     * Validate if execution can proceed
     * @returns {{valid: boolean, reason?: string}}
     */
    validateExecute() {
        return { valid: true };
    }

    unlockCommand() {
        this._isCommandLocked = false;
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
     * Integrates background task checks and R15 Resource Mutex locking.
     */
    async executeIntent(intent) {
        if (this.isCommandLocked && intent.skill === 'navigate') {
            logger.router.warn(`[Command Lock] Ignoring incoming navigation while command execution is locked.`);
            return;
        }

        const gate = this.validateExecute();
        if (!gate.valid) {
            logger.router.info(`[Router] Execution blocked: ${gate.reason}`);
            await recoveryManager.handle('VOICE_004', { detail: gate.reason });
            return;
        }

        if (!intent || !intent.skill || !intent.action) {
            logger.router.warn('Invalid or empty intent payload received:', intent);
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
        logger.router.info(`[Router]\nSelected Skill:\n${skill.constructor.name}`);

        // ─── Priority preemption & lock checks ───────────────────────────
        const currentActive = this.activeSkill;
        if (currentActive) {
            // Command Lock: If an action or navigation is already running, ignore overlapping navigation or duplicate commands!
            const activeId = currentActive.constructor.manifest?.id || '';
            if (intent.skill === 'navigate' || activeId === 'navigate' || intent.skill === activeId) {
                logger.router.warn(`[Command Lock] Ignoring incoming command (${intent.skill}.${intent.action}) while active skill (${activeId || currentActive.constructor.name}) is executing.`);
                return;
            }
            if (manifest.priority >= 800 && (currentActive.constructor.manifest?.priority || 0) < 800) {
                logger.router.info(`Force-cancelling active low-priority skill ${currentActive.constructor.name} for incoming high priority skill ${manifest.id}`);
                try {
                    currentActive.cancel();
                } catch (err) {
                    logger.router.error(`Failed to cancel active skill ${currentActive.constructor.name}:`, err.message);
                }
                speaker.cancel();
            } else if (manifest.priority < 800 && (currentActive.constructor.manifest?.priority || 0) >= 800) {
                logger.router.info(`Decline low-priority skill execution ${manifest.id} because high priority ${currentActive.constructor.name} is running.`);
                eventBus.emit(VoiceEvents.COMMAND_DEFERRED, { intent });
                return;
            }
        }

        this.lockCommand(skill);

        stateMachine.setEngineState('Processing');
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
                    await speaker.speak("I'm still completing your previous request.", { mode: 'replace' });
                    this._resetExecutionState();
                    return;
                }
            } else {
                lockedResources.push(resource);
            }
        }

        // ─── 4. Execution ───────────────────────────
        try {
            logger.router.info(`[Skill]\nExecuting:\n${skill.constructor.name}.${intent.action}()`);
            
            // Watchdog and Execution Context Setup
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('timeout')), 10000)
            );

            const abortController = new AbortController();
            const context = {
                sessionId: sessionManager.sessionId,
                transcript: intent.rawTranscript || '',
                intent: intent,
                abortSignal: abortController.signal,
                startedAt: Date.now(),
                priority: manifest.priority || 0,
                source: intent.source || 'unknown',
                userInitiated: true
            };

            const startTime = performance.now();
            const response = await Promise.race([
                skill.execute(intent.action, intent.params, context),
                timeoutPromise
            ]);
            const duration = Math.round(performance.now() - startTime);

            // Diagnostic logging to see what we actually got
            logger.router.info(`[Skill Diagnostics] Response type: ${typeof response}, value:`, response);
            logger.router.info(`[Skill] Execution completed\nDuration: ${duration}ms`);

            if (response && response.success) {
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
            if (err.message === 'timeout') {
                logger.router.error('[Skill]\nExecution Timeout');
                await speaker.speak("I'm having trouble completing that request. Please try again.", { mode: 'replace' });
            } else if (err.message === 'cancelled' || err.message === 'abort' || err.name === 'AbortError') {
                logger.router.error('[Skill]\nExecution Cancelled');
            } else {
                logger.router.error('[Skill]\nExecution Failed:', err);
                await recoveryManager.handle('SKILL_ERROR', { skill: manifest.id, error: err.message });
            }
            stateMachine.setEngineState('Idle');
        } finally {
            // Auto-release all locks acquired by this skill
            for (const res of lockedResources) {
                resourceLock.release(res, manifest.id);
            }
            this.unlockCommand();
        }
    }

    _resetExecutionState() {
        this.unlockCommand();
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
        this.unlockCommand();
    }
}

// Export single instance
export const router = new Router();
