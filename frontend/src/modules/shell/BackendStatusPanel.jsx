/**
 * NETRA — Backend Status Panel
 * ─────────────────────────────────────────────────────────────
 * Part of the Shell module (Member 4).
 *
 * Allows the user to:
 *   1. Check whether the Express backend is reachable.
 *   2. Send a single test event to POST /api/events.
 *
 * This panel is the minimal proof that the full stack works end-to-end.
 */

import { useState } from 'react';
import { checkHealth, postEvent } from '../../services/api/netraApi.js';
import { exampleObstacleEvent } from '../../shared/types/events.js';

/** @typedef {'idle'|'checking'|'connected'|'unavailable'} BackendStatus */

/**
 * @param {object}   props
 * @param {Function} props.onEvent — Shell callback for NetraEvent
 */
export default function BackendStatusPanel({ onEvent }) {
  const [status,  setStatus]  = useState(/** @type {BackendStatus} */ ('idle'));
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);

  async function handleCheckHealth() {
    setStatus('checking');
    setMessage('');
    try {
      const data = await checkHealth();
      setStatus('connected');
      setMessage(data.message ?? 'Backend connected');
    } catch {
      setStatus('unavailable');
      setMessage('Backend unavailable. Is the backend server running on port 5001?');
    }
  }

  async function handleSendTestEvent() {
    setSending(true);
    setSendResult(null);
    try {
      // Generate a dummy detection event using the shared contract factory
      const event = exampleObstacleEvent();
      const response = await postEvent(event);
      setSendResult({ ok: true, text: `Event saved. ID: ${response.data?.id ?? event.id}` });
      // Also bubble it up to the local activity log
      onEvent?.(event);
    } catch (err) {
      setSendResult({ ok: false, text: `Failed: ${err.message}` });
    } finally {
      setSending(false);
    }
  }

  const statusClass =
    status === 'connected'   ? 'badge--active' :
    status === 'unavailable' ? 'badge--error'  :
    status === 'checking'    ? 'badge--placeholder' :
    'badge--placeholder';

  const statusLabel =
    status === 'connected'   ? 'CONNECTED'   :
    status === 'unavailable' ? 'UNAVAILABLE' :
    status === 'checking'    ? 'CHECKING…'   :
    'NOT CHECKED';

  return (
    <section className="module-card backend-card" aria-labelledby="backend-heading">
      <div className="module-header">
        <h2 id="backend-heading" className="module-title">Backend Connection</h2>
        <span className={`badge ${statusClass}`}>{statusLabel}</span>
      </div>

      <p className="module-desc">
        Verify that the NETRA Express API ({import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001'}) is
        reachable. Use "Send Test Event" to confirm end-to-end communication.
      </p>

      <div className="btn-group">
        <button
          id="btn-check-backend"
          className="btn btn--primary"
          onClick={handleCheckHealth}
          disabled={status === 'checking'}
          aria-busy={status === 'checking'}
        >
          {status === 'checking' ? 'Checking…' : 'Check Backend Connection'}
        </button>

        <button
          id="btn-send-test-event"
          className="btn btn--secondary"
          onClick={handleSendTestEvent}
          disabled={sending}
          aria-busy={sending}
        >
          {sending ? 'Sending…' : 'Send Test Event'}
        </button>
      </div>

      {message && (
        <p
          className={status === 'unavailable' ? 'error-text' : 'result-text'}
          role="status"
          aria-live="polite"
        >
          {status === 'connected' ? '✓ ' : status === 'unavailable' ? '✗ ' : ''}{message}
        </p>
      )}

      {sendResult && (
        <p
          className={sendResult.ok ? 'result-text' : 'error-text'}
          role="status"
          aria-live="polite"
        >
          {sendResult.ok ? '✓ ' : '✗ '}{sendResult.text}
        </p>
      )}
    </section>
  );
}
