# Welcome to NAZAR: The Complete Exhibition & Developer Guide

**NAZAR** is an AI-powered accessibility and navigation companion website designed specifically to help visually impaired and blind individuals interact with and understand the world around them. Using a voice-first interface, it turns a standard computer or phone camera into a talking pair of eyes.

---

## 📖 Quick Glossary of Simple Terms
To make this explanation crystal clear without assuming technical knowledge, here are simple one-sentence definitions of terms used throughout this guide:
*   **API (Application Programming Interface):** A digital bridge that allows two software programs to talk to each other and share information.
*   **Backend:** The invisible engine behind the website that crunches numbers, talks to databases, and handles AI tasks.
*   **Server:** A powerful computer running 24/7 on the internet that stores our website and answers requests from users.
*   **Database:** A digital filing cabinet where user accounts, settings, and scan histories are securely organized and saved.
*   **Authentication:** The digital security guard checking your ID (like email and password or Google login) to prove you are who you say you are.
*   **Deployment:** The process of putting your website code onto a public internet server so anyone in the world can visit it.
*   **Cloud:** A network of remote servers on the internet that store data and run programs so your personal device doesn't have to do all the heavy lifting.

---

## 🌟 What Happens When a User Opens NAZAR (Behind the Scenes from Start to Finish)

When a user types your website address into their browser and presses Enter, an orchestrated journey happens in milliseconds:

1.  **The Website Loads (Vercel & GitHub):** The user's browser contacts **Vercel** (our cloud hosting server), which reads our project code stored on **GitHub**. Vercel sends back the website's structure (HTML), visual styling (CSS), and logic (JavaScript).
2.  **Checking Who You Are (Authentication):** As the page opens, the **frontend JavaScript** checks if the user has a valid login token (a digital ID badge) saved in their browser. If not, it shows the login page. If valid, it contacts our **Express backend server** to load the user's saved settings from **MongoDB**.
3.  **Waking Up the Sensors (Browser APIs):** The website asks the user's browser for permission to use their microphone, camera, and GPS location.
4.  **Listening for Commands (Web Speech API):** A large, high-contrast voice button appears on the screen. When tapped (or when saying the wake word *"Hey Nazar"*), the browser's built-in **Speech Recognition API** turns microphone sounds into text words.
5.  **Understanding Intent (Three-Layer Brain):**
    *   **Layer 1 (Instant Match):** The browser JavaScript first checks if you said a simple command like *"Camera"* or *"Help"*. If yes, it acts instantly.
    *   **Layer 2 (Fuzzy Match):** If you mumbled or mispronounced slightly (e.g., *"Cammra"*), our local JavaScript math formula catches it without internet delay.
    *   **Layer 3 (Google Gemini AI):** If you asked a complex question like *"Find where I left my keys"* or *"Describe this room"*, our JavaScript sends your request to our **Express backend server**, which securely asks **Google Gemini 3.1 Flash Lite** to figure out what you want.
6.  **Seeing the World (Camera & AI):** If the command requires seeing, the browser captures a single photo frame from the camera stream and sends it to our backend, which forwards it to **Google Gemini Vision AI** to analyze objects, scenes, or text.
7.  **Delivering the Final Result (Text-to-Speech):** The AI's description is sent back to the browser. The **Web Speech Synthesis API** reads the answer out loud in a natural voice while displaying synchronized words on the screen, completing the loop!

---

# 🔎 The 15 Features of NAZAR Explained Separately

---

## 1. Login & Authentication

### 1. What it is
The secure entryway that lets users sign up, log in with an email/password or Google Account, and keep their personal data private.

### 2. Why we need it
To protect user privacy, save individual preferences (like speech speed and high-contrast modes), and store personal emergency contacts safely so strangers cannot access them.

### 3. How it works inside NAZAR (step by step)
1. The user types their email and password or clicks "Sign in with Google".
2. The browser JavaScript sends these credentials over an encrypted connection to our Express backend server (`/api/auth`).
3. The backend checks the **MongoDB** database to see if the user exists and verifies the password using encryption math (`bcryptjs`).
4. If correct, the server generates a secure digital badge called a **JSON Web Token (JWT)** and sends it back to the browser to keep the user logged in.

### 4. Technologies used
*   **What happens in the frontend:** Displays login forms and saves the secure login badge (JWT token) in the browser's memory.
*   **What happens in the backend:** Receives login attempts, verifies passwords, and issues login badges using Node.js and Express (`server/routes/auth.js`).
*   **What APIs are used:** Google OAuth API for one-click Google login; internal `/api/auth/login` and `/api/auth/register` endpoints.
*   **What data is stored in MongoDB:** User profiles (name, email, encrypted password hash, registration date) inside the `users` collection.
*   **What Google Gemini does:** Not used in this feature.
*   **What Python does:** **Not implemented or used in NAZAR.** All backend logic runs entirely on Node.js and JavaScript.
*   **What JavaScript does:** Captures form typing, manages error messages, and communicates with the server.
*   **What Vercel does:** Routes the login web requests to our backend serverless functions.
*   **What GitHub is used for:** Stores the source code for our authentication routes and security rules.
*   **What browser APIs are used:** Browser LocalStorage and Cookies to remember user sessions.
*   **How everything connects together:** Frontend form -> Express Backend Server -> MongoDB verification -> Secure token returned to browser.

### 5. Real-life example
Like showing your passport at an airport checkpoint; once the guard checks your details against the computer, you get a boarding pass (the JWT token) that lets you walk freely into the terminal without showing your passport at every door.

### 6. Common questions someone might ask
*   *Q: Can anyone steal my password?*
*   *Q: What happens if I close my browser tab?*

### 7. Simple answers I can give during an exhibition
*   *"No one can read your password—not even us! We use military-grade encryption to scramble passwords before saving them in our database."*
*   *"When you reopen the website, your browser remembers your secure digital badge so you don't have to log in over and over again."*

---

## 2. Home Page

