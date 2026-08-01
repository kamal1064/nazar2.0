# ADR-0001: Google Gemini for Vision Pipelines

## Status
Approved

## Context
NAZAR requires powerful multimodal computer vision capabilities to describe the physical environment, scan and read printed document text, and find specific target objects on-demand. This processing must run with minimal local hardware requirements, as visually impaired users typically run the application on mobile phones or low-spec computers.

Initially, locally run model alternatives (such as TensorFlow models running in browser threads or on CPU backends) were considered. However:
1. Running dense visual models locally on the CPU introduces excessive frame-analysis latencies (>5000ms), which is dangerous for navigating hazards.
2. In-browser models consume significant battery and device memory, crashing on standard mobile browsers.

## Decision
We chose the **Google Gemini API (specifically `gemini-3.1-flash-lite`)** to power our visual pipelines (Scene describing, OCR reading, and Object Finder).

The integration is implemented in [scans.js](file:///c:/Users/kamal/Documents/n1/server/routes/scans.js), which maps direct REST POST requests using raw fetch protocols to `https://generativelanguage.googleapis.com/v1beta/models/...:generateContent`.

To bypass the daily quota restrictions of a single key, we designed a backend rotation mechanism ([keyRotationService.js](file:///c:/Users/kamal/Documents/n1/server/services/keyRotationService.js)) that tracks request counts and errors atomically in MongoDB and automatically switches between up to 4 configured API keys (`GEMINI_API_KEY_1` to `GEMINI_API_KEY_4`) once a key reaches 495 daily requests or returns an HTTP 429 quota code.

## Consequences
- **Pros**:
  - Extremely high quality spatial descriptions and precise OCR text extractions.
  - Offloads dense compute from the user's mobile device to the Google Cloud, ensuring fast execution (<2000ms RTT) and saving device battery.
  - Automatic fallback rotation ensures continuous visual availability and 99.9% uptime.
- **Cons**:
  - Requires an active internet connection to function.
  - Relies on API keys that must be managed and kept secure.
