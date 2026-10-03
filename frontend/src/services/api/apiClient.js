/**
 * NETRA — API Client
 * ─────────────────────────────────────────────────────────────
 * A thin, reusable wrapper around `fetch` for talking to the
 * NETRA Express backend.
 *
 * Base URL is read from the Vite environment variable:
 *   VITE_API_BASE_URL=http://localhost:5000
 *
 * If the variable is not set the client falls back to an empty
 * string, which lets the Vite dev-proxy handle /api/* routes
 * transparently (configured in vite.config.js).
 *
 * Usage:
 *   import { apiClient } from '../services/api/apiClient.js';
 *   const data = await apiClient.get('/api/health');
 *   await apiClient.post('/api/events', eventObject);
 */

const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

/**
 * Core fetch wrapper.
 * @param {string} path       — e.g. '/api/health'
 * @param {RequestInit} init  — standard fetch options
 * @returns {Promise<any>}    — parsed JSON response
 * @throws {Error}            — on network failure or non-2xx response
 */
async function request(path, init = {}) {
  const url = `${BASE_URL}${path}`;

  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
    ...init,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const message = errorBody?.message ?? `HTTP ${response.status} from ${path}`;
    throw new Error(message);
  }

  return response.json();
}

export const apiClient = {
  /** GET /path */
  get: (path) => request(path),

  /** POST /path with a JSON body */
  post: (path, body) =>
    request(path, {
      method: 'POST',
      body:   JSON.stringify(body),
    }),
};
