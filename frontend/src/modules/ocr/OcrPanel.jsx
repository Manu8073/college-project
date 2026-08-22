/**
 * NETRA — OCR Panel Component (PLACEHOLDER)
 * ─────────────────────────────────────────────────────────────
 * OWNER: Member 3
 */

import { useState } from 'react';
import { recognizeText, describeOcrResult } from './ocrService.js';
import {
  createEvent, SOURCE, EVENT_TYPE, PRIORITY
} from '../../shared/types/events.js';

/**
 * @param {object}   props
 * @param {Function} props.onEvent — Shell callback to receive a NetraEvent
 */
export default function OcrPanel({ onEvent }) {
  const [result,  setResult]  = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleRecognize() {
    setLoading(true);
    try {
      const ocr = await recognizeText();
      setResult(ocr);

      const event = createEvent({
        source:   SOURCE.OCR,
        type:     EVENT_TYPE.TEXT,
        priority: PRIORITY.LOW,
        payload:  ocr,
      });
      onEvent?.(event);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="module-card" aria-labelledby="ocr-heading">
      <div className="module-header">
        <h2 id="ocr-heading" className="module-title">
          Text &amp; OCR
        </h2>
        <span className="badge badge--placeholder">PLACEHOLDER</span>
      </div>

      <p className="module-desc">
        Future: Tesseract.js on-device text recognition and currency detection.
        Currently returns dummy results.
      </p>

      <button
        id="btn-ocr"
        className="btn btn--secondary"
        onClick={handleRecognize}
        disabled={loading}
        aria-busy={loading}
      >
        {loading ? 'Reading…' : 'Run Dummy OCR'}
      </button>

      {result && (
        <div className="result-box" role="status" aria-live="polite">
          <p className="result-label">Recognized Text</p>
          <p className="result-text">"{result.text}"</p>
          <p className="result-confidence">
            Confidence: {Math.round(result.confidence * 100)}%
            {' '}— Language: {result.language}
          </p>
        </div>
      )}
    </section>
  );
}
