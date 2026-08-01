# NAZAR — System Requirements & Compatibility

This document lists the runtime requirements, compatibility matrices, browser support, device permission flags, and hardware integrations for NAZAR 2.0.

---

## 1. Runtime Compatibility Matrix

| Component | Minimum Version | Preferred Version | Notes |
| :--- | :---: | :---: | :--- |
| **Node.js** | `>=18.0.0` | `v20.x` or higher | Required for async CommonJS imports. |
| **npm** | `>=9.0.0` | `v10.x` or higher | Core package manager. |
| **MongoDB** | `>=6.0` | `v7.0` / Atlas | Supports Mongoose schema validations. |
| **Express** | `v5.2.1` | `v5.2.1` | Root gateway web routing. |
| **Gemini API** | `v1beta` | `v1beta` | Direct REST routes to Generative Language models. |
| **Groq API** | Current | Current | Remote chat completion tool schemas. |
| **Baileys (WA)**| `^7.0.0-rc13`| `^7.0.0` |Protobuf WebSocket socket bridge. |

---

## 2. Browser Compatibility Matrix

To support voice-first accessible interfaces, the client browser must support the following HTML5 specifications:

| Feature / API | Chrome | Safari | Edge | Firefox | Notes |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **Web Speech (Synthesis)** |  Yes | Yes | Yes | Yes | Reads audio responses out loud. |
| **Web Speech (Recognition)**| Yes | Yes | Yes | Partial | Converts voice input to text. (Firefox requires manual config). |
| **Web Audio API** | Yes | Yes | Yes | Yes | Drives the mic analyser animations. |
| **Navigator Camera Access** | Yes | Yes | Yes | Yes | Feeds canvas descriptors for visual AI scans. |
| **Service Workers** | Yes | Yes | Yes | Yes | Caches assets and CDN weights for offline usage. |

---

## 3. Deployment & Environment Rules

### HTTPS Security Requirement
Browsers restrict microphone (`navigator.mediaDevices.getUserMedia`) and camera access to **secure origins** only. The application must be served over `https://` (or `localhost` for local development), otherwise:
- Speech recognition will fail to initialize.
- The camera viewfinder will display a black screen and return `NotAllowedError`.

### Port Bindings
- **Main Express Server**: Binds to port `5000` (or `process.env.PORT`).
- **WhatsApp SOS Microservice**: Binds to port `5000` inside its container, typically mapped to `5001` or another port in deployment configs (or `process.env.WHATSAPP_SERVICE_PORT`).

### Device Permissions
The front-end client will request:
1. **Microphone Access**: Continuous listening for wake phrases and commands.
2. **Camera Access**: Single frame captures for visual scanning.
3. **Geolocation Access**: GPS coordinates shared with emergency contacts in SOS dispatches.