### 1. What it is
The main landing screen of NAZAR featuring high-contrast colors, large readable text, accessible navigation tabs, and a central voice activation button.

### 2. Why we need it
Visually impaired users need a screen that is uncluttered, easy to navigate with screen readers, and usable by individuals with partial vision or color blindness.

### 3. How it works inside NAZAR (step by step)
1. When the page loads, `app.js` initializes the visual interface and sets up keyboard navigation shortcuts.
2. The screen automatically announces its readiness using hidden screen-reader text (`aria-live`).
3. The user can press Tab or spacebar to instantly jump to the microphone button, camera view, or settings.

### 4. Technologies used
*   **What happens in the frontend:** HTML5 structures the page, Vanilla CSS3 creates vibrant high-contrast styles, and JavaScript controls button clicks and tab switching.
*   **What happens in the backend:** Serves the static website files when requested.
*   **What APIs are used:** Internal application state APIs within `app.js`.
*   **What data is stored in MongoDB:** Not directly applicable to displaying the layout, though custom user display preferences are loaded from MongoDB.
*   **What Google Gemini does:** Not used in this feature.
*   **What Python does:** **Not implemented or used in NAZAR.**
*   **What JavaScript does:** Manages interface animations, tab switching, and listens for keyboard accessibility shortcuts.
*   **What Vercel does:** Delivers the website files instantly to the user's browser over a global content network.
*   **What GitHub is used for:** Hosts the HTML, CSS, and layout scripts.
*   **What browser APIs are used:** DOM Manipulation API and ARIA Accessibility APIs.
*   **How everything connects together:** Vercel serves HTML/CSS -> Browser renders layout -> JavaScript attaches keyboard and click listeners for accessibility.

### 5. Real-life example
Like entering a well-lit room where the light switches and door handles are oversized, brightly colored, and labeled with Braille so you can find your way instantly.

### 6. Common questions someone might ask
*   *Q: Why are the buttons so big and the colors so dark?*
*   *Q: Can I use this without a mouse?*

### 7. Simple answers I can give during an exhibition
*   *"We designed the interface with high-contrast colors and large elements specifically so people with low vision can easily see and press them."*
*   *"Yes! You can navigate the entire website using only keyboard arrows and the spacebar, or simply by speaking out loud."*

---

## 3. Voice Assistant

### 1. What it is
The central intelligent "brain" of NAZAR that listens to user voice commands, understands what they want to do, and executes the right task hands-free.

### 2. Why we need it
For a blind or visually impaired person, navigating menus and clicking small screen buttons is difficult; speaking natural commands is the fastest and most natural way to control the app.

### 3. How it works inside NAZAR (step by step)
1. The user taps the microphone button or says *"Hey Nazar"*.
2. As they speak, our **Three-Layer Processing Pipeline** goes to work:
   *   **Layer 1:** Checks a local dictionary (`voice/commands/english.js`) for exact matches like *"open camera"*.
   *   **Layer 2:** If spelled slightly wrong by the microphone, our fuzzy math matcher (`voice/core/fuzzyMatcher.js`) corrects word errors up to 2 letters off.
   *   **Layer 3:** If it's a conversational sentence like *"Can you check if there is a water bottle in front of me?"*, JavaScript sends the text to our backend server.
3. The server asks **Google Gemini AI** to translate the sentence into a structured action command.
4. Our Task Queue (`voice/core/queue.js`) executes the command safely without overlapping speech sounds.

### 4. Technologies used
*   **What happens in the frontend:** Captures audio, performs local word matching, and animates the voice button (idle blue, listening green, processing spinner, speaking purple).
*   **What happens in the backend:** Receives voice phrases and talks to Google Gemini to understand complex intentions (`/api/voice/intent`).
*   **What APIs are used:** Google Gemini 3.1 Flash Lite API (using structured Function Calling); Web Speech API.
*   **What data is stored in MongoDB:** API key usage metrics and error logs (`apikeyusages` collection).
*   **What Google Gemini does:** Acts as an intelligent translator, turning messy conversational speech into precise command instructions that the website can execute.
*   **What Python does:** **Not implemented or used in NAZAR.**
*   **What JavaScript does:** Routes commands, manages the task queue, controls button animations, and handles speech output.
*   **What Vercel does:** Runs the backend API endpoints that connect our website to Google Gemini.
*   **What GitHub is used for:** Stores the complex voice router, skill registry, and local command dictionaries.
*   **What browser APIs are used:** Web Speech API (`SpeechRecognition`) and Web Audio API (`AnalyserNode`).
*   **How everything connects together:** Microphone -> Web Speech API text -> Local JS Matcher OR Express Backend -> Google Gemini AI -> Action Queue -> Skill execution.

### 5. Real-life example
Like having a personal human concierge sitting next to you; you don't have to push buttons on a machine, you just say what you need, and the concierge pulls the right levers for you.

### 6. Common questions someone might ask
*   *Q: Does it stop working if my internet slows down?*
*   *Q: What if I stutter or mispronounce a word?*

### 7. Simple answers I can give during an exhibition
*   *"No! For basic commands like opening tabs or calling for help, NAZAR has a built-in local dictionary that works instantly right inside your browser without needing the internet."*
*   *"Our intelligent fuzzy-matching math automatically corrects pronunciation slips and typos so the assistant understands you even if you don't speak like a robot."*

---

## 4. Camera

### 1. What it is
The visual input feed that connects the user's webcam or smartphone camera directly to the webpage inside a live video frame.

### 2. Why we need it
To act as the digital eyes of the visually impaired user, providing the raw video stream that our artificial intelligence needs to see scenes, read text, and find objects.

### 3. How it works inside NAZAR (step by step)
1. When the user opens the camera tab or speaks a visual command, JavaScript calls the browser's camera permission system.
2. Once granted, the browser connects the webcam stream directly into an HTML `<video>` element on the screen (`camera-stream`).
3. The video plays continuously in real-time, ready for our AI tools to take instant snapshot photos whenever needed.

