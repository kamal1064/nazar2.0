/**
 * NAZAR Voice Engine Command Priority Levels
 * v1.0.0
 */
export const CommandPriority = {
    CRITICAL: 1000,   // Stop, Cancel
    EMERGENCY: 900,   // SOS, Emergency Contact
    HIGH: 700,        // Navigation
    NORMAL: 500,      // Camera, OCR, Scene
    LOW: 300          // Informational
};
