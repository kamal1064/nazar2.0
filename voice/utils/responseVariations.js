/**
 * NAZAR Voice Engine — Response Variations (Voice Personality Layer)
 * v1.0.0
 *
 * All spoken text lives here. Skills return a responseKey — this module
 * resolves it to a random natural-language variation.
 *
 * Usage:
 *   import { pickResponse } from '../utils/responseVariations.js';
 *   const text = pickResponse('camera.startScan.success'); // → "Camera ready."
 */

/** @type {Object<string, string[]>} */
const RESPONSE_POOLS = {

    // ─── Navigation ───────────────────────────────────────────────────────────
    'navigate.home.success':        ['Home opened.', 'Going to the home screen.', 'Here's the home page.'],
    'navigate.camera.success':      ['Camera opened.', 'Launching camera.', 'Camera is ready.', 'Let me open the camera.'],
    'navigate.settings.success':    ['Settings opened.', 'Here are your settings.', 'Opening settings.'],
    'navigate.profile.success':     ['Profile opened.', 'Opening your account.', 'Here's your profile.'],
    'navigate.back.success':        ['Going back.', 'Navigating back.', 'One step back.'],
    'navigate.error':               ['Navigation failed. Please try again.'],

    // ─── Camera ───────────────────────────────────────────────────────────────
    'camera.startScan.success':     ['Scanning your surroundings.', 'Camera ready. Scanning.', 'Let me take a look.', 'Scanning now.'],
    'camera.stopScan.success':      ['Scan stopped.', 'Camera stopped.', 'Done scanning.'],
    'camera.switch_ocr.success':    ['Switched to text mode.', 'Text reading mode active.', 'Ready to read text.'],
    'camera.switch_scene.success':  ['Switched to scene mode.', 'Scene description mode active.'],
    'camera.error':                 ['Camera error. Please try again.'],

    // ─── OCR ──────────────────────────────────────────────────────────────────
    'ocr.read.success':             ['Reading the text.', 'Scanning for text.', 'Let me read that for you.'],
    'ocr.read.noText':              ['No text found. Try moving the camera closer.', "I couldn't read any text. Adjust the camera and try again."],
    'ocr.error':                    ['Text reading failed. Please try again.'],

    // ─── Scene ────────────────────────────────────────────────────────────────
    'scene.describe.success':       ['Analyzing your surroundings.', 'Let me describe what I see.', 'Looking at the scene now.'],
    'scene.describe.cacheHit':      ['Using my previous scan.', 'Based on what I saw earlier —'],
    'scene.error':                  ['Scene analysis failed. Please try again.'],

    // ─── Emergency ────────────────────────────────────────────────────────────
    'emergency.sendSOS.confirmed':  ['Emergency alert sent.', 'SOS sent. Help is on the way.'],
    'emergency.sendSOS.pending':    ['Do you want me to send an SOS? Say Yes to confirm.'],
    'emergency.cancelSOS.success':  ['Alert cancelled.', 'SOS cancelled.', 'Emergency alert stopped.'],
    'emergency.shareLocation.pending': ['Should I share your current location? Say Yes to confirm.'],
    'emergency.shareLocation.success': ['Location shared.'],
    'emergency.error':              ['Emergency action failed. Please try again or call for help directly.'],

    // ─── Settings ─────────────────────────────────────────────────────────────
    'settings.increaseVolume.success':  ['Volume increased.', 'Speaking louder.', 'Got it, turning up the volume.'],
    'settings.decreaseVolume.success':  ['Volume decreased.', 'Speaking quieter.'],
    'settings.speak_faster.success':    ['Speaking faster.', 'Got it, speeding up.'],
    'settings.speak_slower.success':    ['Speaking slower.', 'Slowing down.'],
    'settings.enableDarkMode.success':  ['Dark mode enabled.'],
    'settings.disableDarkMode.success': ['Light mode enabled.'],
    'settings.error':                   ['Settings change failed.'],

    // ─── Profile ──────────────────────────────────────────────────────────────
    'profile.open.success':         ['Account panel opened.', 'Here's your profile.'],
    'profile.signOut.pending':      ['Are you sure you want to sign out? Say Yes to confirm.'],
    'profile.signOut.success':      ['Signed out successfully.', 'You have been signed out.'],
    'profile.error':                ['Profile action failed.'],

    // ─── Speech Controls ──────────────────────────────────────────────────────
    'speech.stop.success':          ['Stopped.', 'Done.', 'Okay.'],
    'speech.repeat.success':        [],  // Handled by speaker.repeat() — no prefix needed
    'speech.pause.success':         ['Paused.'],
    'speech.continue.success':      ['Continuing.'],

    // ─── UI ───────────────────────────────────────────────────────────────────
    'ui.scrollDown.success':        ['Scrolled down.'],
    'ui.scrollUp.success':          ['Scrolled up.'],
    'ui.openMenu.success':          ['Menu opened.'],
    'ui.closeMenu.success':         ['Menu closed.'],
    'ui.openHelp.success':          ['Sure, here's what I can do.'],
    'ui.openHistory.success':       ['Scan history opened.'],
    'ui.error':                     ['That action is not available right now.'],

    // ─── Object Finder ────────────────────────────────────────────────────────
    'objectFinder.find.searching':  ['Looking for it.', 'Let me search for that.', 'Searching...'],
    'objectFinder.find.notFound':   ["I couldn't find it. Move your camera slightly and say 'Scan again'.", "It's not visible. Try a different angle and say 'Scan again'."],
    'objectFinder.find.error':      ['Object search failed. Please try again.'],

    // ─── Permission Gates ─────────────────────────────────────────────────────
    'permission.confirmation.yes':  ['Done.', 'Action confirmed.'],
    'permission.confirmation.no':   ['Action cancelled.', 'Cancelled.', 'No problem.'],
    'permission.timeout':           ['No response received. Action cancelled.'],

    // ─── Wake / Session ───────────────────────────────────────────────────────
    'wake.greeting':                [
        "Go ahead.",
        "Listening.",
        "What can I do?",
        "Tell me what you need.",
        "I'm here.",
        "Yes?",
        "I'm ready.",
        "How may I help?",
        "Speak whenever you're ready.",
        "Ready.",
        "Ready for your command.",
        "What is it?",
        "Yes, I'm listening.",
        "Talk to me.",
        "At your service.",
        "What's on your mind?",
        "Say what you need.",
        "I'm listening."
    ],
    'wake.sleeping':                ["Alright. Say 'Hey Nazar' whenever you need me.", "Going to sleep. Wake me with 'Hey Nazar'."],
    'wake.keepListening':           ["I'll keep listening for 'Hey Nazar'.", "Wake me with 'Hey Nazar'."],
    'conversation.anythingElse':    ['Anything else?', 'Is there anything else?', 'What else can I help with?'],

    // ─── Recovery ─────────────────────────────────────────────────────────────
    'recovery.generic':             ['Something went wrong. Please try again.'],
    'recovery.notUnderstood':       ["I didn't understand. Could you say that differently?", "I'm not sure I got that. Try again?"],
    'recovery.offline':             ["I'm offline. Navigation and local commands still work."],
    'recovery.cameraUnavailable':   ["I couldn't access the camera. Would you like me to try again?"],
    'recovery.geminiUnavailable':   ["I'm temporarily unable to analyze images. Local commands still work."],
};

/** Keep track of recent index selections to prevent repeating the last 3 */
const RECENT_SELECTIONS = {};

/**
 * Pick a random spoken response for the given response key.
 * Falls back to a generic error message if the key is not found.
 * @param {string} key - e.g. 'camera.startScan.success'
 * @returns {string} A randomly selected natural-language response
 */
export function pickResponse(key) {
    const pool = RESPONSE_POOLS[key];

    if (!pool || pool.length === 0) {
        console.warn('[ResponseVariations] No pool for key:', key);
        return 'Done.';
    }

    if (pool.length <= 1) {
        return pool[0];
    }

    if (!RECENT_SELECTIONS[key]) {
        RECENT_SELECTIONS[key] = [];
    }

    const recent = RECENT_SELECTIONS[key];
    let index;
    let attempts = 0;

    // Pick index, avoiding repeating the last 3 selections
    do {
        index = Math.floor(Math.random() * pool.length);
        attempts++;
    } while (recent.includes(index) && attempts < 15);

    recent.push(index);
    if (recent.length > 3) {
        recent.shift();
    }

    return pool[index];
}

/**
 * Returns all available response keys. Used by UISkill for capability discovery.
 * @returns {string[]}
 */
export function getResponseKeys() {
    return Object.keys(RESPONSE_POOLS);
}
