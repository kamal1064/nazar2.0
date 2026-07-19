const express = require('express');
const router = express.Router();
const Scan = require('../models/Scan');
const User = require('../models/User');
const { validateObjectId } = require('../middleware/validator');
const { scanLimiter } = require('../middleware/rateLimiter');

const SCENE_INSTRUCTION = `You are NAZAR, an AI assistant designed for visually impaired users.

Analyze the image and provide:
1. Immediate hazards first.
2. Nearby objects.
3. People and their relative positions.
4. Important visible text.
5. Navigation guidance.
6. Environmental context.
7. A concise spoken summary.

Rules:
- Safety always comes first.
- Use simple language.
- Mention left, right, front, behind.
- Mention approximate distances when possible.
- Read important text exactly.
- Avoid unnecessary details.
- Keep spoken summaries under 80 words.
- Focus on helping the user move safely.

Focus on these critical hazards if present: stairs, vehicles, bicycles, road crossings, construction zones, open pits, fire, smoke, wet floors, low hanging obstacles, moving objects, and crowded pathways.`;

const OCR_INSTRUCTION = `Extract all visible text from the image, preserving wording precisely for documents, labels, signs, or packaging. Return it structured in JSON.`;

// POST /api/scan - Analyze camera frame using Gemini Vision
router.post('/', scanLimiter, async (req, res, next) => {
    console.log("Received POST /api/scan");

    try {
        const { image, ocrMode } = req.body;
        const rawUserId = req.body.userId || null;
        const userId = (rawUserId && rawUserId.startsWith('local-')) ? null : rawUserId;

        // 1. Validate request payload
        const isImagePresent = !!image;
        const base64Data = isImagePresent ? (image.includes(',') ? image.split(',')[1] : image) : '';
        const imageSizeBytes = isImagePresent ? Buffer.byteLength(base64Data, 'base64') : 0;
        const imageSizeMB = (imageSizeBytes / (1024 * 1024)).toFixed(2);

        console.log(`[Validation] Is image present? ${isImagePresent}`);
        console.log(`[Validation] Image size: ${imageSizeMB} MB (${imageSizeBytes} bytes)`);
        console.log(`[Validation] User ID: ${userId || 'anonymous'}`);

        if (!image) {
            console.warn("[Validation Error] Missing base64 image data");
            return res.status(400).json({ success: false, error: 'Missing base64 image data' });
        }

        if (userId && !validateObjectId(userId)) {
            console.warn(`[Validation Error] Invalid User ID format: ${userId}`);
            return res.status(400).json({ success: false, error: 'Invalid User ID format' });
        }

        // 2. Check environment configuration
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            console.error("[Environment Error] Gemini API Key is not configured");
            return res.status(500).json({ success: false, error: 'Gemini API Key is not configured' });
        }

        const primaryModel = process.env.GEMINI_MODEL || 'gemini-flash-latest';
        const timeoutMs = parseInt(process.env.GEMINI_TIMEOUT || '60000', 10);
        const systemInstruction = ocrMode ? OCR_INSTRUCTION : SCENE_INSTRUCTION;

        // Fallback model chain if primary model hits 429 quota or 404
        const modelChain = Array.from(new Set([
            primaryModel,
            'gemini-flash-lite-latest',
            'gemini-2.0-flash-lite',
            'gemini-flash-latest'
        ]));

        const buildRequestBody = () => ({
            contents: [
                {
                    parts: [
                        { text: systemInstruction },
                        {
                            inlineData: {
                                mimeType: 'image/jpeg',
                                data: base64Data
                            }
                        }
                    ]
                }
            ],
            generationConfig: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: 'OBJECT',
                    properties: {
                        summary: { type: 'STRING' },
                        hazards: {
                            type: 'ARRAY',
                            items: { type: 'STRING' }
                        },
                        objects: {
                            type: 'ARRAY',
                            items: { type: 'STRING' }
                        },
                        people: {
                            type: 'ARRAY',
                            items: { type: 'STRING' }
                        },
                        textDetected: {
                            type: 'ARRAY',
                            items: { type: 'STRING' }
                        },
                        navigation: { type: 'STRING' },
                        environment: { type: 'STRING' },
                        confidence: { type: 'NUMBER' }
                    },
                    required: ['summary', 'hazards', 'objects', 'people', 'textDetected', 'navigation', 'environment', 'confidence']
                }
            }
        });

        const requestBody = buildRequestBody();
        const payloadSizeKB = (Buffer.byteLength(JSON.stringify(requestBody)) / 1024).toFixed(2);
        console.log(`[Config] Timeout: ${timeoutMs}ms (${timeoutMs / 1000}s)`);
        console.log(`[Config] Payload size: ${payloadSizeKB} KB`);

        // Helper function for single request with explicit model & timeout
        const makeSingleGeminiCall = async (targetModel, attemptNum) => {
            console.log(`[Gemini] Request started (Attempt ${attemptNum}, Model: ${targetModel}, Timeout: ${timeoutMs / 1000}s)`);
            const startTime = Date.now();
            const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${apiKey}`;
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
                    console.warn(`[Gemini] Model ${targetModel} HTTP ${response.status} (${duration}ms):`, errText.substring(0, 250));
                    const errorObj = new Error(`HTTP ${response.status}: ${errText}`);
                    errorObj.status = response.status;
                    errorObj.duration = duration;
                    errorObj.model = targetModel;
                    throw errorObj;
                }

                console.log(`[Gemini] Request completed using model ${targetModel} in ${duration} ms`);
                const rawData = await response.json();
                return { rawData, duration, model: targetModel };
            } catch (err) {
                const duration = Date.now() - startTime;
                if (err.name === 'AbortError') {
                    console.error(`[Gemini] Request timed out after ${timeoutMs / 1000} seconds (Model: ${targetModel})`);
                    const timeoutError = new Error(`Gemini request timed out after ${timeoutMs / 1000} seconds.`);
                    timeoutError.isTimeout = true;
                    timeoutError.duration = duration;
                    timeoutError.model = targetModel;
                    throw timeoutError;
                }
                throw err;
            } finally {
                clearTimeout(timer);
            }
        };

        // 3. Execute request with Multi-Model Fallback & Retry
        let apiResult = null;
        let lastError = null;
        let globalAttempt = 0;

        for (const currentModel of modelChain) {
            globalAttempt++;
            try {
                apiResult = await makeSingleGeminiCall(currentModel, globalAttempt);
                if (apiResult) break; // Success!
            } catch (err) {
                lastError = err;
                // If error is 429 (Quota exceeded) or 404 (Not found), seamlessly try next fallback model in chain
                if (err.status === 429 || err.status === 404) {
                    console.warn(`[Gemini] Model ${currentModel} encountered HTTP ${err.status}. Seamlessly falling back to next available model...`);
                    continue;
                }
                // For transient network errors, retry once after 500ms
                if (err.isTimeout || !err.status || err.status >= 500) {
                    console.warn(`[Gemini] Transient error with model ${currentModel} (${err.message}). Retrying once...`);
                    await new Promise(r => setTimeout(r, 500));
                    try {
                        globalAttempt++;
                        apiResult = await makeSingleGeminiCall(currentModel, globalAttempt);
                        if (apiResult) break;
                    } catch (retryErr) {
                        lastError = retryErr;
                        console.warn(`[Gemini] Retry failed for ${currentModel}. Trying fallback model...`);
                        continue;
                    }
                }
            }
        }

        if (!apiResult) {
            console.error('[Gemini] All models in fallback chain failed. Last error:', lastError?.message);
            if (lastError?.isTimeout) {
                return res.status(408).json({ success: false, error: lastError.message });
            }
            if (lastError?.status === 401 || lastError?.status === 403) {
                return res.status(401).json({ success: false, error: 'Invalid or unauthorized Gemini API key.' });
            }
            if (lastError?.status === 429) {
                return res.status(429).json({ success: false, error: 'Gemini rate limit or daily quota exceeded across all models.' });
            }
            return res.status(502).json({ success: false, error: lastError?.message || 'Gemini Vision API request failed.' });
        }

        // 4. Parse response JSON
        let parsedResult;
        try {
            const candidates = apiResult.rawData.candidates || [];
            const textResponse = candidates[0]?.content?.parts[0]?.text || '{}';
            parsedResult = JSON.parse(textResponse);
        } catch (jsonErr) {
            console.error('[Gemini Error] Failed to parse response JSON:', jsonErr.message);
            return res.status(502).json({ success: false, error: 'Failed to parse structured JSON response from Gemini API' });
        }

        // 5. Build and save scan result
        let savedScan = {
            summary: parsedResult.summary || 'Scene scanned.',
            hazards: parsedResult.hazards || [],
            objects: parsedResult.objects || [],
            people: parsedResult.people || [],
            textDetected: parsedResult.textDetected || [],
            navigation: parsedResult.navigation || '',
            environment: parsedResult.environment || '',
            confidence: parsedResult.confidence || 0.0,
            scanMode: ocrMode ? 'ocr' : 'scene',
            createdAt: new Date()
        };

        try {
            const scan = new Scan({
                userId: userId || null,
                imageUrl: '',
                ...savedScan
            });
            await scan.save();
            savedScan.createdAt = scan.createdAt;

            if (userId) {
                const count = await Scan.countDocuments({ userId });
                if (count > 100) {
                    const oldestToKeep = await Scan.find({ userId })
                        .sort({ createdAt: -1 })
                        .skip(99)
                        .limit(1);
                    if (oldestToKeep.length > 0) {
                        await Scan.deleteMany({
                            userId,
                            createdAt: { $lt: oldestToKeep[0].createdAt }
                        });
                    }
                }
            }
        } catch (dbErr) {
            console.warn('[Scan] MongoDB save failed — returning result without persisting:', dbErr.message);
        }

        res.status(200).json({
            success: true,
            summary: savedScan.summary,
            hazards: savedScan.hazards,
            objects: savedScan.objects,
            people: savedScan.people,
            textDetected: savedScan.textDetected,
            navigation: savedScan.navigation,
            environment: savedScan.environment,
            confidence: savedScan.confidence,
            scanMode: savedScan.scanMode,
            timestamp: savedScan.createdAt
        });

    } catch (err) {
        console.error("Gemini Scan Unexpected Error:", err.message);
        res.status(500).json({
            success: false,
            error: err.message || 'Internal server error'
        });
    }
});

// GET /api/scan/:userId - Retrieve scan history for a user
router.get('/:userId', scanLimiter, async (req, res, next) => {
    try {
        const userId = req.params.userId;
        if (!validateObjectId(userId)) {
            return res.status(400).json({ success: false, message: 'Invalid User ID format' });
        }

        const scans = await Scan.find({ userId }).sort({ createdAt: -1 }).limit(100);
        res.status(200).json({ success: true, data: scans });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
