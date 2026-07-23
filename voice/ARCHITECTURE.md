# NAZAR Voice Engine Architecture Specification (v1.0.0)

This document is the technical specification and architecture reference for the **NAZAR Voice Engine**, a voice-operating layer that coordinates speech recognition, intent resolution, sequential queuing, and verbal feedback for the NAZAR accessibility platform.

---

## 1. System Overview
The NAZAR Voice Engine sits between the web browser APIs (SpeechRecognition, SpeechSynthesis) and the core NAZAR application controllers. It translates verbal inputs into execution graphs of decoupled "Skills" that run locally or query a text-only Gemini API using server-side rotated API keys.

---

## 2. Architecture Diagram

```mermaid
graph TD
    UserSpeech[User Speech] -->|Browser API| Recognition[recognition.js]
    Recognition -->|Text Transcript| Parser[parser.js]
    
    subgraph Pipeline [Three-Layer Processing Pipeline]
        Parser -->|1. Exact Alias Match| LocalCommands[commands/*.js]
        Parser -->|2. Local Regex Match| Rules[parser.js Regexes]
        Parser -->|3. Remote Intent Resolution| GeminiService[services/gemini.js]
    end
    
    GeminiService -->|Proxy POST /api/voice/intent| Backend[Backend Router /api/voice]
    Backend -->|Rotated Key API call| GeminiAPI[Gemini Text Model]
    
    LocalCommands -->|Resolved Command| Planner[planner.js]
    Rules -->|Resolved Command| Planner
    GeminiService -->|Validated Intent JSON| Planner
    
    Planner -->|Build Task Dependency Graph| Queue[queue.js]
    Queue -->|Ordered Dispatches| Router[router.js]
    
    Router -->|Check Skill Health & Permissions| SkillRegistry[router.js SkillRegistry]
    SkillRegistry -->|Invoke Skill| Skills[skills/*Skill.js]
    
    Skills -->|Standardized Skill Response| Speaker[speaker.js]
    Skills -->|Mutate UI State| AppBridge[app.js Bridge]
    
    Speaker -->|Audio Earcon / Speech Output| UserSpeech
```

---

## 3. Request Flow

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Rec as recognition.js
    participant Parser as parser.js
    participant Cache as cache.js
    participant Backend as Backend Router
    participant Queue as queue.js
    participant Router as router.js
    participant Skill as BaseSkill

    User->>Rec: Speak "Open camera and start scanning"
    Rec->>Parser: Dispatch Text Transcript
    Parser->>Cache: Query LRU Cache
    alt Cache Hit
        Cache-->>Parser: Return Cached Intent
    else Cache Miss
        Parser->>Parser: Evaluate local aliases & rules
        alt Match Found
            Parser-->>Parser: Resolve Intent
        else No Match
            Parser->>Backend: Fetch /api/voice/intent
            Backend-->>Parser: Return Validated Intent Contract
        end
    end
    Parser->>Queue: Push Actions to Execution Queue
    loop Sequence execution
        Queue->>Router: Dispatch Task
        Router->>Router: Verify Permissions & Health
        Router->>Skill: Execute (action, params)
        Skill-->>Router: Standardized Skill Response
        Router->>User: Verbal Feedback via speaker.js
    end
```

---

## 4. State Machines

To support both Push-to-Talk (PTT) and Continuous Listening modes, states are split into two decoupled state machines:

### Wake State
- **Sleeping**: The assistant ignores all voice input except the wake phrases (e.g. *"Start Voice Assistant"*).
- **Awake**: The assistant actively processes all recognized voice commands.

### Voice Engine State
- **Idle (⚪)**: System is active but inactive, awaiting speech input.
- **Listening (🔵)**: Web Speech Recognition API is listening to speech.
- **Thinking (🟡)**: Querying the Gemini Intent API. Audio delay cues trigger if latency > 700ms.
- **Executing (🟢)**: Router is calling active Skills.
- **Speaking (🟣)**: SpeechSynthesis is speaking out loud.
- **Offline (🔴)**: Browser has no network connection. Gemini commands are disabled.

---

## 5. Event Bus Events

The `eventBus.js` module provides a central broker to coordinate asynchronous components:

| Event ID | Publisher | Subscribers | Payload | Description |
|---|---|---|---|---|
| `wake.state` | `state.js` | `recognition.js`, HUD | `{ state: 'Awake' }` | Wake status changed |
| `engine.state`| `state.js` | HUD, status dot | `{ state: 'Listening' }` | Engine status changed |
| `speech.heard` | `recognition.js` | `parser.js`, HUD | `{ text: '...' }` | Transcript received |
| `speech.priority`| `recognition.js` | `queue.js`, `speaker.js` | `{ command: 'stop' }` | Priority interrupt triggered |
| `skill.finished`| `router.js` | `queue.js`, `memory.js` | `{ success: true, ... }` | Skill finished executing |

---

## 6. Skill Lifecycle

Skills extend `BaseSkill` and self-register on the Router:

```
  Initialize (Router registers Skill)
            │
            ▼
    HealthCheck() ──► ['Ready', 'Busy', 'Unavailable']
            │ (if Ready)
            ▼
