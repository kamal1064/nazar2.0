const ApiKeyUsage = require('../models/ApiKeyUsage');

const MAX_SCANS_PER_KEY = 495;
const SINGLETON_ID = 'default_usage';

// Helper to format today's date in UTC (YYYY-MM-DD)
const getTodayDateString = () => new Date().toISOString().split('T')[0];

/**
 * Dynamically discover configured Gemini API keys from process.env
 * Scans GEMINI_API_KEY_1, GEMINI_API_KEY_2, ... GEMINI_API_KEY_N
 */
function discoverConfiguredKeys() {
    const keysMap = new Map();
    let index = 1;

    while (process.env[`GEMINI_API_KEY_${index}`] !== undefined) {
        const val = (process.env[`GEMINI_API_KEY_${index}`] || '').trim();
        if (val) {
            keysMap.set(index, val);
        }
        index++;
    }

    return keysMap;
}

// In-Memory Fallback State if MongoDB is temporarily unavailable
let inMemoryState = {
    singletonId: SINGLETON_ID,
    activeKey: 1,
    activeModel: process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite',
    keyUsage: new Map(),
    totalScans: 0,
    lastResetDate: getTodayDateString(),
    lastRotation: new Date(),
    rotationReason: 'Initial system startup',
    history: []
};

/**
 * Startup logger to display discovered key configuration
 */
function logStartupValidation() {
    const configuredKeys = discoverConfiguredKeys();
    console.log('[KeyRotation] Startup Key Discovery Validation:');
    if (configuredKeys.size === 0) {
        console.warn('[KeyRotation] WARNING: No Gemini API keys configured in environment variables.');
        return;
    }

    const maxFoundIndex = Math.max(...Array.from(configuredKeys.keys()), 4);
    for (let i = 1; i <= maxFoundIndex; i++) {
        if (configuredKeys.has(i)) {
            console.log(`  ✓ Key ${i}: Configured`);
        } else {
            console.log(`  ✗ Key ${i}: Not configured (skipped)`);
        }
    }
    console.log(`[KeyRotation] Total active configured keys: ${configuredKeys.size}`);
}

// Run startup logger on module load
logStartupValidation();

/**
 * Retrieve or initialize DB state, applying daily reset if UTC date rolled over.
 */
async function getOrInitDbState() {
    const today = getTodayDateString();
    const configuredKeys = discoverConfiguredKeys();
    const sortedKeyIndices = Array.from(configuredKeys.keys()).sort((a, b) => a - b);
    const initialActiveKey = sortedKeyIndices.length > 0 ? sortedKeyIndices[0] : 1;

    try {
        let doc = await ApiKeyUsage.findOne({ singletonId: SINGLETON_ID });
        if (!doc) {
            const initialMap = {};
            sortedKeyIndices.forEach(idx => { initialMap[String(idx)] = 0; });

            doc = new ApiKeyUsage({
                singletonId: SINGLETON_ID,
                activeKey: initialActiveKey,
                activeModel: process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite',
                keyUsage: initialMap,
                totalScans: 0,
                lastResetDate: today,
                lastRotation: new Date(),
                rotationReason: 'Initial state created',
                history: []
            });
            await doc.save();
            return doc;
        }

        // Daily Reset Check
        if (doc.lastResetDate !== today) {
            console.log(`[KeyRotation] New UTC date detected (${today} vs last reset ${doc.lastResetDate}). Performing daily reset...`);
            const resetMap = {};
            sortedKeyIndices.forEach(idx => { resetMap[String(idx)] = 0; });

            const newHistoryItem = {
                from: doc.activeKey,
                to: initialActiveKey,
                reason: `Automatic midnight UTC daily reset (${today})`,
                time: new Date()
            };

            doc.keyUsage = resetMap;
            doc.totalScans = 0;
            doc.activeKey = initialActiveKey;
            doc.lastResetDate = today;
            doc.lastRotation = new Date();
            doc.rotationReason = `Automatic daily reset (${today})`;
            doc.history = [newHistoryItem, ...doc.history].slice(0, 50);

            await doc.save();
            console.log(`[KeyRotation] Daily reset complete. Active key restored to Key #${initialActiveKey}.`);
        }

        return doc;
    } catch (err) {
        console.warn('[KeyRotation] MongoDB access failed — using in-memory state:', err.message);
        if (inMemoryState.lastResetDate !== today) {
            inMemoryState.keyUsage.clear();
            inMemoryState.totalScans = 0;
            inMemoryState.activeKey = initialActiveKey;
            inMemoryState.lastResetDate = today;
            inMemoryState.lastRotation = new Date();
            inMemoryState.rotationReason = `Automatic in-memory daily reset (${today})`;
        }
        return null;
    }
}

