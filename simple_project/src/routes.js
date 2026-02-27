import { Router } from 'express';
import {
  addTask,
  getTask,
  getAllTasks,
  updateTask,
  deleteTask,
} from './db.js';

const router = Router();

// GET /tasks — list all tasks
router.get('/tasks', (_req, res) => {
  res.json(getAllTasks());
});

// GET /tasks/:id — get single task
router.get('/tasks/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const task = getTask(id);
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }
  res.json(task);
});

// POST /tasks — create task
router.post('/tasks', (req, res) => {
  const { title, description } = req.body;
  if (!title || typeof title !== 'string' || title.trim() === '') {
    return res.status(400).json({ error: 'title is required' });
  }
  const task = addTask(title.trim(), description ?? '');
  res.status(201).json(task);
});

// PUT /tasks/:id — update task
router.put('/tasks/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const task = updateTask(id, req.body);
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }
  res.json(task);
});

// DELETE /tasks/:id — delete task
router.delete('/tasks/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const deleted = deleteTask(id);
  if (!deleted) {
    return res.status(404).json({ error: 'Task not found' });
  }
  res.status(204).send();
});

export default router;
