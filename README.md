# NETRA — Assistive Vision System

> **⚠️ This repository contains the full-stack web prototype scaffold — not the completed AI/navigation/OCR system.**

NETRA is an assistive vision application designed to help visually impaired users navigate their environment through real-time object detection, text recognition (OCR), and voice-guided navigation.

## Architecture

This project is structured as a full-stack monorepo:

```text
React + Vite (Frontend)
     ↓
REST API (JSON over HTTP)
     ↓
Node.js + Express (Backend)
```

## Technology Stack

**Frontend:**
* React 19 + Vite
* Browser WebRTC / `getUserMedia` (Camera)
* Web Speech API (`SpeechSynthesis`)
* Browser Geolocation API
* Future: TensorFlow.js + COCO-SSD (Object Detection)
* Future: Tesseract.js (OCR)
* Future: Google Maps JavaScript API (Navigation)

**Backend:**
* Node.js
* Express
* REST API
* In-memory starter event storage (No database yet)

## Project Structure

* **`/frontend`**: The React application. Contains the UI, hardware service hooks, and module placeholders.
* **`/backend`**: The Node.js Express API. Provides system status and a temporary in-memory store for shared events.
* **`/shared`**: Documentation and shared definitions for the data contracts that both frontend and backend use.

## Installation

You must install dependencies for both the frontend and backend separately.

```bash
# Install frontend dependencies
cd frontend
npm install

# Install backend dependencies
cd ../backend
npm install
```

## Running the Project

To run the full stack locally, you need two terminal windows.

**Terminal 1 (Backend):**
```bash
cd backend
npm run dev
```
*The backend runs on `http://localhost:5001`.*

**Terminal 2 (Frontend):**
```bash
cd frontend
npm run dev
```
*The frontend runs on `http://localhost:5173`. API calls are proxied to the backend automatically.*

## Test API

The backend exposes these initial REST endpoints:

* **`GET /api/health`** — Basic health check.
* **`GET /api/system/status`** — Returns the readiness status of all modules.
* **`GET /api/events`** — Returns the list of events currently stored in memory.
* **`POST /api/events`** — Accepts a new NETRA event.

## Shared Event Contract

All inter-module communication uses a standardized event schema.
Please see the [Shared Contract Documentation](shared/contracts/README.md) for full details on the event shape and allowed values.

## Team Modules

The project is divided into four modules for the team:

* **Member 1: Detection** (`frontend/src/modules/detection/`) — Will handle TensorFlow.js object detection.
* **Member 2: Navigation** (`frontend/src/modules/navigation/`) — Will handle Google Maps routing and Geolocation.
* **Member 3: OCR** (`frontend/src/modules/ocr/`) — Will handle Tesseract.js text recognition.
* **Member 4: Shell** (`frontend/src/modules/shell/`) — Handles the integration layout, backend connectivity, and global audio queuing.

Each module can use backend APIs where genuinely needed.

## Git Workflow

```text
main
├── detection-module
├── nav-module
├── ocr-module
└── shell-module
```

**Rules:**
* Do not directly develop features on `main`.
* One module/feature per branch.
* Use Pull Requests.
* Test before merging.
* Avoid multiple members editing the same file simultaneously.
