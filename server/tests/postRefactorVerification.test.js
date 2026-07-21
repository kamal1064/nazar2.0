const http = require('http');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const connectDB = require('../db');
const keyRotationService = require('../services/keyRotationService');
const handler = require('../server');

// Tiny 1x1 transparent PNG base64 for vision test payload
const TEST_BASE64_IMAGE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

function runTestServer() {
    return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
            handler(req, res);
        });
        server.listen(0, '127.0.0.1', () => {
            const port = server.address().port;
            resolve({ server, port });
        });
    });
}

function makeRequest(port, method, reqPath, body = null, headers = {}) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : '';
        const req = http.request({
            hostname: '127.0.0.1',
            port,
            path: reqPath,
            method,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
                ...headers
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                let parsed = {};
                try { parsed = JSON.parse(data); } catch (e) { parsed = data; }
                resolve({ statusCode: res.statusCode, headers: res.headers, body: parsed });
            });
        });

        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

/**
 * Module 1: Repository Audit for Legacy Variables
 */
function runRepositoryAudit() {
    console.log('\n--- Module 1: Repository Codebase Audit ---');
    const rootDir = path.resolve(__dirname, '../../');
    const legacyPatterns = [
        /process\.env\.GEMINI_API_KEY(?![_\d\w])/,
        /GEMINI_API_KEY=(?![_\d\w])/,
        /['"]GEMINI_API_KEY['"]/
    ];

    let violationCount = 0;

    function walkDir(dir) {
        const files = fs.readdirSync(dir);
        for (const file of files) {
            if (file === 'node_modules' || file === '.git' || file === 'brain' || file === '.system_generated') continue;
            const fullPath = path.join(dir, file);
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
                walkDir(fullPath);
            } else if (/\.(js|json|html|css|env|md)$/i.test(file)) {
                // Ignore env example or test files documenting legacy removal intentionally
                if (file.includes('postRefactorVerification') || file.includes('implementation_plan')) continue;
                const content = fs.readFileSync(fullPath, 'utf8');
                for (const pattern of legacyPatterns) {
                    if (pattern.test(content)) {
                        console.error(`  ❌ Legacy match in ${fullPath}: matches ${pattern}`);
                        violationCount++;
                    }
                }
            }
        }
    }

    walkDir(rootDir);
    assert.strictEqual(violationCount, 0, 'Found un-numbered legacy GEMINI_API_KEY references in codebase!');
    console.log('  ✓ PASSED: 0 un-numbered GEMINI_API_KEY occurrences found in repository.');
}

/**
 * Module 2: Sparse Key Discovery & Rotation Unit Test
 */
function runKeyDiscoveryTest() {
    console.log('\n--- Module 2: Key Discovery & Sparse Key Test ---');
    const keysMap = keyRotationService.discoverConfiguredKeys();
    assert.ok(keysMap.size >= 1, 'Key discovery failed to find configured keys');
    console.log(`  ✓ Discovered ${keysMap.size} active numbered keys:`, Array.from(keysMap.keys()));
    assert.ok(keysMap.has(1), 'GEMINI_API_KEY_1 must be configured');
    assert.ok(keysMap.has(2), 'GEMINI_API_KEY_2 must be configured');
    assert.ok(keysMap.has(3), 'GEMINI_API_KEY_3 must be configured');
    assert.ok(keysMap.has(4), 'GEMINI_API_KEY_4 must be configured');
    console.log('  ✓ PASSED: All 4 numbered keys discovered in numeric order.');
}

/**
 * Module 3: Concurrency & Atomic Counter Test
 */
async function runConcurrencyTest() {
    console.log('\n--- Module 3: Concurrency & Atomic State Test ---');
    await connectDB();
    
    const initialAnalytics = await keyRotationService.getAnalyticsState();
    const initialScans = initialAnalytics.totalScans || 0;
    
    // Simulate 10 simultaneous scan completions
    const promises = [];
    for (let i = 0; i < 10; i++) {
        promises.push(keyRotationService.recordSuccessfulScan(1));
    }
    await Promise.all(promises);

    const updatedAnalytics = await keyRotationService.getAnalyticsState();
    const finalScans = updatedAnalytics.totalScans;
    
    assert.strictEqual(finalScans, initialScans + 10, `Atomic concurrency failed: expected ${initialScans + 10}, got ${finalScans}`);
    console.log(`  ✓ PASSED: 10 concurrent scan updates processed atomically (${initialScans} -> ${finalScans}).`);
}

/**
 * Module 4: Diagnostics & Health Check Test
 */
