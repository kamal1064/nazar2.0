# Standalone WhatsApp SOS Microservice

This microservice provides a decoupled, resource-efficient gateway to send automated emergency WhatsApp messages to registered helpers for the NAZAR accessibility platform.

---

## 🛠️ Technology Stack
- **Runtime**: Node.js (>=20.0.0)
- **Protocol Client**: `@whiskeysockets/baileys` (runs directly on Protobuf WebSockets, completely bypassing Chromium/Puppeteer)
- **Log Manager**: Pino
- **Process Manager**: nodemon (development)

---

## 🚀 Local Installation & Run

### 1. Install Dependencies
```bash
cd whatsapp-service
npm install
```

### 2. Configure Environment
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Fill in the configurations:
- `INTERNAL_WHATSAPP_API_KEY`: Secret string matching the main server's `WHATSAPP_SERVICE_API_KEY`.
- `PORT`: Binds to `5000` inside containers (often mapped to `5001` externally).
- `GATEWAY_CALLBACK_URL`: Target webhook on the main server to report dispatch status (e.g. `https://nazar-backend.vercel.app/api/sos/callback`).

### 3. Start the Server

#### Development (Auto-reload)
```bash
npm run dev
```

#### Production Mode
```bash
npm start
```

---

## 🐳 Running with Docker

This service includes a production-grade multi-stage [Dockerfile](file:///c:/Users/kamal/Documents/n1/whatsapp-service/Dockerfile) that locks the environment to Node 20 slim:

### 1. Build the Docker Image
```bash
docker build -t nazar-whatsapp-service .
```

### 2. Run the Container
Mount the auth credentials folder outside the container context to persist sessions across redeploys:
```bash
docker run -d \
  -p 5001:5000 \
  --name nazar-wa-bot \
  -v $(pwd)/.baileys-auth:/app/.baileys-auth \
  --env-file .env \
  nazar-whatsapp-service
```

---

## 📲 Pairing the WhatsApp Client

1. Boot the microservice (`npm start` or Docker).
2. Watch the terminal console log. On initial startup, a dynamic QR code will print directly in your CLI.
3. If deploying headlessly, open your browser and navigate to:
   `http://localhost:5001/qr` (replace with your server host domain).
4. Open WhatsApp on your target phone -> **Linked Devices** -> **Link a Device** and scan the QR code.
5. Once paired, the server console will log:
   `Stage: WhatsApp credentials updated - authentication confirmed`
   Subsequent restarts will load session credentials from `.baileys-auth/` automatically without prompting for pairing.

---

## 📊 Status Codes Matrix
The microservice exposes health indicators on GET `/health`:

| State Value | Description |
| :--- | :--- |
| **UNINITIALIZED** | Socket is created but connection has not been triggered. |
| **CONNECTING** | WebSocket connection is opening. |
| **QR_REQUIRED** | Pairing expired or missing. Scan QR to proceed. |
| **AUTHENTICATED** | Logged in successfully, waiting for connection sync. |
| **READY** | Socket fully operational, messages can be dispatched. |
| **RECONNECTING** | Socket disconnected, attempting to reconnect. |
| **DISCONNECTED** | Offline state. |
