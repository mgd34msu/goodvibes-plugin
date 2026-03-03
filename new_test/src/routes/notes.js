import { Router } from 'express';
import { randomUUID } from 'crypto';

const router = Router();

/** @type {Array<{id: string, title: string, body: string, createdAt: string, updatedAt: string}>} */
let notes = [];

// GET /notes — list all notes
router.get('/', (_req, res) => {
  res.json(notes);
});

// GET /notes/:id — get a single note
router.get('/:id', (req, res) => {
  const note = notes.find((n) => n.id === req.params.id);
  if (!note) {
    return res.status(404).json({ error: 'Note not found' });
  }
  res.json(note);
});

// POST /notes — create a note
router.post('/', (req, res) => {
  const { title, body } = req.body ?? {};

  if (!title || typeof title !== 'string' || title.trim() === '') {
    return res.status(400).json({ error: 'title is required' });
  }
  if (!body || typeof body !== 'string' || body.trim() === '') {
    return res.status(400).json({ error: 'body is required' });
  }

  const now = new Date().toISOString();
  const note = {
    id: randomUUID(),
    title: title.trim(),
    body: body.trim(),
    createdAt: now,
    updatedAt: now,
  };

  notes.push(note);
  res.status(201).json(note);
});

// PUT /notes/:id — update a note
router.put('/:id', (req, res) => {
  const idx = notes.findIndex((n) => n.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: 'Note not found' });
  }

  const { title, body } = req.body ?? {};

  if (title !== undefined && (typeof title !== 'string' || title.trim() === '')) {
    return res.status(400).json({ error: 'title must be a non-empty string' });
  }
  if (body !== undefined && (typeof body !== 'string' || body.trim() === '')) {
    return res.status(400).json({ error: 'body must be a non-empty string' });
  }

  notes[idx] = {
    ...notes[idx],
    ...(title !== undefined ? { title: title.trim() } : {}),
    ...(body !== undefined ? { body: body.trim() } : {}),
    updatedAt: new Date().toISOString(),
  };

  res.json(notes[idx]);
});

// DELETE /notes/:id — delete a note
router.delete('/:id', (req, res) => {
  const idx = notes.findIndex((n) => n.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: 'Note not found' });
  }

  notes.splice(idx, 1);
  res.status(204).send();
});

export default router;
