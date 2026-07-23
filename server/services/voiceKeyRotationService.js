/**
 * NAZAR Backend Voice API Key Rotation Service
 * v1.0.0
 */
const ApiKeyUsage = require('../models/ApiKeyUsage');

const MAX_CALLS_PER_KEY = 495; // Safety margin for daily Gemini quotas
const SINGLETON_ID = 'voice_usage';

const getTodayDateString = () => new Date().toISOString().split('T')[0];

/**
 * Discover configured Gemini keys from env
 */
function discoverConfiguredKeys() {
    const keysMap = new Map();
    let index = 1;

    // 1. Try finding GEMINI_INTENT_API_KEY_X keys
    while (process.env[`GEMINI_INTENT_API_KEY_${index}`] !== undefined) {
        const val = (process.env[`GEMINI_INTENT_API_KEY_${index}`] || '').trim();
        if (val) {
            keysMap.set(index, val);
        }
        index++;
    }

    // 2. Fallback to GEMINI_INTENT_API_KEY if no indexed keys
    if (keysMap.size === 0 && process.env.GEMINI_INTENT_API_KEY) {
        const val = (process.env.GEMINI_INTENT_API_KEY || '').trim();
        if (val) {
            keysMap.set(1, val);
        }
    }

    // 3. Fallback to scanning keys GEMINI_API_KEY_X
    if (keysMap.size === 0) {
        let scanIndex = 1;
        while (process.env[`GEMINI_API_KEY_${scanIndex}`] !== undefined) {
            const val = (process.env[`GEMINI_API_KEY_${scanIndex}`] || '').trim();
            if (val) {
                keysMap.set(scanIndex, val);
            }
            scanIndex++;
        }
    }

    return keysMap;
}

// In-memory fallback state
let inMemoryState = {
    singletonId: SINGLETON_ID,
    activeKey: 1,
    activeModel: process.env.GEMINI_INTENT_MODEL || 'gemini-2.5-flash-lite',
    keyUsage: new Map(),
    totalCalls: 0,
    lastResetDate: getTodayDateString(),
    lastRotation: new Date(),
    rotationReason: 'Initial startup',
    history: []
};

/**
 * Logs key configuration on startup
 */
function logStartupValidation() {
    const configuredKeys = discoverConfiguredKeys();
    console.log('[VoiceKeyRotation] Discovered keys:');
    if (configuredKeys.size === 0) {
        console.warn('[VoiceKeyRotation] WARNING: No voice or general Gemini API keys configured.');
        return;
    }
    configuredKeys.forEach((val, idx) => {
        console.log(`  ✓ Voice Key ${idx}: Configured`);
    });
    console.log(`[VoiceKeyRotation] Total active voice keys: ${configuredKeys.size}`);
}

logStartupValidation();

async function getOrInitDbState() {
    const today = getTodayDateString();
    const configuredKeys = discoverConfiguredKeys();
    const sortedIndices = Array.from(configuredKeys.keys()).sort((a, b) => a - b);
    const initialActive = sortedIndices.length > 0 ? sortedIndices[0] : 1;

    try {
        let doc = await ApiKeyUsage.findOne({ singletonId: SINGLETON_ID });
        if (!doc) {
            const initialMap = {};
            sortedIndices.forEach(idx => { initialMap[String(idx)] = 0; });

            doc = new ApiKeyUsage({
                singletonId: SINGLETON_ID,
                activeKey: initialActive,
                activeModel: process.env.GEMINI_INTENT_MODEL || 'gemini-2.5-flash-lite',
                keyUsage: initialMap,
                totalScans: 0, // Using totalScans field to store voice calls
                lastResetDate: today,
                lastRotation: new Date(),
                rotationReason: 'Initial state created',
                history: []
            });
            await doc.save();
            return doc;
        }

        // Check daily reset
        if (doc.lastResetDate !== today) {
            console.log(`[VoiceKeyRotation] Daily reset. Current date: ${today}`);
            const resetMap = {};
            sortedIndices.forEach(idx => { resetMap[String(idx)] = 0; });
            doc.keyUsage = resetMap;
            doc.totalScans = 0;
            doc.lastResetDate = today;
            doc.rotationReason = 'Daily quota reset';
            await doc.save();
        }

        return doc;
    } catch (err) {
        console.warn('[VoiceKeyRotation] DB error, using in-memory state:', err.message);
        
        // Sync inMemoryState with date changes
        if (inMemoryState.lastResetDate !== today) {
            inMemoryState.keyUsage.clear();
            inMemoryState.totalCalls = 0;
            inMemoryState.lastResetDate = today;
        }
        return null;
    }
}

