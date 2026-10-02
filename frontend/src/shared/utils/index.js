/**
 * NETRA — Shared Utilities
 */

/**
 * Returns a short, human-readable time string from an ISO timestamp.
 * e.g. "14:32:05"
 * @param {string} isoString
 * @returns {string}
 */
export function formatTimestamp(isoString) {
  try {
    return new Date(isoString).toLocaleTimeString('en-US', {
      hour:   '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  } catch {
    return isoString;
  }
}

/**
 * Truncates a string to maxLength characters, appending "…" if needed.
 * @param {string} str
 * @param {number} maxLength
 * @returns {string}
 */
export function truncate(str, maxLength = 80) {
  if (!str) return '';
  return str.length <= maxLength ? str : str.slice(0, maxLength - 1) + '…';
}

/**
 * Checks if the browser supports a named media device API.
 * @returns {boolean}
 */
export function isCameraSupported() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

/**
 * Checks if the Web Speech API is available.
 * @returns {boolean}
 */
export function isSpeechSupported() {
  return 'speechSynthesis' in window;
}

/**
 * Checks if the Geolocation API is available.
 * @returns {boolean}
 */
export function isGeolocationSupported() {
  return 'geolocation' in navigator;
}
