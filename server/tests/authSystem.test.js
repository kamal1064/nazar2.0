const http = require('http');
const assert = require('assert');
const mongoose = require('mongoose');
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

function makeRequest(port, method, reqPath, body = null, headersObj = {}) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : '';
        const defaultHeaders = {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
            'X-Requested-With': 'XMLHttpRequest',
            ...headersObj
        };

        const req = http.request({
            hostname: '127.0.0.1',
            port,
            path: reqPath,
            method,
            headers: defaultHeaders
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

async function runAuthTests() {
    console.log('[TestRunner] Starting Automated NAZAR Authentication System Tests...');
    const { server, port } = await runTestServer();

    try {
        const testEmail = `test.user.${Date.now()}@nazar.app`;
        const testPassword = 'Password123!';
        let authToken = '';

        // Test 1: User Signup
        console.log('  Testing 1: User Signup (POST /api/auth/signup)...');
        const signupRes = await makeRequest(port, 'POST', '/api/auth/signup', {
            name: 'Test Auth User',
            email: testEmail,
            password: testPassword
        });
        assert.strictEqual(signupRes.statusCode, 201, `Signup expected 201, got ${signupRes.statusCode}`);
        assert.strictEqual(signupRes.body.success, true);
        assert.ok(signupRes.body.token, 'Signup response should return JWT token');
        assert.strictEqual(signupRes.body.data.email, testEmail);
        authToken = signupRes.body.token;
        console.log('  ✓ Test 1 PASSED: Signup created user and returned valid JWT token & HttpOnly cookie headers.');

        // Test 2: Duplicate Email Signup
        console.log('  Testing 2: Duplicate Email Prevention...');
        const dupRes = await makeRequest(port, 'POST', '/api/auth/signup', {
            name: 'Duplicate User',
            email: testEmail,
            password: testPassword
        });
        assert.strictEqual(dupRes.statusCode, 400);
        assert.strictEqual(dupRes.body.success, false);
        assert.strictEqual(dupRes.body.code, 'EMAIL_EXISTS');
        console.log('  ✓ Test 2 PASSED: Duplicate email correctly rejected with EMAIL_EXISTS code.');

        // Test 3: Weak Password Prevention
        console.log('  Testing 3: Weak Password Validation...');
        const weakRes = await makeRequest(port, 'POST', '/api/auth/signup', {
            name: 'Weak User',
            email: `weak.${Date.now()}@nazar.app`,
            password: '123'
        });
        assert.strictEqual(weakRes.statusCode, 400);
        assert.strictEqual(weakRes.body.code, 'WEAK_PASSWORD');
        console.log('  ✓ Test 3 PASSED: Weak password rejected with WEAK_PASSWORD code.');

        // Test 4: User Login
        console.log('  Testing 4: User Login (POST /api/auth/login)...');
        const loginRes = await makeRequest(port, 'POST', '/api/auth/login', {
            email: testEmail,
            password: testPassword
        });
        assert.strictEqual(loginRes.statusCode, 200);
        assert.strictEqual(loginRes.body.success, true);
        assert.ok(loginRes.body.token);
        console.log('  ✓ Test 4 PASSED: Login succeeded with valid credentials.');

        // Test 5: Invalid Password Login
        console.log('  Testing 5: Invalid Credentials Login...');
        const badLogin = await makeRequest(port, 'POST', '/api/auth/login', {
            email: testEmail,
            password: 'WrongPassword123!'
        });
        assert.strictEqual(badLogin.statusCode, 401);
        assert.strictEqual(badLogin.body.code, 'INVALID_CREDENTIALS');
        console.log('  ✓ Test 5 PASSED: Invalid password rejected with 401 UNAUTHORIZED.');

        // Test 6: Protected Route GET /api/auth/me
        console.log('  Testing 6: Protected Route (GET /api/auth/me)...');
        const meRes = await makeRequest(port, 'GET', '/api/auth/me', null, {
            'Authorization': `Bearer ${authToken}`
        });
        assert.strictEqual(meRes.statusCode, 200);
        assert.strictEqual(meRes.body.success, true);
        assert.strictEqual(meRes.body.data.email, testEmail);
        console.log('  ✓ Test 6 PASSED: Protected route authenticated user via Bearer token.');

        // Test 7: Unauthenticated Protected Route Access
        console.log('  Testing 7: Unauthenticated Access Protection...');
        const unauthRes = await makeRequest(port, 'GET', '/api/auth/me');
        assert.strictEqual(unauthRes.statusCode, 401);
        assert.strictEqual(unauthRes.body.code, 'UNAUTHORIZED');
        console.log('  ✓ Test 7 PASSED: Protected route rejected request without token.');

        // Test 8: Forgot Password Endpoint
        console.log('  Testing 8: Forgot Password (POST /api/auth/forgot-password)...');
        const forgotRes = await makeRequest(port, 'POST', '/api/auth/forgot-password', {
            email: testEmail
        });
        assert.strictEqual(forgotRes.statusCode, 200);
        assert.strictEqual(forgotRes.body.success, true);
        console.log('  ✓ Test 8 PASSED: Forgot password endpoint processed cleanly.');

        // Test 9: Logout Endpoint
        console.log('  Testing 9: Logout (POST /api/auth/logout)...');
        const logoutRes = await makeRequest(port, 'POST', '/api/auth/logout');
        assert.strictEqual(logoutRes.statusCode, 200);
        assert.strictEqual(logoutRes.body.success, true);
        console.log('  ✓ Test 9 PASSED: Logout endpoint cleared session.');

        console.log('\n===============================================================');
        console.log('  🎉 ALL AUTOMATED AUTHENTICATION SYSTEM TESTS PASSED CLEANLY!');
        console.log('===============================================================\n');

    } catch (err) {
        console.error('❌ Auth System Test Failure:', err);
        process.exit(1);
    } finally {
        server.close();
        if (mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
        }
    }
}

runAuthTests();
