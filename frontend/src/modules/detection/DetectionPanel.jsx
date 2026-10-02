/**
 * NETRA — Detection Panel Component (PLACEHOLDER)
 * ─────────────────────────────────────────────────────────────
 * OWNER: Member 1
 *
 * Displays the current detection status and latest result.
 * The Shell module renders this panel.
 */

import { useState } from 'react';
import { runDetection, describeDetection } from './detectionService.js';
import {
  createEvent, SOURCE, EVENT_TYPE, PRIORITY
} from '../../shared/types/events.js';

/**
 * @param {object}   props
 * @param {Function} props.onEvent — Shell callback to receive a NetraEvent
 */
export default function DetectionPanel({ onEvent }) {
  const [result,  setResult]  = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleDetect() {
    setLoading(true);
    try {
      const detection = await runDetection();
      setResult(detection);

      // Emit a shared-contract event up to the Shell
      const event = createEvent({
        source:   SOURCE.DETECTION,
        type:     EVENT_TYPE.OBSTACLE,
        priority: detection.confidence > 0.85 ? PRIORITY.HIGH : PRIORITY.MEDIUM,
        payload:  detection,
      });
      onEvent?.(event);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="module-card" aria-labelledby="detection-heading">
      <div className="module-header">
        <h2 id="detection-heading" className="module-title">
          Object Detection
        </h2>
        <span className="badge badge--placeholder">PLACEHOLDER</span>
      </div>

      <p className="module-desc">
        Future: TensorFlow.js COCO-SSD real-time obstacle detection.
        Currently returns dummy results.
      </p>

      <button
        id="btn-detect"
        className="btn btn--secondary"
        onClick={handleDetect}
        disabled={loading}
        aria-busy={loading}
      >
        {loading ? 'Detecting…' : 'Run Dummy Detection'}
      </button>

      {result && (
        <div className="result-box" role="status" aria-live="polite">
          <p className="result-label">Last Result</p>
          <p className="result-text">
            <strong>{result.label}</strong> — {result.direction},{' '}
            {result.distance} away
          </p>
          <p className="result-confidence">
            Confidence: {Math.round(result.confidence * 100)}%
          </p>
        </div>
      )}
    </section>
  );
}
