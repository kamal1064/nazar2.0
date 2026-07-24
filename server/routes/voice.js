/**
 * NAZAR Backend Voice Intent Router
 * v2.0.0
 *
 * Migrated to Gemini Function Calling (Tools) for higher reliability, schema-less fallback,
 * and conversational context injection support.
 */
const express = require('express');
const router = express.Router();
const voiceKeyRotationService = require('../services/voiceKeyRotationService');
const { voiceLimiter } = require('../middleware/rateLimiter');

const VOICE_INTENT_INSTRUCTION = `You are NAZAR's voice intent parser. Analyze the user's spoken command and choose the most appropriate function call tool.
Available tools correspond to navigation, camera controls, volume/speech adjustments, emergency SOS, profile settings, user interface controls, and object search.

Rules:
- Select the single most specific function that satisfies the user's request.
- Extract any required arguments.
- If the command is completely unrecognized, irrelevant, or is gibberish, invoke the 'unknown_command' tool.`;

// ─── Gemini Tools Declaration ───────────────────────────────────────────────
const tools = [{
    functionDeclarations: [
        {
            name: 'navigate',
            description: 'Navigate to a page or screen in the application.',
            parameters: {
                type: 'OBJECT',
                properties: {
                    target: { type: 'STRING', enum: ['home', 'camera', 'settings', 'profile', 'back'] }
                },
                required: ['target']
            }
        },
        {
            name: 'start_scan',
            description: 'Start scanning surroundings or document text using the camera.',
            parameters: { type: 'OBJECT', properties: {} }
        },
        {
            name: 'stop_scan',
            description: 'Stop the active camera scanning.',
            parameters: { type: 'OBJECT', properties: {} }
        },
        {
            name: 'read_text',
            description: 'Start optical character recognition to read documents or signs in view.',
            parameters: { type: 'OBJECT', properties: {} }
        },
        {
            name: 'describe_scene',
            description: 'Provide a voice description of environmental surroundings and hazards in view.',
            parameters: { type: 'OBJECT', properties: {} }
        },
        {
            name: 'send_sos',
            description: 'Trigger emergency SOS alert message to contacts.',
            parameters: { type: 'OBJECT', properties: {} }
        },
        {
            name: 'cancel_sos',
            description: 'Cancel emergency SOS alert state.',
            parameters: { type: 'OBJECT', properties: {} }
        },
        {
            name: 'share_location',
            description: 'Retrieve and share current location coordinates.',
            parameters: { type: 'OBJECT', properties: {} }
        },
        {
            name: 'stop_speaking',
            description: 'Interrupt and cancel active voice feedback playback.',
            parameters: { type: 'OBJECT', properties: {} }
        },
        {
            name: 'repeat_last',
            description: 'Repeat the last spoken announcement.',
            parameters: { type: 'OBJECT', properties: {} }
        },
        {
            name: 'adjust_volume',
            description: 'Increase or decrease speech output volume.',
            parameters: {
                type: 'OBJECT',
                properties: {
                    direction: { type: 'STRING', enum: ['up', 'down'] }
                },
                required: ['direction']
            }
        },
        {
            name: 'adjust_speech_rate',
            description: 'Speed up or slow down speaking rate.',
            parameters: {
                type: 'OBJECT',
                properties: {
                    direction: { type: 'STRING', enum: ['faster', 'slower'] }
                },
                required: ['direction']
            }
        },
        {
            name: 'enable_dark_mode',
            description: 'Switch application color theme to dark mode.',
            parameters: { type: 'OBJECT', properties: {} }
        },
        {
            name: 'disable_dark_mode',
            description: 'Switch application color theme to light mode.',
            parameters: { type: 'OBJECT', properties: {} }
        },
        {
            name: 'open_profile',
            description: 'Navigate to account panel.',
            parameters: { type: 'OBJECT', properties: {} }
        },
        {
            name: 'sign_out',
            description: 'Log out of user account session.',
            parameters: { type: 'OBJECT', properties: {} }
        },
        {
            name: 'find_object',
            description: 'Initiate search scanner to locate a specific target object.',
            parameters: {
                type: 'OBJECT',
                properties: {
                    object: { type: 'STRING', description: 'Name of the target object to find' }
                },
                required: ['object']
            }
        },
        {
            name: 'switch_camera_mode',
            description: 'Switch camera scan mode between ocr (text reading) and scene (surroundings description).',
            parameters: {
                type: 'OBJECT',
                properties: {
                    mode: { type: 'STRING', enum: ['ocr', 'scene'] }
                },
                required: ['mode']
            }
        },
        {
            name: 'unknown_command',
            description: 'Fallback triggered when a user command is not recognized or is gibberish.',
            parameters: {
                type: 'OBJECT',
                properties: {
                    transcript: { type: 'STRING', description: 'The unrecognized raw text command transcript' }
                },
                required: ['transcript']
            }
        }
    ]
}];

