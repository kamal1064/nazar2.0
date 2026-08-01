# NAZAR — Dependency Catalog

---

## 📅 Freshness Note
- **Generated on**: 2026-08-01T04:30:00Z (UTC)
- **Repository Commit**: `317e32c6a14a75bd19cb9023f26cc5e3c854c3f0`
- **Branch**: `main`
- **Node Version**: `v20.11.0`
- **Audit Tool**: Antigravity Auditor v2.1.0

---

This document catalogs all third-party dependencies used in NAZAR 2.0, categorized by component. It specifies the role of each library, which files use it, and notes candidate packages for removal.

---

## 1. Main Express Server (Root)

Located in [package.json](file:///c:/Users/kamal/Documents/n1/package.json).

### Production Dependencies

| Package | Version | Purpose | Used In |
| :--- | :--- | :--- | :--- |
| **express** | `^5.2.1` | Web framework for mounting routing and request middleware. | [server.js](file:///c:/Users/kamal/Documents/n1/server/server.js) |
| **mongoose** | `^9.7.4` | MongoDB Object Data Modeling (ODM) to query user settings and quotas. | [db.js](file:///c:/Users/kamal/Documents/n1/server/db.js), [models/](file:///c:/Users/kamal/Documents/n1/server/models/) |
| **bcryptjs** | `^3.0.3` | Password hashing algorithm for secure logins. | [authController.js](file:///c:/Users/kamal/Documents/n1/server/controllers/authController.js) |
| **jsonwebtoken** | `^9.0.3` | Session authentication token signature and verification. | [authController.js](file:///c:/Users/kamal/Documents/n1/server/controllers/authController.js), [auth.js](file:///c:/Users/kamal/Documents/n1/server/middleware/auth.js) |
| **cookie-parser** | `^1.4.7` | Parses cookie headers and populates `req.cookies`. | [server.js](file:///c:/Users/kamal/Documents/n1/server/server.js) |
| **cors** | `^2.8.6` | Enables Cross-Origin Resource Sharing for browser clients. | [server.js](file:///c:/Users/kamal/Documents/n1/server/server.js) |
| **helmet** | `^8.3.0` | Secures the app by setting various HTTP headers. | [server.js](file:///c:/Users/kamal/Documents/n1/server/server.js) |
| **express-rate-limit** | `^8.6.0` | Limit repeated requests to public APIs (auth, voice). | [rateLimiter.js](file:///c:/Users/kamal/Documents/n1/server/middleware/rateLimiter.js) |
| **nodemailer** | `^9.0.3` | Sends emergency alert email logs to helpers. | [emailService.js](file:///c:/Users/kamal/Documents/n1/server/services/emailService.js) |
| **dotenv** | `^17.4.2` | Loads environment variables from `.env` file. | [server.js](file:///c:/Users/kamal/Documents/n1/server/server.js) |
| **pino** | `^9.14.0` | Fast, structured logging. | [authController.js](file:///c:/Users/kamal/Documents/n1/server/controllers/authController.js) |
| **@hapi/boom** | `^10.0.1` | Formats standardized HTTP error objects. | [errorHandler.js](file:///c:/Users/kamal/Documents/n1/server/middleware/errorHandler.js) |

### Candidates for Removal in Root
The following dependencies are declared in the root [package.json](file:///c:/Users/kamal/Documents/n1/package.json) but are **not** imported by any file in the `server/` or `voice/` folders. They are duplicates of dependencies already managed inside `whatsapp-service/` and can safely be uninstalled from the root:
- **@whiskeysockets/baileys** (used only in the WhatsApp microservice)
- **qrcode** (used only in the WhatsApp microservice)
- **qrcode-terminal** (used only in the WhatsApp microservice)

---

## 2. WhatsApp SOS Microservice

Located in [whatsapp-service/package.json](file:///c:/Users/kamal/Documents/n1/whatsapp-service/package.json).

### Production Dependencies

| Package | Version | Purpose | Used In |
| :--- | :--- | :--- | :--- |
| **@whiskeysockets/baileys** | `^7.0.0-rc13` | Communicates directly with WhatsApp servers via WebSocket protocols (no browser required). | [whatsappService.js](file:///c:/Users/kamal/Documents/n1/whatsapp-service/services/whatsappService.js) |
| **express** | `^4.19.2` | Listens for SOS dispatch requests and serves readiness healthchecks. | [server.js](file:///c:/Users/kamal/Documents/n1/whatsapp-service/server.js) |
| **body-parser** | `^1.20.2` | Parses POST request JSON bodies. | [server.js](file:///c:/Users/kamal/Documents/n1/whatsapp-service/server.js) |
| **dotenv** | `^16.4.5` | Loads microservice environment configurations. | [server.js](file:///c:/Users/kamal/Documents/n1/whatsapp-service/server.js) |
| **pino** | `^9.14.0` | Internal logger for socket data stream events. | [whatsappService.js](file:///c:/Users/kamal/Documents/n1/whatsapp-service/services/whatsappService.js) |
| **@hapi/boom** | `^10.0.1` | Standard HTTP error generation. | [whatsappService.js](file:///c:/Users/kamal/Documents/n1/whatsapp-service/services/whatsappService.js) |
| **qrcode** | `^1.5.4` | Generates browser-renderable QR codes for device pairing. | [whatsappService.js](file:///c:/Users/kamal/Documents/n1/whatsapp-service/services/whatsappService.js), [sosController.js](file:///c:/Users/kamal/Documents/n1/whatsapp-service/controllers/sosController.js) |
| **qrcode-terminal** | `^0.12.0` | Prints pairing QR code directly inside developer terminals. | [whatsappService.js](file:///c:/Users/kamal/Documents/n1/whatsapp-service/services/whatsappService.js) |

### Development Dependencies

| Package | Version | Purpose |
| :--- | :--- | :--- |
| **nodemon** | `^3.1.0` | Automatically restarts the local microservice on code edits. |

---

## 3. Web Client (Frontend)

The frontend is built using standard, framework-less browser modules. It dynamically loads external helper libraries from public CDNs to keep the download size small and support offline caching:

- **TensorFlow.js** (`@tensorflow/tfjs` loaded via CDN): Powers the web worker local tensor matrix math calculations.
- **COCO-SSD Model** (`@tensorflow-models/coco-ssd` loaded via CDN): Local object locator running inside [detection-worker.js](file:///c:/Users/kamal/Documents/n1/detection-worker.js).
- **Google Fonts (Outfit, Inter)**: Custom typography loaded from Google's font engine APIs.
