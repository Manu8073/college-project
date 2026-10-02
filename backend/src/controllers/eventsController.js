/**
 * NETRA Backend — Events Controller
 * ─────────────────────────────────────────────────────────────
 * Handles POST /api/events and GET /api/events.
 *
 * Storage is intentionally in-memory only.
 * Events are lost when the server restarts.
 */

import { saveEvent, getAllEvents } from '../services/eventStore.js';
import { sendSuccess, sendError }  from '../utils/response.js';

/**
 * POST /api/events
 * Validates and saves one NETRA event.
 */
export function createEvent(req, res) {
  const result = saveEvent(req.body);

  if (!result.ok) {
    return sendError(res, result.error, 400);
  }

  return sendSuccess(res, result.event, 'Event saved successfully', 201);
}

/**
 * GET /api/events
 * Returns all in-memory events.
 */
export function listEvents(_req, res) {
  const events = getAllEvents();
  return sendSuccess(res, events, `${events.length} events retrieved`);
}
