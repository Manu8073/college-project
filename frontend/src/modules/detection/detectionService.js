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

// ═══════════════════════════════════════════════════════════════
// REAL OBJECT DETECTION — via FastAPI service on port 8002
// Uses yolo26n-objv1-150.pt (365-class trained model)
// ═══════════════════════════════════════════════════════════════

export const OBJECT_DETECTION_CONFIG = {
  apiUrl: import.meta.env?.VITE_OBJECT_DETECTION_API_URL || 'http://localhost:8002',
  timeoutMs: 15000,
  /** Must match the FastAPI parameter name: `file: UploadFile = File(...)` */
  fieldName: 'file',
};

/**
 * @typedef {object} ObjectDetection
 * @property {string}   label      — class name, e.g. "person"
 * @property {number}   confidence — 0.0–1.0
 * @property {string}   direction  — "left" | "center" | "right"
 * @property {string}   distance   — estimated proximity string
 * @property {number[]} box        — [x1, y1, x2, y2]
 */

/**
 * @typedef {object} ObjectDetectionResult
 * @property {ObjectDetection[]} detections
 * @property {number}  count
 * @property {string}  model
 * @property {string}  timestamp
 */

// ── Direction / distance heuristics from bounding boxes ────────

/**
 * Estimates horizontal direction ('left' | 'center' | 'right')
 * based on the horizontal center of the bounding box and actual frame width.
 *
 * @param {number[]} box        — [x1, y1, x2, y2]
 * @param {number}   [frameWidth=1280]
 * @returns {'left' | 'center' | 'right'}
 */
export function estimateDirection(box, frameWidth = 1280) {
  if (!Array.isArray(box) || box.length < 4) return 'center';
  const width = typeof frameWidth === 'number' && frameWidth > 0 ? frameWidth : 1280;
  const [x1, , x2] = box;
  const centerX = (x1 + x2) / 2;
  const third = width / 3;
  if (centerX < third) return 'left';
  if (centerX > 2 * third) return 'right';
  return 'center';
}

/**
 * Estimates approximate proximity ('near' | 'nearby' | 'far')
 * based on the box height relative to actual frame height.
 *
 * @param {number[]} box         — [x1, y1, x2, y2]
 * @param {number}   [frameHeight=720]
 * @returns {'near' | 'nearby' | 'far'}
 */
export function estimateDistance(box, frameHeight = 720) {
  if (!Array.isArray(box) || box.length < 4) return 'far';
  const height = typeof frameHeight === 'number' && frameHeight > 0 ? frameHeight : 720;
  const [, y1, , y2] = box;
  const boxHeight = Math.max(0, y2 - y1);
  const ratio = boxHeight / height;
  if (ratio > 0.55) return 'near';
  if (ratio > 0.25) return 'nearby';
  return 'far';
}

// ── Speech Prioritization & Deduplication ─────────────────────

const PROXIMITY_WEIGHT = {
  'near': 3,
  'very close': 3,
  'nearby': 2,
  'medium': 2,
  'far': 1,
};

/**
 * Deterministically prioritizes detections: closer objects first, then higher confidence, then larger area.
 *
 * @param {ObjectDetection[]} detections
 * @param {number} [maxCount=3]
 * @returns {ObjectDetection[]}
 */
export function prioritizeDetections(detections, maxCount = 3) {
  if (!Array.isArray(detections) || detections.length === 0) return [];
  return [...detections]
    .sort((a, b) => {
      const pA = PROXIMITY_WEIGHT[a.distance] ?? 1;
      const pB = PROXIMITY_WEIGHT[b.distance] ?? 1;
      if (pB !== pA) return pB - pA;
      if ((b.confidence ?? 0) !== (a.confidence ?? 0)) return (b.confidence ?? 0) - (a.confidence ?? 0);
      const areaA = a.box ? Math.max(0, (a.box[2] - a.box[0]) * (a.box[3] - a.box[1])) : 0;
      const areaB = b.box ? Math.max(0, (b.box[2] - b.box[0]) * (b.box[3] - b.box[1])) : 0;
      return areaB - areaA;
    })
    .slice(0, maxCount);
}