// In-Memory sliding window history: sessionId -> array of { role, parts: [{ text }] }
const sessionStore = new Map();

function getSessionHistory(sessionId) {
    if (!sessionId) return [];
    if (!sessionStore.has(sessionId)) {
        sessionStore.set(sessionId, []);
    }
    return sessionStore.get(sessionId);
}

function updateSessionHistory(sessionId, role, text) {
    if (!sessionId) return;
    const history = getSessionHistory(sessionId);
    history.push({ role, parts: [{ text }] });
    
    if (history.length > 10) {
        history.shift();
        history.shift();
    }
}

/** Map function Call Name to structured local intent schema */
function mapFunctionCallToIntent(name, args) {
    let skill = 'unknown';
    let action = 'unknown';
    let params = { ...args };
    let confidence = 0.95;

    switch (name) {
        case 'navigate':
            skill = 'navigate';
            action = args.target === 'back' ? 'back' : 'navigate';
            params = args.target === 'back' ? {} : { target: args.target };
            break;
        case 'start_scan':
            skill = 'camera';
            action = 'startScan';
            break;
        case 'stop_scan':
            skill = 'camera';
            action = 'stopScan';
            break;
        case 'read_text':
            skill = 'ocr';
            action = 'read';
            break;
        case 'describe_scene':
            skill = 'scene';
            action = 'describe';
            break;
        case 'send_sos':
            skill = 'emergency';
            action = 'sendSOS';
            break;
        case 'cancel_sos':
            skill = 'emergency';
            action = 'cancelSOS';
            break;
        case 'share_location':
            skill = 'emergency';
            action = 'shareLocation';
            break;
        case 'stop_speaking':
            skill = 'speech';
            action = 'stop';
            break;
        case 'repeat_last':
            skill = 'speech';
            action = 'repeat';
            break;
        case 'adjust_volume':
            skill = 'settings';
            action = args.direction === 'up' ? 'increaseVolume' : 'decreaseVolume';
            break;
        case 'adjust_speech_rate':
            skill = 'settings';
            action = args.direction === 'faster' ? 'speakFaster' : 'speakSlower';
            break;
        case 'enable_dark_mode':
            skill = 'settings';
            action = 'enableDarkMode';
            break;
        case 'disable_dark_mode':
            skill = 'settings';
            action = 'disableDarkMode';
            break;
        case 'open_profile':
            skill = 'profile';
            action = 'open';
            break;
        case 'sign_out':
            skill = 'profile';
            action = 'signOut';
            break;
        case 'find_object':
            skill = 'objectFinder';
            action = 'find';
            params = { object: args.object };
            break;
        case 'switch_camera_mode':
            skill = 'camera';
            action = args.mode === 'ocr' ? 'switch_ocr' : 'switch_scene';
            break;
        case 'unknown_command':
        default:
            skill = 'unknown';
            action = 'unknown';
            confidence = 0.30;
            break;
    }

    return { skill, action, params, confidence };
}

