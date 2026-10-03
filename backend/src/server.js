/**
 * NETRA Backend — HTTP Server Entry Point
 * ─────────────────────────────────────────────────────────────
 * Starts the Express server on the configured port.
 * Import order matters: config is loaded first via app.js.
 */

import app          from './app.js';
import { config }   from './config/index.js';

const server = app.listen(config.port, () => {
  console.log(`\n🟢  NETRA Backend running`);
  console.log(`    ➜  http://localhost:${config.port}`);
  console.log(`    ➜  Environment : ${config.nodeEnv}`);
  console.log(`    ➜  Client URL  : ${config.clientUrl}`);
  console.log(`    ➜  Health check: http://localhost:${config.port}/api/health\n`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n🔴  SIGTERM received. Shutting down gracefully…');
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  console.log('\n🔴  SIGINT received. Shutting down gracefully…');
  server.close(() => process.exit(0));
});
