import { Router } from 'express';
import { getAll } from '../store.js';

const router = Router();

// GET /stats - return aggregate statistics for all quotes
router.get('/', (req, res) => {
  const quotes = getAll();

  const byCategory = {};
  const byAuthor = {};
  let mostRecent = null;

  for (const quote of quotes) {
    // Count by category
    byCategory[quote.category] = (byCategory[quote.category] || 0) + 1;

    // Count by author
    byAuthor[quote.author] = (byAuthor[quote.author] || 0) + 1;

    // Track most recent by createdAt
    if (!mostRecent || new Date(quote.createdAt) > new Date(mostRecent.createdAt)) {
      mostRecent = quote;
    }
  }

  res.json({
    total: quotes.length,
    byCategory,
    byAuthor,
    mostRecent,
  });
});

export default router;
