# ADR-0004: MongoDB for Session, Settings & Key Quotas

## Status
Approved

## Context
NAZAR requires storing several categories of persistent state:
1. **User Profiles**: Login credentials, passwords (encrypted with `bcryptjs`), and account details.
2. **Emergency Contacts**: Names, phone numbers, and relationships of emergency helpers.
3. **Application Settings**: Accessibility preferences, speech speed rates, volume, dark mode state, and preferred camera options.
4. **Key Rotation Metrics**: Counter logs mapping active API key indices and request limits.

We required a flexible database solution that integrates seamlessly with a JavaScript backend (Node.js/Express) and handles atomic modifications for request counting.

## Decision
We chose **MongoDB (via the Mongoose ODM)** as our database solution.

Key implementation details:
- **Collections & Schemas**: Configured models inside `server/models/`:
  - `User.js`: Password hashes, registration timestamps, and account details.
  - `Contact.js`: Emergency helpers bound to specific User ObjectIds.
  - `Settings.js`: Accessibility configuration properties.
  - `ApiKeyUsage.js`: Logging for Gemini key rotation request quotas.
- **Failover Local JSON Store**: For the key rotation service, we implemented a local JSON file fallback (`server/data/groq_usage.json` and `server/data/gemini_usage.json`) that stores usage metrics if MongoDB becomes temporarily unreachable or times out, preventing the server from crashing or rejecting visual scans.

## Consequences
- **Pros**:
  - Flexible schema matches JavaScript object structures, simplifying data pipelines.
  - Easy horizontal scaling using MongoDB Atlas.
  - Mongoose validation ensures data integrity on user input profiles.
- **Cons**:
  - The application relies on database connections. If MongoDB Atlas is unavailable or blocked (resulting in `ECONNREFUSED` or timeouts), authentication routes return HTTP 500. This is mitigated by local fallbacks in key rotation tracking, but requires proper database configuration for general app functionality.
