# NAZAR — Local Installation & Setup Guide

This document describes the step-by-step installation instructions to configure and run the NAZAR Express Server, MongoDB database, and Standalone WhatsApp microservice locally.

---

## 📋 Prerequisites
Before bootstrapping the application, ensure the following software is installed on your development machine:
1. **Node.js**: `v20.x` or higher.
2. **MongoDB**: Local server instance running on `mongodb://127.0.0.1:27017` or access to a MongoDB Atlas cluster.
3. **Git**: Core version control.
4. **Web Browser**: Chrome, Safari, or Edge (required for Web Speech APIs and camera device permissions).

---

## 🛠️ Step 1: Clone the Repository & Install Dependencies

### 1. Clone the codebase:
```bash
git clone https://github.com/kamal1064/nazar2.0.git
cd nazar2.0
```

### 2. Install main server dependencies:
```bash
npm install
```

### 3. Install WhatsApp microservice dependencies:
```bash
cd whatsapp-service
npm install
cd ..
```

---

## ⚙️ Step 2: Configure Environment Variables

### 1. Main Express Server
Create a `.env` file in the root directory by copying the template:
```bash
cp .env.example .env
```
Open `.env` and fill in the required keys:
- `MONGODB_URI`: Link to your MongoDB instance (e.g. `mongodb://127.0.0.1:27017/nazar`).
- `GEMINI_API_KEY_1` to `GEMINI_API_KEY_4`: Google Gemini API keys for vision. At least key `1` must be provided.
- `GROQ_API_KEY_1` and `GROQ_API_KEY_2`: Groq API keys for voice intent parsing. At least key `1` must be provided.
- `EMAIL_USER` & `EMAIL_APP_PASSWORD`: SSMTP credentials for email dispatches.
- `WHATSAPP_SERVICE_URL`: Port where the microservice will run (typically `http://localhost:5001`).
- `WHATSAPP_SERVICE_API_KEY`: Secret matching token (e.g. `your-secret-security-key`).

### 2. WhatsApp Microservice
Create a `.env` file inside the `whatsapp-service/` directory:
```bash
cd whatsapp-service
cp .env.example .env
```
Open `whatsapp-service/.env` and edit:
- `PORT`: Binds to `5000` inside the container (mapped to `5001` on host).
- `INTERNAL_WHATSAPP_API_KEY`: Must match the main server's `WHATSAPP_SERVICE_API_KEY`.
- `GATEWAY_CALLBACK_URL`: Direct link to report dispatches (e.g. `http://localhost:5000/api/sos/callback`).
- `BAILEYS_AUTH_PATH`: Session path (defaults to `../.baileys-auth` which resolves to the parent root, preventing git commits).

---

## 🚀 Step 3: Run the Servers

### 1. Boot the Main API Backend
From the root directory, run:
```bash
npm run dev
```
The server will initialize on `http://localhost:5000`. You should see log lines validating your configured keys and confirming Gmail SMTP credentials.

### 2. Boot the WhatsApp Microservice
From a separate terminal window, navigate to `whatsapp-service/` and run:
```bash
cd whatsapp-service
npm run dev
```
The microservice will boot on port `5001` (if `PORT=5001` is set in its `.env` file).

---

## 📲 Step 4: Scan and Pair WhatsApp

1. Look at your terminal console running `whatsapp-service`. On initial boot, a QR code will print directly in your CLI.
2. If it does not print clearly, open your web browser and visit:
   `http://localhost:5001/qr`
3. Open WhatsApp on your target mobile phone -> **Linked Devices** -> **Link a Device** and scan the browser QR code.
4. The terminal will log `authentication confirmed`. A folder `.baileys-auth/` will be generated in your root directory.
5. Visit `http://localhost:5000/health` in your browser. You should see `"status": "healthy"` and `"openwa": "ready"`, verifying all services are fully connected.

---

## 🧪 Step 5: Verify the Installation

Run the backend verification checks:
```bash
npm test
```
*Note: If local database configurations are missing, database-dependent authentication tests will fail. This is normal and represents an environmental timeout, not a code defect.*
