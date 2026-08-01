# NAZAR — Environment Configuration Reference

This document provides a comprehensive reference for all environment variables used by the NAZAR Express Server and the standalone WhatsApp microservice.

---

## 1. Key Configuration Drift Findings

> [!WARNING]
> **Configuration Drift Alert**: The following environment variables listed in current configuration templates are either stale (legacy OpenWA) or mismatches:
> - `OPENWA_SESSION_PATH`: Not used by the code. The active variable is `BAILEYS_AUTH_PATH` (defaults to `../.baileys-auth`).
> - `OPENWA_LOG_LEVEL`: Not used. The active variable is `WA_LOG_LEVEL` (defaults to `'silent'`).
> - `OPENWA_SESSION_ID` and `OPENWA_HEADLESS`: Unused. The Baileys connection is purely socket-based and does not use session ID scopes or headless browsers.
> 
> *Action: The `.env.example` templates should be updated to align with the active Baileys configurations.*

---

## 2. Main Express Server (Root)

These variables must be configured in a `.env` file in the root directory.

| Variable Name | Required? | Default | Example | Used In | Security Notes |
| :--- | :---: | :--- | :--- | :--- | :--- |
| **PORT** | No | `5000` | `5000` | [config.js](file:///c:/Users/kamal/Documents/n1/server/config.js) | Port the main server binds to. |
| **NODE_ENV** | No | `'development'` | `production` | [config.js](file:///c:/Users/kamal/Documents/n1/server/config.js) | Controls error stack trace suppression and security protocols. |
| **MONGODB_URI** | Yes | None | `mongodb+srv://...` | [db.js](file:///c:/Users/kamal/Documents/n1/server/db.js) | Database connection link. Masked in log traces. |
| **MONGODB_DB_NAME**| No | `'nazar'` | `nazar_prod` | [config.js](file:///c:/Users/kamal/Documents/n1/server/config.js) | Target MongoDB database namespace. |
| **GEMINI_API_KEY_N**| Yes | None | `AIzaSy...` | [keyRotationService.js](file:///c:/Users/kamal/Documents/n1/server/services/keyRotationService.js) | Discovers `GEMINI_API_KEY_1` to `4` dynamically. |
| **GEMINI_MODEL** | No | `'gemini-3.1-flash-lite'` | `gemini-3.1-flash-lite` | [config.js](file:///c:/Users/kamal/Documents/n1/server/config.js) | Google Gemini model to execute content generation. |
| **GEMINI_TIMEOUT** | No | `60000` | `45000` | [config.js](file:///c:/Users/kamal/Documents/n1/server/config.js) | API request abort timeout duration in ms. |
| **GROQ_API_KEY_N** | Yes | None | `gsk_...` | [groqService.js](file:///c:/Users/kamal/Documents/n1/server/services/groqService.js) | Discovers `GROQ_API_KEY_1` and `GROQ_API_KEY_2` dynamically. |
| **GROQ_MODEL** | No | `'llama-3.1-8b-instant'`| `llama-3.1-8b-instant` | [groqService.js](file:///c:/Users/kamal/Documents/n1/server/services/groqService.js) | Target Groq model for intent classification. |
| **EMAIL_USER** | Yes | None | `security@gmail.com` | [config.js](file:///c:/Users/kamal/Documents/n1/server/config.js) | Sender address for emergency SOS helper emails. |
| **EMAIL_APP_PASSWORD**| Yes| None | `abcd efgh ijkl mnop` | [config.js](file:///c:/Users/kamal/Documents/n1/server/config.js) | Gmail SMTP Secure App Password. Must never be committed. |
| **JWT_SECRET** | No | `'nazar-dev-jwt...'` | `super-secret-...` | [config.js](file:///c:/Users/kamal/Documents/n1/server/config.js) | Encryption key for signing session tokens. |
| **JWT_EXPIRES_IN** | No | `'7d'` | `24h` | [config.js](file:///c:/Users/kamal/Documents/n1/server/config.js) | Session lifespan after successful log in. |
| **GOOGLE_CLIENT_ID**| Yes* | None | `12345-abc.google...` | [config.js](file:///c:/Users/kamal/Documents/n1/server/config.js) | OAuth Client ID. Required if Google sign-in is used. |
| **GOOGLE_CLIENT_SECRET**| Yes*| None | `GOCSPX-...` | [config.js](file:///c:/Users/kamal/Documents/n1/server/config.js) | OAuth Client Secret. Required if Google sign-in is used. |
| **GOOGLE_REDIRECT_URI**| No | `'https://nazar.../api/auth/google/callback'` | [config.js](file:///c:/Users/kamal/Documents/n1/server/config.js) | OAuth Redirect callback matching Google Console setup. |
| **CLIENT_URL** | No | `'http://localhost:5000'`| `https://nazar.app` | [config.js](file:///c:/Users/kamal/Documents/n1/server/config.js) | Base origin URL of the front-end application. |
| **WHATSAPP_SERVICE_URL**| Yes | None | `http://localhost:5001`| [sosController.js](file:///c:/Users/kamal/Documents/n1/server/controllers/sosController.js) | Endpoint of the standalone WhatsApp service container. |
| **WHATSAPP_SERVICE_API_KEY**| Yes | None | `nazar-micro-token` | [sosController.js](file:///c:/Users/kamal/Documents/n1/server/controllers/sosController.js) | Shared secret token authorizing SOS POST calls. |
| **WHATSAPP_REQUEST_TIMEOUT_MS**| No | `10000` | `15000` | [sosController.js](file:///c:/Users/kamal/Documents/n1/server/controllers/sosController.js) | HTTP connection timeout when calling microservice. |

---

## 3. WhatsApp SOS Microservice

These variables must be configured in `whatsapp-service/.env`.

| Variable Name | Required? | Default | Example | Used In | Description |
| :--- | :---: | :--- | :--- | :--- | :--- |
| **PORT** | No | `5000` | `5000` | [server.js](file:///c:/Users/kamal/Documents/n1/whatsapp-service/server.js) | Binding port for the standalone microservice. |
| **NODE_ENV** | No | `'production'`| `production` | [server.js](file:///c:/Users/kamal/Documents/n1/whatsapp-service/server.js) | Environment scope. |
| **INTERNAL_WHATSAPP_API_KEY**| Yes | None | `your-secret-key` | [apiKeyAuth.js](file:///c:/Users/kamal/Documents/n1/whatsapp-service/middleware/apiKeyAuth.js) | Bearer authorization key for validating Vercel triggers. |
| **GATEWAY_CALLBACK_URL**| No | None | `https://nazar.app/api/sos/callback`| [queueService.js](file:///c:/Users/kamal/Documents/n1/whatsapp-service/services/queueService.js) | Webhook callback to report message delivery status back to main server. |
| **BAILEYS_AUTH_PATH**| No | `'../.baileys-auth'`| `../.baileys-auth` | [whatsappService.js](file:///c:/Users/kamal/Documents/n1/whatsapp-service/services/whatsappService.js) | Folder storing multi-file WebSocket authorization data. |
| **WA_LOG_LEVEL** | No | `'silent'` | `info` | [whatsappService.js](file:///c:/Users/kamal/Documents/n1/whatsapp-service/services/whatsappService.js) | Verbosity for the internal Pino WebSocket event stream logger. |
| **WA_DEFAULT_COUNTRY_CODE** | No | `'91'` | `91` | [locationFormatter.js](file:///c:/Users/kamal/Documents/n1/whatsapp-service/utils/locationFormatter.js) | Prepended international country code for 10-digit formats. |
| **WA_SEND_TIMEOUT_MS**| No | `10000` | `15000` | [queueService.js](file:///c:/Users/kamal/Documents/n1/whatsapp-service/services/queueService.js) | Protobuf socket timeout before rejecting message queues. |
| **WA_MAX_CONCURRENT_SENDS**| No | `4` | `4` | [queueService.js](file:///c:/Users/kamal/Documents/n1/whatsapp-service/services/queueService.js) | Maximum threads processing SOS alert dispatches concurrently. |

---
*Note: For backward compatibility, the WhatsApp microservice checks for environment variables starting with `OPENWA_` (e.g. `OPENWA_DEFAULT_COUNTRY_CODE`) if their `WA_` equivalents are not defined.*
