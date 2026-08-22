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

/** Speech synthesis defaults */
export const SPEECH_DEFAULTS = {
  lang:   'en-US',
  rate:   0.95,
  pitch:  1.0,
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
