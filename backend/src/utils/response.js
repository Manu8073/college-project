/**
 * NETRA Backend — Response Utilities
 * ─────────────────────────────────────────────────────────────
 * Helpers for building consistent API responses.
 * All routes should use these instead of calling res.json() directly.
 */

/**
 * Sends a 200 success response.
 * @param {import('express').Response} res
 * @param {any}    data
 * @param {string} [message]
 * @param {number} [statusCode=200]
 */
export function sendSuccess(res, data, message = 'Success', statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
}

/**
 * Sends a JSON error response.
 * @param {import('express').Response} res
 * @param {string} message
 * @param {number} [statusCode=400]
 */
export function sendError(res, message, statusCode = 400) {
  return res.status(statusCode).json({
    success: false,
    message,
  });
}

/**
 * Throws a structured error that the global error handler can catch.
 * @param {string} message
 * @param {number} [statusCode=400]
 */
export function createHttpError(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}
