/**
 * NAZAR Backend Groq Conversational AI Service
 * v1.0.0
 * 
 * Replaces legacy conversational AI backend with Groq's llama-3.1-8b-instant.
 * Provides automatic key rotation, persistent quota tracking (MongoDB + Local JSON fallback),
 * daily UTC reset, and 429 failover without exposing API keys or crashing.
 */
const fs = require('fs');
const path = require('path');
const ApiKeyUsage = require('../models/ApiKeyUsage');

const SINGLETON_ID = 'groq_usage';
const ROTATION_LIMIT = 14000; // Quota safety buffer below 14,400 daily limit
const LOCAL_FILE = path.join(__dirname, '../data/groq_usage.json');

// Get current date string in UTC (YYYY-MM-DD)
function getTodayUTC() {
    return new Date().toISOString().split('T')[0];
}

// Discover configured Groq API keys from environment variables
function discoverKeys() {
    const keys = new Map();
    const k1 = (process.env.GROQ_API_KEY_1 || '').trim();
    const k2 = (process.env.GROQ_API_KEY_2 || '').trim();
    if (k1) keys.set(1, k1);
    if (k2) keys.set(2, k2);
    return keys;
}

// In-memory atomic state
let inMemoryState = {
    activeKey: 1,
    key1Requests: 0,
    key2Requests: 0,
    lastReset: getTodayUTC()
};

// Cached HTTP client instances per API key to avoid re-creation per request
const clientCache = new Map();

class GroqClient {
    constructor(apiKey, model) {
        this.apiKey = apiKey;
        this.model = model;
        this.baseUrl = 'https://api.groq.com/openai/v1/chat/completions';
    }

    async chatCompletion(payload, timeoutMs = 15000) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const res = await fetch(this.baseUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: this.model,
                    ...payload
                }),
                signal: controller.signal
            });
            let data = {};
            try {
                data = await res.json();
            } catch (e) {
                data = {};
            }
            return { ok: res.ok, status: res.status, data };
        } finally {
            clearTimeout(timer);
        }
    }
}

function getClient(keyNum, apiKey) {
    const model = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';
    const cacheKey = `${keyNum}:${model}`;
    if (!clientCache.has(cacheKey) || clientCache.get(cacheKey).apiKey !== apiKey) {
        clientCache.set(cacheKey, new GroqClient(apiKey, model));
    }
    return clientCache.get(cacheKey);
}

// Sync memory state with MongoDB and Local JSON file, handling daily UTC midnight reset
async function syncState() {
    const today = getTodayUTC();

    // Check memory date reset
    if (inMemoryState.lastReset !== today) {
        console.log(`[GroqService] Daily UTC midnight reset triggered. Date: ${today}`);
        inMemoryState.key1Requests = 0;
        inMemoryState.key2Requests = 0;
        inMemoryState.activeKey = 1;
        inMemoryState.lastReset = today;
    }

    try {
        let doc = await ApiKeyUsage.findOne({ singletonId: SINGLETON_ID });
        if (!doc) {
            doc = new ApiKeyUsage({
                singletonId: SINGLETON_ID,
                activeKey: inMemoryState.activeKey,
                activeModel: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
                keyUsage: { '1': inMemoryState.key1Requests, '2': inMemoryState.key2Requests },
                totalScans: 0,
                lastResetDate: today,
                rotationReason: 'Initial Groq setup'
            });
            await doc.save();
        } else if (doc.lastResetDate !== today) {
            doc.keyUsage.set('1', 0);
            doc.keyUsage.set('2', 0);
            doc.activeKey = 1;
            doc.lastResetDate = today;
            doc.rotationReason = 'Daily UTC quota reset';
            await doc.save();
        }

        inMemoryState.activeKey = doc.activeKey || 1;
        inMemoryState.key1Requests = doc.keyUsage.get('1') || 0;
        inMemoryState.key2Requests = doc.keyUsage.get('2') || 0;
        inMemoryState.lastReset = doc.lastResetDate || today;
    } catch (dbErr) {
        // Fallback to local JSON file if MongoDB is disconnected or unavailable
        try {
            if (fs.existsSync(LOCAL_FILE)) {
                const raw = fs.readFileSync(LOCAL_FILE, 'utf8');
                const saved = JSON.parse(raw);
                if (saved.lastReset !== today) {
                    saved.key1Requests = 0;
                    saved.key2Requests = 0;
                    saved.activeKey = 1;
                    saved.lastReset = today;
                }
                inMemoryState.activeKey = saved.activeKey || 1;
                inMemoryState.key1Requests = saved.key1Requests || 0;
                inMemoryState.key2Requests = saved.key2Requests || 0;
                inMemoryState.lastReset = saved.lastReset || today;
            }
        } catch (fileErr) {
            // Use existing inMemoryState
        }
    }
}

// Persist state to both local JSON file and MongoDB
async function saveState(reason = '') {
    const dir = path.dirname(LOCAL_FILE);
    try {
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(LOCAL_FILE, JSON.stringify(inMemoryState, null, 2));
    } catch (e) {
        console.warn('[GroqService] Failed to write local JSON fallback file.');
    }

    try {
        let doc = await ApiKeyUsage.findOne({ singletonId: SINGLETON_ID });
        if (doc) {
            doc.activeKey = inMemoryState.activeKey;
            doc.keyUsage.set('1', inMemoryState.key1Requests);
            doc.keyUsage.set('2', inMemoryState.key2Requests);
            doc.lastResetDate = inMemoryState.lastReset;
            if (reason) {
                doc.lastRotation = new Date();
                doc.rotationReason = reason;
                doc.history.push({
                    from: doc.activeKey === 1 ? 2 : 1,
                    to: doc.activeKey,
                    reason: reason,
                    time: new Date()
                });
            }
            await doc.save();
        }
    } catch (e) {
        // MongoDB offline fallback handled by local file persistence
    }
}

