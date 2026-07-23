/**
 * NAZAR Backend Voice Intent Router
 * v1.0.0
 */
const express = require('express');
const router = express.Router();
const voiceKeyRotationService = require('../services/voiceKeyRotationService');
const { voiceLimiter } = require('../middleware/rateLimiter');

const VOICE_INTENT_INSTRUCTION = `You are NAZAR's voice intent parser. Analyze the user's spoken command and resolve it into a structured JSON object representing their intent.
Available skills, actions, and expected parameters:
1. navigate:
   - action: 'navigate', params: { target: 'home' | 'camera' | 'settings' | 'profile' }
   - action: 'back', params: {}
2. camera:
   - action: 'startScan', params: {}
   - action: 'stopScan', params: {}
   - action: 'switchTextMode', params: {}
   - action: 'switchSceneMode', params: {}
   - action: 'captureImage', params: {}
   - action: 'readLastResult', params: {}
3. settings:
   - action: 'increaseVolume', params: {}
   - action: 'decreaseVolume', params: {}
   - action: 'speakFaster', params: {}
   - action: 'speakSlower', params: {}
   - action: 'muteVoice', params: {}
   - action: 'unmuteVoice', params: {}
   - action: 'enableDarkMode', params: {}
   - action: 'disableDarkMode', params: {}
4. emergency:
   - action: 'sendSOS', params: {}
   - action: 'cancelSOS', params: {}
   - action: 'shareLocation', params: {}
5. profile:
   - action: 'open', params: {}
   - action: 'signOut', params: {}

Rules:
- Identify the most appropriate skill and action.
- Extract any parameters (e.g. target view).
- Estimate your confidence (value between 0.00 and 1.00). If you are unsure or the command is gibberish, return confidence less than 0.50.`;

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
    
    // Limit to sliding window of 5 turns (10 items total)
    if (history.length > 10) {
        history.shift();
        history.shift();
    }
}

// POST /api/voice/intent
router.post('/intent', voiceLimiter, async (req, res, next) => {
    console.log("Received POST /api/voice/intent");
    const { text, sessionId } = req.body;

    if (!text || typeof text !== 'string') {
        return res.status(400).json({ success: false, message: 'Missing speech command text.', code: 'BAD_REQUEST' });
    }

    const targetModel = process.env.GEMINI_INTENT_MODEL || 'gemini-2.5-flash-lite';
    const timeoutMs = parseInt(process.env.GEMINI_TIMEOUT || '10000', 10);
    const history = getSessionHistory(sessionId);

    // Build standard generative language payload with structured JSON schema
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

        return {
            contents,
            systemInstruction: {
                parts: [{ text: VOICE_INTENT_INSTRUCTION }]
            },
            generationConfig: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: 'OBJECT',
                    properties: {
                        skill: { type: 'STRING' },
                        action: { type: 'STRING' },
                        params: { type: 'OBJECT' },
                        confidence: { type: 'NUMBER' }
                    },
                    required: ['skill', 'action', 'params', 'confidence']
                }
            }
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
            
            // Increment quota call counts
            await voiceKeyRotationService.incrementUsage();
            break;
        } catch (err) {
            console.error(`[Gemini Voice] Attempt ${attempts} failed:`, err.message);
            
            // If HTTP 429 quota exhaustion or model error, rotate key immediately and retry
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

            // Exponential backoff
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempts) * 500));
        }
    }

    try {
        const candidates = apiResult.rawData.candidates;
        if (!candidates || candidates.length === 0 || !candidates[0].content || !candidates[0].content.parts || candidates[0].content.parts.length === 0) {
            throw new Error('Empty Gemini response content.');
        }

        const rawText = candidates[0].content.parts[0].text;
        const parsedIntent = JSON.parse(rawText.trim());

        // Validate structure matching IntentContract.v1.json
        if (!parsedIntent.skill || !parsedIntent.action || parsedIntent.params === undefined || parsedIntent.confidence === undefined) {
            throw new Error('Gemini response failed Intent schema structure validation.');
        }

        // Stash result to sliding window conversation memory on success
        updateSessionHistory(sessionId, 'user', text);
        updateSessionHistory(sessionId, 'model', rawText);

        return res.json({
            success: true,
            intent: parsedIntent
        });
    } catch (parseErr) {
        console.error('[Gemini Voice] Parsing / Schema validation error:', parseErr.message);
        return res.status(502).json({
            success: false,
            message: 'Invalid structured JSON response returned from Gemini.',
            code: 'BAD_GATEWAY'
        });
    }
});

module.exports = router;
