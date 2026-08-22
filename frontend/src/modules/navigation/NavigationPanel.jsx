/**
 * NETRA — Navigation Panel Component (PLACEHOLDER)
 * ─────────────────────────────────────────────────────────────
 * OWNER: Member 2
 */

import { useState } from 'react';
import {
  getNextInstruction, describeInstruction, isGoogleMapsConfigured
} from './navigationService.js';
import { useLocation }  from '../../services/location/useLocation.js';
import {
  createEvent, SOURCE, EVENT_TYPE, PRIORITY
} from '../../shared/types/events.js';

/**
 * @param {object}   props
 * @param {Function} props.onEvent — Shell callback to receive a NetraEvent
 */
export default function NavigationPanel({ onEvent }) {
  const { position, status: locationStatus, error: locationError, requestLocation } = useLocation();
  const [instruction, setInstruction] = useState(null);
  const [loading,     setLoading]     = useState(false);

  const mapsConfigured = isGoogleMapsConfigured();

  async function handleNavigate() {
    setLoading(true);
    try {
      const nav = await getNextInstruction();
      setInstruction(nav);

      const event = createEvent({
        source:   SOURCE.NAVIGATION,
        type:     EVENT_TYPE.NAVIGATION,
        priority: PRIORITY.MEDIUM,
        payload:  nav,
      });
      onEvent?.(event);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="module-card" aria-labelledby="nav-heading">
      <div className="module-header">
        <h2 id="nav-heading" className="module-title">Navigation</h2>
        <span className="badge badge--placeholder">PLACEHOLDER</span>
      </div>

      <p className="module-desc">
        Future: Google Maps turn-by-turn navigation with obstacle integration.
        {!mapsConfigured && (
          <span className="notice"> — Google Maps API key not configured.</span>
        )}
      </p>

      {/* Location sub-section */}
      <div className="sub-section">
        <button
          id="btn-location"
          className="btn btn--secondary"
          onClick={requestLocation}
          disabled={locationStatus === 'requesting'}
          aria-busy={locationStatus === 'requesting'}
        >
          {locationStatus === 'requesting' ? 'Getting location…' : 'Get Current Location'}
        </button>

        {locationStatus === 'available' && position && (
          <p className="result-text" role="status">
            Lat: {position.latitude.toFixed(5)}, Lng: {position.longitude.toFixed(5)}
            {position.accuracy && ` (±${Math.round(position.accuracy)}m)`}
          </p>
        )}

        {locationError && (
          <p className="error-text" role="alert">{locationError}</p>
        )}
      </div>

      {/* Navigation instruction sub-section */}
      <button
        id="btn-navigate"
        className="btn btn--secondary"
        onClick={handleNavigate}
        disabled={loading}
        aria-busy={loading}
      >
        {loading ? 'Fetching…' : 'Get Dummy Instruction'}
      </button>

      {instruction && (
        <div className="result-box" role="status" aria-live="polite">
          <p className="result-label">Current Instruction</p>
          <p className="result-text">{describeInstruction(instruction)}</p>
          <p className="result-confidence">Heading: {instruction.heading}</p>
        </div>
      )}
    </section>
  );
}
