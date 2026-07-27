/**
 * NAZAR Voice Engine Command Parser
 * v1.0.0
 */
import { english } from '../commands/english.js';
import { hindi } from '../commands/hindi.js';
import { kannada } from '../commands/kannada.js';

export class Parser {
    constructor() {
        this.languagePacks = {
            'en-IN': english,
            'en-US': english,
            'en': english,
            'hi-IN': hindi,
            'hi': hindi,
            'kn-IN': kannada,
            'kn': kannada
        };

        // Regex Rules for dynamic/templated commands (Layer 2)
        this.regexRules = [
            {
                pattern: /^(?:open|go to|show|take me to|navigate to) (home|camera|settings|profile|preferences|account)(?:\s+(?:page|screen|view|tab|mode|panel))?$/i,
                resolver: (match) => {
                    let target = match[1].toLowerCase();
                    if (target === 'preferences') target = 'settings';
                    if (target === 'account') target = 'profile';
                    return {
                        skill: 'navigate',
                        action: target,
                        params: { target },
                        confidence: 1.0,
                        source: 'local_regex'
                    };
                }
            },
            {
                pattern: /^(?:switch to|enable|activate) (text|ocr|scene|describe) mode$/i,
                resolver: (match) => {
                    const mode = match[1].toLowerCase();
                    if (mode === 'text' || mode === 'ocr') {
                        return {
                            skill: 'camera',
                            action: 'switch_ocr',
                            confidence: 0.98,
                            source: 'local_regex'
                        };
                    } else {
                        return {
                            skill: 'camera',
                            action: 'switch_scene',
                            confidence: 0.98,
                            source: 'local_regex'
                        };
                    }
                }
            },
            {
                pattern: /^(?:speak|talk) (faster|slower)$/i,
                resolver: (match) => {
                    const direction = match[1].toLowerCase();
                    return {
                        skill: 'settings',
                        action: direction === 'faster' ? 'speak_faster' : 'speak_slower',
                        confidence: 0.98,
                        source: 'local_regex'
                    };
                }
            },
            {
                pattern: /^(?:find|locate|where is|search for|look for) (?:my\s+|the\s+)?(.+)$/i,
                resolver: (match) => {
                    const object = match[1].trim().toLowerCase();
                    return {
                        skill: 'objectFinder',
                        action: 'find',
                        params: { object },
                        confidence: 0.95,
                        source: 'local_regex'
                    };
                }
            }
        ];
    }

    /**
     * Parses a text transcript based on language packs and regex rules
     * @param {string} transcript 
     * @param {string} locale e.g. 'en-US', 'hi-IN'
     * @returns {Object|null} The resolved intent structure, or null if no local matches found
     */
    parse(transcript, locale = 'en-IN') {
        const cleanText = transcript.trim().toLowerCase();
        if (!cleanText) return null;

        // --- Layer 1: Local Exact Match (Aliases) ---
        // Get the matching language pack (default to English)
        const pack = this.languagePacks[locale] || this.languagePacks[locale.split('-')[0]] || english;
        
        for (const [commandId, aliases] of Object.entries(pack.commands)) {
            if (aliases.includes(cleanText)) {
                // Deconstruct commandId (e.g. 'navigate.home' -> skill: 'navigation', action: 'home')
                const [skillName, actionName] = commandId.split('.');
                return {
                    skill: skillName,
                    action: actionName,
                    params: {},
                    confidence: 1.0,
                    source: 'local_exact'
                };
            }
        }

        // --- Layer 2: Local Regex Rules ---
        for (const rule of this.regexRules) {
            const match = cleanText.match(rule.pattern);
            if (match) {
                return rule.resolver(match);
            }
        }

        // --- Layer 3: No local matches found (will fallback to Gemini Service) ---
        return null;
    }
}

// Export single instance
export const parser = new Parser();