/**
 * Convert Mongoose Document / Map to Plain JavaScript Object for usage counts
 */
function parseKeyUsageMap(doc) {
    const usageObj = {};
    if (!doc) {
        inMemoryState.keyUsage.forEach((val, key) => { usageObj[String(key)] = val; });
        return usageObj;
    }

    if (doc.keyUsage instanceof Map) {
        doc.keyUsage.forEach((val, key) => { usageObj[String(key)] = val; });
    } else if (doc.keyUsage && typeof doc.keyUsage === 'object') {
        Object.assign(usageObj, doc.keyUsage);
    }
    return usageObj;
}

/**
 * Get active API key details for making Gemini calls
 * Automatically skips unconfigured or exhausted keys (scans >= 495)
 */
async function getActiveApiKey() {
    const configuredKeys = discoverConfiguredKeys();
    const doc = await getOrInitDbState();
    const usageMap = parseKeyUsageMap(doc);

    const sortedKeyIndices = Array.from(configuredKeys.keys()).sort((a, b) => a - b);

    if (sortedKeyIndices.length === 0) {
        return { keyIndex: null, apiKey: null, isExhausted: true, message: 'No Gemini API keys configured.' };
    }

    let targetKeyIndex = doc ? doc.activeKey : inMemoryState.activeKey;

    // Check if targetKeyIndex is valid and has capacity (< 495)
    const currentScans = usageMap[String(targetKeyIndex)] || 0;
    if (!configuredKeys.has(targetKeyIndex) || currentScans >= MAX_SCANS_PER_KEY) {
        // Find next configured key index with < 495 scans
        const availableIndex = sortedKeyIndices.find(idx => (usageMap[String(idx)] || 0) < MAX_SCANS_PER_KEY);
        if (availableIndex !== undefined) {
            targetKeyIndex = availableIndex;
            // Update activeKey in state
            if (doc) {
                doc.activeKey = targetKeyIndex;
                await doc.save().catch(() => {});
            } else {
                inMemoryState.activeKey = targetKeyIndex;
            }
        } else {
            // All configured keys are exhausted for today
            return {
                keyIndex: null,
                apiKey: null,
                isExhausted: true,
                message: 'Daily scan capacity has been reached. Please try again tomorrow.'
            };
        }
    }

    return {
        keyIndex: targetKeyIndex,
        apiKey: configuredKeys.get(targetKeyIndex),
        isExhausted: false,
        currentScans: usageMap[String(targetKeyIndex)] || 0,
        maxScans: MAX_SCANS_PER_KEY
    };
}

/**
 * Atomically record a successful Gemini scan
 * Increments count only AFTER a valid response is received.
 */
async function recordSuccessfulScan(keyIndex) {
    const configuredKeys = discoverConfiguredKeys();
    const keyProp = `keyUsage.${keyIndex}`;

    try {
        const doc = await ApiKeyUsage.findOneAndUpdate(
            { singletonId: SINGLETON_ID },
            {
                $inc: {
                    [keyProp]: 1,
                    totalScans: 1
                }
            },
            { new: true, upsert: true }
        );

        const usageMap = parseKeyUsageMap(doc);
        const currentScans = usageMap[String(keyIndex)] || 0;
        console.log(`[KeyRotation] Using API Key #${keyIndex} | Scan ${currentScans} / ${MAX_SCANS_PER_KEY}`);

        // Check if key reached 495 threshold -> rotate activeKey to next available key
        if (currentScans >= MAX_SCANS_PER_KEY) {
            const sortedKeyIndices = Array.from(configuredKeys.keys()).sort((a, b) => a - b);
            const nextKeyIndex = sortedKeyIndices.find(idx => idx > keyIndex && (usageMap[String(idx)] || 0) < MAX_SCANS_PER_KEY)
                || sortedKeyIndices.find(idx => (usageMap[String(idx)] || 0) < MAX_SCANS_PER_KEY);

            if (nextKeyIndex !== undefined && nextKeyIndex !== keyIndex) {
                console.log(`[KeyRotation] API Key #${keyIndex} reached ${MAX_SCANS_PER_KEY} scans. Automatically switching to API Key #${nextKeyIndex}.`);
                
                const historyItem = {
                    from: keyIndex,
                    to: nextKeyIndex,
                    reason: `Reached ${MAX_SCANS_PER_KEY} successful scans threshold`,
                    time: new Date()
                };

                doc.activeKey = nextKeyIndex;
                doc.lastRotation = new Date();
                doc.rotationReason = historyItem.reason;
                doc.history = [historyItem, ...(doc.history || [])].slice(0, 50);
                await doc.save();
            }
        }
    } catch (err) {
        console.warn('[KeyRotation] Failed atomic DB update — updating in-memory state:', err.message);
        const prev = inMemoryState.keyUsage.get(keyIndex) || 0;
        inMemoryState.keyUsage.set(keyIndex, prev + 1);
        inMemoryState.totalScans += 1;
    }
}

