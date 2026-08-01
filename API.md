# NAZAR — API Endpoint Specification

This document provides a detailed specification for the REST API endpoints exposed by the NAZAR Main Express Server and the standalone WhatsApp SOS Microservice.

---

## 1. Main Express Server

### Base URL
- **Local Development**: `http://localhost:5000`
- **Production Gateway**: `/api` (Proxied via Vercel rules)

### Authentication
Endpoints marked with **[Protected]** require a valid JWT cookie session (`token`) or header.

---

### Authentication Routes

#### POST `/api/auth/signup`
* **Authentication**: None
* **Rate Limits**: `authLimiter` (5 attempts / minute)
* **Request Body**:
  ```json
  {
    "email": "user@example.com",
    "password": "SecurePassword123"
  }
  ```
* **Success Response (201 Created)**:
  ```json
  {
    "success": true,
    "message": "User registered successfully."
  }
  ```
* **Error Response (400 Bad Request / 500)**:
  ```json
  {
    "success": false,
    "message": "Invalid password format.",
    "code": "BAD_REQUEST"
  }
  ```

#### POST `/api/auth/login`
* **Authentication**: None
* **Rate Limits**: `authLimiter`
* **Request Body**:
  ```json
  {
    "email": "user@example.com",
    "password": "SecurePassword123"
  }
  ```
* **Success Response (200 OK)**:
  Sets `token` cookie.
  ```json
  {
    "success": true,
    "data": {
      "_id": "603d65b161f302001f3eabcd",
      "email": "user@example.com"
    }
  }
  ```

---

### User Profile Routes

#### POST `/api/users`
* **Authentication**: None
* **Description**: Register or retrieve a client bound to a dynamic device signature.
* **Request Body**:
  ```json
  {
    "deviceId": "dev_unique_99",
    "name": "Alex Carter",
    "profilePicture": "",
    "provider": "local"
  }
  ```
* **Success Response (201 Created / 200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "_id": "603d65b161f302001f3e1234",
      "deviceId": "dev_unique_99",
      "name": "Alex Carter",
      "profilePicture": "",
      "provider": "local"
    }
  }
  ```

---

### Visual Scanner Routes

#### POST `/api/scan`
* **Authentication**: None
* **Rate Limits**: `scanLimiter` (15 scans / minute)
* **Request Body**:
  ```json
  {
    "image": "data:image/jpeg;base64,/9j/4AAQSk...",
    "ocrMode": false,
    "prompt": "Analyze this environment"
  }
  ```
* **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "summary": "Stairs directly ahead leading down. Handrail is on the left.",
    "hazards": ["stairs leading down"],
    "objects": ["handrail"],
    "people": [],
    "textDetected": [],
    "navigation": "Hold the handrail on your left and descend slowly.",
    "environment": "indoors",
    "confidence": 0.98
  }
  ```

---

### Voice Intent Routes

#### POST `/api/voice/intent`
* **Authentication**: None (Rate limited)
* **Rate Limits**: `voiceIntentLimiter` (30 requests / minute)
* **Request Body**:
  ```json
  {
    "text": "describe the surroundings",
    "sessionId": "session_99ab",
    "context": {
      "currentPage": "home",
      "lastScene": "A green table",
      "conversationSummary": ""
    }
  }
  ```
* **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "intent": {
      "skill": "scene",
      "action": "scan",
      "params": {},
      "confidence": 0.95,
      "rawTranscript": "describe the surroundings"
    }
  }
  ```

---

### Emergency SOS Routes

#### POST `/api/sos` **[Protected]**
* **Authentication**: JWT Cookie Required
* **Rate Limits**: `sosLimiter` (2 dispatches / minute)
* **Request Body**:
  ```json
  {
    "latitude": 37.7749,
    "longitude": -122.4194,
    "message": "I need help immediately."
  }
  ```
* **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "SOS alerts dispatched successfully.",
    "dispatched": {
      "emails": ["helper@example.com"],
      "whatsapp": true
    }
  }
  ```

#### POST `/api/sos/callback`
* **Authentication**: Signed callback HMAC token
* **Description**: Receives delivery success logs from the standalone WhatsApp service container.
* **Request Body**:
  ```json
  {
    "jobId": "job_172abc",
    "status": "delivered",
    "recipient": "919988776655",
    "timestamp": "2026-08-01T04:20:00Z"
  }
  ```
* **Success Response (200 OK)**:
  ```json
  {
    "success": true
  }
  ```

---

## 2. Standalone WhatsApp SOS Microservice

### Base URL
- **Local Development**: `http://localhost:5001` (Internal binding default)

### Authentication
Endpoints marked with **[Secure]** require `Authorization: Bearer <INTERNAL_WHATSAPP_API_KEY>` and payload HMAC verification signature header `x-nazar-signature`.

---

#### GET `/ready`
* **Authentication**: None
* **Description**: Readiness check for Baileys server connection status.
* **Success Response (200 OK)**:
  ```json
  {
    "ready": true,
    "state": "AUTHENTICATED"
  }
  ```

#### GET `/qr`
* **Authentication**: None
* **Description**: Serves an HTML page rendering the latest device-pairing QR code.
* **Success Response (200 OK)**:
  ```html
  <html>
    <body>
      <h2>Scan this QR to pair WhatsApp</h2>
      <img src="data:image/png;base64,..." />
    </body>
  </html>
  ```

#### POST `/api/send-sos` **[Secure]**
* **Authentication**: Bearer token + HMAC Signature
* **Request Body**:
  ```json
  {
    "phone": "919988776655",
    "message": "Emergency Alert: Alex Carter needs help. Location: https://maps.google.com/?q=37.7749,-122.4194"
  }
  ```
* **Success Response (202 Accepted)**:
  Enqueues message for async sending.
  ```json
  {
    "success": true,
    "jobId": "job_9821a",
    "status": "queued"
  }
  ```
