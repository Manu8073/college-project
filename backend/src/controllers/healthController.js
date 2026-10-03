/**
 * NETRA Backend — Health Controller
 */

import { sendSuccess } from '../utils/response.js';

export function getHealth(_req, res) {
  return sendSuccess(res, null, 'NETRA API is running');
}