/**
 * Returns the currently active API key, and rotates if it has exceeded its quota
 */
async function getActiveKey() {
    const configuredKeys = discoverConfiguredKeys();
    if (configuredKeys.size === 0) {
        throw new Error('No Gemini API keys are configured in environment variables.');
    }

    const doc = await getOrInitDbState();
    let activeKeyIndex = doc ? doc.activeKey : inMemoryState.activeKey;

    // Check if index is still valid in configuration
    if (!configuredKeys.has(activeKeyIndex)) {
        const firstIndex = Array.from(configuredKeys.keys()).sort((a,b)=>a-b)[0];
        console.log(`[VoiceKeyRotation] Current key index ${activeKeyIndex} invalid. Resetting to ${firstIndex}`);
        activeKeyIndex = firstIndex;
        if (doc) {
            doc.activeKey = activeKeyIndex;
            doc.rotationReason = 'Invalid key index correction';
            await doc.save();
        } else {
            inMemoryState.activeKey = activeKeyIndex;
        }
    }

    // Check key usage
    const keyUsageVal = doc 
        ? (doc.keyUsage.get(String(activeKeyIndex)) || 0)
        : (inMemoryState.keyUsage.get(activeKeyIndex) || 0);

    if (keyUsageVal >= MAX_CALLS_PER_KEY) {
        console.log(`[VoiceKeyRotation] Key ${activeKeyIndex} exceeded daily quota (${keyUsageVal}/${MAX_CALLS_PER_KEY}). Rotating...`);
        const nextKey = await rotateKey(`Quota limit reached for key ${activeKeyIndex}`);
        return configuredKeys.get(nextKey);
    }

    return configuredKeys.get(activeKeyIndex);
}

/**
 * Rotates to the next available key
 */
async function rotateKey(reason = 'Manual rotation request') {
    const configuredKeys = discoverConfiguredKeys();
    const sortedIndices = Array.from(configuredKeys.keys()).sort((a,b)=>a-b);
    if (sortedIndices.length <= 1) {
        console.warn('[VoiceKeyRotation] Cannot rotate key: Only 1 key is configured.');
        return sortedIndices[0] || 1;
    }

    const doc = await getOrInitDbState();
    const currentActive = doc ? doc.activeKey : inMemoryState.activeKey;
    const currentIndex = sortedIndices.indexOf(currentActive);
    const nextIndex = (currentIndex + 1) % sortedIndices.length;
    const nextKey = sortedIndices[nextIndex];

    console.log(`[VoiceKeyRotation] Rotating key: ${currentActive} -> ${nextKey}. Reason: ${reason}`);

    if (doc) {
        doc.history.push({
            from: currentActive,
            to: nextKey,
            reason: reason,
            time: new Date()
        });
        doc.activeKey = nextKey;
        doc.lastRotation = new Date();
        doc.rotationReason = reason;
        await doc.save();
    } else {
        inMemoryState.history.push({
            from: currentActive,
            to: nextKey,
            reason: reason,
            time: new Date()
        });
        inMemoryState.activeKey = nextKey;
        inMemoryState.lastRotation = new Date();
        inMemoryState.rotationReason = reason;
    }

    return nextKey;
}

/**
 * Increments call count for current active key
 */
async function incrementUsage() {
    const doc = await getOrInitDbState();
    if (doc) {
        const activeStr = String(doc.activeKey);
        const currentCount = doc.keyUsage.get(activeStr) || 0;
        doc.keyUsage.set(activeStr, currentCount + 1);
        doc.totalScans += 1;
        await doc.save();
    } else {
        const activeIdx = inMemoryState.activeKey;
        const currentCount = inMemoryState.keyUsage.get(activeIdx) || 0;
        inMemoryState.keyUsage.set(activeIdx, currentCount + 1);
        inMemoryState.totalCalls += 1;
    }
}

module.exports = {
    getActiveKey,
    rotateKey,
    incrementUsage,
    discoverConfiguredKeys
};