RequiredPermissions() ──► Check browser access
            │ (if Granted)
            ▼
   Execute(action) ──► Perform DOM / API update
            │
            ▼
   Return Standard Response ──► Spoken text feedback
            │
            ▼
      Cleanup() ──► Reset local skill states
```

---

## 7. Intent Contracts
All intent transactions between the client and backend must comply with **IntentContract.v1**:

```json
{
  "$schema": "voice/contracts/IntentContract.v1.json",
  "skill": "string (matches registered skill name)",
  "action": "string (matches skill action)",
  "params": {
    "type": "object",
    "properties": {
      "mode": { "type": "string" },
      "target": { "type": "string" }
    }
  },
  "confidence": "number (0.00 to 1.00)"
}
```

---

## 8. API Endpoints
- **`POST /api/voice/intent`**
  - **Auth**: Optional session cookie.
  - **Rate Limit**: 30 requests/minute per IP (`voiceIntentLimiter`).
  - **Payload**:
    ```json
    {
      "transcript": "what am I looking at?",
      "context": {
        "sessionId": "UUIDv4",
        "lastIntent": "ocr",
        "lastResult": "Raw scanned text..."
      }
    }
    ```
  - **Response**: `IntentContract.v1` JSON structure.

---

## 9. Folder Structure
```
voice/
  contracts/
    IntentContract.v1.json      # Schema for input intent
    SkillResponse.v1.json        # Schema for skill outputs
    Session.v1.json              # Schema for session state
  core/
    eventBus.js                 # Decoupled Pub/Sub Broker
    recognition.js              # Speech Recognition wrapper
    speaker.js                  # Speech Synthesis wrapper
    parser.js                   # Alias/Rules Matcher
    planner.js                  # Compound Execution Planner
    state.js                    # Wake/Engine State Machine
    cache.js                    # Bounded LRU Cache (100)
    queue.js                    # Execution Queue
  commands/
    english.js                  # English aliases
    hindi.js                    # Hindi aliases
    kannada.js                  # Kannada aliases
  skills/
    BaseSkill.js                # Base Plugin Class
    NavigationSkill.js          # Core navigation actions
    CameraSkill.js              # Viewfinder & stream actions
    OCRSkill.js                 # Text scanning logic
    SceneSkill.js               # Visual surroundings logic
    SOSSkill.js                 # SOS dispatching calls
    SettingsSkill.js            # Speed/volume/dark-mode
    ProfileSkill.js             # User accounts & login
  services/
    gemini.js                   # Client-side intent proxy
    permissions.js              # Hardware permissions broker
    settings.js                 # Voice settings manager
    logger.js                   # Log level manager
  models/
    SessionModel.js             # Holds current conversation state
    SkillResponseModel.js       # Typed skill output struct
    Intents.js                  # Typed intent definitions
  utils/
    errorCodes.js               # Unified codes VOICE_001 to VOICE_005
    selfTest.js                 # Startup capability diagnostics
    voiceConfig.js              # Configuration timings
    replayHarness.js            # Batch local command harness
  controllers/
    voiceController.js          # Coordinator & UI bootstrap
```

---

## 10. Performance Targets
- **Local Parsing Latency**: `< 100 ms`
- **Queue Dispatch Latency**: `< 50 ms`
- **UI Transition Action Time**: `< 150 ms`
- **Gemini Intent Resolution Target**: `< 2.0 s`
- **Speech Synthesis Start Latency**: `< 300 ms`

---

## 11. Error Codes

| Code | Key | Description | Spoken Accessibility Prompt |
|---|---|---|---|
| `VOICE_001` | `MIC_DENIED` | Microphone permissions blocked | *"Microphone access is required. Please check permissions."* |
| `VOICE_002` | `REC_TIMEOUT` | Speech Recognition timed out | *"I didn't hear anything. Please try again."* |
| `VOICE_003` | `GEMINI_FAIL` | Backend intent API error / timeout | *"AI features are temporarily unavailable. Local commands remain active."* |
| `VOICE_004` | `SKILL_FAIL` | A skill execution threw an error | *"Something went wrong executing that command. Please try again."* |
| `VOICE_005` | `PERM_MISSING` | Skill requires hardware access denied | *"[Permission] access is required. Please allow access to proceed."* |

---

## 12. Testing Strategy
1. **Automated Integration Tests**: `server/tests/voiceIntent.test.js` checks backend routing, schemas, and rotated key extraction.
2. **Replay regression Harness**: `replayHarness.js` passes mock transcript batches in the frontend, verifying cache matches and execution outputs.
3. **Manual Voice Command Checklist**: Verified across Chrome (Windows/Android) and Safari (iOS) focusing on:
   - "Open settings" (local match)
   - "Describe surroundings" (Gemini vision fallback)
   - Interrupt priority ("Stop" while talking)
   - Session context persistence ("Translate it" after OCR scan)
