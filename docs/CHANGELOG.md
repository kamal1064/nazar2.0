# NAZAR — Changelog

All notable changes to the NAZAR codebase are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.1.0] - 2026-08-01

### Added
- Created complete production-grade documentation index and guides (`INSTALL.md`, `DEPLOYMENT.md`, `ENVIRONMENT.md`, `API.md`, `PROJECT_STRUCTURE.md`, `SYSTEM_REQUIREMENTS.md`, `THIRD_PARTY_LICENSES.md`, `FEATURES.md`, `MAINTAINERS.md`).
- Added Architectural Decision Records (ADRs) folder and landing page index `DECISIONS.md`.
- Added static codebase analysis verification check tools (circular dependency locator and file statistics scanner) inside the scratch folder.
- Generated comprehensive system-wide and service-level Mermaid charts.

---

## [2.0.0] - 2026-07-27

### Changed
- **Voice Engine Migration**: Migrated remote intent resolution (`Layer 3` parsing) in backend router `voice.js` from Gemini text completion to **Groq Llama-3.1-8B-Instant** using tool-calling function conversions. Latency dropped from ~1200ms to <200ms.
- **WhatsApp Gateway Migration**: Migrated the emergency SOS dispatch backend from the resource-heavy OpenWA HTTP Gateway container (Puppeteer Chromium) to a custom standalone Express microservice `whatsapp-service/` powered by **`@whiskeysockets/baileys`** Protobuf WebSocket connection. RAM usage dropped from ~2GB to <80MB.

### Added
- Added automatic rotation scheduler inside `groqService.js` to cycle between 2 keys on reaching daily quotas.
- Added bearer-token authorization and HMAC-SHA256 signature payload validations between the Vercel app and WhatsApp microservice container.
- Added local JSON fallback store (`groq_usage.json` and `gemini_usage.json`) inside `server/data/` to log quotas if MongoDB goes offline.

---

## [1.0.0] - 2026-07-14

### Added
- Initial stable release of NAZAR AI Navigation Companion.
- High-contrast client interface with central voice assistant microphone button and screen overlays.
- Real-time client-side object locator utilizing TensorFlow.js and COCO-SSD running in a Web Worker thread.
- Speech-to-Text transcription loop and Text-to-Speech synthesis readout utilizing browser Web Speech APIs.
- Gemini Vision API integration (`gemini-3.1-flash-lite`) to scan and describe surroundings and read printed document text.
- Gemini key rotation scheduling supporting 4 keys.
- Emergency SOS alert triggers sending instant email location coordinates.
