/**
 * NAZAR Voice Engine Replay regression test harness
 * v2.0.0
 */
import { parser } from '../core/parser.js';
import { fuzzyMatcher } from '../core/fuzzyMatcher.js';

export const testCases = [
    { command: "go home", expectedSkill: "navigate", expectedAction: "home" },
    { command: "open camera", expectedSkill: "navigate", expectedAction: "camera" },
    { command: "open settings", expectedSkill: "navigate", expectedAction: "settings" },
    { command: "open profile", expectedSkill: "navigate", expectedAction: "profile" },
    { command: "go back", expectedSkill: "navigate", expectedAction: "back" },
    
    { command: "start scan", expectedSkill: "camera", expectedAction: "startScan" },
    { command: "stop scan", expectedSkill: "camera", expectedAction: "stopScan" },
    { command: "switch to text mode", expectedSkill: "camera", expectedAction: "switch_ocr" },
    { command: "switch to scene mode", expectedSkill: "camera", expectedAction: "switch_scene" },
    
    { command: "increase volume", expectedSkill: "settings", expectedAction: "increaseVolume" },
    { command: "speak faster", expectedSkill: "settings", expectedAction: "speak_faster" },
    { command: "speak slower", expectedSkill: "settings", expectedAction: "speak_slower" },
    
    { command: "send sos", expectedSkill: "emergency", expectedAction: "sendSOS" },
    { command: "cancel sos", expectedSkill: "emergency", expectedAction: "cancelSOS" },

    // New Skill Tests (v4.1 additions)
    { command: "stop speaking", expectedSkill: "speech", expectedAction: "stop" },
    { command: "pause speaking", expectedSkill: "speech", expectedAction: "pause" },
    { command: "repeat last description", expectedSkill: "speech", expectedAction: "repeat" },
    { command: "scroll down please", expectedSkill: "ui", expectedAction: "scrollDown" },
    { command: "scroll up", expectedSkill: "ui", expectedAction: "scrollUp" },
    { command: "what can you do", expectedSkill: "ui", expectedAction: "openHelp" },
    { command: "find my bottle", expectedSkill: "objectFinder", expectedAction: "find" },
    { command: "locate my keys", expectedSkill: "objectFinder", expectedAction: "find" },
    { command: "yes confirm that", expectedSkill: "permission", expectedAction: "confirm" },
    { command: "no reject that", expectedSkill: "permission", expectedAction: "cancel" }
];

export function runReplayTests() {
    console.log('====================================================');
    console.log('         NAZAR Voice Replay Test Harness v2.0.0      ');
    console.log('====================================================');
    
    let passed = 0;
    let failed = 0;
    const report = [];

    for (const test of testCases) {
        try {
            // Level 1 & 2: Parser (exact / regex)
            let resolved = parser.parse(test.command, 'en-US');
            if (!resolved) {
                resolved = parser.parseRegex(test.command, 'en-US');
            }

            // Level 2.5: Fuzzy Local Matcher fallback
            if (!resolved) {
                resolved = fuzzyMatcher.match(test.command);
            }
            
            if (!resolved) {
                console.error(`❌ FAILED: "${test.command}" -> Returned null intent.`);
                failed++;
                report.push({ command: test.command, success: false, reason: 'Null intent returned' });
                continue;
            }

            const skillMatch = resolved.skill === test.expectedSkill;
            const actionMatch = resolved.action === test.expectedAction;

            if (skillMatch && actionMatch) {
                console.log(`✓ PASSED: "${test.command}" -> Resolved to ${resolved.skill}.${resolved.action} (Source: ${resolved.source || 'local'}, Confidence: ${resolved.confidence})`);
                passed++;
                report.push({ command: test.command, success: true });
            } else {
                console.error(`❌ FAILED: "${test.command}" -> Expected ${test.expectedSkill}.${test.expectedAction}, got ${resolved.skill}.${resolved.action}`);
                failed++;
                report.push({ 
                    command: test.command, 
                    success: false, 
                    reason: `Expected ${test.expectedSkill}.${test.expectedAction}, got ${resolved.skill}.${resolved.action}`
                });
            }
        } catch (err) {
            console.error(`❌ EXCEPTION in test "${test.command}":`, err);
            failed++;
            report.push({ command: test.command, success: false, reason: err.message });
        }
    }

    console.log('====================================================');
    console.log(`TEST RUN SUMMARY: Passed ${passed}/${testCases.length} (${((passed/testCases.length)*100).toFixed(0)}%)`);
    console.log('====================================================');

    return {
        success: failed === 0,
        passed,
        failed,
        report
    };
}

// Expose on window for easy browser console execution
window.runVoiceReplayTests = runReplayTests;

