/**
 * NAZAR Voice Engine Pluggable Base Skill
 * v2.0.0
 */
export class BaseSkill {
    constructor() {
        this._disabled = false;
        this._offlineDisabled = false;
    }

    /**
     * Unique identifier for the skill (e.g. 'navigation')
     * @returns {string}
     */
    name() {
        return this.constructor.manifest?.id || 'base';
    }

    /**
     * Semantic version of the skill
     * @returns {string}
     */
    version() {
        return this.constructor.manifest?.version || '1.0.0';
    }

    /**
     * Execution priority (higher is triggered first)
     * @returns {number}
     */
    priority() {
        return this.constructor.manifest?.priority || 100;
    }

    /**
     * List of supported actions (e.g. ['navigate', 'back'])
     * @returns {Array<string>}
     */
    supportedActions() {
        return this.constructor.manifest?.commands || [];
    }

    /**
     * Required hardware/browser permissions (e.g. ['camera', 'microphone'])
     * @returns {Array<string>}
     */
    requiredPermissions() {
        return this.constructor.manifest?.permissions || [];
    }

    /**
     * Called once after registration to set up listeners or background timers.
     * @returns {Promise<void>}
     */
    async initialize() {
        // Optional override
    }

    /**
     * Queries skill state to ensure it's ready to handle actions
     * @returns {string|Promise<string>} 'Ready', 'Busy', or 'Unavailable'
     */
    healthCheck() {
        if (this._disabled) return 'Unavailable';
        if (this._offlineDisabled) return 'Offline';
        return 'Ready';
    }

    /**
     * Verifies if this skill handles the given intent
     * @param {Object} intent 
     * @returns {boolean}
     */
    canHandle(intent) {
        return intent && intent.skill === this.name() && this.supportedActions().includes(intent.action);
    }

    /**
     * Called when a higher-priority command interrupts this skill mid-execution.
     * Skills should clean up any in-progress async operations or camera sessions.
     */
    cancel() {
        // Optional override
    }

    /**
     * Called on voice engine shutdown or skill unregistration.
     * Skills should remove all event listeners and release resources.
     */
    dispose() {
        // Optional override
    }

    /**
     * Core execution logic of the skill.
     * Returns a SkillResponse matching contracts/SkillResponse.v1.json.
     * @param {string} action 
     * @param {Object} params 
     * @returns {Promise<Object>} Standardized Skill Response with responseKey
     */
    async execute(action, params = {}) {
        return {
            success: false,
            responseKey: 'recovery.generic',
            nextState: "Idle",
            data: {}
        };
    }

    /**
     * Legacy cleanup fallback (aliases to dispose)
     */
    cleanup() {
        this.dispose();
    }
}

