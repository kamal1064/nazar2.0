# NAZAR — Project Roadmap

This document outlines the milestones completed, current active improvements, and future roadmap directions for the NAZAR accessibility framework.

---

## 🏁 Completed Milestones (v2.0.0 Production-Ready)
- [x] **Core Visual Pipelines**: Scene descriptions and OCR text reading utilizing Google Gemini Vision API.
- [x] **Low-Latency Voice Engine**: Real-time intent classification (<200ms) utilizing Groq Llama-3.1-8B-Instant tool calling.
- [x] **Standalone SOS Microservice**: Socket protobuf connection connection utilizing `@whiskeysockets/baileys` directly without browser container requirements.
- [x] **Fuzzy Matcher**: Levenshtein edit distance matcher resolving command aliases locally on browser, bypassing 40% of API calls.
- [x] **Web Audio visualizer**: Exponentially smoothed frequency pulsing rings on voice button.
- [x] **PWA Cache Invalidation**: Automatic pre-cached updates (`v33`) of CSS/JS modules on client-side reload.

---

## ⚡ Active & Mid-Term Priorities (v2.1.x)
- [ ] **Multi-lingual Voice Synthesis**: Vocal readout support for Hindi (`hi-IN`), Kannada (`kn-IN`), and Spanish (`es-ES`) using native browser speech synthesis engines.
- [ ] **Google OAuth Production Setup**: Standardize Google client callback redirect integrations across hosting deployments.
- [ ] **Micro-Earcons Sound Palette**: Programmatic double-tone warning and chime sound updates to guide users when camera or microphone state errors trigger.

---

## 🔮 Future Vision (v3.0.0 & Hardware Integration)
- [ ] **Offline Intent Matching**: Implement local transformer modules running inside the browser thread via WebAssembly to enable 100% offline navigation.
- [ ] **Smart Glasses Integration**: Direct hardware pairing via Bluetooth (BLE) to capture video frame feeds from smart glass cameras instead of the user holding their mobile device.
- [ ] **Spatial Beacon Alerts**: Connect with Bluetooth location beacons inside public galleries and museums to trigger automated coordinate guidelines.

---

## 🛠️ Code Quality & Infrastructure Roadmap
- [ ] **Decouple ESM Dependency Cycles**: Refactor the voice engine router to eliminate the startup import cycles in `UISkill.js` and `PermissionSkill.js`.
- [ ] **Expand Test Coverage**: Add thorough mock-ups and assertions for the MongoDB authentication pathways, Groq route classifications, and WhatsApp WebSocket dispatches.
- [ ] **Integrate CI/CD Pipelines**: Set up automated GitHub Actions executing `npm install`, linting, static checks, unit tests, and markdown link validation check routines on every pull request.
- [ ] **Automated OpenAPI/Swagger Generation**: Transition `API.md` endpoints definition specifications to an auto-generated model driven directly from Express route configurations.
- [ ] **Documentation Release Audits**: Schedule periodic documentation consistency audits on every release tag to prevent configuration and code drifts.
