const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('\n===============================================================');
console.log('  NAZAR V2 Voice Assistant Production Refactor Verification  ');
console.log('===============================================================\n');

let passCount = 0;
let failCount = 0;

function check(name, fn) {
    try {
        fn();
        console.log(`  ✓ PASSED: ${name}`);
        passCount++;
    } catch (e) {
        console.error(`  ✗ FAILED: ${name}`);
        console.error(`    ${e.message}`);
        failCount++;
    }
}

const voiceDir = path.resolve(__dirname, '../../voice');
const serverDir = path.resolve(__dirname, '../');

// --- Task 1: Command Lock & Local Expansion ---
check('Task 1: english.js contains expanded local command aliases', () => {
    const content = fs.readFileSync(path.join(voiceDir, 'commands/english.js'), 'utf8');
    assert(content.includes("'cam'"), "Missing 'cam' alias");
    assert(content.includes("'help me'"), "Missing 'help me' alias");
    assert(content.includes("'config'"), "Missing 'config' alias");
    assert(content.includes("'prefs'"), "Missing 'prefs' alias");
    assert(content.includes("'options'"), "Missing 'options' alias");
    assert(content.includes("'go to settings'"), "Missing 'go to settings' alias");
});

check('Task 1: router.js checks isCommandLocked before executing commands', () => {
    const content = fs.readFileSync(path.join(voiceDir, 'core/router.js'), 'utf8');
    assert(content.includes('this.isCommandLocked'), "Router does not check isCommandLocked");
    assert(content.includes('this.lockCommand'), "Router does not lock command execution");
});

// --- Task 2: Wake-Word / Short-Recognition Cycle ---
check('Task 2: voiceConfig.js sets 18s timeout and maxRetries to 3', () => {
    const content = fs.readFileSync(path.join(voiceDir, 'utils/voiceConfig.js'), 'utf8');
    assert(/conversationTimeout:\s*18000/.test(content), "conversationTimeout is not set to 18000 (18s)");
    assert(/maxRetries:\s*3/.test(content), "maxRetries is not set to 3");
    assert(content.includes('WakeStates:'), "WakeStates definition missing in voiceConfig");
});

// --- Task 3: Complete Barge-In Reset & Interrupts ---
check('Task 3: recognition.js implements barge-in reset (speaker.cancel & geminiService.abort)', () => {
    const content = fs.readFileSync(path.join(voiceDir, 'core/recognition.js'), 'utf8');
    assert(content.includes("speaker.cancel()"), "Missing speaker.cancel() on barge-in");
    assert(content.includes("geminiService.abort()"), "Missing geminiService.abort() on barge-in");
    assert(content.includes("stateMachine.setEngineState('Listening')"), "Missing engine state transition to Listening on barge-in");
});

check('Task 3: gemini.js implements abort method and clears timers', () => {
    const content = fs.readFileSync(path.join(voiceDir, 'services/gemini.js'), 'utf8');
    assert(content.includes("abort() {"), "Missing abort() method in gemini.js");
    assert(content.includes("this.activeController.abort()"), "Missing AbortController abort call");
});

// --- Task 4: Sentence-by-Sentence TTS Streaming & FIFO Queue ---
check('Task 4: speaker.js implements chunkTextIntoSentences and FIFO queue', () => {
    const content = fs.readFileSync(path.join(voiceDir, 'core/speaker.js'), 'utf8');
    assert(content.includes("chunkTextIntoSentences(text)"), "Missing chunkTextIntoSentences method");
    assert(content.includes("this._pendingQueue"), "Missing FIFO speech queue");
    assert(content.includes("this._pendingQueue.shift()"), "Missing queue processing logic");
});

// --- Task 5: 4-Pair Context Window & App Context Injection ---
check('Task 5: context.js implements 8-turn sliding history (4 user/assistant pairs)', () => {
    const content = fs.readFileSync(path.join(voiceDir, 'core/context.js'), 'utf8');
    assert(content.includes("this._data.conversationHistory.length > 8"), "History is not capped at 8 turns (4 pairs)");
    assert(content.includes("page_switched"), "Missing page_switched event tracking in context.js");
    assert(content.includes("toGeminiContext()"), "Missing structured context generation");
});

