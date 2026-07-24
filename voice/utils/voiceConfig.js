/**
 * NAZAR Voice Engine Configuration
 * v2.0.0
 *
 * Single source of truth for all constants across the voice engine.
 * Organized into 8 sections for easy navigation.
 * All modules must import from the relevant section — no magic numbers elsewhere.
 */
export const voiceConfig = {

    // ─── Feature Flags ────────────────────────────────────────────────────────
    // Set any flag to false to instantly disable that subsystem during debugging.
    flags: {
        wakeWord:           true,   // "Hey Nazar" wake phrase detection
        functionCalling:    true,   // Gemini Function Calling (vs. JSON mode)
        overlay:            true,   // Voice overlay UI
        objectFinder:       true,   // ObjectFinderSkill
        analytics:          true,   // Session performance analytics
        fuzzyMatcher:       true,   // Layer 2.5 fuzzy local matching
        conversationMode:   true,   // "Anything else?" conversation loop
        audioCues:          true,   // Web Audio API earcons
        resourceLock:       true,   // Shared resource mutex
        devHud:             true,   // Developer HUD auto-update
    },

    // ─── Recognition ──────────────────────────────────────────────────────────
    recognition: {
        inactivityTimeout:          15000,  // ms — mic auto-stops on silence
        interimTranscriptEnabled:   true,   // Feed interim results to wake detector
        language:                   'en-US',
        continuous:                 true,   // Keep recognition alive
        interimResults:             true,
    },

    // ─── Conversation ─────────────────────────────────────────────────────────
    conversation: {
        wakeWordTimeout:        10000,  // ms — command window after wake
        conversationTimeout:    10000,  // ms — wait after "Anything else?"
        maxDepth:               8,      // Max rounds before forced sleep
        greetingDelayMs:        800,    // Pause before "Anything else?"
        dedupWindowMs:          500,    // Intent-based dedup window
        // Phonetic aliases for "Hey Nazar" — covers recognition variations
        wakeAliases: [
            'hey nazar', 'hi nazar', 'nazar', 'okay nazar', 'ok nazar',
            'hey nasar', 'hey nazer', 'hey nasa', 'hey naser',
            'hey nizza', 'nazar wake up', 'wake up nazar',
        ],
    },

    // ─── Vision ───────────────────────────────────────────────────────────────
    vision: {
        cacheTTL:       60000,  // ms — scene description cache expiry
        ocrCacheTTL:    120000, // ms — OCR result cache expiry
    },

    // ─── Speech Output ────────────────────────────────────────────────────────
    speech: {
        defaultMode:        'queue',    // 'queue' | 'replace' | 'interrupt'
        thinkingDelay:      700,        // ms — threshold before "thinking" cue
        audioCues: {
            wakeVolume:     0.4,
            successVolume:  0.3,
            errorVolume:    0.3,
        },
    },

    // ─── Analytics ────────────────────────────────────────────────────────────
    analytics: {
        commandHistorySize:     20,     // Ring buffer size for command history
        hudPollingIntervalMs:   30000,  // ms — HUD /api/health poll interval
    },

    // ─── Performance Budgets ──────────────────────────────────────────────────
    performance: {
        budgets: {
            localCommand:       100,    // ms — local parse target
            fuzzyMatch:         50,     // ms — fuzzy match target
            queueDispatch:      50,     // ms — task queue dispatch
            uiAction:           150,    // ms — DOM transition
            speechTrigger:      300,    // ms — SpeechSynthesis start
            geminiResolution:   2000,   // ms — Gemini intent API call
            skillExecution:     500,    // ms — skill execute()
        },
        confidence: {
            executeImmediate:   0.95,   // Band A — execute without confirmation
            askConfirmation:    0.75,   // Band B — confirm before executing
            askRepeat:          0.50,   // Band C — ask to repeat
                                        // Band D (<0.50) — deny
        },
    },

    // ─── Cache ────────────────────────────────────────────────────────────────
    cache: {
        size: 100,          // LRU cache max entries
    },

    // ─── Gemini ───────────────────────────────────────────────────────────────
    gemini: {
        timeout:            10000,  // ms — intent API call timeout
        model:              'gemini-2.5-flash-lite',
    },

    // ─── Security ─────────────────────────────────────────────────────────────
    security: {
        maxTranscriptLength:    500,
        contextWhitelist:       ['lastScene', 'lastOCR', 'currentPage', 'currentCameraMode'],
        // Characters stripped from transcript before sending to Gemini
        stripPattern:           /[<>{}]/g,
    },

    // ─── Timeouts (legacy aliases — keep for backward compatibility) ──────────
    get thinkingDelay()                  { return this.speech.thinkingDelay; },
    get geminiTimeout()                  { return this.gemini.timeout; },
    get cameraStartupTimeout()           { return 5000; },
    get idleSleep()                      { return 180000; },
    get recognitionInactivityTimeout()   { return this.recognition.inactivityTimeout; },
    get cacheSize()                      { return this.cache.size; },
    get budgets()                        { return this.performance.budgets; },
};