### 4. Technologies used
*   **What happens in the frontend:** Requests camera permissions, displays the live video feed, and takes hidden snapshot images (canvas frames) when AI analysis is requested.
*   **What happens in the backend:** Nothing during live streaming! The live video never leaves the user's device, ensuring maximum privacy.
*   **What APIs are used:** HTML5 Video element methods.
*   **What data is stored in MongoDB:** No live video is ever stored in the database.
*   **What Google Gemini does:** Not involved in the live video preview.
*   **What Python does:** **Not implemented or used in NAZAR.**
*   **What JavaScript does:** Controls the camera start/stop functions, switches cameras (front vs. back on mobile), and captures image frames for analysis (`voice/skills/CameraSkill.js`).
*   **What Vercel does:** Serves the secure HTTPS web connection required by web browsers to allow camera permissions.
*   **What GitHub is used for:** Saves the camera controller scripts and UI styling.
*   **What browser APIs are used:** Browser MediaDevices API (`navigator.mediaDevices.getUserMedia`) and HTML5 Canvas API (for taking snapshots).
*   **How everything connects together:** Webcam hardware -> Browser MediaDevices API -> JavaScript Controller -> HTML5 Video Element on screen.

### 5. Real-life example
Like opening a window blind in your house; you are letting the light and view come inside so you (or your assistant) can look at what is happening outside.

### 6. Common questions someone might ask
*   *Q: Are you recording my camera feed or spying on me?*
*   *Q: Can I use the back camera on my mobile phone?*

### 7. Simple answers I can give during an exhibition
*   *"We never record or broadcast your live video! The camera video stays 100% inside your own browser for your privacy, and we only take a temporary single photo when you explicitly ask the AI to describe something."*
*   *"Yes! On mobile devices, NAZAR automatically lets you flip between the front selfie camera and the rear camera to point at objects around you."*

---

## 5. Object Detection

### 1. What it is
A real-time scanner that draws visual boxes around everyday objects (like chairs, cups, laptops, and people) shown in the live camera view and announces them out loud.

### 2. Why we need it
Helps blind users navigate around physical obstacles, find everyday items on a desk, and understand what objects are immediately around them without waiting for slow cloud uploads.

### 3. How it works inside NAZAR (step by step)
1. When Object Detection is turned on, a specialized background helper called a **Web Worker** (`detection-worker.js`) wakes up inside the browser.
2. It loads an artificial intelligence vision model called **COCO-SSD** directly into the computer's local memory.
3. Every few fractions of a second, JavaScript grabs a picture from the live camera stream and hands it to this local Web Worker.
4. The local AI finds object shapes, draws colored boxes on the screen, and sends the names of detected objects to our speech synthesizer to read out loud!

### 4. Technologies used
*   **What happens in the frontend:** Runs the machine learning vision model locally inside the browser memory without internet lag, drawing colored rectangles over detected items.
*   **What happens in the backend:** Absolutely nothing! Zero server requests are made for real-time detection.
*   **What APIs are used:** TensorFlow.js and COCO-SSD pre-trained machine learning models.
*   **What data is stored in MongoDB:** Nothing is stored in the database for real-time object bounding boxes.
*   **What Google Gemini does:** Not used for this feature (Gemini is only used for complex scene explanations or deep searches).
*   **What Python does:** **Not implemented or used in NAZAR.**
*   **What JavaScript does:** Manages the background worker thread, cleans up AI computer memory (`tf.engine().startScope()`), and draws boxes on an HTML5 canvas.
*   **What Vercel does:** Serves the worker javascript file to the browser when the page loads.
*   **What GitHub is used for:** Stores `detection-worker.js` and the canvas drawing scripts.
*   **What browser APIs are used:** Web Workers API, Offscreen Canvas API, and WebGL GPU Acceleration.
*   **How everything connects together:** Camera video frame -> JavaScript Web Worker -> Local TensorFlow.js AI model -> Bounding boxes drawn on screen + names spoken aloud.

### 5. Real-life example
Like having a friend with a laser pointer standing next to you, pointing at items on a table and saying, *"There is a cup on the left, a keyboard in the middle, and a book on the right."*

### 6. Common questions someone might ask
*   *Q: How does it detect objects so fast without lagging?*
*   *Q: Does this work if my Wi-Fi gets disconnected?*

### 7. Simple answers I can give during an exhibition
*   *"It is super fast because we run an artificial intelligence model directly inside your computer's web browser, so images never have to travel across the internet!"*
*   *"Yes! Once the webpage is loaded, this real-time object detector works completely offline without needing any internet connection."*

---

## 6. Scene Description

### 1. What it is
An advanced visual feature where the user asks NAZAR to take a photograph of their surroundings and narrate a detailed, spatial description of the scene out loud.

### 2. Why we need it
While real-time detection identifies simple item names, a blind person often needs contextual understanding—such as knowing if a room is crowded, where an empty chair is located, or what a storefront sign looks like from across the street.

### 3. How it works inside NAZAR (step by step)
1. The user asks, *"Describe my surroundings"* or clicks the "Describe Scene" button (`voice/skills/SceneSkill.js`).
2. JavaScript grabs a high-quality snapshot picture from the camera stream and converts it into a compressed text format (base64 image).
3. This image is securely sent to our Express backend server (`/api/scans`).
4. The server sends the image along with a specialized accessibility prompt to **Google Gemini Vision AI**, asking it to describe the spatial layout and key safety details.
5. Gemini sends back a rich paragraph description, which our backend saves to MongoDB and our frontend reads out loud to the user!

