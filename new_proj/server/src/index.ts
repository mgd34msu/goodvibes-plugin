import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { bookmarkRouter, globalErrorHandler } from './routes/bookmarks.js';

export function createApp() {
  const app = express();

  // Security middleware
  app.use(helmet());

  // CORS — configurable via CORS_ORIGIN env var
  const corsOrigin = process.env['CORS_ORIGIN'] ?? 'http://localhost:5173';
  app.use(cors({ origin: corsOrigin }));

  // Body parsing with explicit size limit
  app.use(express.json({ limit: '100kb' }));

  // Rate limiting: 100 requests per 15 minutes
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use(limiter);

  // Routes
  app.use('/api/bookmarks', bookmarkRouter);

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // 404 handler
  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found', statusCode: 404 });
  });

  // Global error handler (must be last)
  app.use(globalErrorHandler);

  return app;
}

// Only start the server when this file is run directly (not during tests)
const isMain = process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  const PORT = process.env['PORT'] ?? 3000;
  const app = createApp();
  app.listen(PORT, () => {
    console.log(`Bookmark Manager API running on http://localhost:${PORT}`);
  });
}
