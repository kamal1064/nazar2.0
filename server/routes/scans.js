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

const keyRotationService = require('../services/keyRotationService');

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
            return res.status(400).json({ success: false, message: 'Missing base64 image data.', code: 'BAD_REQUEST' });
        }

        if (userId && !validateObjectId(userId)) {
            console.warn(`[Validation Error] Invalid User ID format: ${userId}`);
            return res.status(400).json({ success: false, message: 'Invalid User ID format.', code: 'INVALID_USER_ID' });
        }

        // 2. Check environment and active API key from Key Rotation Service
        let keyInfo = await keyRotationService.getActiveApiKey();
        if (keyInfo.isExhausted || !keyInfo.apiKey) {
            console.warn("[Quota Limit] Daily scan capacity has been reached across all configured keys.");
            return res.status(429).json({
                success: false,
                message: keyInfo.message || 'Daily scan capacity has been reached. Please try again tomorrow.',
                code: 'TOO_MANY_REQUESTS'
            });
        }

        const targetModel = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
        const timeoutMs = parseInt(process.env.GEMINI_TIMEOUT || '60000', 10);
        const systemInstruction = ocrMode ? OCR_INSTRUCTION : SCENE_INSTRUCTION;

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
        console.log(`[Config] Model: ${targetModel}`);
        console.log(`[Config] Active API Key Index: #${keyInfo.keyIndex}`);
        console.log(`[Config] Timeout: ${timeoutMs}ms (${timeoutMs / 1000}s)`);
        console.log(`[Config] Payload size: ${payloadSizeKB} KB`);

        // Helper function for single request with explicit active key & timeout
        const makeSingleGeminiCall = async (currentKeyIndex, currentApiKey, attemptNum) => {
            console.log(`[Gemini] Request started (Key #${currentKeyIndex}, Attempt ${attemptNum}, Model: ${targetModel})`);
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
                    console.warn(`[Gemini] Key #${currentKeyIndex} Model ${targetModel} HTTP ${response.status} (${duration}ms):`, errText.substring(0, 250));
                    const errorObj = new Error(`HTTP ${response.status}: ${errText}`);
                    errorObj.status = response.status;
                    errorObj.duration = duration;
                    errorObj.keyIndex = currentKeyIndex;
                    errorObj.rawErrorText = errText;
                    throw errorObj;
                }

                console.log(`[Gemini] Request completed using Key #${currentKeyIndex} model ${targetModel} in ${duration} ms`);
                const rawData = await response.json();
                return { rawData, duration, keyIndex: currentKeyIndex };
            } catch (err) {
                const duration = Date.now() - startTime;
                if (err.name === 'AbortError') {
                    console.error(`[Gemini] Request timed out after ${timeoutMs / 1000} seconds (Key #${currentKeyIndex})`);
                    const timeoutError = new Error(`Gemini request timed out after ${timeoutMs / 1000} seconds.`);
                    timeoutError.isTimeout = true;
                    timeoutError.duration = duration;
                    timeoutError.keyIndex = currentKeyIndex;
                    throw timeoutError;
                }
                throw err;
            } finally {
                clearTimeout(timer);
            }
        };

        // 3. Execute request with max 2 retries per key, daily quota key failover, and exponential backoff
        let apiResult = null;
        let lastError = null;
        const maxRetries = 2; // Max 2 retries per key attempt

        let activeKeyIndex = keyInfo.keyIndex;
        let activeApiKeyStr = keyInfo.apiKey;

        for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
            try {
                apiResult = await makeSingleGeminiCall(activeKeyIndex, activeApiKeyStr, attempt);
                if (apiResult) break; // Success!
            } catch (err) {
                lastError = err;
                const errStr = (err.rawErrorText || err.message || '').toUpperCase();
                const isDailyQuotaExhausted = err.status === 429 && (errStr.includes('RESOURCE_EXHAUSTED') || errStr.includes('DAILY') || errStr.includes('QUOTA'));

                if (isDailyQuotaExhausted) {
                    console.warn(`[Gemini] Daily quota exhausted for API Key #${activeKeyIndex}. Rotating key...`);
                    await keyRotationService.rotateOnQuotaError(activeKeyIndex, 'HTTP 429 Daily Quota Exhausted');
                    
                    const nextKeyInfo = await keyRotationService.getActiveApiKey();
                    if (!nextKeyInfo.isExhausted && nextKeyInfo.apiKey) {
                        activeKeyIndex = nextKeyInfo.keyIndex;
                        activeApiKeyStr = nextKeyInfo.apiKey;
                        console.log(`[Gemini] Retrying request seamlessly with new active API Key #${activeKeyIndex}...`);
                        try {
                            apiResult = await makeSingleGeminiCall(activeKeyIndex, activeApiKeyStr, 1);
                            if (apiResult) break;
                        } catch (failoverErr) {
                            lastError = failoverErr;
                        }
                    } else {
                        break;
                    }
                }

                // Transient rate limit or 5xx server error -> retry same key after exponential backoff
                const isTransientError = err.isTimeout || !err.status || [429, 500, 502, 503, 504].includes(err.status);
                if (isTransientError && attempt <= maxRetries) {
                    const backoffMs = Math.pow(2, attempt - 1) * 500; // 500ms, 1000ms
                    console.warn(`[Gemini] Transient error with Key #${activeKeyIndex} (Attempt ${attempt}, Status: ${err.status || 'Network/Timeout'}, ${err.message}). Retrying in ${backoffMs}ms...`);
                    await new Promise(r => setTimeout(r, backoffMs));
                    continue;
                }
                break;
            }
        }

        if (!apiResult) {
            console.error(`[Gemini] Request failed. Last error:`, lastError?.message);
            if (lastError?.isTimeout) {
                return res.status(408).json({ success: false, message: 'Vision request timed out. Please try scanning again.', code: 'REQUEST_TIMEOUT' });
            }
            if (lastError?.status === 401 || lastError?.status === 403) {
                return res.status(401).json({ success: false, message: 'Vision service authorization failed.', code: 'UNAUTHORIZED' });
            }
            if (lastError?.status === 429) {
                return res.status(429).json({ success: false, message: 'Daily scan capacity has been reached. Please try again tomorrow.', code: 'TOO_MANY_REQUESTS' });
            }
            return res.status(502).json({ success: false, message: 'Vision service is temporarily unavailable.', code: 'BAD_GATEWAY' });
        }

        // 4. Parse response JSON
        let parsedResult;
        try {
            const candidates = apiResult.rawData.candidates || [];
            const textResponse = candidates[0]?.content?.parts[0]?.text || '{}';
            parsedResult = JSON.parse(textResponse);
        } catch (jsonErr) {
            console.error('[Gemini Error] Failed to parse response JSON:', jsonErr.message);
            return res.status(502).json({ success: false, message: 'Failed to process structured response from vision service.', code: 'BAD_GATEWAY' });
        }

        // Increment scan count ONLY AFTER a valid response is received and parsed
        await keyRotationService.recordSuccessfulScan(apiResult.keyIndex);

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
