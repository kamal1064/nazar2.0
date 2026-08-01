# NAZAR — Feature Catalog

---

## 📅 Freshness Note
- **Generated on**: 2026-08-01T04:30:00Z (UTC)
- **Repository Commit**: `317e32c6a14a75bd19cb9023f26cc5e3c854c3f0`
- **Branch**: `main`
- **Node Version**: `v20.11.0`
- **Audit Tool**: Antigravity Auditor v2.1.0

---

This document catalogues every completed and experimental feature implemented in the NAZAR codebase, mapping them to their corresponding frontend/backend source files and dependencies.

---

## 1. Visual Core

### AI Scene Description
* **Status**: Completed
* **Description**: Captures a single video frame from the camera stream, uploads it to the backend, and returns a detailed spatial description, prioritizing immediate hazards, objects, people, and directions.
* **Frontend Files**: [app.js](file:///c:/Users/kamal/Documents/n1/app.js) (camera capture), [voice/skills/SceneSkill.js](file:///c:/Users/kamal/Documents/n1/voice/skills/SceneSkill.js)
* **Backend Files**: [scans.js](file:///c:/Users/kamal/Documents/n1/server/routes/scans.js) (`POST /api/scan`)
* **Dependencies**: Google Gemini API (`gemini-3.1-flash-lite`), HTML5 Canvas context.

### OCR Reading
* **Status**: Completed
* **Description**: Scans, extracts, and reads printed text from documents, labels, signs, or packaging in view.
* **Frontend Files**: [app.js](file:///c:/Users/kamal/Documents/n1/app.js), [voice/skills/OCRSkill.js](file:///c:/Users/kamal/Documents/n1/voice/skills/OCRSkill.js)
* **Backend Files**: [scans.js](file:///c:/Users/kamal/Documents/n1/server/routes/scans.js)
* **Dependencies**: Google Gemini Vision API, HTML5 Canvas.

### On-Demand Object Finder
* **Status**: Completed
* **Description**: Searches a single video frame to locate a specific item requested by the user (e.g., *"Find my keys"*).
* **Frontend Files**: [app.js](file:///c:/Users/kamal/Documents/n1/app.js), [voice/skills/ObjectFinderSkill.js](file:///c:/Users/kamal/Documents/n1/voice/skills/ObjectFinderSkill.js)
* **Backend Files**: [scans.js](file:///c:/Users/kamal/Documents/n1/server/routes/scans.js)
* **Dependencies**: Google Gemini Vision API.

### TensorFlow Local Object Detection
* **Status**: Experimental
* **Description**: Background thread running local client-side object classification and coordinate boundary mapping without querying external APIs.
* **Frontend Files**: [detection-worker.js](file:///c:/Users/kamal/Documents/n1/detection-worker.js), [app.js](file:///c:/Users/kamal/Documents/n1/app.js)
* **Dependencies**: `@tensorflow/tfjs`, `@tensorflow-models/coco-ssd` (loaded via CDN, cached by Service Worker).

---

## 2. Voice Operating Layer

### Web Speech Recognition & Synthesis
* **Status**: Completed
* **Description**: Speech-to-text transcription loop and vocal text-to-speech feedback playback.
* **Frontend Files**: [voice/core/recognition.js](file:///c:/Users/kamal/Documents/n1/voice/core/recognition.js), [voice/core/speaker.js](file:///c:/Users/kamal/Documents/n1/voice/core/speaker.js)
* **Dependencies**: Browser Web Speech API (`SpeechRecognition`, `SpeechSynthesis`).

### Exact & Regex Command Matcher
* **Status**: Completed
* **Description**: Matches transcripts locally to exact keywords or regular expressions to execute actions in under 2ms.
* **Frontend Files**: [voice/core/parser.js](file:///c:/Users/kamal/Documents/n1/voice/core/parser.js), [voice/commands/](file:///c:/Users/kamal/Documents/n1/voice/commands/)
* **Dependencies**: None.

### Fuzzy Local Matcher
* **Status**: Completed
* **Description**: Computes Levenshtein edit distance $\le 2$ on interim/final transcripts to catch mumbled commands locally, saving remote API calls.
* **Frontend Files**: [voice/core/fuzzyMatcher.js](file:///c:/Users/kamal/Documents/n1/voice/core/fuzzyMatcher.js)
* **Dependencies**: Levenshtein Distance DP algorithm.

### Remote Intent Resolution (Function Calling)
* **Status**: Completed
* **Description**: Remote natural language intent classification that maps complex queries into structured function contracts.
* **Frontend Files**: [voice/services/gemini.js](file:///c:/Users/kamal/Documents/n1/voice/services/gemini.js) (Note: proxies to Express router)
* **Backend Files**: [voice.js](file:///c:/Users/kamal/Documents/n1/server/routes/voice.js), [services/groqService.js](file:///c:/Users/kamal/Documents/n1/server/services/groqService.js)
* **Dependencies**: Groq Llama-3.1-8B-Instant with dynamic tool call conversion.

### Web Audio Visualizer
* **Status**: Completed
* **Description**: Exponentially smoothed frequency mapping that creates breathing visual animations of mic input on the UI microphone button.
* **Frontend Files**: [voice/utils/audioVisualizer.js](file:///c:/Users/kamal/Documents/n1/voice/utils/audioVisualizer.js), [voice/core/audioContextManager.js](file:///c:/Users/kamal/Documents/n1/voice/core/audioContextManager.js)
* **Dependencies**: HTML5 Web Audio API (`AnalyserNode`).

---

## 3. Safety & System Control

### Emergency SOS Email Alerts
* **Status**: Completed
* **Description**: Sends immediate security emails containing user name, custom alert messages, and Google Maps location pins to configured helpers.
* **Backend Files**: [sosController.js](file:///c:/Users/kamal/Documents/n1/server/controllers/sosController.js), [services/emailService.js](file:///c:/Users/kamal/Documents/n1/server/services/emailService.js)
* **Dependencies**: `nodemailer` (secure SMTP).

### Emergency SOS WhatsApp Alerts
* **Status**: Completed
* **Description**: Dispatches instant WhatsApp messages containing location details and names to configured helpers.
* **Backend Files**: [sosController.js](file:///c:/Users/kamal/Documents/n1/server/controllers/sosController.js) (Vercel gateway caller)
* **Microservice Files**: [whatsapp-service/](file:///c:/Users/kamal/Documents/n1/whatsapp-service/)
* **Dependencies**: `@whiskeysockets/baileys` (protobuf socket), `pino` logger.

### API Key Rotation
* **Status**: Completed
* **Description**: Automatically logs request quotas for Gemini (4 keys) and Groq (2 keys) inside MongoDB (with local JSON fallback), swapping keys on HTTP 429 quota exhaustion to ensure service availability.
* **Backend Files**: [services/keyRotationService.js](file:///c:/Users/kamal/Documents/n1/server/services/keyRotationService.js), [services/groqService.js](file:///c:/Users/kamal/Documents/n1/server/services/groqService.js)
* **Dependencies**: MongoDB collection updates, fs fallback.
