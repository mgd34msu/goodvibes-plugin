import { Router } from 'express';

const router = Router();

let items = [
  { id: 1, name: 'Item One' },
  { id: 2, name: 'Item Two' },
];

let nextId = 3;

// GET /api/items
router.get('/', (req, res) => {
  res.json(items);
});

// GET /api/items/:id
router.get('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const item = items.find((i) => i.id === id);
  if (!item) {
    return res.status(404).json({ error: 'Item not found' });
  }
  res.json(item);
});

// POST /api/items
router.post('/', (req, res) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string' || name.trim() === '') {
    return res.status(400).json({ error: 'name is required' });
  }
  const item = { id: nextId++, name: name.trim() };
  items.push(item);
  res.status(201).json(item);
});

// DELETE /api/items/:id
router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const index = items.findIndex((i) => i.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Item not found' });
  }
  items.splice(index, 1);
  res.status(204).send();
});

export default router;
