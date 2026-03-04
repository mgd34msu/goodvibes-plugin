import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getAllTasks, createTask, updateTask, deleteTask } from '../store/tasks';

const router = Router();

const createTaskSchema = z.object({
  title: z.string().trim().min(1, 'title is required and must be a non-empty string'),
  description: z.string().optional(),
});

const updateTaskSchema = z.object({
  title: z.string().trim().min(1, 'title must be a non-empty string').optional(),
  description: z.string().optional(),
  completed: z.boolean().optional(),
});

// GET /api/tasks — list all tasks
router.get('/', (_req: Request, res: Response) => {
  const tasks = getAllTasks();
  res.json(tasks);
});

// POST /api/tasks — create task
router.post('/', (req: Request, res: Response) => {
  const result = createTaskSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.issues[0]?.message ?? 'Invalid input' });
    return;
  }

  const { title, description } = result.data;
  const task = createTask({ title, description: description?.trim() });
  res.status(201).json(task);
});

// PATCH /api/tasks/:id — update task
router.patch('/:id', (req: Request, res: Response) => {
  const { id } = req.params;

  const result = updateTaskSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.issues[0]?.message ?? 'Invalid input' });
    return;
  }

  const input = result.data;
  const updated = updateTask(id, {
    ...input,
    ...(input.description !== undefined && { description: input.description.trim() }),
  });

  if (!updated) {
    res.status(404).json({ error: `Task with id '${id}' not found` });
    return;
  }

  res.json(updated);
});

// DELETE /api/tasks/:id — delete task
router.delete('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const existed = deleteTask(id);

  if (!existed) {
    res.status(404).json({ error: `Task with id '${id}' not found` });
    return;
  }

  res.status(204).send();
});

export default router;
