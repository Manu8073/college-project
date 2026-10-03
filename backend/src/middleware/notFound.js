/**
 * NETRA Backend — 404 Not Found Middleware
 * Returns a consistent JSON response for unknown routes.
 */

export function notFound(req, res) {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
}
