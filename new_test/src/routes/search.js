import { Router } from 'express';
import { notes } from './notes.js';

export const searchRouter = Router();
export default searchRouter;

/**
 * GET /search?q=term
 * Search notes by title or body (case-insensitive).
 * Returns an array of matching notes.
 */
searchRouter.get('/', (req, res) => {
  const q = req.query.q;

  if (q === undefined || q === '') {
    return res.status(400).json({ error: '"q" query parameter is required' });
  }

  const term = String(q).toLowerCase();
  const results = notes.filter(
    (note) =>
      note.title.toLowerCase().includes(term) ||
      note.body.toLowerCase().includes(term)
  );

  res.json(results);
});
