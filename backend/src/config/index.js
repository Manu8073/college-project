/**
 * NETRA Backend — Environment Configuration
 * ─────────────────────────────────────────────────────────────
 * Load .env into process.env early, before any other module
 * reads environment variables.
 *
 * Uses dotenv's findUpSync so the server can be started from
 * any working directory.
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

// Load backend/.env  (two dirs up: src/config/ → src/ → backend/)
dotenv.config({ path: resolve(__dirname, '../../.env') });

export const config = {
  port:      parseInt(process.env.PORT ?? '5001', 10),
  clientUrl: process.env.CLIENT_URL ?? 'http://localhost:5173',
  nodeEnv:   process.env.NODE_ENV   ?? 'development',
  geminiApiKey: process.env.GEMINI_API_KEY,

  /** True in production — controls stack trace exposure */
  get isProduction() {
    return this.nodeEnv === 'production';
  },
};