### 4. Technologies used
*   **What happens in the frontend:** Captures the camera photo snapshot, shows a loading animation, and speaks the returned text description.
*   **What happens in the backend:** Receives the image, checks API key usage limits, forwards the image to Google Cloud AI, and logs the scan result (`server/routes/scans.js`).
*   **What APIs are used:** Google Gemini Vision API (`gemini-3.1-flash-lite`); internal `/api/scans` endpoint.
*   **What data is stored in MongoDB:** The scan history record (user ID, image thumbnail, text summary, timestamp) stored inside the `scans` collection.
*   **What Google Gemini does:** Acts as a master visual interpreter, analyzing the photograph to understand lighting, distances, people, obstacles, and room layout in human-like detail.
*   **What Python does:** **Not implemented or used in NAZAR.**
*   **What JavaScript does:** Formats image data, manages network requests, and triggers voice narration.
*   **What Vercel does:** Hosts our backend server endpoints that safely communicate with Google's AI servers.
*   **What GitHub is used for:** Stores the scan controllers and database schema models.
*   **What browser APIs are used:** HTML5 Canvas API (for snapping images) and Fetch API (for sending images to the backend).
*   **How everything connects together:** Camera snapshot -> Express Backend Server -> Google Gemini Vision AI -> Description saved in MongoDB -> Spoken aloud by browser speech synthesizer.

### 5. Real-life example
Like taking a photograph of a grocery store aisle and texting it to a helpful family member who calls you right back to describe exactly which cereals are on the top shelf and where the shopping carts are parked.

### 6. Common questions someone might ask
*   *Q: How detailed is the description? Can it tell me colors and distances?*
*   *Q: Can I look back at descriptions of places I visited yesterday?*

### 7. Simple answers I can give during an exhibition
*   *"It is incredibly detailed! It can tell you colors, relative distances, lighting conditions, and even warn you if there is an obstacle like a wet floor sign in your path."*
*   *"Yes! Every scene you scan is securely saved in your personal scan history in our database so you can review descriptions of past places anytime."*

---

## 7. OCR (Text Reading)

### 1. What it is
An Optical Character Recognition (OCR) scanner that reads printed words, handwriting, books, menus, product labels, and digital screens out loud to the user.

### 2. Why we need it
Visually impaired individuals face daily barriers when trying to read physical mail, restaurant menus, medicine bottle dosages, or room numbers; OCR makes any text instantly accessible.

### 3. How it works inside NAZAR (step by step)
1. The user points their camera at text and says, *"Read this text"* (`voice/skills/OCRSkill.js`).
2. The browser captures an image frame and transmits it to our Express backend server.
3. The server instructs **Google Gemini Vision AI** to act as a precision text reader, extracting all visible words while ignoring background noise and pictures.
4. The extracted text is returned to the frontend, where our voice speaker reads it out loud word-by-word while visually highlighting the captions on screen!

### 4. Technologies used
*   **What happens in the frontend:** Snaps the photo, displays the text in a readable box on screen, and highlights words progressively as they are spoken.
*   **What happens in the backend:** Routes the image to Google AI with instructions to extract readable typography (`server/controllers/scanController.js`).
*   **What APIs are used:** Google Gemini Vision API; `/api/scans/ocr` internal route.
*   **What data is stored in MongoDB:** The extracted text and scan timestamp in the `scans` collection (categorized as an OCR scan).
*   **What Google Gemini does:** Performs advanced optical character recognition, recognizing curved text, different languages, and blurry fonts that traditional scanners miss.
*   **What Python does:** **Not implemented or used in NAZAR.**
*   **What JavaScript does:** Manages image compression, updates screen text boxes, and synchronizes word-by-word voice reading.
*   **What Vercel does:** Processes the server-side OCR translation request in a fast cloud function.
*   **What GitHub is used for:** Stores the OCR skill definitions and text formatting utilities.
*   **What browser APIs are used:** Canvas API and Web Speech Synthesis API.
*   **How everything connects together:** Camera image of text -> Backend Server -> Gemini Vision OCR extraction -> Text stored in MongoDB -> Progressive speech output in browser.

### 5. Real-life example
Like having a friend read a restaurant menu out loud to you from top to bottom, pausing whenever you ask them to repeat a delicious item.

### 6. Common questions someone might ask
*   *Q: Can it read handwritten notes or medicine bottles?*
*   *Q: Can it read text in different languages?*

### 7. Simple answers I can give during an exhibition
*   *"Yes! Because it uses modern Google artificial intelligence instead of old-school scanners, it can easily decipher handwriting, curved text on medicine bottles, and low-contrast fonts."*
*   *"Absolutely! It can recognize and read printed text in dozens of international languages automatically."*

---

## 8. Speech Recognition

### 1. What it is
The "ears" of NAZAR that listen to words spoken into the microphone and convert those audio sounds into written text string commands in real-time.

### 2. Why we need it
To enable a completely hands-free operating experience so users never have to locate, touch, or type on small keyboard buttons to navigate the application.

### 3. How it works inside NAZAR (step by step)
1. When the assistant is listening, our voice controller (`voice/core/recognition.js`) activates the browser's built-in speech engine.
2. As the user speaks into the microphone, the browser streams audio sounds and converts them into text transcripts on the fly.
3. The moment the user stops speaking, the final text phrase (e.g., *"Take a picture"*) is emitted as an event (`Speech heard`) and sent into our command router.

### 4. Technologies used
*   **What happens in the frontend:** Controls microphone listening permissions, captures audio waves, and translates speech to text using browser engines.
*   **What happens in the backend:** Nothing during the raw listening phase! Audio conversion happens natively in the user's browser or operating system.
*   **What APIs are used:** Web Speech API (`webkitSpeechRecognition` or `SpeechRecognition`).
*   **What data is stored in MongoDB:** No voice audio recordings are ever saved in the database.
*   **What Google Gemini does:** Not involved in converting raw microphone audio into text words.
*   **What Python does:** **Not implemented or used in NAZAR.**
*   **What JavaScript does:** Restarts listening if it disconnects, handles background noise timeouts, and filters out empty audio sounds.
*   **What Vercel does:** Delivers the JavaScript listeners that start microphone recording.
*   **What GitHub is used for:** Saves the speech recognition event bus (`voice/events.js`) and audio configuration files.
*   **What browser APIs are used:** Web Speech API (`SpeechRecognition`) and MediaStream Microphone API.
*   **How everything connects together:** User microphone -> Browser SpeechRecognition Engine -> Text string generated -> JavaScript Command Router.

