import { Router } from 'express';
import {
  getAllTasks,
  getTaskById,
  createTask,
  updateTask,
  deleteTask,
} from './db.js';
import { success, sendError, notFound } from './utils/response.js';
import { validateBody } from './middleware/validate.js';
import { validateTaskInput, sanitizeString, isValidStatus } from './utils/validators.js';

const router = Router();

/**
 * GET /tasks
 * Optional query param: ?status=pending|completed|...
 */
router.get('/tasks', (req, res) => {
  const { status } = req.query;
  let tasks = getAllTasks();

  if (status !== undefined) {
    if (!isValidStatus(status)) {
      return sendError(res, 'Invalid status filter', 400);
    }
    tasks = tasks.filter((t) => t.status === status);
  }

  return success(res, tasks);
});

/**
 * GET /tasks/:id
 */
router.get('/tasks/:id', (req, res) => {
  const task = getTaskById(req.params.id);
  if (!task) {
    return notFound(res, 'Task');
  }
  return success(res, task);
});

/**
 * POST /tasks
 * Body: { title: string, description?: string }
 */
router.post('/tasks', validateBody(['title']), (req, res) => {
  const { title, description } = req.body;

  const validation = validateTaskInput({ title, description });
  if (!validation.valid) {
    return sendError(res, validation.errors.join('; '), 400);
  }

  const task = createTask({
    title: sanitizeString(title),
    description: description !== undefined ? sanitizeString(description) : undefined,
  });
  return success(res, task, 201);
});

/**
 * PUT /tasks/:id
 * Body: { title?, description?, status? }
 */
router.put('/tasks/:id', (req, res) => {
  const { title, description, status } = req.body;

  // For updates, all fields are optional — validate only if provided
  const errors = [];
  if (title !== undefined) {
    if (typeof title !== 'string' || title.trim() === '') {
      errors.push('title must be a non-empty string');
    }
  }
  if (description !== undefined && typeof description !== 'string') {
    errors.push('description must be a string');
  }
  if (status !== undefined && !isValidStatus(status)) {
    errors.push(`status must be one of: pending, in-progress, completed`);
  }

  if (errors.length > 0) {
    return sendError(res, errors.join('; '), 400);
  }

  const updates = {};
  if (title !== undefined) updates.title = sanitizeString(title);
  if (description !== undefined) updates.description = sanitizeString(description);
  if (status !== undefined) updates.status = status;

  const task = updateTask(req.params.id, updates);
  if (!task) {
    return notFound(res, 'Task');
  }

  return success(res, task);
});

/**
 * DELETE /tasks/:id
 */
router.delete('/tasks/:id', (req, res) => {
  const deleted = deleteTask(req.params.id);
  if (!deleted) {
    return notFound(res, 'Task');
  }
  res.status(204).send();
});

export default router;
