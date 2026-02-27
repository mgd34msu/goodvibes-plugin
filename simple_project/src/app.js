import express from 'express';
import router from './routes.js';

const app = express();

// Parse JSON request bodies
app.use(express.json());

// Mount task routes under /api
app.use('/api', router);

// 404 handler for unmatched routes
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Generic error handler middleware
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

export default app;
