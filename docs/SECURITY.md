# NAZAR — Security Policy & Configuration

This document outlines the security architecture, data protections, and vulnerability reporting policies implemented in the NAZAR codebase.

---

## 🔒 Security Protections

### 1. API Key Sanitization
All API key interactions (Google Gemini, Groq, Gmail SMTP) occur exclusively on the backend server. The front-end client communicates with backend proxy routes (e.g., `/api/voice/intent` or `/api/scan`) and never directly exposes API keys, preventing data leaks or quota thefts.

### 2. Request Security Middleware
We enforce secure HTTP protocols and request structures:
- **Helmet**: Embedded in [server.js](file:///c:/Users/kamal/Documents/n1/server/server.js) to set response headers preventing cross-site scripting (XSS) and clickjacking.
- **CORS**: Configured in [server.js](file:///c:/Users/kamal/Documents/n1/server/server.js) to whitelist access to trusted client hosts only.
- **Cookie Sanitization**: JWT cookies are issued using `httpOnly` and `secure` tags, preventing client-side scripts from reading tokens.
- **HMAC Signatures**: SOS alert dispatches between the main server and the microservice are signed using HMAC-SHA256 containing a shared secret.

### 3. API Rate Limiting
Rate limit constraints are defined in [rateLimiter.js](file:///c:/Users/kamal/Documents/n1/server/middleware/rateLimiter.js) to protect backend services from Denial of Service (DoS) attempts:

- **authLimiter**: Limits register, logins, and password resets to 5 attempts per minute.
- **scanLimiter**: Limits visual Gemini uploads to 15 requests per minute.
- **voiceLimiter**: Limits Groq intent requests to 30 calls per minute.
- **sosLimiter**: Limits emergency alert dispatches to 2 requests per minute.
- **userLimiter**: Limits profile fetches to 60 calls per minute.

---

## 🛡️ Vulnerability Disclosure Policy

If you identify a security vulnerability in NAZAR, please report it to us immediately. 

### Reporting Steps:
1. Do **not** open a public GitHub issue reporting the security leak.
2. Email the lead architect directly (refer to the contacts in [MAINTAINERS.md](file:///c:/Users/kamal/Documents/n1/docs/MAINTAINERS.md)).
3. Include:
   - Description of the vulnerability.
   - Detailed proof of concept or steps to reproduce the leak.
   - The environment where the vulnerability was verified.

We will review your submission within 48 hours and work with you to patch the vulnerability before public disclosure.
