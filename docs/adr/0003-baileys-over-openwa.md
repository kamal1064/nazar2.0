# ADR-0003: Stand-alone Baileys Microservice over OpenWA Gateway

## Status
Approved

## Context
When a user triggers an emergency SOS alert (via wake-word triggers like `"send help"` or clicking the SOS panel button), NAZAR must send a message immediately to configured contacts containing the user's name and Google Maps coordinates. Email notifications are reliable but slow. WhatsApp notifications have a near-100% read rate and enable prompt intervention.

Initially, we integrated the OpenWA Gateway (a self-hosted Node HTTP API for WhatsApp). However:
1. OpenWA requires running a full headless Chromium browser instance in a container. This requires massive server resources (at least 2GB RAM per session), causing high hosting costs and severe performance degradation on small servers.
2. Web scraper-based WhatsApp bridges are fragile, breaking with layout changes and frequently suffering session logs-out.

## Decision
We migrated the WhatsApp messaging infrastructure to a **standalone Node.js microservice (`whatsapp-service/`) powered by `@whiskeysockets/baileys`**.

Key implementation features:
- **Baileys Protocol Library**: Connects directly to WhatsApp servers via WebSockets using raw protobuf signals, completely eliminating the need for a headless Puppeteer/Chromium browser.
- **Microservice Isolation**: Decoupled Express app listening on port 5000 (`whatsapp-service/server.js`) using bearer-token authentication and payload signing (HMAC-SHA256) to ensure secure communications.
- **Session Auth Persistence**: Saves authentication states as modular files in `.baileys-auth/` to survive container restarts.
- **Compatibility Bridge**: Maintains the `OPENWA_` environment variable prefixes in configurations to avoid breaking deployment templates.

## Consequences
- **Pros**:
  - Extremely lightweight: RAM usage dropped from ~2GB (Chromium-based OpenWA) to under 80MB (Baileys socket connection). Can be deployed on free-tier containers.
  - Highly robust: Connection events and session re-pairings are managed via low-level WebSocket listeners, recovering from connection dropouts automatically.
- **Cons**:
  - WhatsApp Web socket libraries run the risk of temporary account suspensions if automated volumes are too high.
  - Requires scanning a QR code once on initialization via terminal/endpoint `/qr` to pair the device.