// Check quota and rotate automatically at 14,000 requests
async function getActiveKeyNumber() {
    await syncState();
    let kNum = inMemoryState.activeKey;
    let currentReqs = kNum === 1 ? inMemoryState.key1Requests : inMemoryState.key2Requests;

    if (currentReqs >= ROTATION_LIMIT) {
        console.log(`[GroqService] Quota limit (${ROTATION_LIMIT}) reached on API Key #${kNum}. Automatically rotating to next key...`);
        kNum = kNum === 1 ? 2 : 1;
        inMemoryState.activeKey = kNum;
        await saveState(`Quota reached on Key #${kNum === 1 ? 2 : 1}`);
    }
    return kNum;
}

// Record successful request increment
async function recordSuccess(keyNum) {
    if (keyNum === 1) {
        inMemoryState.key1Requests++;
    } else {
        inMemoryState.key2Requests++;
    }
    await saveState('Request success');
    console.log(`[GroqService] Recorded success on Key #${keyNum}. Total Requests -> Key #1: ${inMemoryState.key1Requests}, Key #2: ${inMemoryState.key2Requests}`);
}

// Force rotate between configured keys
async function rotateKey(reason = 'Manual rotation') {
    const oldKey = inMemoryState.activeKey;
    inMemoryState.activeKey = oldKey === 1 ? 2 : 1;
    console.log(`[GroqService] Rotating API Key: #${oldKey} -> #${inMemoryState.activeKey}. Reason: ${reason}`);
    await saveState(reason);
    return inMemoryState.activeKey;
}

/**
 * Generate AI response using Groq llama-3.1-8b-instant with automatic key rotation and 429 failover.
 * @param {Object} options Options containing messages, tools, tool_choice, temperature
 * @returns {Promise<Object>} Result object with success status and completion data
 */
async function generate_response(options) {
    const { messages, tools, tool_choice = 'auto', temperature = 0.1 } = options;
    const keysMap = discoverKeys();

    if (keysMap.size === 0) {
        console.error('[GroqService] No GROQ_API_KEY configured in environment variables.');
        return {
            success: false,
            error: true,
            message: "The assistant is temporarily busy. Please try again in a few minutes.",
            friendlyResponse: true
        };
    }

    const executeCall = async (keyNum) => {
        const apiKey = keysMap.get(keyNum) || keysMap.get(1) || keysMap.get(2);
        if (!apiKey) {
            const err = new Error(`Missing API Key #${keyNum}`);
            err.status = 500;
            throw err;
        }
        const client = getClient(keyNum, apiKey);
        const res = await client.chatCompletion({
            messages,
            tools: tools && tools.length > 0 ? tools : undefined,
            tool_choice: tools && tools.length > 0 ? tool_choice : undefined,
            temperature
        });

        if (!res.ok) {
            const err = new Error(`HTTP ${res.status}: ${JSON.stringify(res.data)}`);
            err.status = res.status;
            err.data = res.data;
            throw err;
        }
        return res.data;
    };

    let currentKeyNum = await getActiveKeyNumber();

    try {
        const data = await executeCall(currentKeyNum);
        await recordSuccess(currentKeyNum);
        return {
            success: true,
            data,
            keyUsed: currentKeyNum
        };
    } catch (err) {
        console.warn(`[GroqService] Error on Key #${currentKeyNum}: HTTP ${err.status || 'unknown'}`);

        // Immediate failover on 429 Too Many Requests or server error
        if (err.status === 429 || err.status >= 500 || err.name === 'AbortError' || !err.status) {
            console.log(`[GroqService] Triggering failover rotation due to error (${err.status || err.message})...`);
            const nextKeyNum = await rotateKey(`Failover from Key #${currentKeyNum} due to HTTP ${err.status || 'error'}`);

            try {
                console.log(`[GroqService] Retrying request once on Key #${nextKeyNum}...`);
                const retryData = await executeCall(nextKeyNum);
                await recordSuccess(nextKeyNum);
                return {
                    success: true,
                    data: retryData,
                    keyUsed: nextKeyNum
                };
            } catch (retryErr) {
                console.error(`[GroqService] Retry failed on Key #${nextKeyNum}: HTTP ${retryErr.status || 'unknown'}`);
            }
        }

        // Both keys failed or unavailable: return friendly message without crashing
        return {
            success: false,
            error: true,
            message: "The assistant is temporarily busy. Please try again in a few minutes.",
            friendlyResponse: true
        };
    }
}

// Get current tracking analytics
function getUsage() {
    return {
        activeKey: inMemoryState.activeKey,
        key1Requests: inMemoryState.key1Requests,
        key2Requests: inMemoryState.key2Requests,
        lastReset: inMemoryState.lastReset,
        model: process.env.GROQ_MODEL || 'llama-3.1-8b-instant'
    };
}

module.exports = {
    generate_response,
    generateResponse: generate_response, // camelCase alias
    rotateKey,
    rotate_key: rotateKey,
    getUsage,
    get_usage: getUsage,
    discoverKeys
};
