/**
 * NAZAR Voice Engine Configuration
 * v1.0.0
 */
export const voiceConfig = {
    // Delays & Timeouts (in milliseconds)
    thinkingDelay: 700,             // Threshold before playing "thinking" cue/earcon
    geminiTimeout: 10000,           // Timeout for intent API calls
    cameraStartupTimeout: 5000,     // Timeout for starting camera
    idleSleep: 180000,              // 3 minutes of inactivity triggers sleep
    recognitionInactivityTimeout: 15000, // 15 seconds of silence stops listening

    // Bounded Cache
    cacheSize: 100,                 // Maximum LRU Cache Size

    // Performance Budgets (in milliseconds)
    budgets: {
        localCommand: 100,          // Local parsing target latency
        queueDispatch: 50,          // Action queue dispatch latency
        uiAction: 150,              // DOM transition response
        speechTrigger: 300,         // SpeechSynthesis start latency
        geminiResolution: 2000      // Remote Gemini resolution target
    }
};
