import { Router } from 'express';
import { getAll } from '../store.js';

const router = Router();

// GET /search?q=term        - search text and author fields (case-insensitive)
// GET /search?category=cat  - filter by category
// GET /search?author=name   - filter by author
router.get('/', (req, res) => {
  const { q, category, author } = req.query;

  if (!q && !category && !author) {
    return res.status(400).json({ error: 'At least one search parameter (q, category, author) is required' });
  }

  let results = getAll();

  if (q) {
    const term = q.toLowerCase();
    results = results.filter(
      (quote) =>
        quote.text.toLowerCase().includes(term) ||
        quote.author.toLowerCase().includes(term)
    );
  }

  if (category) {
    const cat = category.toLowerCase();
    results = results.filter((quote) => quote.category.toLowerCase() === cat);
  }

  if (author) {
    const name = author.toLowerCase();
    results = results.filter((quote) => quote.author.toLowerCase().includes(name));
  }

  res.json(results);
});

export default router;
