/**
 * NETRA — Detection Service (PLACEHOLDER)
 * ─────────────────────────────────────────────────────────────
 * OWNER: Member 1
 *
 * Future responsibilities:
 *  - Accept a video element / canvas frame as input
 *  - Run TensorFlow.js COCO-SSD (or custom model) inference
 *  - Return a structured DetectionResult conforming to the shared contract
 *
 * Current state:
 *  - Returns a hardcoded dummy result after a simulated async delay
 *  - The exported interface is intentionally stable so the rest of the
 *    application can integrate against it before the real model is added.
 *
 * TODO (Member 1):
 *  1. npm install @tensorflow/tfjs @tensorflow-models/coco-ssd
 *  2. Replace runDetection() with real model inference
 *  3. Map raw COCO-SSD output to the DetectionResult typedef
 */

/**
 * @typedef {object} DetectionResult
 * @property {string} label       — human-readable class name, e.g. "person"
 * @property {number} confidence  — 0.0–1.0
 * @property {string} direction   — "left" | "center" | "right"
 * @property {string} distance    — estimated distance string, e.g. "2m"
 */

/**
 * Simulates one detection pass.
 * Replace the body of this function with real TensorFlow.js inference.
 *
 * @returns {Promise<DetectionResult>}
 */
export async function runDetection(/* videoElement */) {
  // Simulate processing time
  await new Promise(resolve => setTimeout(resolve, 300));

  // ── DUMMY RESULT ──────────────────────────────────────────
  // Member 1: replace this with real COCO-SSD output mapping
  const dummyResults = [
    { label: 'person',   confidence: 0.92, direction: 'left',   distance: '2m'  },
    { label: 'car',      confidence: 0.87, direction: 'center', distance: '5m'  },
    { label: 'chair',    confidence: 0.74, direction: 'right',  distance: '1.5m'},
    { label: 'bicycle',  confidence: 0.81, direction: 'left',   distance: '3m'  },
  ];

  return dummyResults[Math.floor(Math.random() * dummyResults.length)];
}

/**
 * Returns a human-readable alert string for a DetectionResult.
 * @param {DetectionResult} result
 * @returns {string}
 */
export function describeDetection(result) {
  return `${result.label} detected ${result.direction}, approximately ${result.distance} away. Confidence: ${Math.round(result.confidence * 100)}%.`;
}
