/**
 * NETRA — Root Application
 * ─────────────────────────────────────────────────────────────
 * OWNER: Member 4 (Shell / Integration)
 *
 * Integration layer responsibilities:
 *   - Owns the global speech service (one shared audio queue)
 *   - Maintains the global event log (local + synced from backend)
 *   - Renders the full dashboard layout
 *   - Passes onEvent callbacks to each module panel
 *
 * Full-stack additions:
 *   - BackendStatusPanel — health check + test event posting
 *
 * Future integration work (Member 4):
 *   - Wire detection loop with camera feed
 *   - Route high-priority events to speak() automatically
 *   - Add priority-based audio queue ordering
 *   - Optionally poll GET /api/events to sync with backend log
 */

import { useState, useCallback, useEffect } from 'react';
import { useSpeech }          from './services/speech/useSpeech.js';
import { exampleSystemEvent } from './shared/types/events.js';
import { APP_NAME, APP_TAGLINE, MAX_LOG_EVENTS } from './shared/constants/index.js';

// Shell components
import SystemStatus       from './modules/shell/SystemStatus.jsx';
import CameraPanel        from './modules/shell/CameraPanel.jsx';
import AudioPanel         from './modules/shell/AudioPanel.jsx';
import EventLog           from './modules/shell/EventLog.jsx';
import BackendStatusPanel from './modules/shell/BackendStatusPanel.jsx';

// Module panels
import DetectionPanel  from './modules/detection/DetectionPanel.jsx';
import NavigationPanel from './modules/navigation/NavigationPanel.jsx';
import OcrPanel        from './modules/ocr/OcrPanel.jsx';

export default function App() {
  // ── Global speech service — shared by all modules ─────────
  const { speak, stop, isSpeaking, isSupported } = useSpeech();

  // ── Global event log ──────────────────────────────────────
  const [events, setEvents] = useState([]);

  /**
   * Central event handler.
   * All module panels call this when they emit an event.
   * Future: route high-priority events to speak() here.
   */
  const handleEvent = useCallback((event) => {
    setEvents(prev => {
      const updated = [...prev, event];
      return updated.length > MAX_LOG_EVENTS
        ? updated.slice(updated.length - MAX_LOG_EVENTS)
        : updated;
    });
  }, []);

  const clearLog = useCallback(() => setEvents([]), []);

  // Announce initialization on first mount
  useEffect(() => {
    const initEvent = exampleSystemEvent(
      'NETRA full-stack scaffold initialized. Web prototype ready.'
    );
    handleEvent(initEvent);
    speak('NETRA system initialized.');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="app-root">
      {/* ── Skip navigation (accessibility) ── */}
      <a href="#main-content" className="skip-link">Skip to main content</a>

      {/* ── Header ─────────────────────────────────────────── */}
      <header className="app-header" role="banner">
        <div className="header-inner">
          <div className="logo-group">
            <span className="logo-icon" role="img" aria-label="Eye logo">👁</span>
            <div>
              <h1 className="app-name">{APP_NAME}</h1>
              <p className="app-tagline">{APP_TAGLINE}</p>
            </div>
          </div>
          <span className="scaffold-badge">FULL-STACK SCAFFOLD v0.2</span>
        </div>
      </header>

      {/* ── Main content ───────────────────────────────────── */}
      <main id="main-content" className="app-main">

        {/* System status overview */}
        <SystemStatus />

        {/* Module grid */}
        <div className="modules-grid">

          {/* Backend connection — Shell (Member 4) */}
          <BackendStatusPanel onEvent={handleEvent} />

          {/* Camera — Shell (Member 4) */}
          <CameraPanel />

          {/* Detection — Member 1 */}
          <DetectionPanel onEvent={handleEvent} />

          {/* Navigation — Member 2 */}
          <NavigationPanel onEvent={handleEvent} />

          {/* OCR — Member 3 */}
          <OcrPanel onEvent={handleEvent} />

          {/* Audio — Shell (Member 4) */}
          <AudioPanel
            speak={speak}
            stop={stop}
            isSpeaking={isSpeaking}
            isSupported={isSupported}
          />

        </div>

        {/* Event log — shows shared data contract in action */}
        <EventLog events={events} onClear={clearLog} />

      </main>

      {/* ── Footer ─────────────────────────────────────────── */}
      <footer className="app-footer" role="contentinfo">
        <p>NETRA — Assistive Vision System · Full-Stack Web Prototype · 2025</p>
        <p className="footer-note">
          Initial scaffold — AI/navigation/OCR features not yet implemented.
          Frontend: localhost:5173 · Backend: localhost:5001
        </p>
      </footer>
    </div>
  );
}