check('Task 5: server/routes/voice.js injects structured app context into system prompt', () => {
    const content = fs.readFileSync(path.join(serverDir, 'routes/voice.js'), 'utf8');
    assert(content.includes("System Prompt -> Conversation Summary -> Recent Conversation -> Current Page -> Current Mode"), "Missing structured app context header in comment/prompt");
    assert(content.includes("Current Page: ${context.currentPage"), "Missing currentPage injection");
    assert(content.includes("Current Camera Mode: ${context.currentCameraMode"), "Missing currentCameraMode injection");
});

// --- Task 6: Conversation Mode Loop & 18s Silence Recovery ---
check('Task 6: conversationManager.js detects trailing questions and auto-returns to Listening', () => {
    const content = fs.readFileSync(path.join(voiceDir, 'core/conversationManager.js'), 'utf8');
    assert(content.includes("/\\?\\s*$/.test(lastSpeech.trim())"), "Missing trailing question detection in conversationManager");
    assert(content.includes("if (!recognition.isContinuous) recognition.start()"), "Missing automatic recognition restart for follow-up questions");
    assert(content.includes("conversationTimeout || 18000"), "Silence timeout fallback is not 18000ms");
    assert(content.includes("Conversation ended."), "Missing 'Conversation ended.' TTS timeout message");
});

// --- Task 7: Voice Activity Indicator & Structured Production Logging ---
check('Task 7: logger.js implements productionLog without raw user speech', () => {
    const content = fs.readFileSync(path.join(voiceDir, 'utils/logger.js'), 'utf8');
    assert(content.includes("productionLog(event, metadata = {})"), "Missing productionLog method in logger.js");
    assert(content.includes("delete safeMeta.transcript"), "Does not delete raw transcript from production logs");
    assert(content.includes("delete safeMeta.rawSpeech"), "Does not delete rawSpeech from production logs");
    assert(content.includes("delete safeMeta.text"), "Does not delete text from production logs");
});

check('Task 7: voiceController.js starts/stops audio visualizer and logs navigation commands', () => {
    const content = fs.readFileSync(path.join(voiceDir, 'controllers/voiceController.js'), 'utf8');
    assert(content.includes("audioVisualizer.start(this._visualizerBars)"), "Missing audioVisualizer.start call");
    assert(content.includes("logger.productionLog('Navigation Command'"), "Missing production log for navigation commands");
});

check('Task 7: recognition.js logs Voice Started, Recognition Success/Failure, and Error', () => {
    const content = fs.readFileSync(path.join(voiceDir, 'core/recognition.js'), 'utf8');
    assert(content.includes("logger.productionLog('Voice Started'"), "Missing production log for Voice Started");
    assert(content.includes("logger.productionLog('Recognition Success'"), "Missing production log for Recognition Success");
    assert(content.includes("logger.productionLog('Recognition Failure'"), "Missing production log for Recognition Failure");
    assert(content.includes("logger.productionLog('Error'"), "Missing production log for Error");
});

check('Task 7: gemini.js logs Groq Request and Groq Response Time', () => {
    const content = fs.readFileSync(path.join(voiceDir, 'services/gemini.js'), 'utf8');
    assert(content.includes("logger.productionLog('Groq Request'"), "Missing production log for Groq Request");
    assert(content.includes("logger.productionLog('Groq Response Time'"), "Missing production log for Groq Response Time");
});

console.log('\n---------------------------------------------------------------');
if (failCount === 0) {
    console.log(`  ALL ${passCount} V2 PRODUCTION REFACTOR VERIFICATION CHECKS PASSED! ✅`);
    console.log('---------------------------------------------------------------\n');
    process.exit(0);
} else {
    console.error(`  ✗ ${failCount} CHECKS FAILED. PLEASE REVIEW ABOVE LOGS.`);
    console.log('---------------------------------------------------------------\n');
    process.exit(1);
}