### 5. Real-life example
Like a court stenographer sitting in a courtroom, listening to someone talk and instantly typing down every single word they say onto a notepad.

### 6. Common questions someone might ask
*   *Q: Does it record my voice and save my audio files in the cloud?*
*   *Q: What happens if there is loud background noise in the room?*

### 7. Simple answers I can give during an exhibition
*   *"We never record or save your voice audio! Your microphone sounds are converted into text strings instantly inside your browser and the audio is immediately discarded."*
*   *"Our system has built-in noise filtering and silence detection that waits until you clearly finish speaking your sentence before taking action."*

---

## 9. Text-to-Speech

### 1. What it is
The vocal voice of NAZAR that reads out descriptions, answers, confirmation messages, and OCR text in a clear, human-like spoken voice.

### 2. Why we need it
A visually impaired user cannot read answers displayed on a screen; vocal feedback provides the primary way they receive information and know what the computer is doing.

### 3. How it works inside NAZAR (step by step)
1. Whenever an AI answer or confirmation text is ready, our speaker module (`voice/core/speaker.js`) receives the message.
2. It sends the text string to the browser's built-in voice synthesizer, adjusting the speech rate, pitch, and voice accent based on the user's saved preferences.
3. As the voice speaks out loud, an event trigger (`onboundary`) lights up each spoken word on the screen in sync with the audio, while our audio visualizer makes the voice button pulse to the sound waves!

### 4. Technologies used
*   **What happens in the frontend:** Generates the spoken voice audio, animates the pulsing wave visualizer ring, and displays word-by-word text captions.
*   **What happens in the backend:** Nothing! Voice synthesis is handled entirely by the user's local device hardware and browser.
*   **What APIs are used:** Web Speech API (`SpeechSynthesis`, `SpeechSynthesisUtterance`).
*   **What data is stored in MongoDB:** The user's custom speech preferences (preferred rate, pitch, voice name) are saved in their MongoDB user profile.
*   **What Google Gemini does:** Not involved in generating audio sounds.
*   **What Python does:** **Not implemented or used in NAZAR.**
*   **What JavaScript does:** Splits long text paragraphs into smooth sentences, manages voice queues so voices don't talk over each other, and controls the audio visualizer (`AnalyserNode`).
*   **What Vercel does:** Serves the speaker formatting code to the browser.
*   **What GitHub is used for:** Stores `speaker.js` and the audio visualizer mathematical formulas.
*   **What browser APIs are used:** Web Speech Synthesis API and Web Audio API (`AnalyserNode`).
*   **How everything connects together:** Text answer -> JavaScript Speaker Queue -> Browser SpeechSynthesis Engine -> Speakers play sound + Visualizer button pulses.

### 5. Real-life example
Like an audiobook reader or a GPS car navigation voice that clearly speaks out instructions: *"Turn left in 100 feet"* so you keep your eyes on the road.

### 6. Common questions someone might ask
*   *Q: Can I change how fast or slow the voice speaks?*
*   *Q: Why does the center button pulse and breathe when speaking?*

### 7. Simple answers I can give during an exhibition
*   *"Yes! You can go into settings and customize the speech speed, voice pitch, and even select different male or female voice accents."*
*   *"The pulsing glowing wave on the button is a visualizer that moves in sync with the voice audio, giving a beautiful visual cue for users with partial vision or hearing impairments!"*

---

## 10. Emergency SOS

### 1. What it is
A vital safety system that lets a user instantly dispatch an emergency alert email containing their exact GPS location to loved ones using a single voice command or button press.

### 2. Why we need it
Visually impaired individuals may sometimes get lost, disoriented in unfamiliar locations, or experience a medical emergency; a hands-free voice trigger provides immediate peace of mind and rapid assistance.

### 3. How it works inside NAZAR (step by step)
1. The user says *"Send SOS"*, *"Emergency"*, or presses the red SOS button (`voice/skills/SOSSkill.js`).
2. JavaScript immediately contacts the browser's geolocation system to grab their exact latitude and longitude coordinates.
3. The browser sends these coordinates and the user's ID to our secure backend server (`/api/sos/trigger`).
4. The backend retrieves the user's saved emergency contact email addresses from MongoDB.
5. Our email delivery engine (`server/services/emailService.js`) uses **Nodemailer** to fire off high-priority alert emails containing a direct clickable Google Maps link of the user's exact location.
6. The backend logs the emergency event in MongoDB and the voice assistant calmly announces: *"Emergency alert and GPS location sent to your contacts."*

### 4. Technologies used
*   **What happens in the frontend:** Grabs GPS location coordinates and triggers emergency visual confirmation screens.
*   **What happens in the backend:** Fetches contact emails from the database, builds an HTML emergency email message, sends SMTP emails via Nodemailer, and logs the incident (`server/routes/sosRoutes.js`).
*   **What APIs are used:** Nodemailer SMTP Email API; Google Maps link formatting; internal `/api/sos/trigger` endpoint.
*   **What data is stored in MongoDB:** Saved emergency contacts (names, phone numbers, email addresses) in the `contacts` collection, and audit records of every triggered alert in the `soslogs` collection.
*   **What Google Gemini does:** Not used in this feature, ensuring instant execution without waiting for AI processing!
*   **What Python does:** **Not implemented or used in NAZAR.**
*   **What JavaScript does:** Grabs location coordinates and makes the secure server request.
*   **What Vercel does:** Executes the emergency serverless backend route that dispatches the alert email.
*   **What GitHub is used for:** Stores our SOS skill logic and email formatting templates.
*   **What browser APIs are used:** Geolocation API (`navigator.geolocation.getCurrentPosition`).
*   **How everything connects together:** Voice command *"SOS"* -> Browser Geolocation API -> Express Backend Server -> MongoDB Contact Lookup -> Nodemailer SMTP Server -> Emergency Email Delivered!

