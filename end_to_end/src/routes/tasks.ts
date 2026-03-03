import { Router, Request, Response } from 'express';
import { store } from '../store.js';
import { CreateTaskInput, UpdateTaskInput } from '../types.js';

const router = Router();

// GET / — list all tasks
router.get('/', (_req: Request, res: Response) => {
  res.json(store.getAll());
});

// GET /:id — get task by id
router.get('/:id', (req: Request, res: Response) => {
  const task = store.getById(req.params.id);
  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }
  res.json(task);
});

// POST / — create task
router.post('/', (req: Request, res: Response) => {
  const { title, description } = req.body as Partial<CreateTaskInput>;

  if (!title || typeof title !== 'string' || title.trim() === '') {
    res.status(400).json({ error: 'title is required' });
    return;
  }

  const input: CreateTaskInput = {
    title: title.trim(),
    description: typeof description === 'string' ? description : '',
  };

  const task = store.create(input);
  res.status(201).json(task);
});

// PATCH /:id — update task
router.patch('/:id', (req: Request, res: Response) => {
  const input = req.body as UpdateTaskInput;
  const task = store.update(req.params.id, input);
  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }
  res.json(task);
});

// DELETE /:id — delete task
router.delete('/:id', (req: Request, res: Response) => {
  const deleted = store.delete(req.params.id);
  if (!deleted) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }
  res.status(204).send();
});

export default router;