/**
 * Handle HTTP 429 / RESOURCE_EXHAUSTED quota error
 * Marks key as exhausted (set to 495), advances activeKey, and appends to audit history.
 */
async function rotateOnQuotaError(keyIndex, reasonDescription = 'HTTP 429 Daily Quota Exhausted') {
    const configuredKeys = discoverConfiguredKeys();
    const sortedKeyIndices = Array.from(configuredKeys.keys()).sort((a, b) => a - b);

    console.warn(`[KeyRotation] Quota error on API Key #${keyIndex} (${reasonDescription}). Immediately rotating to next key...`);

    try {
        const doc = await getOrInitDbState();
        if (doc) {
            const usageMap = parseKeyUsageMap(doc);
            usageMap[String(keyIndex)] = MAX_SCANS_PER_KEY;

            const nextKeyIndex = sortedKeyIndices.find(idx => idx !== keyIndex && (usageMap[String(idx)] || 0) < MAX_SCANS_PER_KEY);
            const targetNextKey = nextKeyIndex !== undefined ? nextKeyIndex : doc.activeKey;

            const historyItem = {
                from: keyIndex,
                to: targetNextKey,
                reason: reasonDescription,
                time: new Date()
            };

            doc.keyUsage = usageMap;
            if (nextKeyIndex !== undefined) {
                doc.activeKey = nextKeyIndex;
            }
            doc.lastRotation = new Date();
            doc.rotationReason = reasonDescription;
            doc.history = [historyItem, ...(doc.history || [])].slice(0, 50);

            await doc.save();
            console.log(`[KeyRotation] Key #${keyIndex} marked as exhausted. Rotated to Key #${doc.activeKey}.`);
            return targetNextKey;
        }
    } catch (err) {
        console.warn('[KeyRotation] DB error during quota rotation:', err.message);
    }

    inMemoryState.keyUsage.set(keyIndex, MAX_SCANS_PER_KEY);
    return keyIndex;
}

/**
 * Get comprehensive analytics state for Admin endpoint & Healthcheck
 */
async function getAnalyticsState() {
    const configuredKeys = discoverConfiguredKeys();
    const doc = await getOrInitDbState();
    const usageMap = parseKeyUsageMap(doc);

    const configuredCount = configuredKeys.size;
    let availableCount = 0;
    let totalRemainingScans = 0;

    configuredKeys.forEach((_, idx) => {
        const count = usageMap[String(idx)] || 0;
        if (count < MAX_SCANS_PER_KEY) {
            availableCount++;
            totalRemainingScans += (MAX_SCANS_PER_KEY - count);
        }
    });

    const activeKey = doc ? doc.activeKey : inMemoryState.activeKey;
    const totalScans = doc ? doc.totalScans : inMemoryState.totalScans;
    const history = doc ? doc.history : inMemoryState.history;

    return {
        model: process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite',
        configuredKeys: configuredCount,
        availableKeys: availableCount,
        activeKey: activeKey,
        remainingToday: totalRemainingScans,
        totalCapacity: configuredCount * MAX_SCANS_PER_KEY,
        maxScansPerKey: MAX_SCANS_PER_KEY,
        keyUsage: usageMap,
        totalScans: totalScans,
        lastResetDate: doc ? doc.lastResetDate : inMemoryState.lastResetDate,
        lastRotation: doc ? doc.lastRotation : inMemoryState.lastRotation,
        rotationReason: doc ? doc.rotationReason : inMemoryState.rotationReason,
        history: history || []
    };
}

module.exports = {
    discoverConfiguredKeys,
    getActiveApiKey,
    recordSuccessfulScan,
    rotateOnQuotaError,
    getAnalyticsState
};