### 5. Real-life example
Like pulling a fire alarm lever in a building or pressing a medical alert bracelet; a single simple action automatically alerts security guards and sends them your exact room number.

### 6. Common questions someone might ask
*   *Q: How does it know where I am located?*
*   *Q: Can I add multiple family members to receive the SOS alert?*

### 7. Simple answers I can give during an exhibition
*   *"It uses your device's built-in GPS satellite and Wi-Fi location sensors to pinpoint your exact coordinates on a map."*
*   *"Yes! You can add as many family members, friends, or caregivers as you want in your personal contacts list, and all of them will receive the emergency email alert simultaneously."*

---

## 11. Settings

### 1. What it is
The customization dashboard where users modify their personal preferences, manage emergency contacts, adjust voice speeds, and configure display options.

### 2. Why we need it
Every user's accessibility needs are unique—some prefer very fast speech, others need extra-large text or specific language dialects, and everyone needs a simple place to manage their emergency trusted contacts.

### 3. How it works inside NAZAR (step by step)
1. When the user opens the Settings tab (`voice/skills/SettingsSkill.js`), JavaScript fetches their current saved profile from our backend server (`/api/settings`).
2. The user changes a slider (e.g., speech rate from 1.0x to 1.5x) or adds a new emergency contact email.
3. JavaScript automatically sends these changes to our Express backend server, which updates their document in MongoDB.
4. The website instantly applies the new settings without requiring a page reload!

### 4. Technologies used
*   **What happens in the frontend:** Displays accessible forms, toggles, and sliders; updates live application settings in browser memory.
*   **What happens in the backend:** Receives preference updates, validates data, and saves changes to user profiles in the database (`server/routes/settings.js`, `server/routes/contacts.js`).
*   **What APIs are used:** Internal `/api/settings` and `/api/contacts` endpoints.
*   **What data is stored in MongoDB:** User settings documents (speech rate, pitch, voice preference, high-contrast mode toggles) inside the `settings` collection, and contact cards in the `contacts` collection.
*   **What Google Gemini does:** Not used in this feature.
*   **What Python does:** **Not implemented or used in NAZAR.**
*   **What JavaScript does:** Listens to slider adjustments, updates form fields, and sends save requests to the server.
*   **What Vercel does:** Routes settings API requests to our Express server functions.
*   **What GitHub is used for:** Stores settings UI layouts and data validation rules.
*   **What browser APIs are used:** LocalStorage API (for offline caching of preferences).
*   **How everything connects together:** User moves slider -> JavaScript captures update -> Express Backend Server -> MongoDB database document updated -> Voice synthesizer speed changes instantly.

### 5. Real-life example
Like adjusting the driver's seat, rear-view mirror, and radio volume when you get into a car so the vehicle fits your exact body size and driving style.

### 6. Common questions someone might ask
*   *Q: If I log in on a different computer, will my settings transfer over?*
*   *Q: How easy is it to add or remove an emergency contact?*

### 7. Simple answers I can give during an exhibition
*   *"Yes! Because your settings and contacts are securely saved in our cloud database, your customized voice speed and contacts will load automatically on any device you log into."*
*   *"It is as simple as typing a name and email address into two boxes and pressing Save, or you can even add contacts using your voice!"*

---

## 12. Database

### 1. What it is
The secure cloud storage filing system powered by **MongoDB** that permanently organizes and remembers all user data across internet sessions.

### 2. Why we need it
Without a database, a website has "amnesia"—every time you refresh the page or close your laptop, your login account, scan history, customized settings, and emergency contacts would be erased!

### 3. How it works inside NAZAR (step by step)
1. When our backend server boots up (`server/db.js`), it connects to our cloud database cluster on **MongoDB Atlas** using a Mongoose wrapper.
2. We organize our data into 6 neat digital collections (like folders in a filing cabinet): `users`, `settings`, `contacts`, `scans`, `soslogs`, and `apikeyusages`.
3. Whenever a user performs an action (like registering an account or completing an OCR scan), Express sends a structured document to MongoDB to be saved instantly with an atomic timestamp.

### 4. Technologies used
*   **What happens in the frontend:** Nothing directly! The browser never touches the database directly for security reasons; it only talks to our Express backend server.
*   **What happens in the backend:** Node.js uses **Mongoose 9.7.4** (an Object Data Modeling library) to validate data schemas, read documents, and write new records safely (`server/models/*`).
*   **What APIs are used:** MongoDB Wire Protocol over encrypted TLS/SSL connections.
*   **What data is stored in MongoDB:**
    *   `users`: Login emails and password hashes.
    *   `settings`: Custom voice rate, pitch, and theme preferences.
    *   `contacts`: Emergency SOS recipient names and emails.
    *   `scans`: History of AI scene descriptions and OCR readings.
    *   `soslogs`: Timestamped audit logs of when emergency alerts were triggered.
    *   `apikeyusages`: Tracking counters for our 4 Gemini API keys to manage rotation.
*   **What Google Gemini does:** Not involved in database management.
*   **What Python does:** **Not implemented or used in NAZAR.**
*   **What JavaScript does:** Defines database schemas, validates input data types, and writes queries inside our Node.js server scripts.
*   **What Vercel does:** Maintains secure database connection pools from our serverless functions to MongoDB cloud.
*   **What GitHub is used for:** Stores Mongoose schema models (`server/models/*.js`) and database connection configurations.
*   **What browser APIs are used:** None for direct database communication.
*   **How everything connects together:** Browser Request -> Express Backend Server (`server.js`) -> Mongoose Validation Schema -> MongoDB Cloud Cluster Storage.

### 5. Real-life example
Like a giant, high-security library vault where a librarian (our server) takes your books (data), catalogs them with index cards, and locks them away safely so only you can check them out later.

### 6. Common questions someone might ask
*   *Q: What database system do you use and why?*
*   *Q: Can other users see my personal scan history in the database?*

