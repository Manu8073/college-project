/**
 * NETRA Backend — In-Memory Event Store
 * ─────────────────────────────────────────────────────────────
 * Stores events in a plain JavaScript array for the prototype phase.
 *
 * ⚠️  Events are NOT persisted — they disappear when the server restarts.
 *
 * TODO (future): Replace with a database (MongoDB / PostgreSQL / SQLite)
 *               when persistent storage is required.
 */

import { randomUUID } from 'crypto';

/** @type {NetraEvent[]} */
let events = [];

const MAX_EVENTS = 200; // Keep memory bounded

/**
 * @typedef {object} NetraEvent
 * @property {string} id
 * @property {'detection'|'navigation'|'ocr'|'shell'} source
 * @property {'obstacle'|'navigation'|'text'|'system'} type
 * @property {'low'|'medium'|'high'|'critical'} priority
 * @property {string} timestamp
 * @property {object} payload
 */

const VALID_SOURCES   = ['detection', 'navigation', 'ocr', 'shell'];
const VALID_TYPES     = ['obstacle', 'navigation', 'text', 'system'];
const VALID_PRIORITIES = ['low', 'medium', 'high', 'critical'];

/**
 * Validates and saves an event.
 * Assigns a server-side ID if the client didn't provide one.
 * @param {object} rawEvent
 * @returns {{ ok: boolean, event?: NetraEvent, error?: string }}
 */
export function saveEvent(rawEvent) {
  const { source, type, priority, payload } = rawEvent ?? {};

  if (!VALID_SOURCES.includes(source)) {
    return { ok: false, error: `Invalid 'source'. Must be one of: ${VALID_SOURCES.join(', ')}` };
  }
  if (!VALID_TYPES.includes(type)) {
    return { ok: false, error: `Invalid 'type'. Must be one of: ${VALID_TYPES.join(', ')}` };
  }
  if (!VALID_PRIORITIES.includes(priority)) {
    return { ok: false, error: `Invalid 'priority'. Must be one of: ${VALID_PRIORITIES.join(', ')}` };
  }
  if (typeof payload !== 'object' || payload === null) {
    return { ok: false, error: `'payload' must be a non-null object` };
  }

  /** @type {NetraEvent} */
  const event = {
    id:        rawEvent.id ?? randomUUID(),
    source,
    type,
    priority,
    timestamp: rawEvent.timestamp ?? new Date().toISOString(),
    payload,
  };

  events.push(event);

  // Keep the store bounded
  if (events.length > MAX_EVENTS) {
    events = events.slice(events.length - MAX_EVENTS);
  }

  return { ok: true, event };
}

/**
 * Returns all stored events (newest last).
 * @returns {NetraEvent[]}
 */
export function getAllEvents() {
  return [...events];
}

/**
 * Clears all events (useful for testing).
 */
export function clearEvents() {
  events = [];
}
