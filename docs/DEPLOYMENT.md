# NAZAR — Production Deployment Guide

This document describes how to deploy NAZAR 2.0 to production environments, using Vercel serverless containers for the frontend/Express API, and VPS/Docker hosts for the standalone WhatsApp microservice.

---

## 🏗️ Production Architecture Map

```text
                     ┌────────────────────────┐
                     │    Browser Client      │
                     └───────────┬────────────┘
                                 │
                   ┌─────────────┴─────────────┐
                   │    Vercel CDN Gateway     │
                   └──────┬─────────────┬──────┘
                          │             │
                          ▼             ▼
       ┌────────────────────┐         ┌────────────────────────┐
       │ Static UI Assets   │         │ Serverless Express API │
       │ (HTML, CSS, JS)    │         │ (/api/*, /health)      │
       └────────────────────┘         └─────────┬──────────────┘
                                                │
                                  ┌─────────────┴─────────────┐
                                  ▼                           ▼
                     ┌────────────────────────┐  ┌────────────────────────┐
                     │    MongoDB Atlas DB    │  │ WhatsApp Microservice  │
                     │  (User profiles, locks)│  │   (Docker/VPS container)│
                     └────────────────────────┘  └────────────────────────┘
```

---

## 1. Deploying Frontend & Express Backend (Vercel)

Vercel hosts the front-end static modules (`index.html`, `app.js`, `style.css`, etc.) and routes all `/api` and `/health` requests to a serverless instance of the Express app, using the configuration in [vercel.json](file:///c:/Users/kamal/Documents/n1/vercel.json).

### Steps to Deploy:
1. Push your audited code to your remote GitHub repository (`main` branch).
2. Open the [Vercel Dashboard](https://vercel.com) and click **Add New Project**.
3. Import your `nazar2.0` repository.
4. Set the **Framework Preset** to **Other** (Vercel will detect `package.json` and build scripts automatically).
5. In **Environment Variables**, add the configurations from [ENVIRONMENT.md](file:///c:/Users/kamal/Documents/n1/docs/ENVIRONMENT.md):
   - `MONGODB_URI` & `MONGODB_DB_NAME`
   - `GEMINI_API_KEY_1` to `4` (at least `1` required)
   - `GROQ_API_KEY_1` & `GROQ_API_KEY_2`
   - `EMAIL_USER` & `EMAIL_APP_PASSWORD`
   - `WHATSAPP_SERVICE_URL`: Set to the public endpoint of your hosted WhatsApp microservice.
   - `WHATSAPP_SERVICE_API_KEY`: Secret matching token.
   - `JWT_SECRET`
6. Click **Deploy**. Vercel will build and host your application, assigning a public URL (e.g. `https://nazar-accessibility.vercel.app`).

---

## 2. Deploying WhatsApp Microservice (Docker/VPS)

Because the WhatsApp microservice maintains persistent WebSocket streams with WhatsApp servers, it **cannot** be deployed on serverless platforms (which shut down container threads after a short timeout). It must run on a server that stays online 24/7 (such as AWS EC2, DigitalOcean, or render.com background worker nodes).

### Prerequisites:
- A virtual server (VPS) with Docker installed.
- Open firewall ports to listen on (e.g., port `5001`).

### Steps to Deploy:
1. SSH into your VPS.
2. Clone the repository and navigate to the microservice folder:
   ```bash
   git clone https://github.com/kamal1064/nazar2.0.git
   cd nazar2.0/whatsapp-service
   ```
3. Create your production `.env` file containing `INTERNAL_WHATSAPP_API_KEY`, `PORT=5000`, `WA_LOG_LEVEL=info`, and `GATEWAY_CALLBACK_URL` pointing to your Vercel deployment (e.g. `https://your-app.vercel.app/api/sos/callback`).
4. Build and run using the [Dockerfile](file:///c:/Users/kamal/Documents/n1/whatsapp-service/Dockerfile):
   ```bash
   docker build -t nazar-whatsapp-service .
   docker run -d \
     -p 5001:5000 \
     --name nazar-wa-bot \
     -v $(pwd)/.baileys-auth:/app/.baileys-auth \
     --env-file .env \
     --restart unless-stopped \
     nazar-whatsapp-service
   ```
5. Scan the pairing QR code by viewing the logs:
   ```bash
   docker logs -f nazar-wa-bot
   ```
   Or visit the public IP of your server: `http://<your-vps-ip>:5001/qr`. Scan using your WhatsApp device.
6. Verify connectivity by hitting `http://<your-vps-ip>:5001/ready`. It should return `{"ready":true,"state":"AUTHENTICATED"}`.
