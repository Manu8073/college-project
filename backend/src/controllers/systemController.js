/**
 * NETRA Backend — System Status Controller
 * ─────────────────────────────────────────────────────────────
 * Returns the static scaffold status of each module.
 *
 * Future: member modules can update these values dynamically
 * (e.g. 'detection' becomes 'active' when the model is loaded).
 */

import { sendSuccess } from '../utils/response.js';

// Static status map — update when modules become functional
const MODULE_STATUS = {
  backend:    'ready',
  detection:  'ready',
  navigation: 'placeholder',
  ocr:        'ready',
  currency:   'ready',
  shell:      'ready',
};

export function getSystemStatus(_req, res) {
  return sendSuccess(res, {
    ...MODULE_STATUS,
    timestamp: new Date().toISOString(),
  }, 'System status retrieved');
}
