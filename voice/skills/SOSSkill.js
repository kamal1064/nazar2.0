/**
 * NAZAR Voice Engine SOS Skill
 * v1.0.0
 */
import { BaseSkill } from './BaseSkill.js';

export class SOSSkill extends BaseSkill {
    constructor() {
        super();
        this.pendingConfirmation = false;
        this.confirmationTimeout = null;
    }

    name() {
        return 'emergency';
    }

    supportedActions() {
        return ['sendSOS', 'cancelSOS', 'shareLocation', 'confirmSOS'];
    }

    requiredPermissions() {
        return []; // Permission checks are done internally within local location services
    }

    async execute(action, params = {}) {
        console.log(`[SOSSkill] Executing: ${action}`);

        if (!window.NazarVoiceAPI) {
            return {
                success: false,
                spokenText: "Emergency system is unavailable.",
                nextState: "Idle",
                data: {}
            };
        }

        try {
            switch (action) {
                case 'sendSOS':
                    // Trigger confirmation safety loop
                    this.pendingConfirmation = true;
                    this.startConfirmationTimeout();
                    return {
                        success: true,
                        spokenText: "Are you sure you want to send an emergency SOS? Say Yes to confirm.",
                        nextState: "Idle",
                        data: { pendingConfirmation: true }
                    };

                case 'confirmSOS':
                    if (this.pendingConfirmation) {
                        this.clearConfirmationTimeout();
                        this.pendingConfirmation = false;
                        window.NazarVoiceAPI.sendSOS(false); // Send real SOS email
                        return {
                            success: true,
                            spokenText: "Emergency alert sent.",
                            nextState: "Idle",
                            data: { sosSent: true }
                        };
                    } else {
                        return {
                            success: false,
                            spokenText: "No SOS alert was pending confirmation.",
                            nextState: "Idle",
                            data: {}
                        };
                    }

                case 'cancelSOS':
                    this.clearConfirmationTimeout();
                    this.pendingConfirmation = false;
                    // Trigger "I'm Safe" / Cancel SOS action
                    const cancelBtn = document.getElementById('cancel-sos');
                    if (cancelBtn) cancelBtn.click();
                    return {
                        success: true,
                        spokenText: "Emergency alert cancelled.",
                        nextState: "Idle",
                        data: { cancelled: true }
                    };

                case 'shareLocation':
                    // Trigger Location announcement
                    if (typeof window.NazarVoiceAPI.navigate === 'function') {
                        // Switch to camera/home if location handles it
                    }
                    const whereAmIBtn = document.getElementById('feature-places');
                    if (whereAmIBtn) whereAmIBtn.click();
                    return {
                        success: true,
                        spokenText: "Retrieving location.",
                        nextState: "Idle",
                        data: {}
                    };

                default:
                    return {
                        success: false,
                        spokenText: "Emergency action not supported.",
                        nextState: "Idle",
                        data: {}
                    };
            }
        } catch (err) {
            console.error('[SOSSkill] Execution error:', err);
            return {
                success: false,
                spokenText: "Emergency SOS failed to send.",
                nextState: "Idle",
                data: {}
            };
        }
    }

    startConfirmationTimeout() {
        this.clearConfirmationTimeout();
        // Discard confirmation if user waits longer than 15 seconds
        this.confirmationTimeout = setTimeout(() => {
            if (this.pendingConfirmation) {
                console.log('[SOSSkill] SOS Confirmation timeout reached.');
                this.pendingConfirmation = false;
            }
        }, 15000);
    }

    clearConfirmationTimeout() {
        if (this.confirmationTimeout) {
            clearTimeout(this.confirmationTimeout);
            this.confirmationTimeout = null;
        }
    }
}