### 7. Simple answers I can give during an exhibition
*   *"We use MongoDB, a world-class NoSQL cloud database, because it handles flexible, rapid data changes and scales effortlessly to millions of users."*
*   *"Never! Every piece of data in our database is strictly linked to your unique encrypted User ID, making it mathematically impossible for other users to see your scans or contacts."*

---

## 13. Deployment

### 1. What it is
The hosting infrastructure powered by **Vercel** that takes our raw project code from **GitHub** and publishes it onto high-speed cloud servers around the globe so anyone can visit the website 24/7.

### 2. Why we need it
A project running only on a developer's personal laptop cannot be accessed by the public; deployment places the website on the internet with automatic security certificates (HTTPS) and global server distribution.

### 3. How it works inside NAZAR (step by step)
1. Whenever our developers write new code and push it to our repository on **GitHub** (`github.com/kamal1064/nazar2.0`), an automatic trigger fires.
2. Our cloud hosting provider, **Vercel**, detects the new GitHub code and reads our configuration file (`vercel.json`).
3. Vercel builds the frontend HTML/CSS/JS files and deploys them to hundreds of global edge servers (Content Delivery Network).
4. Simultaneously, Vercel wraps our Node.js Express server (`server/server.js`) into **Serverless Functions**—cloud backends that wake up instantly whenever a user makes an API request!

### 4. Technologies used
*   **What happens in the frontend:** Loaded from Vercel's edge servers closest to the user's city for lightning-fast page loading.
*   **What happens in the backend:** Express API routes run as scalable Vercel Serverless Functions over secure Node.js 18+ environments.
*   **What APIs are used:** Vercel Build & Deployment APIs; GitHub Webhooks.
*   **What data is stored in MongoDB:** Database connection URI strings are securely stored as encrypted Vercel Environment Variables (`MONGODB_URI`).
*   **What Google Gemini does:** API keys (`GEMINI_API_KEY_1...4`) are injected securely during Vercel's server deployment.
*   **What Python does:** **Not implemented or used in NAZAR.**
*   **What JavaScript does:** Runs the Node.js server inside Vercel's cloud execution environment.
*   **What Vercel does:** Acts as our master web host, SSL certificate provider, domain router, and serverless backend engine!
*   **What GitHub is used for:** Serves as the central source code repository that triggers automated deployments whenever code changes.
*   **What browser APIs are used:** HTTPS / SSL secure network protocols.
*   **How everything connects together:** Developer pushes code to GitHub -> Vercel Webhook triggered -> Vercel builds Website & Serverless Functions -> Live Website available at public URL!

### 5. Real-life example
Like printing copies of a helpful guidebook and placing a copy in every public library around the world; no matter which city a user lives in, they can walk in and grab a guidebook instantly without waiting for shipping from headquarters.

### 6. Common questions someone might ask
*   *Q: What happens if thousands of people visit the website at the exact same time during this exhibition?*
*   *Q: Why did you choose Vercel instead of running a traditional server?*

### 7. Simple answers I can give during an exhibition
*   *"Because we are deployed on Vercel's serverless cloud, our server automatically scales up instantly to handle thousands of simultaneous visitors without crashing or slowing down!"*
*   *"Vercel integrates seamlessly with GitHub and automatically handles SSL security, server maintenance, and global caching so our team can focus 100% on building accessibility features."*

---

## 14. Security

### 1. What it is
The protective armor and digital safety guards built into NAZAR to block hackers, prevent spam attacks, protect user passwords, and safeguard sensitive API keys.

### 2. Why we need it
Because NAZAR handles sensitive user accessibility data, camera images, and GPS emergency locations, maintaining absolute security and privacy is critical to gaining user trust.

### 3. How it works inside NAZAR (step by step)
1. When a user connects to NAZAR, **Helmet.js** middleware (`server/server.js`) automatically attaches HTTP security headers to protect against scripting attacks and clickjacking.
2. Our **CORS (Cross-Origin Resource Sharing)** rules ensure that only our official website domain is allowed to talk to our backend API server.
3. If an attacker tries to spam our voice or login endpoints, our **Rate Limiter** (`express-rate-limit`) blocks their IP address after too many rapid requests.
4. User passwords are never saved in plain text; our server uses **bcryptjs** math algorithms to hash them into unreadable character strings before saving to MongoDB.
5. Our **Key Rotation Service** (`server/services/keyRotationService.js`) dynamically monitors and rotates across 4 Google Gemini API keys, ensuring our AI secrets are never overloaded or exposed!

### 4. Technologies used
*   **What happens in the frontend:** Sanitizes user inputs to prevent malicious code injection and communicates exclusively over encrypted HTTPS connections.
*   **What happens in the backend:** Applies Helmet security headers, validates CORS origins, enforces rate-limiting rules, encrypts passwords, and rotates API keys (`server/middleware/*`).
*   **What APIs are used:** Express Security Middlewares (`helmet`, `cors`, `express-rate-limit`, `bcryptjs`, `jsonwebtoken`).
*   **What data is stored in MongoDB:** Only securely hashed password strings (`bcrypt`) and encrypted session records; never plain-text secrets.
*   **What Google Gemini does:** Protected by our backend API proxy so API keys (`GEMINI_API_KEY_1...4`) are never sent to or visible in the user's browser.
*   **What Python does:** **Not implemented or used in NAZAR.**
*   **What JavaScript does:** Executes all security middlewares, password hashing algorithms, and token verification checks.
*   **What Vercel does:** Enforces strict HTTPS encryption protocols and blocks distributed denial-of-service (DDoS) attacks at the network edge.
*   **What GitHub is used for:** Stores our security middleware code while using `.gitignore` to ensure secret passwords and API keys (`.env` files) are never uploaded to the public internet.
*   **What browser APIs are used:** Secure HTTP-only and SameSite cookie protocols.
*   **How everything connects together:** Browser HTTPS request -> Vercel Edge Firewall -> Express Helmet & CORS Firewall -> Rate Limiter Check -> Secure Database Query.

