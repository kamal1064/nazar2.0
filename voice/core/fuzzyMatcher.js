/**
 * NAZAR Voice Engine — Fuzzy Matcher (Intent Resolution Layer 2.5)
 * v1.0.0
 *
 * Sits between the regex parser (Layer 2) and Gemini (Layer 3).
 * Catches near-matches that exact/regex parsing misses, reducing Gemini calls
 * by an estimated 40%.
 *
 * Two matching strategies:
 *   1. Substring: transcript contains a known command keyword
 *   2. Edit distance: transcript is within 2 Levenshtein edits of an alias
 *
 * Returns an intent with confidence: 0.85, source: 'local_fuzzy'
 */
import { voiceConfig } from '../utils/voiceConfig.js';
import { logger } from '../utils/logger.js';

// ─── Keyword → intent mapping ─────────────────────────────────────────────────
// Each entry: { keywords: string[], skill, action, params? }
// Keywords are checked via .includes() against the normalized transcript.
const KEYWORD_MAP = [
    // Navigation
    { keywords: ['home', 'go home', 'main page'],          skill: 'navigate',   action: 'home' },
    { keywords: ['camera', 'open camera', 'launch camera'], skill: 'navigate',   action: 'camera' },
    { keywords: ['settings', 'open settings'],              skill: 'navigate',   action: 'settings' },
    { keywords: ['profile', 'my account', 'account'],       skill: 'navigate',   action: 'profile' },
    { keywords: ['go back', 'back', 'previous'],            skill: 'navigate',   action: 'back' },

    // Camera / Vision
    { keywords: ['start scan', 'scan', 'start scanning'],   skill: 'camera',     action: 'startScan' },
    { keywords: ['stop scan', 'stop scanning'],             skill: 'camera',     action: 'stopScan' },
    { keywords: ['text mode', 'read mode', 'ocr'],          skill: 'camera',     action: 'switch_ocr' },
    { keywords: ['scene mode', 'describe mode'],            skill: 'camera',     action: 'switch_scene' },

    // OCR
    { keywords: ['read text', 'read this', 'scan text'],    skill: 'ocr',        action: 'read' },

    // Scene
    { keywords: ['describe', 'surroundings', 'what do you see', 'look around'],
                                                            skill: 'scene',      action: 'describe' },

    // Speech
    { keywords: ['stop', 'stop talking', 'quiet', 'silence'],
                                                            skill: 'speech',     action: 'stop' },
    { keywords: ['repeat', 'say again', 'again'],           skill: 'speech',     action: 'repeat' },
    { keywords: ['pause'],                                  skill: 'speech',     action: 'pause' },
    { keywords: ['continue', 'resume', 'go on'],            skill: 'speech',     action: 'continue' },

    // Settings
    { keywords: ['louder', 'increase volume', 'volume up'],   skill: 'settings', action: 'increaseVolume' },
    { keywords: ['quieter', 'lower volume', 'volume down'],   skill: 'settings', action: 'decreaseVolume' },
    { keywords: ['speak faster', 'faster', 'speed up'],       skill: 'settings', action: 'speak_faster' },
    { keywords: ['speak slower', 'slower', 'slow down'],      skill: 'settings', action: 'speak_slower' },
    { keywords: ['dark mode', 'dark theme'],                  skill: 'settings', action: 'enableDarkMode' },
    { keywords: ['light mode', 'light theme'],                skill: 'settings', action: 'disableDarkMode' },

    // Emergency
    { keywords: ['sos', 'send sos', 'emergency'],             skill: 'emergency', action: 'sendSOS' },
    { keywords: ['cancel sos', 'cancel emergency'],           skill: 'emergency', action: 'cancelSOS' },

    // UI
    { keywords: ['scroll down'],                              skill: 'ui',        action: 'scrollDown' },
    { keywords: ['scroll up'],                                skill: 'ui',        action: 'scrollUp' },
    { keywords: ['help', 'what can you do'],                  skill: 'ui',        action: 'openHelp' },

    // Permission gates
    { keywords: ['yes', 'yeah', 'sure', 'confirm', 'yup'],    skill: 'permission', action: 'confirm' },
    { keywords: ['no', 'nope', 'dont', 'reject'],             skill: 'permission', action: 'cancel' },

    // Object finder
    { keywords: ['find my', 'find the', 'where is', 'locate'],
                                                              skill: 'objectFinder', action: 'find' },
];

/**
 * Compute Levenshtein edit distance between two strings.
 * Uses standard DP approach. Returns the number of single-char edits.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function levenshtein(a, b) {
    const m = a.length, n = b.length;
    // Fast path
    if (m === 0) return n;
    if (n === 0) return m;
    if (Math.abs(m - n) > 3) return 99; // Can't be within 2 edits

    const dp = Array.from({ length: m + 1 }, (_, i) =>
        Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
    );

    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            dp[i][j] = a[i - 1] === b[j - 1]
                ? dp[i - 1][j - 1]
                : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
    }
    return dp[m][n];
}

class FuzzyMatcher {
    /**
     * Attempt to resolve a transcript using fuzzy matching.
     * @param {string} rawTranscript
     * @returns {{ skill, action, params, confidence, source }|null}
     */
    match(rawTranscript) {
        if (!voiceConfig.flags.fuzzyMatcher) return null;

        const normalized = rawTranscript
            .toLowerCase()
            .replace(/[^\w\s]/g, '')
            .replace(/\s+/g, ' ')
            .trim();

        // Strategy 1: Substring match — transcript CONTAINS a keyword
        for (const entry of KEYWORD_MAP) {
            for (const kw of entry.keywords) {
                if (normalized.includes(kw)) {
                    logger.router.debug(`[FuzzyMatcher] Substring match: "${kw}" in "${normalized}"`);
                    return this._buildIntent(entry, rawTranscript, 0.85, normalized);
                }
            }
        }

        // Strategy 2: Edit-distance match — transcript close to a keyword (≤ 2 edits)
        const words = normalized.split(' ');
        for (const entry of KEYWORD_MAP) {
            for (const kw of entry.keywords) {
                const dist = levenshtein(normalized, kw);
                if (dist <= 2) {
                    logger.router.debug(`[FuzzyMatcher] Edit-distance match (dist=${dist}): "${kw}" ≈ "${normalized}"`);
                    return this._buildIntent(entry, rawTranscript, 0.80, normalized);
                }
                // Also check word-level partial matches for longer phrases
                for (const word of words) {
                    if (word.length > 3 && levenshtein(word, kw) <= 1) {
                        logger.router.debug(`[FuzzyMatcher] Word edit-distance match: "${word}" ≈ "${kw}"`);
                        return this._buildIntent(entry, rawTranscript, 0.78, normalized);
                    }
                }
            }
        }

        return null; // No fuzzy match — pass to Gemini
    }

    /** Extract named object from "find my bottle" style transcripts */
    _extractObject(normalized) {
        const match = normalized.match(/(?:find|locate|where is)\s+(?:my\s+|the\s+)?(.+)/);
        return match ? match[1].trim() : null;
    }

    _buildIntent(entry, rawTranscript, confidence, normalized) {
        const params = { ...(entry.params || {}) };
        // Special case: objectFinder needs the object name
        if (entry.skill === 'objectFinder') {
            params.object = this._extractObject(normalized) || 'object';
        }
        return {
            skill:         entry.skill,
            action:        entry.action,
            params,
            confidence,
            source:        'local_fuzzy',
            rawTranscript,
        };
    }
}

// Export single instance
export const fuzzyMatcher = new FuzzyMatcher();
