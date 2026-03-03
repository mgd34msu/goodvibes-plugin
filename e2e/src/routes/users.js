'use strict';

const { Router } = require('express');

const router = Router();

let nextId = 4;
let users = [
  { id: 1, name: 'Alice Smith', email: 'alice@example.com' },
  { id: 2, name: 'Bob Jones', email: 'bob@example.com' },
  { id: 3, name: 'Carol White', email: 'carol@example.com' },
];

// GET /api/users — list all users
router.get('/', (req, res) => {
  res.json(users);
});

// GET /api/users/:id — get by id
router.get('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const user = users.find((u) => u.id === id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json(user);
});

// POST /api/users — create user
router.post('/', (req, res) => {
  const { name, email } = req.body || {};
  if (!name || !email) {
    return res.status(400).json({ error: 'name and email are required' });
  }
  const user = { id: nextId++, name, email };
  users.push(user);
  res.status(201).json(user);
});

// DELETE /api/users/:id — delete by id
router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const index = users.findIndex((u) => u.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'User not found' });
  }
  const deleted = users.splice(index, 1)[0];
  res.json(deleted);
});

module.exports = router;
