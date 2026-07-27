/**
 * NAZAR Backend Voice Intent Router
 * v2.0.0
 *
 * Migrated to Gemini Function Calling (Tools) for higher reliability, schema-less fallback,
 * and conversational context injection support.
 */
const express = require('express');
const router = express.Router();
const groqService = require('../services/groqService');
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
    
    while (history.length > 8) {
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

function convertToGroqTools(geminiToolsArray) {
    if (!geminiToolsArray || !Array.isArray(geminiToolsArray) || geminiToolsArray.length === 0) return [];
    const declarations = geminiToolsArray[0].functionDeclarations || geminiToolsArray;
    return declarations.map(decl => {
        const convertSchema = (schema) => {
            if (!schema || typeof schema !== 'object') return schema;
            const newSchema = { ...schema };
            if (typeof newSchema.type === 'string') {
                newSchema.type = newSchema.type.toLowerCase();
            }
            if (newSchema.properties) {
                const newProps = {};
                for (const [k, v] of Object.entries(newSchema.properties)) {
                    newProps[k] = convertSchema(v);
                }
                newSchema.properties = newProps;
            }
            if (newSchema.items) {
                newSchema.items = convertSchema(newSchema.items);
            }
            return newSchema;
        };

        return {
            type: 'function',
            function: {
                name: decl.name,
                description: decl.description,
                parameters: convertSchema(decl.parameters || { type: 'object', properties: {} })
            }
        };
    });
}

// POST /api/voice/intent - Powered by Groq llama-3.1-8b-instant
router.post('/intent', voiceLimiter, async (req, res, next) => {
    console.log("Received POST /api/voice/intent (Groq Backend)");
    const { text, sessionId, context } = req.body;

    if (!text || typeof text !== 'string') {
        return res.status(400).json({ success: false, message: 'Missing speech command text.', code: 'BAD_REQUEST' });
    }

    const history = getSessionHistory(sessionId);

    // Build OpenAI-compatible messages array for Groq (System Prompt -> Conversation Summary -> Recent Conversation -> Current Page -> Current Mode -> Current User Input)
    const messages = [];
    let systemInstructionText = VOICE_INTENT_INSTRUCTION;
    if (context) {
        const summaryText = context.conversationSummary ? `\nConversation Summary: ${context.conversationSummary}\n` : '';
        const pageText = `Current Page: ${context.currentPage || 'home'}\nCurrent Camera Mode: ${context.currentCameraMode || 'none'}\n`;
        const visionText = context.lastScene ? `Last Vision Scene: "${context.lastScene}"\n` : '';
        const ocrText = context.lastOCR ? `Last OCR Text: "${context.lastOCR}"\n` : '';
        systemInstructionText = `${VOICE_INTENT_INSTRUCTION}\n\n--- App Context ---\n${pageText}${summaryText}${visionText}${ocrText}`;
    }
    messages.push({ role: 'system', content: systemInstructionText });

    history.forEach(turn => {
        const role = (turn.role === 'model' || turn.role === 'assistant') ? 'assistant' : 'user';
        const content = turn.parts && turn.parts[0] ? turn.parts[0].text : (turn.content || '');
        if (content) {
            messages.push({ role, content });
        }
    });

    messages.push({ role: 'user', content: text });

    const groqTools = convertToGroqTools(tools);

    const groqRes = await groqService.generate_response({
        messages,
        tools: groqTools,
        tool_choice: 'auto'
    });

    if (!groqRes.success || groqRes.friendlyResponse) {
        return res.status(503).json({
            success: false,
            message: groqRes.message || "The assistant is temporarily busy. Please try again in a few minutes.",
            code: 'SERVICE_UNAVAILABLE'
        });
    }

    try {
        const choice = groqRes.data.choices && groqRes.data.choices[0];
        if (!choice || !choice.message) {
            throw new Error('Empty response from Groq assistant.');
        }

        const msg = choice.message;
        let name = 'unknown_command';
        let args = { transcript: text };

        if (msg.tool_calls && msg.tool_calls.length > 0) {
            const call = msg.tool_calls[0].function;
            name = call.name;
            try {
                args = JSON.parse(call.arguments || '{}');
            } catch (e) {
                args = {};
            }
        } else if (msg.content) {
            try {
                const parsed = JSON.parse(msg.content);
                if (parsed.name || parsed.function || parsed.tool) {
                    name = parsed.name || (parsed.function && parsed.function.name) || parsed.tool;
                    args = parsed.arguments || parsed.args || (parsed.function && parsed.function.arguments) || {};
                    if (typeof args === 'string') {
                        try { args = JSON.parse(args); } catch (e) { args = {}; }
                    }
                } else {
                    name = 'unknown_command';
                    args = { transcript: text, speechResponse: msg.content };
                }
            } catch (e) {
                name = 'unknown_command';
                args = { transcript: text, speechResponse: msg.content };
            }
        }

        const parsedIntent = mapFunctionCallToIntent(name, args);
        parsedIntent.rawTranscript = text;
        if (args && args.speechResponse) {
            parsedIntent.speechResponse = args.speechResponse;
        }

        // Update session history
        updateSessionHistory(sessionId, 'user', text);
        if (msg.tool_calls && msg.tool_calls.length > 0) {
            updateSessionHistory(sessionId, 'assistant', `[Tool Call: ${name}]`);
        } else if (msg.content) {
            updateSessionHistory(sessionId, 'assistant', msg.content);
        }

        return res.json({
            success: true,
            intent: parsedIntent
        });
    } catch (parseErr) {
        console.error('[Groq Voice] Processing error:', parseErr.message);
        return res.status(502).json({
            success: false,
            message: 'Invalid response returned from Groq assistant.',
            code: 'BAD_GATEWAY'
        });
    }
});

module.exports = router;
