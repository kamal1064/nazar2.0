/**
 * NAZAR Voice Engine Pluggable Base Skill
 * v1.0.0
 */
export class BaseSkill {
    /**
     * Unique identifier for the skill (e.g. 'navigation')
     * @returns {string}
     */
    name() {
        throw new Error('Skill name must be implemented');
    }

    /**
     * Semantic version of the skill
     * @returns {string} e.g. '1.0.0'
     */
    version() {
        return '1.0.0';
    }

    /**
     * Execution priority (higher is triggered first)
     * @returns {number}
     */
    priority() {
        return 100;
    }

    /**
     * List of supported actions (e.g. ['navigate', 'back'])
     * @returns {Array<string>}
     */
    supportedActions() {
        return [];
    }

    /**
     * Required hardware/browser permissions (e.g. ['camera', 'microphone', 'location'])
     * @returns {Array<string>}
     */
    requiredPermissions() {
        return [];
    }

    /**
     * Queries skill state to ensure it's ready to handle actions
     * @returns {string} 'Ready', 'Busy', or 'Unavailable'
     */
    healthCheck() {
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
     * Core execution logic of the skill
     * @param {string} action 
     * @param {Object} params 
     * @returns {Promise<Object>} Standardized Skill Response
     */
    async execute(action, params = {}) {
        return {
            success: false,
            spokenText: "Action not implemented.",
            nextState: "Idle",
            data: {}
        };
    }

    /**
     * Cleans up local state or listeners
     */
    cleanup() {
        // Optional override
    }
}
