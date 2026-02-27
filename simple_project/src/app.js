import express from 'express';
import router from './routes.js';
import logger from './middleware/logger.js';

const app = express();

// Parse JSON request bodies
app.use(express.json({ limit: '100kb' }));

// Request logging
app.use(logger);

// Mount API routes
app.use('/api', router);

// 404 handler for unknown routes
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
    path: req.originalUrl,
    method: req.method,
  });
});

// Global error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[error]', err.message, err.stack);
  const status = err.status ?? err.statusCode ?? 500;
  res.status(status).json({
    success: false,
    error: status >= 500 ? 'Internal server error' : err.message,
  });
});

export default app;
