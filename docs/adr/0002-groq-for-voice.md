# ADR-0002: Groq Llama-3.1-8B for Voice Intent Parsing

## Status
Approved

## Context
Voice command parsing represents the core interaction bridge for visually impaired users. When a user speaks, the transcribed command must be classified into a structured action contract (e.g., mapping `"describe what you see"` to `{ skill: 'scene', action: 'scan' }`).

Initially, Gemini text-only completions were used for processing these requests. However:
1. Gemini's latency budget for chat/text function-calling was too high (>1200ms RTT), causing sluggish voice assistant states.
2. Direct text function classification was prone to parsing errors or hallucinated fields.

## Decision
We migrated the voice intent resolution layer (`Layer 3` remote classification) from Gemini to **Groq Llama-3.1-8B-Instant** using tool/function calling.

The integration is implemented in:
- [groqService.js](file:///c:/Users/kamal/Documents/n1/server/services/groqService.js): Backend service wrapping Groq REST completions, implementing a custom 2-key rotation (`GROQ_API_KEY_1` and `GROQ_API_KEY_2`) and atomic quota limits (rotating at 14,000 daily requests).
- [voice.js](file:///c:/Users/kamal/Documents/n1/server/routes/voice.js): Backend router converting Gemini-format tool schemas to Groq-compatible JSON at runtime and executing intent mapping.

## Consequences
- **Pros**:
  - Dramatic reduction in latency: intent resolution is now resolved in under 200ms on Groq's hardware, providing an instantaneous voice response.
  - Highly robust tool execution: Llama-3.1-8B-Instant adheres strictly to functional parameters, eliminating JSON parse failures.
- **Cons**:
  - Adds another external API dependency to configure (`GROQ_API_KEY_N`).
  - Dual-model architecture: developers must support both Gemini for vision and Groq for text processing.
