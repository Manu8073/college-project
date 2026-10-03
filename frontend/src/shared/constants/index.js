/**
 * NETRA — Shared Constants
 * ─────────────────────────────────────────────────────────────
 * Central place for app-wide magic numbers and config values.
 * Import from here rather than scattering literals across modules.
 */

export const APP_NAME    = 'NETRA';
export const APP_VERSION = '0.1.0-scaffold';
export const APP_TAGLINE = 'Assistive Vision System — Web Prototype';

/** Maximum events to keep in the activity log */
export const MAX_LOG_EVENTS = 50;

/** Camera default constraints */
export const CAMERA_CONSTRAINTS = {
  video: {
    facingMode: 'environment', // rear camera on mobile; falls back to any on desktop
    width:  { ideal: 1280 },
    height: { ideal: 720 },
  },
  audio: false,
};

/**
 * Speech synthesis defaults.
 * lang: 'en-IN' — Indian English locale for natural pronunciation of
 * rupee amounts, Indian place names, and Indian-context text.
 * The browser falls back to 'en-US' if no en-IN voice is installed.
 */
export const SPEECH_DEFAULTS = {
  lang:   'en-IN',
  rate:   1.0,    // natural conversational pace (was 0.92 — too slow)
  pitch:  1.05,   // slightly warmer/higher pitch
  volume: 1.0,
};

/** Module status labels */
export const MODULE_STATUS = {
  READY:       'READY',
  PLACEHOLDER: 'PLACEHOLDER',
  ACTIVE:      'ACTIVE',
  ERROR:       'ERROR',
  INITIALIZING:'INITIALIZING',
};

/**
 * Indian-English voice messages used by TextReader and CurrencyReader.
 * Written in natural, warm Indian-English — spoken aloud to the user.
 */
export const INDIAN_VOICE_MESSAGES = {
  // ── Text detection ─────────────────────────────────────────
  TEXT_FOUND:       (text) => `Text found. ${text}`,
  TEXT_NOT_FOUND:   'No text found. Please hold the camera steady on the text, yaar.',
  TEXT_READING:     'Hold on, reading the text…',
  TEXT_ERROR:       'Arre, something went wrong while reading the text. Please try again.',
  TEXT_AUTO_ON:     'Auto-read is on. I will read new text for you automatically.',
  TEXT_AUTO_OFF:    'Auto-read is off.',
  TEXT_START:       'Starting text detection. Point the camera at the text.',
  TEXT_STOPPED:     'Text detection stopped.',

  // ── Currency detection ──────────────────────────────────────
  CURRENCY_FOUND:   (spoken) => `Detected ${spoken}.`,
  CURRENCY_NOT_FOUND: 'No note found. Please hold the note flat and steady in good light, yaar.',
  CURRENCY_READING: 'Hold on, checking the note…',
  CURRENCY_ERROR:   'Arre, could not read the currency. Please try again.',
  CURRENCY_AUTO_ON: 'Auto-read is on. I will announce each note automatically.',
  CURRENCY_AUTO_OFF:'Auto-read is off.',
  CURRENCY_START:   'Starting currency detection. Point the camera at the note.',
  CURRENCY_STOPPED: 'Currency detection stopped.',
};