### 5. Real-life example
Like a high-security bank building that has an armored front door (HTTPS), a security guard checking IDs at the entrance (CORS & Authentication), a turnstile that only lets one person in at a time to prevent rushing (Rate Limiting), and a vault where all money is kept in locked safe deposit boxes (Password Hashing).

### 6. Common questions someone might ask
*   *Q: How do you prevent hackers from stealing your expensive Google AI keys?*
*   *Q: Can someone spy on my GPS coordinates during an SOS alert?*

### 7. Simple answers I can give during an exhibition
*   *"Our Google AI keys are stored strictly inside our encrypted server environment; your browser never sees the keys, it only talks to our secure server proxy!"*
*   *"No! When you trigger an SOS alert, your GPS coordinates are encrypted over HTTPS and sent directly to our private server, which securely emails them exclusively to your trusted contacts."*

---

## 15. Performance Optimizations

### 1. What it is
The speed-tuning engineering and smart architectural shortcuts built into NAZAR to make voice responses instantaneous, save internet bandwidth, and prevent the browser from freezing.

### 2. Why we need it
For a blind user navigating a physical room, waiting 5 seconds for a computer to answer is dangerous and frustrating; accessibility software must respond in the blink of an eye.

### 3. How it works inside NAZAR (step by step)
1. **Local Voice Bypass:** When you speak a basic command like *"Help"* or *"Camera"*, our local dictionary and fuzzy matcher (`voice/commands/english.js`, `voice/core/fuzzyMatcher.js`) resolve the action in **under 10 milliseconds locally inside the browser**—completely bypassing slow internet server trips!
2. **Offline Web Worker:** For real-time object detection, we run the heavy machine learning math inside a background thread (**Web Worker** `detection-worker.js`), ensuring the main webpage layout and voice animations never lag or freeze.
3. **Memory Scoping:** When analyzing camera images, our code wraps TensorFlow operations inside memory cleanup blocks (`tf.engine().startScope()` and `tensor.dispose()`), instantly deleting old image data so the computer doesn't run out of RAM.
4. **API Key Rotation:** To guarantee 100% uptime without hitting Google's rate limits, our backend automatically tracks request counts (`server/services/keyRotationService.js`) and instantly switches between 4 backup Gemini API keys after 495 requests or upon encountering a server busy warning!

### 4. Technologies used
*   **What happens in the frontend:** Employs background Web Workers for heavy AI calculations, local fuzzy matching for instant voice commands, and memory cleanup blocks for image tensors.
*   **What happens in the backend:** Tracks API request counts in memory and MongoDB, dynamically swapping API keys (`GEMINI_API_KEY_1...4`) to prevent bottlenecks and downtime.
*   **What APIs are used:** Levenshtein Distance Math Algorithm; TensorFlow.js Memory Scoping (`tf.engine().startScope()`); Web Workers API.
*   **What data is stored in MongoDB:** Real-time API key usage counters (`apikeyusages` collection) to manage rotation schedules across server restarts.
*   **What Google Gemini does:** Responds rapidly to complex queries while our backend protects it from being overloaded by simple commands that can be handled locally.
*   **What Python does:** **Not implemented or used in NAZAR.**
*   **What JavaScript does:** Performs lightning-fast math calculations, manages background worker threads, and executes garbage collection on unused image data.
*   **What Vercel does:** Serves static files from global edge caches so the website opens in less than a second anywhere in the world.
*   **What GitHub is used for:** Stores our optimization algorithms and key rotation services.
*   **What browser APIs are used:** Web Workers API, Offscreen Canvas API, and Hardware GPU Acceleration.
*   **How everything connects together:** Voice/Image Input -> Local Browser Math Check (instant bypass if simple) OR Background Web Worker (if real-time AI) OR Rotated Backend API (if complex cloud AI) -> Instantaneous User Feedback!

### 5. Real-life example
Like having a smart receptionist at the front desk of a busy office; if you ask a simple question like *"Where is the restroom?"*, the receptionist answers instantly without bothering the CEO (the cloud AI). Only when you ask a complex question like *"Can you analyze this 20-page legal contract?"* does the receptionist send it up to the executive floor!

### 6. Common questions someone might ask
*   *Q: Why does NAZAR respond so much faster than normal voice assistants?*
*   *Q: What happens if thousands of users overload your Google AI account?*

### 7. Simple answers I can give during an exhibition
*   *"We built a smart two-speed brain: everyday commands are answered instantly right inside your browser in milliseconds without ever waiting for the internet!"*
*   *"Our backend features an automatic API Key Rotation system that monitors traffic and dynamically shifts between 4 backup AI keys so our service never slows down or hits traffic limits!"*

---

## 🔗 Summary: How All Technologies Connect Together in Harmony

To summarize for judges or exhibition visitors, here is how the entire ecosystem operates as a unified, accessible operating layer:

1.  **GitHub** holds our open-source codebase safely in version control.
2.  **Vercel** watches GitHub, builds our project, and deploys the website globally with HTTPS security.
3.  **HTML5 & CSS3** provide the high-contrast, accessible visual foundation on the user's screen.
4.  **JavaScript (Frontend)** powers the interface, listening to microphone audio via the **Web Speech API** and streaming video via the **MediaDevices Camera API**.
5.  **Web Workers & TensorFlow.js** run real-time object detection locally in background threads without internet lag.
6.  **Node.js & Express (Backend)** act as our secure server bridge, protected by **Helmet** security headers and **CORS** rules.
7.  **MongoDB** stores user profiles, preferences, scan histories, and emergency contacts securely in the cloud using **Mongoose**.
8.  **Google Gemini 3.1 Flash Lite & Vision AI** serve as our cloud intelligence, understanding complex spoken phrases and describing spatial camera scenes.
9.  **Nodemailer** dispatches instant emergency GPS emails to loved ones when the SOS system is triggered.

*Every line of code in NAZAR is engineered with a single purpose: empowering visually impaired individuals with independence, safety, and instant understanding of their environment.*