/**
 * Computes a fingerprint representing the current detection state (count, label, direction, distance).
 * Used to detect meaningful changes and prevent repetitive announcements.
 *
 * @param {ObjectDetectionResult|null} result
 * @param {number} [maxTracked=4]
 * @returns {string}
 */
export function getDetectionSignature(result, maxTracked = 4) {
  if (!result?.count || !result.detections?.length) return 'none:0';
  const prioritized = prioritizeDetections(result.detections, maxTracked);
  const signatureItems = prioritized
    .map(d => `${d.label}|${d.direction}|${d.distance}`)
    .sort()
    .join(';');
  return `${result.count}:${signatureItems}`;
}

// ── Public API ─────────────────────────────────────────────────

/**
 * Sends a camera frame to the object-detection-service and returns
 * structured results with direction / distance estimates based on actual frame dimensions.
 *
 * @param {Blob}   image               — JPEG blob from captureFrame()
 * @param {object} [options]
 * @param {AbortSignal} [options.signal]
 * @param {number} [options.frameWidth=1280]
 * @param {number} [options.frameHeight=720]
 * @returns {Promise<ObjectDetectionResult>}
 */
export async function detectObjects(image, { signal, frameWidth = 1280, frameHeight = 720 } = {}) {
  if (!image) {
    throw new Error('Camera frame is empty. Please ensure the camera is running.');
  }

  const controller = new AbortController();
  let timedOut = false;

  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, OBJECT_DETECTION_CONFIG.timeoutMs);

  const forwardAbort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', forwardAbort);

  try {
    const body = new FormData();
    body.append(OBJECT_DETECTION_CONFIG.fieldName, image, 'frame.jpg');

    let response;
    try {
      response = await fetch(
        `${OBJECT_DETECTION_CONFIG.apiUrl}/api/detect`,
        { method: 'POST', body, signal: controller.signal },
      );
    } catch (networkErr) {
      if (controller.signal.aborted) throw networkErr;
      throw new Error(
        'Object detection service is unavailable on port 8002. Please ensure the service is running.'
      );
    }

    if (!response.ok) {
      const errorMsg = await response.text().catch(() => '');
      throw new Error(`Object detection service returned HTTP ${response.status}${errorMsg ? `: ${errorMsg}` : ''}`);
    }

    let raw;
    try {
      raw = await response.json();
    } catch {
      throw new Error('Object detection service returned an invalid response format.');
    }

    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.detections)) {
      throw new Error('Object detection service returned an unexpected response structure.');
    }

    // Map the FastAPI response to our internal format using actual frame dimensions
    const detections = raw.detections.map((d) => ({
      label:      d['class'] ?? d.label ?? 'unknown',
      confidence: typeof d.confidence === 'number' ? d.confidence : 0,
      direction:  estimateDirection(d.box ?? [0, 0, 0, 0], frameWidth),
      distance:   estimateDistance(d.box ?? [0, 0, 0, 0], frameHeight),
      box:        Array.isArray(d.box) ? d.box : [0, 0, 0, 0],
    }));

    return {
      detections,
      count: typeof raw.count === 'number' ? raw.count : detections.length,
      model: raw.model ?? '',
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(
        timedOut
          ? 'Object detection service took too long to respond.'
          : 'Object detection was cancelled.',
      );
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener('abort', forwardAbort);
  }
}

function formatDirection(direction) {
  if (direction === 'left') return 'on your left';
  if (direction === 'right') return 'on your right';
  return 'ahead';
}

/**
 * Returns a concise, prioritized spoken description of an ObjectDetectionResult.
 * Limits spoken items to avoid overwhelming the user in busy frames.
 *
 * @param {ObjectDetectionResult|null} result
 * @param {number} [maxSpoken=3]
 * @returns {string}
 */
export function describeObjectDetection(result, maxSpoken = 3) {
  if (!result?.count || !result.detections?.length) return 'No objects detected.';

  const prioritized = prioritizeDetections(result.detections, maxSpoken);
  const items = prioritized.map(
    (d) => `${d.label} ${formatDirection(d.direction)}, ${d.distance}`
  );

  if (result.count === 1) {
    return items[0] ? `${items[0]}.` : '1 object detected.';
  }

  if (result.count <= maxSpoken) {
    return `${items.join('. ')}.`;
  }

  return `${result.count} objects. ${items.join('. ')}.`;
}
