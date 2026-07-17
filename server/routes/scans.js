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
    try {
        const { userId, image, ocrMode } = req.body;

        if (!image) {
            return res.status(400).json({ success: false, message: 'Missing base64 image data' });
        }

        // Validate userId if provided
        if (userId && !validateObjectId(userId)) {
            return res.status(400).json({ success: false, message: 'Invalid User ID format' });
        }

        const apiKey = process.env.GEMINI_API_KEY;
        const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
        
        if (!apiKey) {
            return res.status(500).json({ success: false, message: 'Gemini API Key is not configured' });
        }

        const systemInstruction = ocrMode ? OCR_INSTRUCTION : SCENE_INSTRUCTION;

        // Strip base64 metadata headers if present
        const base64Data = image.includes(',') ? image.split(',')[1] : image;

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

        const requestBody = {
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
        };

        // Enforce 15-second request timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        let response;
        try {
            response = await fetch(geminiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
                signal: controller.signal
            });
        } catch (fetchErr) {
            if (fetchErr.name === 'AbortError') {
                return res.status(408).json({ success: false, message: 'Scan timed out' });
            }
            throw fetchErr;
        } finally {
            clearTimeout(timeoutId);
        }

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Gemini API responded with status ${response.status}: ${errText}`);
        }

        const rawData = await response.json();
        let parsedResult;

        try {
            const candidates = rawData.candidates || [];
            const textResponse = candidates[0]?.content?.parts[0]?.text || '{}';
            parsedResult = JSON.parse(textResponse);
        } catch (jsonErr) {
            throw new Error('Failed to parse structured JSON response from Gemini API');
        }

        // Attempt to save scan to MongoDB (non-fatal if DB unavailable)
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

            // Pruning logic: keep last 100 scans per user
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
        next(err);
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
