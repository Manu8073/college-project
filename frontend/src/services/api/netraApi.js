/**
 * NETRA — Backend API Service
 * ─────────────────────────────────────────────────────────────
 * High-level functions for calling the NETRA REST API.
 * All modules should import from here rather than calling
 * apiClient directly, so the URL structure stays centralised.
 */

import { apiClient } from './apiClient.js';

/**
 * GET /api/health
 * @returns {Promise<{ success: boolean, message: string, timestamp: string }>}
 */
export async function checkHealth() {
  return apiClient.get('/api/health');
}

/**
 * GET /api/system/status
 * @returns {Promise<{ success: boolean, data: object }>}
 */
export async function getSystemStatus() {
  return apiClient.get('/api/system/status');
}

/**
 * POST /api/events
 * @param {import('../../shared/types/events.js').NetraEvent} event
 * @returns {Promise<{ success: boolean, data: object }>}
 */
export async function postEvent(event) {
  return apiClient.post('/api/events', event);
}

/**
 * GET /api/events
 * @returns {Promise<{ success: boolean, data: object[], count: number }>}
 */
export async function getEvents() {
  return apiClient.get('/api/events');
}

/**
 * POST /api/assistant/ask
 * @param {string} query 
 * @returns {Promise<{ success: boolean, answer: string }>}
 */
export async function askAssistant(query) {
  return apiClient.post('/api/assistant/ask', { query });
}
