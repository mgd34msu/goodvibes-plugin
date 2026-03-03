import { Router } from 'express';
import store from '../models/bookmark.js';

const router = Router();

/**
 * GET /tags
 * Returns all unique tags across all bookmarks, sorted alphabetically.
 */
router.get('/', (_req, res) => {
  const bookmarks = store.getAll();
  const tagSet = new Set();

  for (const bookmark of bookmarks) {
    if (Array.isArray(bookmark.tags)) {
      for (const tag of bookmark.tags) {
        tagSet.add(tag);
      }
    }
  }

  const tags = Array.from(tagSet).sort();
  res.json({ tags });
});

/**
 * GET /tags/:tag/bookmarks
 * Returns all bookmarks that include the specified tag.
 */
router.get('/:tag/bookmarks', (req, res) => {
  const { tag } = req.params;
  const bookmarks = store.getAll();

  const matched = bookmarks.filter(
    (b) => Array.isArray(b.tags) && b.tags.includes(tag),
  );

  if (matched.length === 0) {
    return res.status(404).json({ error: `No bookmarks found for tag "${tag}"` });
  }

  res.json({ tag, bookmarks: matched });
});

export default router;
