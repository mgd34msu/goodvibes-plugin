import { v4 as uuidv4 } from 'uuid';

/** @type {Map<string, object>} */
const tasks = new Map();

/**
 * Returns all tasks as an array.
 * @returns {object[]}
 */
export function getAllTasks() {
  return Array.from(tasks.values());
}

/**
 * Returns a task by ID or null if not found.
 * @param {string} id
 * @returns {object|null}
 */
export function getTaskById(id) {
  return tasks.get(id) ?? null;
}

/**
 * Creates a new task.
 * @param {{ title: string, description?: string }} data
 * @returns {object}
 */
export function createTask({ title, description = '' }) {
  const now = new Date().toISOString();
  const task = {
    id: uuidv4(),
    title,
    description,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  };
  tasks.set(task.id, task);
  return task;
}

/**
 * Partially updates a task. Returns updated task or null if not found.
 * @param {string} id
 * @param {Partial<{title: string, description: string, status: string}>} updates
 * @returns {object|null}
 */
export function updateTask(id, updates) {
  const task = tasks.get(id);
  if (!task) return null;

  const updated = {
    ...task,
    ...(updates.title !== undefined && { title: updates.title }),
    ...(updates.description !== undefined && { description: updates.description }),
    ...(updates.status !== undefined && { status: updates.status }),
    id: task.id,
    createdAt: task.createdAt,
    updatedAt: new Date().toISOString(),
  };
  tasks.set(id, updated);
  return updated;
}

/**
 * Deletes a task by ID. Returns true if deleted, false if not found.
 * @param {string} id
 * @returns {boolean}
 */
export function deleteTask(id) {
  return tasks.delete(id);
}

/**
 * Clears all tasks. Intended for use in tests.
 */
export function clearAll() {
  tasks.clear();
}
