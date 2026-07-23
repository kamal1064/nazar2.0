/**
 * NAZAR Voice Engine Permissions Broker
 * v1.0.0
 */
export class PermissionsBroker {
    constructor() {
        this.micPermission = 'prompt'; // 'prompt', 'granted', 'denied'
    }

    /**
     * Check if the browser supports standard audio/video media devices
     * @returns {boolean}
     */
    hasMediaDevicesSupport() {
        return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    }

    /**
     * Queries current permissions state
     * @returns {Promise<string>} 'granted', 'denied', or 'prompt'
     */
    async checkPermissionStatus() {
        if (!this.hasMediaDevicesSupport()) {
            this.micPermission = 'denied';
            return 'denied';
        }

        try {
            // Browser compatibility check
            if (navigator.permissions && navigator.permissions.query) {
                const status = await navigator.permissions.query({ name: 'microphone' });
                this.micPermission = status.state;
                
                // Watch for changes in permission
                status.onchange = () => {
                    this.micPermission = status.state;
                };
                return status.state;
            }
        } catch (e) {
            console.warn('[PermissionsBroker] navigator.permissions.query not supported or rejected:', e);
        }

        return this.micPermission;
    }

    /**
     * Prompts the user to grant microphone permissions
     * @returns {Promise<boolean>} Resolves to true if granted, false otherwise
     */
    async requestMicrophonePermission() {
        if (!this.hasMediaDevicesSupport()) {
            this.micPermission = 'denied';
            return false;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            // Immediately release the microphone stream (just checking permission)
            stream.getTracks().forEach(track => track.stop());
            
            this.micPermission = 'granted';
            return true;
        } catch (err) {
            console.warn('[PermissionsBroker] Microphone permission request denied or failed:', err);
            this.micPermission = 'denied';
            return false;
        }
    }

    /**
     * Returns true if microphone permissions are currently granted
     * @returns {boolean}
     */
    isGranted() {
        return this.micPermission === 'granted';
    }
}

// Export single instance
export const permissionsBroker = new PermissionsBroker();
