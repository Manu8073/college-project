/**
 * NETRA — Audio Panel Component
 * ─────────────────────────────────────────────────────────────
 * Part of the Shell module.
 * Exposes the speech service controls to the user and lets the
 * shell test the audio queue.
 *
 * The Shell's parent (App.jsx) owns the useSpeech() instance and
 * passes speak/stop as props so all modules share one queue.
 */

/**
 * @param {object}   props
 * @param {Function} props.speak      — speak(text)
 * @param {Function} props.stop       — stop()
 * @param {boolean}  props.isSpeaking — true when speech is active
 * @param {boolean}  props.isSupported
 */
export default function AudioPanel({ speak, stop, isSpeaking, isSupported }) {
  const TEST_MESSAGES = [
    'NETRA system initialized and ready.',
    'Object detected. Person on the left, approximately 2 meters away.',
    'Navigation update. Turn right in 50 meters.',
    'Text recognized. STOP sign ahead.',
  ];

  return (
    <section className="module-card" aria-labelledby="audio-heading">
      <div className="module-header">
        <h2 id="audio-heading" className="module-title">Audio Feedback</h2>
        <span className={`badge ${isSupported ? 'badge--ready' : 'badge--error'}`}>
          {isSupported ? (isSpeaking ? 'SPEAKING' : 'READY') : 'UNSUPPORTED'}
        </span>
      </div>

      <p className="module-desc">
        Web Speech API with a queued audio manager.
        Future modules will route all alerts through this service.
      </p>

      <div className="btn-group" role="group" aria-label="Audio test controls">
        {TEST_MESSAGES.map((msg, i) => (
          <button
            key={i}
            id={`btn-speak-${i}`}
            className="btn btn--secondary"
            onClick={() => speak(msg)}
            disabled={!isSupported}
          >
            Test Message {i + 1}
          </button>
        ))}

        <button
          id="btn-stop-speech"
          className="btn btn--danger"
          onClick={stop}
          disabled={!isSupported || !isSpeaking}
        >
          Stop Audio
        </button>
      </div>

      {!isSupported && (
        <p className="notice" role="status">
          Speech synthesis is not supported in this browser.
        </p>
      )}

      {isSpeaking && (
        <p className="speaking-indicator" role="status" aria-live="polite">
          🔊 Speaking…
        </p>
      )}
    </section>
  );
}
