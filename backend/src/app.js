/**
 * NETRA Backend — Express Application
 * ─────────────────────────────────────────────────────────────
 * Sets up middleware, routes, and error handling.
 * The actual HTTP server is started in server.js.
 */

import express    from 'express';
import cors       from 'cors';
import { config } from './config/index.js';

// Route modules
import healthRouter  from './routes/health.js';
import systemRouter  from './routes/system.js';
import eventsRouter  from './routes/events.js';

// Middleware
import { requestLogger } from './middleware/requestLogger.js';
import { notFound }      from './middleware/notFound.js';
import { errorHandler }  from './middleware/errorHandler.js';

const app = express();

// ── CORS ────────────────────────────────────────────────────
// Allow requests from the configured frontend origin.
app.use(cors({
  origin:      config.clientUrl,
  credentials: true,
  methods:     ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}));

// ── Body parsing ─────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Request logger (development only) ───────────────────────
if (!config.isProduction) {
  app.use(requestLogger);
}

// ── Routes ───────────────────────────────────────────────────
app.use('/api/health',  healthRouter);
app.use('/api/system',  systemRouter);
app.use('/api/events',  eventsRouter);

// ── 404 — unknown routes ─────────────────────────────────────
app.use(notFound);

// ── Global error handler ─────────────────────────────────────
// Must be last and must have 4 parameters (err, req, res, next).
app.use(errorHandler);

export default app;
