# Netra Navigation Module (React + JavaScript)

Assistive walking navigation web application with real-time AI obstacle & hazard detection and audio guidance.

## Features
- **Turn-by-turn Audio Guidance**: Voice-driven walking navigation using Google Places and Routes APIs.
- **Real-Time AI Vision**: Object and hazard detection (vehicles, pedestrians, obstacles, traffic signals) using TensorFlow.js COCO-SSD.
- **Pedestrian Crossing Radar**: Alerts for approaching zebra crossings and signalized intersections via OpenStreetMap Overpass API.
- **High-Contrast Accessible UI**: Built with React, large touch controls, keyboard shortcuts (`Space` for voice command, `Esc` to stop, `N` to start, `M` to mute), and ARIA live regions.
- **Sensor Telemetry**: GPS accuracy, speed, coordinates, and 3D device orientation compass.

## Getting Started

### Prerequisites
- Node.js (v18+)
- Google Maps API Key (with Places API, Routes API, and Geocoding API enabled)

### Installation
```bash
npm install
```

### Environment Configuration
Create a `.env.local` or `.env` file in the root directory:
```bash
VITE_GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here
```

### Running Locally
```bash
npm run dev
```

### Building for Production
```bash
npm run build
```
