import { Router } from 'express';
import { bookmarkStore } from '../models/bookmark.js';

export const bookmarksRouter = Router();
export default bookmarksRouter;

/**
 * GET /bookmarks
 * List all bookmarks.
 */
bookmarksRouter.get('/', (_req, res) => {
  res.json(bookmarkStore.findAll());
});

/**
 * GET /bookmarks/:id
 * Retrieve a single bookmark by ID.
 */
bookmarksRouter.get('/:id', (req, res) => {
  const bookmark = bookmarkStore.findById(req.params.id);
  if (!bookmark) {
    return res.status(404).json({ error: 'Bookmark not found' });
  }
  res.json(bookmark);
});

/**
 * POST /bookmarks
 * Create a new bookmark.
 * Body: { url, title, description?, tags? }
 */
bookmarksRouter.post('/', (req, res) => {
  const { url, title, description, tags } = req.body;

  if (!url || typeof url !== 'string' || url.trim() === '') {
    return res.status(400).json({ error: '"url" is required and must be a non-empty string' });
  }
  if (!title || typeof title !== 'string' || title.trim() === '') {
    return res.status(400).json({ error: '"title" is required and must be a non-empty string' });
  }
  if (tags !== undefined && !Array.isArray(tags)) {
    return res.status(400).json({ error: '"tags" must be an array when provided' });
  }

  const bookmark = bookmarkStore.create({ url: url.trim(), title: title.trim(), description, tags });
  res.status(201).json(bookmark);
});

/**
 * PUT /bookmarks/:id
 * Replace or update a bookmark by ID.
 * Body: { url?, title?, description?, tags? }
 */
bookmarksRouter.put('/:id', (req, res) => {
  const { url, title, description, tags } = req.body;

  if (url !== undefined && (typeof url !== 'string' || url.trim() === '')) {
    return res.status(400).json({ error: '"url" must be a non-empty string when provided' });
  }
  if (title !== undefined && (typeof title !== 'string' || title.trim() === '')) {
    return res.status(400).json({ error: '"title" must be a non-empty string when provided' });
  }
  if (tags !== undefined && !Array.isArray(tags)) {
    return res.status(400).json({ error: '"tags" must be an array when provided' });
  }

  const updated = bookmarkStore.update(req.params.id, {
    url: url !== undefined ? url.trim() : undefined,
    title: title !== undefined ? title.trim() : undefined,
    description,
    tags,
  });

  if (!updated) {
    return res.status(404).json({ error: 'Bookmark not found' });
  }
  res.json(updated);
});

/**
 * DELETE /bookmarks/:id
 * Delete a bookmark by ID.
 */
bookmarksRouter.delete('/:id', (req, res) => {
  const deleted = bookmarkStore.delete(req.params.id);
  if (!deleted) {
    return res.status(404).json({ error: 'Bookmark not found' });
  }
  res.status(204).end();
});
