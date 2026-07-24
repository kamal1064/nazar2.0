/**
 * NAZAR Voice Engine — Permission and Confirmation Skill
 * v1.0.0
 *
 * Intercepts dangerous actions (SOS, location sharing, sign out) and prompts
 * the user for confirmation first.
 */
import { BaseSkill } from './BaseSkill.js';
import { router } from '../core/router.js';
import { logger } from '../utils/logger.js';
import { voiceConfig } from '../utils/voiceConfig.js';

const PROTECTED_INTENTS = [
    'emergency.sendSOS',
    'emergency.shareLocation',
    'profile.signOut'
];

export class PermissionSkill extends BaseSkill {
    constructor() {
        super();
        this._pendingIntent = null;
        this._timeoutHandle = null;
        this._timeoutMs = 15000; // 15 seconds confirmation window
    }

    /** Intercept protected intents, or handle yes/no confirmations */
    canHandle(intent) {
        if (!intent) return false;
        
        // 1. If bypass flag is present, let it fall through to the target skill
        if (intent.bypassGate) {
            return false;
        }

        // 2. If it's a critical protected action, intercept it
        const intentKey = `${intent.skill}.${intent.action}`;
        if (PROTECTED_INTENTS.includes(intentKey)) {
            return true;
        }

        // 3. If we are in the middle of a confirmation, handle yes/no intents
        if (this._pendingIntent && intent.skill === 'permission') {
            return true;
        }

        return false;
    }

    async execute(action, params = {}) {
        const intentKey = `${params.skill ?? ''}.${params.action ?? ''}`;

        // Case A: User said a protected action -> Intercept and prompt
        if (PROTECTED_INTENTS.includes(action) || PROTECTED_INTENTS.includes(intentKey)) {
            this._cancelTimeout();
            
            // Re-construct the full intent object to stash
            const targetKey = PROTECTED_INTENTS.includes(action) ? action : intentKey;
            const [targetSkill, targetAction] = targetKey.split('.');
            
            this._pendingIntent = {
                skill: targetSkill,
                action: targetAction,
                params: params,
                confidence: 0.95,
                source: 'permission_gate'
            };

            logger.skill.info(`[PermissionSkill] Intercepted protected action: ${targetKey}`);

            // Start 15s confirmation window timeout
            this._timeoutHandle = setTimeout(() => {
                logger.skill.warn('[PermissionSkill] Confirmation timeout. Action cancelled.');
                this.cancel();
            }, this._timeoutMs);

            return {
                success: true,
                responseKey: `${targetKey}.pending`, // Resolves to "Do you want to send SOS? Say Yes to confirm."
                nextState: 'Listening',
                data: {}
            };
        }

        // Case B: User said "yes" -> Execute stashed intent
        if (action === 'confirm' && this._pendingIntent) {
            this._cancelTimeout();
            const original = this._pendingIntent;
            this._pendingIntent = null;

            logger.skill.info(`[PermissionSkill] User confirmed action: ${original.skill}.${original.action}`);

            // Bypass the gate so it executes on the actual skill
            original.bypassGate = true;
            
            // Execute stashed intent
            await router.executeIntent(original);

            return {
                success: true,
                responseKey: 'permission.confirmation.yes',
                nextState: 'Idle',
                data: {}
            };
        }

        // Case C: User said "no" -> Cancel action
        if (action === 'cancel') {
            this._cancelTimeout();
            this._pendingIntent = null;
            logger.skill.info('[PermissionSkill] User cancelled action.');

            return {
                success: true,
                responseKey: 'permission.confirmation.no',
                nextState: 'Idle',
                data: {}
            };
        }

        return {
            success: false,
            responseKey: 'recovery.generic',
            nextState: 'Idle',
            data: {}
        };
    }

    cancel() {
        this._cancelTimeout();
        this._pendingIntent = null;
    }

    dispose() {
        this.cancel();
    }

    _cancelTimeout() {
        if (this._timeoutHandle) {
            clearTimeout(this._timeoutHandle);
            this._timeoutHandle = null;
        }
    }
}

// Static manifest
PermissionSkill.manifest = {
    id: 'permission',
    version: '1.0.0',
    priority: 1000, // Highest priority to intercept critical actions
    description: 'manage security confirmations for emergency or sensitive actions',
    commands: ['confirm', 'cancel'],
    permissions: [],
    busyDescription: 'waiting for confirmation'
};
