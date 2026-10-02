/**
 * NETRA — Shared Data Contract
 * ─────────────────────────────────────────────────────────────
 * All inter-module communication uses a single standard event shape.
 * Every module (detection, navigation, ocr, currency, shell) must emit
 * and consume events that conform to this structure.
 *
 * EVENT SHAPE:
 * {
 *   id:        string   — UUID, unique per event
 *   source:    string   — which module emitted the event
 *   type:      string   — semantic category of the event
 *   priority:  string   — how urgently to handle / speak it
 *   timestamp: string   — ISO 8601 date-time string
 *   payload:   object   — event-specific data (varies per type)
 * }
 */

import { v4 as uuidv4 } from 'uuid';

// ─── Source constants ──────────────────────────────────────────
/** @type {'detection'|'navigation'|'ocr'|'currency'|'shell'} */
export const SOURCE = {
  DETECTION: 'detection',
  NAVIGATION: 'navigation',
  OCR: 'ocr',
  CURRENCY: 'currency',
  SHELL: 'shell',
};

// ─── Type constants ────────────────────────────────────────────
/** @type {'obstacle'|'navigation'|'text'|'currency'|'system'} */
export const EVENT_TYPE = {
  OBSTACLE: 'obstacle',
  NAVIGATION: 'navigation',
  TEXT: 'text',
  CURRENCY: 'currency',
  SYSTEM: 'system',
};

// ─── Priority constants ────────────────────────────────────────
/** @type {'low'|'medium'|'high'|'critical'} */
export const PRIORITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
};

// ─── Factory ───────────────────────────────────────────────────
/**
 * Creates a well-formed NETRA event.
 *
 * @param {object} params
 * @param {string} params.source   — one of SOURCE
 * @param {string} params.type     — one of EVENT_TYPE
 * @param {string} params.priority — one of PRIORITY
 * @param {object} params.payload  — event-specific data
 * @returns {NetraEvent}
 */
export function createEvent({ source, type, priority, payload }) {
  return {
    id: uuidv4(),
    source,
    type,
    priority,
    timestamp: new Date().toISOString(),
    payload,
  };
}

// ─── JSDoc typedef ─────────────────────────────────────────────
/**
 * @typedef {object} NetraEvent
 * @property {string} id
 * @property {'detection'|'navigation'|'ocr'|'currency'|'shell'} source
 * @property {'obstacle'|'navigation'|'text'|'currency'|'system'} type
 * @property {'low'|'medium'|'high'|'critical'} priority
 * @property {string} timestamp
 * @property {object} payload
 */

// ─── Example events (for development / testing) ────────────────

/** @returns {NetraEvent} */
export function exampleObstacleEvent() {
  return createEvent({
    source: SOURCE.DETECTION,
    type: EVENT_TYPE.OBSTACLE,
    priority: PRIORITY.HIGH,
    payload: {
      label: 'person',
      confidence: 0.92,
      direction: 'left',
      distance: '2m',
    },
  });
}

/** @returns {NetraEvent} */
export function exampleNavigationEvent() {
  return createEvent({
    source: SOURCE.NAVIGATION,
    type: EVENT_TYPE.NAVIGATION,
    priority: PRIORITY.MEDIUM,
    payload: {
      instruction: 'Turn right in 50 meters',
      distance: '50m',
      heading: 'NE',
    },
  });
}

/** @returns {NetraEvent} */
export function exampleOcrEvent() {
  return createEvent({
    source: SOURCE.OCR,
    type: EVENT_TYPE.TEXT,
    priority: PRIORITY.LOW,
    payload: {
      text: 'Sample detected text',
      confidence: 0.88,
      language: 'en',
    },
  });
}

/** @returns {NetraEvent} */
export function exampleCurrencyEvent() {
  return createEvent({
    source: SOURCE.CURRENCY,
    type: EVENT_TYPE.CURRENCY,
    priority: PRIORITY.LOW,
    payload: {
      currency: 'INR',
      denomination: '500',
      confidence: 0.93,
    },
  });
}

/** @returns {NetraEvent} */
export function exampleSystemEvent(message = 'NETRA system initialized') {
  return createEvent({
    source: SOURCE.SHELL,
    type: EVENT_TYPE.SYSTEM,
    priority: PRIORITY.LOW,
    payload: { message },
  });
}