/**
 * NAZAR Voice Engine Error Codes Mapping
 * v1.0.0
 */
export const ErrorCodes = {
    VOICE_001: {
        code: 'VOICE_001',
        description: 'Microphone hardware device is missing or disconnected.',
        spokenAlert: 'Microphone not found. Please connect an input device.'
    },
    VOICE_002: {
        code: 'VOICE_002',
        description: 'Speech recognition or synthesis APIs are unsupported by this browser.',
        spokenAlert: 'Voice services are not supported in this browser. Please upgrade.'
    },
    VOICE_003: {
        code: 'VOICE_003',
        description: 'Network connectivity is offline.',
        spokenAlert: 'You are offline. Cloud voice command recognition is unavailable.'
    },
    VOICE_004: {
        code: 'VOICE_004',
        description: 'Intent parsing or structured execution failed.',
        spokenAlert: 'Command not recognized.'
    },
    VOICE_005: {
        code: 'VOICE_005',
        description: 'Voice action blocked due to missing permissions.',
        spokenAlert: 'Permission required. Please check your browser settings.'
    }
};
