# NAZAR — Project Structure & Folder Map

This document outlines the codebase directory layout of NAZAR 2.0, defining folder purposes, owners, and key files.

---

## 1. Directory Tree Map

```text
nazar/
├── .agents/                    # Custom agent blueprints & instructions
│   └── skills/
│       └── web-development/    # Web development workflow skill guides
├── .baileys-auth/              # (Ignored) WhatsApp paired session auth files
├── docs/                       # Architecture specifications and ADR decisions
│   └── adr/                    # Architecture Decision Records
├── server/                     # Express Backend Server (API Core)
│   ├── config.js               # Central configuration loader
│   ├── db.js                   # Mongoose connection manager
│   ├── server.js               # Express application entrypoint
│   ├── controllers/            # Logic handlers (Auth, SOS)
│   ├── data/                   # JSON fallback local files for API rotations
│   ├── middleware/             # Rate limiters, validators, error handlers
│   ├── models/                 # Mongoose schema definitions
│   ├── routes/                 # REST API router endpoints
│   ├── services/               # Key rotation, email, and Groq wrappers
│   └── tests/                  # Backend Jest and verification test suites
├── voice/                      # Client-side Voice Operating Layer (ES Modules)
│   ├── ARCHITECTURE.md         # Voice system technical specifications
│   ├── commands/               # Multi-lingual local voice mappings (EN, HI, KN)
│   ├── contracts/              # Schema formats for intents and responses
│   ├── core/                   # Audio manager, priority queue, wake word, speaker
│   ├── services/               # Intent resolution proxies and permissions
│   ├── skills/                 # Pluggable modular voice classifications
│   └── utils/                  # Local config, cache, logger, replays
├── whatsapp-service/           # Standalone WhatsApp Protobuf SOS Microservice
│   ├── Dockerfile              # Container building instructions
│   ├── server.js               # Service router server
│   ├── controllers/            # SOS alert and pairing controllers
│   ├── middleware/             # Token auth and signature verifiers
│   ├── routes/                 # Endpoint routing rules
│   ├── services/               # Protobuf WebSocket connection manager
│   └── utils/                  # Country prefix formatter
├── app.js                      # Core frontend view navigation and browser API binds
├── index.html                  # Accessible layout with Developer HUD
├── style.css                   # Responsive layout stylesheet
├── detection-worker.js         # TensorFlow local Object detection worker thread
├── service-worker.js           # Production offline caching worker
└── vercel.json                 # Vercel serverless routing rules
```

---

## 2. Directory Details

### `server/`
* **Purpose**: Hosts the main API gateway, database entities, security middleware, and email handlers.
* **Owner**: Backend Engineering Team.
* **Key Files**:
  - [server.js](file:///c:/Users/kamal/Documents/n1/server/server.js): Entrypoint loading express app, routers, and CORS controls.
  - [db.js](file:///c:/Users/kamal/Documents/n1/server/db.js): Connection initialization for MongoDB.
  - [services/keyRotationService.js](file:///c:/Users/kamal/Documents/n1/server/services/keyRotationService.js): Gemini key rotation scheduler.
  - [services/groqService.js](file:///c:/Users/kamal/Documents/n1/server/services/groqService.js): Groq Llama completion client.

### `voice/`
* **Purpose**: Front-end voice engine processing speech-to-text transcripts, matching local command aliases, and executing pluggable modules.
* **Owner**: Interaction Design & Voice UI.
* **Key Files**:
  - [core/router.js](file:///c:/Users/kamal/Documents/n1/voice/core/router.js): Evaluates intent classifications against the registered skill list.
  - [core/recognition.js](file:///c:/Users/kamal/Documents/n1/voice/core/recognition.js): Web Speech recognition loop.
  - [skills/index.js](file:///c:/Users/kamal/Documents/n1/voice/skills/index.js): Pluggable barrel registration list.
  - [utils/voiceConfig.js](file:///c:/Users/kamal/Documents/n1/voice/utils/voiceConfig.js): Local confidence and timeout configurations.

### `whatsapp-service/`
* **Purpose**: Microservice managing live WebSocket protocols to WhatsApp without consuming container memory with Chrome instances.
* **Owner**: Operations & Integrations.
* **Key Files**:
  - [server.js](file:///c:/Users/kamal/Documents/n1/whatsapp-service/server.js): Microservice listener port config.
  - [services/whatsappService.js](file:///c:/Users/kamal/Documents/n1/whatsapp-service/services/whatsappService.js): Dynamically imports `@whiskeysockets/baileys` and manages socket status events.
  - [services/queueService.js](file:///c:/Users/kamal/Documents/n1/whatsapp-service/services/queueService.js): Memory queue retrying failed SOS alert dispatches.

### Root Level Frontend
* **Purpose**: Coordinates view structures, high-contrast layouts, CSS variables, and worker scopes.
* **Owner**: Frontend Core Team.
* **Key Files**:
  - [app.js](file:///c:/Users/kamal/Documents/n1/app.js): Switches panels, binds event listeners, and feeds Web Audio streams to visualizers.
  - [index.html](file:///c:/Users/kamal/Documents/n1/index.html): Accessible HTML5 landing page.
  - [style.css](file:///c:/Users/kamal/Documents/n1/style.css): Dynamic CSS rules (light/dark mode, focus highlights).
  - [detection-worker.js](file:///c:/Users/kamal/Documents/n1/detection-worker.js): TensorFlow web worker.
