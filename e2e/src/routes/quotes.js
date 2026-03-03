import { Router } from 'express';
import { getAll, getById, create, update, remove } from '../store.js';

const router = Router();

// GET /quotes — list all
router.get('/', (req, res) => {
  res.json(getAll());
});

// GET /quotes/:id — get one
router.get('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const quote = getById(id);
  if (!quote) {
    return res.status(404).json({ error: 'Quote not found' });
  }
  res.json(quote);
});

// POST /quotes — create
router.post('/', (req, res) => {
  const { text, author, category } = req.body;
  if (!text || !author) {
    return res.status(400).json({ error: 'text and author are required' });
  }
  const quote = create({ text, author, category });
  res.status(201).json(quote);
});

// PUT /quotes/:id — update
router.put('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { text, author, category } = req.body;
  const quote = update(id, { text, author, category });
  if (!quote) {
    return res.status(404).json({ error: 'Quote not found' });
  }
  res.json(quote);
});

// DELETE /quotes/:id — remove
router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const deleted = remove(id);
  if (!deleted) {
    return res.status(404).json({ error: 'Quote not found' });
  }
  res.status(204).send();
});

export default router;
