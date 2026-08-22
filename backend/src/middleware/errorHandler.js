/**
 * NETRA Backend — Global Error Handler Middleware
 *
 * Must have exactly 4 parameters to be treated as an error handler by Express.
 * Stack traces are hidden in production to avoid leaking internal details.
 */

import { config } from '../config/index.js';

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  const statusCode = err.statusCode ?? err.status ?? 500;

  console.error(`[Error] ${err.message}`, config.isProduction ? '' : err.stack);

  res.status(statusCode).json({
    success: false,
    message: err.message ?? 'An unexpected error occurred.',
    // Expose stack trace only in development
    ...(config.isProduction ? {} : { stack: err.stack }),
  });
}
