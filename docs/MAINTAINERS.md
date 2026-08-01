# NAZAR — Maintainers & Governance

This document lists the code owners, contacts, and releasing guidelines for the NAZAR 2.0 repository.

---

## 1. Repository Ownership

| Role | Responsibility | Contact / GitHub |
| :--- | :--- | :--- |
| **Lead Architect** | Global system design, database integration, security guidelines. | [kamal1064](https://github.com/kamal1064) |
| **Backend Maintainer**| API endpoint routers, key rotation algorithms, rate limiting configuration. | [kamal1064](https://github.com/kamal1064) |
| **Voice UI Lead** | Web Speech interfaces, recognition loop persistence, local command matching. | [kamal1064](https://github.com/kamal1064) |
| **SOS Integrations** | WhatsApp microservice protocol connections and nodemailer hooks. | [kamal1064](https://github.com/kamal1064) |

---

## 2. Release Process

### Release Cadence
NAZAR uses semantic versioning (`MAJOR.MINOR.PATCH`). Releases are published when critical visual core refactors occur or new accessibility features pass all replay test suites.

### Deployment Walkthrough
1. **Local Checks**: Run static analysis (`node scratch/circular_check.js`), and backend verification tests (`npm test`).
2. **Pre-caching Version Upgrades**: When modifying assets in the root (like `app.js` or `style.css`), increment the cache version parameter in:
   - [service-worker.js](file:///c:/Users/kamal/Documents/n1/service-worker.js): e.g., update `CACHE_NAME = 'nazar-vision-cache-v58'` and asset queries `'/app.js?v=58'`.
   - [app.js](file:///c:/Users/kamal/Documents/n1/app.js): update `CURRENT_VERSION = 'v58'` to trigger client-side storage invalidation.
3. **Commit & Push**: Commit changes to `main` branch.
4. **Vercel Automatic Deploy**: Pushing to the Git remote (`origin/main`) triggers Vercel serverless integration tests, publishing the front-end interface and API endpoint wrappers.
5. **WhatsApp Service Deploy**: Re-build the Docker container for the WhatsApp service on the target server.

---

## 3. Communication Channels
- **Issues**: Open a bug report on the [Nazar 2.0 GitHub Issues Board](https://github.com/kamal1064/nazar2.0/issues) for any interface layout or speech issues.
- **Discussions**: Use the pull request reviews to coordinate custom voice skill releases.
