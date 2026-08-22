/**
 * NETRA — Location Service Hook
 * ─────────────────────────────────────────────────────────────
 * Wraps the browser Geolocation API.
 * Permission is only requested when the user explicitly triggers it.
 *
 * Usage:
 *   const { position, status, error, requestLocation, clearLocation } = useLocation();
 *
 * The navigation module will later use this hook to obtain coordinates
 * and pass them to the Google Maps routing API.
 */

import { useState, useCallback } from 'react';
import { isGeolocationSupported } from '../../shared/utils/index.js';

/** @typedef {'idle'|'requesting'|'available'|'error'|'unsupported'} LocationStatus */

/**
 * @typedef {object} Position
 * @property {number} latitude
 * @property {number} longitude
 * @property {number|null} accuracy   — meters
 * @property {number|null} altitude   — meters, if available
 * @property {string}      timestamp  — ISO string
 */

export function useLocation() {
  const [status,   setStatus]   = useState(
    /** @type {LocationStatus} */ (isGeolocationSupported() ? 'idle' : 'unsupported')
  );
  const [position, setPosition] = useState(/** @type {Position|null} */ (null));
  const [error,    setError]    = useState(/** @type {string|null} */ (null));

  /**
   * Requests the current device position.
   * Will trigger the browser permission prompt if not yet granted.
   */
  const requestLocation = useCallback(() => {
    if (!isGeolocationSupported()) {
      setStatus('unsupported');
      setError('Geolocation is not supported by this browser.');
      return;
    }

    setStatus('requesting');
    setError(null);

    navigator.geolocation.getCurrentPosition(
      (geoPos) => {
        const { latitude, longitude, accuracy, altitude } = geoPos.coords;
        setPosition({
          latitude,
          longitude,
          accuracy:  accuracy ?? null,
          altitude:  altitude ?? null,
          timestamp: new Date(geoPos.timestamp).toISOString(),
        });
        setStatus('available');
      },
      (err) => {
        setStatus('error');
        switch (err.code) {
          case err.PERMISSION_DENIED:
            setError('Location permission denied. Please allow access and try again.');
            break;
          case err.POSITION_UNAVAILABLE:
            setError('Location information is currently unavailable.');
            break;
          case err.TIMEOUT:
            setError('Location request timed out. Please try again.');
            break;
          default:
            setError(`Geolocation error: ${err.message}`);
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  }, []);

  /** Clears the last known position and resets to idle. */
  const clearLocation = useCallback(() => {
    setPosition(null);
    setStatus(isGeolocationSupported() ? 'idle' : 'unsupported');
    setError(null);
  }, []);

  return {
    position,        // Position | null
    status,          // LocationStatus
    error,           // string | null
    requestLocation,
    clearLocation,
  };
}
