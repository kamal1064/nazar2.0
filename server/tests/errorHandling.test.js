const http = require('http');
const assert = require('assert');

// Import server handler
const handler = require('../server');

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

function makeRequest(port, method, reqPath, body = null) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : '';
        const req = http.request({
            hostname: '127.0.0.1',
            port,
            path: reqPath,
            method,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
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

async function runErrorHandlingTests() {
    console.log('[TestRunner] Starting Automated Error Handling & Information Disclosure Tests...');
    const { server, port } = await runTestServer();

    try {
        // Test 1: 404 Unhandled Route Test
        console.log('  Testing 1: 404 Unhandled Route (/api/non-existent-route-xyz)...');
        const res1 = await makeRequest(port, 'GET', '/api/non-existent-route-xyz');
        assert.notStrictEqual(res1.statusCode, 200, 'Error responses MUST NOT return HTTP 200');
        assert.strictEqual(res1.statusCode, 404);
        assert.strictEqual(res1.body.success, false);
        assert.strictEqual(res1.body.message, 'Resource not found.');
        assert.strictEqual(res1.body.code, 'NOT_FOUND');
        assert.ok(res1.body.requestId, 'Response MUST contain requestId correlation ID');
        assert.strictEqual(res1.body.stack, undefined, 'Client response MUST NOT leak stack trace');
        assert.strictEqual(res1.body.trace, undefined, 'Client response MUST NOT leak trace object');
        assert.ok(res1.headers['x-request-id'], 'Response should contain correlation X-Request-Id header');
        console.log('  ✓ Test 1 PASSED: 404 response structure contains requestId and clean message.');

        // Test 2: 400 Invalid User ID Format Test
        console.log('  Testing 2: 400 Invalid User ID (/api/users/invalid-id-123)...');
        const res2 = await makeRequest(port, 'GET', '/api/users/invalid-id-123');
        assert.notStrictEqual(res2.statusCode, 200);
        assert.strictEqual(res2.statusCode, 400);
        assert.strictEqual(res2.body.success, false);
        assert.strictEqual(res2.body.message, 'Invalid User ID format.');
        assert.strictEqual(res2.body.code, 'INVALID_USER_ID');
        assert.ok(res2.body.requestId);
        assert.strictEqual(res2.body.stack, undefined);
        console.log('  ✓ Test 2 PASSED: 400 invalid ID response includes requestId and hides internal details.');

        // Test 3: 400 Scan Validation Error Test
        console.log('  Testing 3: 400 Scan Validation Error (POST /api/scan with empty body)...');
        const res3 = await makeRequest(port, 'POST', '/api/scan', {});
        assert.notStrictEqual(res3.statusCode, 200);
        assert.strictEqual(res3.statusCode, 400);
        assert.strictEqual(res3.body.success, false);
        assert.strictEqual(res3.body.message, 'Missing base64 image data.');
        assert.strictEqual(res3.body.code, 'BAD_REQUEST');
        assert.ok(res3.body.requestId);
        assert.strictEqual(res3.body.stack, undefined);
        console.log('  ✓ Test 3 PASSED: Scan validation error payload is clean with requestId.');

        // Test 4: 400 Middleware Validation Error Test
        console.log('  Testing 4: 400 Middleware Validation Error (POST /api/users with invalid body)...');
        const res4 = await makeRequest(port, 'POST', '/api/users', { deviceId: '' });
        assert.notStrictEqual(res4.statusCode, 200);
        assert.strictEqual(res4.statusCode, 400);
        assert.strictEqual(res4.body.success, false);
        assert.strictEqual(res4.body.code, 'VALIDATION_ERROR');
        console.log('  ✓ Test 4 PASSED: Middleware validation error returns VALIDATION_ERROR code.');

        // Test 5: 400 Emergency Coordinates Error Test
        console.log('  Testing 5: 400 Emergency Coordinates Error (POST /api/emergency/send-email)...');
        const res5 = await makeRequest(port, 'POST', '/api/emergency/send-email', { latitude: 999, longitude: 999 });
        assert.notStrictEqual(res5.statusCode, 200);
        assert.strictEqual(res5.statusCode, 400);
        assert.strictEqual(res5.body.success, false);
        assert.strictEqual(res5.body.code, 'INVALID_COORDINATES');
        console.log('  ✓ Test 5 PASSED: Emergency coordinate validation handled with INVALID_COORDINATES code.');

        console.log('\n[TestRunner] ALL Automated Error Handling Tests PASSED SUCCESSFULLY! ✅');
    } catch (err) {
        console.error('[TestRunner] Test FAILED:', err.message);
        process.exitCode = 1;
    } finally {
        server.close();
    }
}

if (require.main === module) {
    runErrorHandlingTests();
}

module.exports = runErrorHandlingTests;
