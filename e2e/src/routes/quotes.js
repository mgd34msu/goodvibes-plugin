'use strict';

const { Router } = require('express');

const router = Router();

let nextId = 4;
let quotes = [
  { id: 1, text: 'The only way to do great work is to love what you do.', author: 'Steve Jobs' },
  { id: 2, text: 'In the middle of every difficulty lies opportunity.', author: 'Albert Einstein' },
  { id: 3, text: 'It does not matter how slowly you go as long as you do not stop.', author: 'Confucius' },
];

/** Reset store — used by tests for isolation. */
function resetStore() {
  nextId = 4;
  quotes = [
    { id: 1, text: 'The only way to do great work is to love what you do.', author: 'Steve Jobs' },
    { id: 2, text: 'In the middle of every difficulty lies opportunity.', author: 'Albert Einstein' },
    { id: 3, text: 'It does not matter how slowly you go as long as you do not stop.', author: 'Confucius' },
  ];
}

// GET /api/quotes
router.get('/quotes', (req, res) => {
  res.json(quotes);
});

// GET /api/quotes/:id
router.get('/quotes/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Invalid id' });
  }
  const quote = quotes.find((q) => q.id === id);
  if (!quote) {
    return res.status(404).json({ error: 'Quote not found' });
  }
  res.json(quote);
});

// POST /api/quotes
router.post('/quotes', (req, res) => {
  const { text, author } = req.body || {};
  const errors = [];
  if (!text || typeof text !== 'string' || text.trim() === '') {
    errors.push('text is required');
  }
  if (!author || typeof author !== 'string' || author.trim() === '') {
    errors.push('author is required');
  }
  if (errors.length > 0) {
    return res.status(400).json({ error: errors.join(', ') });
  }
  const quote = { id: nextId++, text: text.trim(), author: author.trim() };
  quotes.push(quote);
  res.status(201).json(quote);
});

// DELETE /api/quotes/:id
router.delete('/quotes/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Invalid id' });
  }
  const index = quotes.findIndex((q) => q.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Quote not found' });
  }
  const deleted = quotes.splice(index, 1)[0];
  res.json(deleted);
});

module.exports = { router, resetStore };
