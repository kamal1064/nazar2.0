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

function makeRequest(port, method, path, body = null) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : '';
        const req = http.request({
            hostname: '127.0.0.1',
            port,
            path,
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
        assert.strictEqual(res1.statusCode, 404);
        assert.strictEqual(res1.body.success, false);
        assert.strictEqual(res1.body.message, 'Resource not found.');
        assert.strictEqual(res1.body.code, 'NOT_FOUND');
        assert.strictEqual(res1.body.stack, undefined, 'Client response MUST NOT leak stack trace');
        assert.strictEqual(res1.body.trace, undefined, 'Client response MUST NOT leak trace object');
        assert.ok(res1.headers['x-request-id'], 'Response should contain correlation X-Request-Id header');
        console.log('  ✓ Test 1 PASSED: 404 response structure is clean and generic.');

        // Test 2: 400 Invalid User ID Format Test
        console.log('  Testing 2: 400 Invalid User ID (/api/users/invalid-id-123)...');
        const res2 = await makeRequest(port, 'GET', '/api/users/invalid-id-123');
        assert.strictEqual(res2.statusCode, 400);
        assert.strictEqual(res2.body.success, false);
        assert.strictEqual(res2.body.message, 'Invalid User ID format.');
        assert.strictEqual(res2.body.code, 'INVALID_USER_ID');
        assert.strictEqual(res2.body.stack, undefined);
        console.log('  ✓ Test 2 PASSED: 400 invalid ID response hides internal details.');

        // Test 3: 400 Scan Validation Error Test
        console.log('  Testing 3: 400 Scan Validation Error (POST /api/scan with empty body)...');
        const res3 = await makeRequest(port, 'POST', '/api/scan', {});
        assert.strictEqual(res3.statusCode, 400);
        assert.strictEqual(res3.body.success, false);
        assert.strictEqual(res3.body.message, 'Missing base64 image data.');
        assert.strictEqual(res3.body.code, 'BAD_REQUEST');
        assert.strictEqual(res3.body.stack, undefined);
        console.log('  ✓ Test 3 PASSED: Scan validation error payload is clean.');

        console.log('[TestRunner] ALL Automated Error Handling Tests PASSED SUCCESSFULLY! ✅');
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
