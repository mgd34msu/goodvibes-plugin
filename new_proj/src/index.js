import express from 'express';
import { errorHandler } from './middleware/error-handler.js';

// Route imports — these files will be created by the routes agent.
// Using dynamic import guards so the server starts even if routes are absent.
let bookmarksRouter;
let tagsRouter;

try {
  ({ default: bookmarksRouter } = await import('./routes/bookmarks.js'));
} catch {
  bookmarksRouter = express.Router();
  bookmarksRouter.all('*', (_req, res) => res.status(501).json({ error: 'Bookmarks routes not yet implemented' }));
}

try {
  ({ default: tagsRouter } = await import('./routes/tags.js'));
} catch {
  tagsRouter = express.Router();
  tagsRouter.all('*', (_req, res) => res.status(501).json({ error: 'Tags routes not yet implemented' }));
}

const app = express();

// ── Body parsing ────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// ── API routes ───────────────────────────────────────────────────────────────
app.use('/bookmarks', bookmarksRouter);
app.use('/tags', tagsRouter);

// ── 404 handler ──────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// ── Centralized error handler (must be last) ──────────────────────────────────
app.use(errorHandler);

// ── Start server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => {
  console.log(`Bookmark API listening on port ${PORT}`);
});

export default app;
