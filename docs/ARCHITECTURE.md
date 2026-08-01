# NAZAR — System Architecture Specification

This document provides a detailed overview of the system architecture, component integrations, database schemas, and data pipelines for NAZAR 2.0.

---

## 1. System Architecture Diagram

```mermaid
graph TB
    subgraph Frontend [Browser Client Layer]
        UI[index.html & style.css] <--> App[app.js UI Controller]
        App <--> WW[detection-worker.js TensorFlow Web Worker]
        App <--> VE[voice/ Voice Engine Core]
        VE <--> WS[Web Speech & Web Audio APIs]
    end

    subgraph BackendGateway [Vercel API Gateway]
        Express[server/server.js Express App]
        Express --> Auth[routes/auth.js & users.js]
        Express --> Scans[routes/scans.js Visual API]
        Express --> VoiceRouter[routes/voice.js Voice Parser]
        Express --> SOSRouter[routes/sosRoutes.js Gateway]
    end

    subgraph ServiceLayer [Business Logic & Services]
        GroqService[services/groqService.js Client]
        GeminiRotation[services/keyRotationService.js Client]
        EmailService[services/emailService.js SMTP]
    end

    subgraph DatabaseLayer [Persistence Store]
        DB[(MongoDB Atlas Database)]
        JSONFallback[(Local JSON Fallback Store)]
    end

    subgraph Microservice [Docker / VPS Host]
        WAService[whatsapp-service/server.js Express API]
        BaileysClient[services/whatsappService.js Socket]
    end

    %% Client communication
    App <-->|HTTPS REST API| Express
    VE <-->|POST /api/voice/intent| VoiceRouter

    %% Backend routing calls
    Scans -->|Rotate & Call| GeminiRotation
    VoiceRouter -->|Parse & Call| GroqService
    SOSRouter -->|Send SMTP Alert| EmailService
    SOSRouter -->|Sign & Trigger /api/send-sos| WAService

    %% Database integrations
    Auth <--> DB
    GeminiRotation <--> DB
    GroqService <--> DB
    GeminiRotation -.->|Offline Fallback| JSONFallback
    GroqService -.->|Offline Fallback| JSONFallback

    %% External interfaces
    GeminiRotation ===>|REST request v1beta| GeminiAPI[Google Gemini API]
    GroqService ===>|JSON completion| GroqAPI[Groq Llama-3.1 API]
    BaileysClient ===>|Protobuf WebSockets| WhatsAppServer[WhatsApp Cloud Servers]
    WAService <--> BaileysClient
    WAService -.->|Post back outcomes| SOSRouter
```

---

## 2. Dynamic Pipelines & Request Flows

### Voice Command Pipeline
```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Browser as Browser Media APIs
    participant Recognition as voice/core/recognition.js
    participant Parser as voice/core/parser.js
    participant Backend as Express /api/voice/intent
    participant Groq as Groq Llama-3.1-8B
    participant Router as voice/core/router.js
    participant Speaker as voice/core/speaker.js

    User->>Browser: Speak command
    Browser->>Recognition: Capture voice audio stream
    Recognition->>Parser: Transcribe speech text
    alt Exact/Regex Local Match
        Parser->>Router: Dispatch Action
    else Fuzzy Local Match
        Parser->>Parser: Compute Levenshtein Edit Distance
        Parser->>Router: Dispatch Action
    else Remote API Match
        Parser->>Backend: Fetch POST /api/voice/intent
        Backend->>Groq: Generate Chat Completion (Tool Calling)
        Groq-->>Backend: Return Structured Tool Call
        Backend-->>Parser: Return Intent Payload
        Parser->>Router: Dispatch Action
    end
    Router->>Router: Verify Resource Locks & Execute Skill
    Router->>Speaker: Play vocal feedback text
    Speaker-->>User: Read response out loud
```

### Vision Pipeline
```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Client as app.js Camera Manager
    participant Backend as Express POST /api/scan
    participant KeyRotation as keyRotationService.js
    participant Gemini as Google Gemini Vision API

    User->>Client: Triggers "Scene Description" or "OCR"
    Client->>Client: Capture frame from `<video>` element
    Client->>Backend: Upload base64 image data payload
    Backend->>KeyRotation: Request Active API Key
    KeyRotation->>KeyRotation: Check usage quotas & rotate key
    Backend->>Gemini: Fetch REST generateContent
    Gemini-->>Backend: Return Structured JSON response
    Backend-->>Client: Return spatial analysis data
    Client-->>User: Speak results via SpeechSynthesis
```

### Emergency WhatsApp SOS Flow
```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Gateway as Express POST /api/sos
    participant DB as MongoDB Atlas
    participant Microservice as Standalone whatsapp-service
    participant Baileys as whatsappService.js WebSocket
    participant WhatsApp as WhatsApp Servers

    User->>Gateway: Trigger SOS (voice or click)
    Gateway->>DB: Fetch user's registered emergency contacts
    Gateway->>Gateway: Create alert message with GPS Coordinates
    Gateway->>Gateway: Sign payload using SHA-256 HMAC
    Gateway->>Microservice: POST /api/send-sos (secure bearer token)
    Microservice->>Microservice: Verify payload signature and auth
    Microservice->>Microservice: Enqueue message in MemoryQueue
    Microservice->>Baileys: Process queue job & construct Protobuf
    Baileys->>WhatsApp: Dispatch WhatsApp Protobuf WebSocket package
    WhatsApp-->>Baileys: Message delivered acknowledgement
    Baileys->>Gateway: POST /callback status callback
```

---

## 3. Database Schema Models (Mongoose)

### `User` Collection
Stores user authentication details and device identity binds.
```javascript
{
  email: { type: String, unique: true, sparse: true },
  password: { type: String }, // Bcrypt hash
  deviceId: { type: String, unique: true, index: true },
  name: { type: String, default: 'Nazar User' },
  profilePicture: { type: String, default: '' },
  provider: { type: String, default: 'local' },
  createdAt: { type: Date, default: Date.now }
}
```

### `Contact` Collection
Stores helper profiles associated with users.
```javascript
{
  userId: { type: ObjectId, ref: 'User', index: true, required: true },
  name: { type: String, required: true },
  phone: { type: String, required: true }, // Format: E.164 (without prefix if country-formatted)
  relationship: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
}
```

### `Settings` Collection
Accessibility and visual user preferences.
```javascript
{
  userId: { type: ObjectId, ref: 'User', unique: true, index: true, required: true },
  voiceEnabled: { type: Boolean, default: false },
  speechRate: { type: Number, default: 1.0 },
  speechVolume: { type: Number, default: 1.0 },
  locationSharing: { type: Boolean, default: false },
  darkMode: { type: Boolean, default: false },
  continuousScanning: { type: Boolean, default: false },
  preferredScanMode: { type: String, enum: ['ocr', 'scene'], default: 'scene' },
  updatedAt: { type: Date, default: Date.now }
}
```

### `ApiKeyUsage` Collection
Maintains dynamic metrics tracking for API key rotations.
```javascript
{
  singletonId: { type: String, unique: true, required: true }, // 'default_usage' or 'groq_usage'
  activeKey: { type: Number, default: 1 },
  activeModel: { type: String },
  keyUsage: { type: Map, of: Number }, // Map index to total requests
  totalScans: { type: Number, default: 0 },
  lastResetDate: { type: String }, // YYYY-MM-DD
  lastRotation: { type: Date },
  rotationReason: { type: String },
  history: [
    {
      from: Number,
      to: Number,
      reason: String,
      time: Date
    }
  ]
}
```
