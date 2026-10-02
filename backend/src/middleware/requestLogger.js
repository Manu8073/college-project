/**
 * NETRA Backend — Request Logger Middleware
 * Simple development-only request logger.
 */

export function requestLogger(req, _res, next) {
  const now = new Date().toISOString();
  console.log(`[${now}] ${req.method} ${req.url}`);
  next();
}