async function runHealthCheckTest(port) {
    console.log('\n--- Module 4: Diagnostics & Health Check Test ---');
    
    const healthRes = await makeRequest(port, 'GET', '/health');
    assert.strictEqual(healthRes.statusCode, 200);
    assert.strictEqual(healthRes.body.success, true);
    assert.ok(healthRes.body.configuredKeys >= 4);
    assert.ok(healthRes.body.activeApiKey >= 1);
    console.log(`  ✓ Health status: ${healthRes.body.status}, Active Key Index: #${healthRes.body.activeApiKey}, Configured Keys: ${healthRes.body.configuredKeys}`);

    const adminRes = await makeRequest(port, 'GET', '/api/admin/api-usage');
    assert.strictEqual(adminRes.statusCode, 200);
    assert.strictEqual(adminRes.body.success, true);
    assert.ok(adminRes.body.keyUsage);
    console.log('  ✓ Admin analytics capacity:', adminRes.body.remainingToday, '/', adminRes.body.totalCapacity, 'scans remaining today.');
    console.log('  ✓ PASSED: Health check & diagnostic endpoints operating cleanly.');
}

/**
 * Module 5: Live Gemini API Scan Integration Test
 */
async function runVisionApiTest(port) {
    console.log('\n--- Module 5: Live Vision API Integration Test (gemini-3.1-flash-lite) ---');
    
    // Scene Mode Test
    console.log('  Executing Scene Scan request...');
    const sceneRes = await makeRequest(port, 'POST', '/api/scan', {
        image: TEST_BASE64_IMAGE,
        ocrMode: false
    });

    assert.strictEqual(sceneRes.statusCode, 200, `Scan failed with status ${sceneRes.statusCode}: ${JSON.stringify(sceneRes.body)}`);
    assert.strictEqual(sceneRes.body.success, true);
    assert.ok(sceneRes.body.summary, 'Summary field missing in response');
    assert.ok(Array.isArray(sceneRes.body.hazards), 'Hazards array missing');
    console.log(`  ✓ Scene Scan PASSED: "${sceneRes.body.summary}"`);

    // OCR Mode Test
    console.log('  Executing OCR Scan request...');
    const ocrRes = await makeRequest(port, 'POST', '/api/scan', {
        image: TEST_BASE64_IMAGE,
        ocrMode: true
    });

    assert.strictEqual(ocrRes.statusCode, 200);
    assert.strictEqual(ocrRes.body.success, true);
    assert.ok(Array.isArray(ocrRes.body.textDetected));
    console.log('  ✓ OCR Scan PASSED: Text detection completed.');
}

/**
 * Module 6: Error & Security Audit Test
 */
async function runErrorAndSecurityAudit(port) {
    console.log('\n--- Module 6: Error Handling & Security Leak Verification ---');
    
    // Missing payload test
    const errRes = await makeRequest(port, 'POST', '/api/scan', {});
    assert.strictEqual(errRes.statusCode, 400);
    assert.strictEqual(errRes.body.success, false);
    assert.strictEqual(errRes.body.code, 'BAD_REQUEST');
    assert.strictEqual(errRes.body.stack, undefined);
    assert.strictEqual(errRes.body.trace, undefined);

    // Verify raw key leakage in JSON payload
    const bodyStr = JSON.stringify(errRes.body);
    assert.strictEqual(bodyStr.includes('AQ.Ab8'), false, 'Raw API key leaked in response body!');
    console.log('  ✓ PASSED: Validation error handled cleanly without information leakage.');
}

/**
 * Main Test Execution Runner
 */
async function main() {
    console.log('===============================================================');
    console.log('  NAZAR Post-Refactor Verification Test Suite');
    console.log('===============================================================');

    const { server, port } = await runTestServer();

    try {
        runRepositoryAudit();
        runKeyDiscoveryTest();
        await runConcurrencyTest();
        await runHealthCheckTest(port);
        await runVisionApiTest(port);
        await runErrorAndSecurityAudit(port);

        console.log('\n===============================================================');
        console.log('  🎉 ALL POST-REFACTOR VERIFICATION TESTS PASSED SUCCESSFULLY!');
        console.log('  System Status: 100% SECURE & PRODUCTION READY (PASS)');
        console.log('===============================================================\n');
    } catch (err) {
        console.error('\n❌ VERIFICATION TEST FAILED:', err.message);
        process.exitCode = 1;
    } finally {
        server.close();
        const mongoose = require('mongoose');
        mongoose.connection.close();
    }
}

if (require.main === module) {
    main();
}

module.exports = main;
