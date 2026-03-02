import { Router } from 'express';

const router = Router();

/** @type {{ id: number, name: string, description: string }[]} */
let items = [];
let nextId = 1;

// GET /api/items — return all items
router.get('/', (_req, res) => {
  res.json(items);
});

// GET /api/items/:id — return single item
router.get('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const item = items.find((i) => i.id === id);
  if (!item) {
    return res.status(404).json({ error: 'Item not found' });
  }
  res.json(item);
});

// POST /api/items — create new item
router.post('/', (req, res) => {
  const { name, description } = req.body;
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Field "name" is required and must be a string' });
  }
  const item = { id: nextId++, name, description: description ?? '' };
  items.push(item);
  res.status(201).json(item);
});

// DELETE /api/items/:id — remove item
router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const index = items.findIndex((i) => i.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Item not found' });
  }
  items.splice(index, 1);
  res.status(204).end();
});

export default router;