// POST /api/voice/intent
router.post('/intent', voiceLimiter, async (req, res, next) => {
    console.log("Received POST /api/voice/intent");
    const { text, sessionId, context } = req.body;

    if (!text || typeof text !== 'string') {
        return res.status(400).json({ success: false, message: 'Missing speech command text.', code: 'BAD_REQUEST' });
    }

    const targetModel = process.env.GEMINI_INTENT_MODEL || 'gemini-2.5-flash-lite';
    const timeoutMs = parseInt(process.env.GEMINI_TIMEOUT || '10000', 10);
    const history = getSessionHistory(sessionId);

    // Build standard generative language payload with tools
    const buildRequestBody = () => {
        const contents = [];
        
        // Push recent sliding window history
        history.forEach(turn => {
            contents.push({
                role: turn.role,
                parts: turn.parts
            });
        });

        // Push current prompt
        contents.push({
            role: 'user',
            parts: [{ text }]
        });

        // Prepend context description if provided
        let systemInstructionText = VOICE_INTENT_INSTRUCTION;
        if (context) {
            systemInstructionText = `Current user application context:\n${JSON.stringify(context, null, 2)}\n\n` + VOICE_INTENT_INSTRUCTION;
        }

        return {
            contents,
            systemInstruction: {
                parts: [{ text: systemInstructionText }]
            },
            tools
        };
    };

    const requestBody = buildRequestBody();

    // Helper for single HTTP request to Gemini API
    const makeSingleGeminiCall = async (currentApiKey, attemptNum) => {
        console.log(`[Gemini Voice] Request started (Attempt ${attemptNum}, Model: ${targetModel})`);
        const startTime = Date.now();
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${currentApiKey}`;
        
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const response = await fetch(geminiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
                signal: controller.signal
            });

            const duration = Date.now() - startTime;

            if (!response.ok) {
                const errText = await response.text();
                console.warn(`[Gemini Voice] HTTP ${response.status} (${duration}ms):`, errText.substring(0, 250));
                const errorObj = new Error(`HTTP ${response.status}: ${errText}`);
                errorObj.status = response.status;
                throw errorObj;
            }

            console.log(`[Gemini Voice] Request completed in ${duration} ms`);
            const rawData = await response.json();
            return { rawData, duration };
        } catch (err) {
            if (err.name === 'AbortError') {
                console.error(`[Gemini Voice] Request timed out after ${timeoutMs / 1000} seconds.`);
                const timeoutError = new Error(`Gemini request timed out after ${timeoutMs / 1000} seconds.`);
                timeoutError.isTimeout = true;
                throw timeoutError;
            }
            throw err;
        } finally {
            clearTimeout(timer);
        }
    };

    // Retry loop with failover key rotation support
    let apiResult = null;
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
        attempts++;
        try {
            const activeKey = await voiceKeyRotationService.getActiveKey();
            apiResult = await makeSingleGeminiCall(activeKey, attempts);
            await voiceKeyRotationService.incrementUsage();
            break;
        } catch (err) {
            console.error(`[Gemini Voice] Attempt ${attempts} failed:`, err.message);
            if (err.status === 429 || err.status === 403 || err.isTimeout) {
                console.warn('[Gemini Voice] Rotating key due to HTTP error or timeout...');
                await voiceKeyRotationService.rotateKey(err.message);
            }

            if (attempts >= maxAttempts) {
                return res.status(502).json({
                    success: false,
                    message: 'Gemini intent resolution failed after repeated retries.',
                    code: 'BAD_GATEWAY'
                });
            }
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempts) * 500));
        }
    }

    try {
        const candidates = apiResult.rawData.candidates;
        if (!candidates || candidates.length === 0 || !candidates[0].content || !candidates[0].content.parts || candidates[0].content.parts.length === 0) {
            throw new Error('Empty Gemini response content.');
        }

        const part = candidates[0].content.parts[0];
        if (!part.functionCall) {
            throw new Error('Gemini did not return a functionCall tool invocation.');
        }

        const call = part.functionCall;
        const parsedIntent = mapFunctionCallToIntent(call.name, call.args || {});
        parsedIntent.rawTranscript = text;

        // Stash result to sliding window conversation memory on success
        updateSessionHistory(sessionId, 'user', text);
        updateSessionHistory(sessionId, 'model', JSON.stringify(call));

        return res.json({
            success: true,
            intent: parsedIntent
        });
    } catch (parseErr) {
        console.error('[Gemini Voice] Processing error:', parseErr.message);
        return res.status(502).json({
            success: false,
            message: 'Invalid tool calling response returned from Gemini.',
            code: 'BAD_GATEWAY'
        });
    }
});

module.exports = router;
