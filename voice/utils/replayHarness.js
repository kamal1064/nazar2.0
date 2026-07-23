/**
 * NAZAR Voice Engine Replay regression test harness
 * v1.0.0
 */
import { parser } from '../core/parser.js';

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
    { command: "cancel sos", expectedSkill: "emergency", expectedAction: "cancelSOS" }
];

export function runReplayTests() {
    console.log('====================================================');
    console.log('         NAZAR Voice Replay Test Harness             ');
    console.log('====================================================');
    
    let passed = 0;
    let failed = 0;
    const report = [];

    for (const test of testCases) {
        try {
            const resolved = parser.parse(test.command, 'en-US');
            
            if (!resolved) {
                console.error(`❌ FAILED: "${test.command}" -> Returned null intent.`);
                failed++;
                report.push({ command: test.command, success: false, reason: 'Null intent returned' });
                continue;
            }

            const skillMatch = resolved.skill === test.expectedSkill;
            const actionMatch = resolved.action === test.expectedAction;

            if (skillMatch && actionMatch) {
                console.log(`✓ PASSED: "${test.command}" -> Resolved to ${resolved.skill}.${resolved.action} (Confidence: ${resolved.confidence})`);
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
