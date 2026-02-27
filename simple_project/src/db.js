// In-memory data store for tasks
let nextId = 1;
const tasks = [];

/**
 * Creates a new task.
 * @param {string} title
 * @param {string} [description]
 * @returns {object} The created task
 */
export function addTask(title, description = '') {
  const now = new Date().toISOString();
  const task = {
    id: nextId++,
    title,
    description,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  };
  tasks.push(task);
  return task;
}

/**
 * Returns a task by id, or null if not found.
 * @param {number} id
 * @returns {object|null}
 */
export function getTask(id) {
  return tasks.find((t) => t.id === id) ?? null;
}

/**
 * Returns all tasks.
 * @returns {object[]}
 */
export function getAllTasks() {
  return [...tasks];
}

/**
 * Updates a task by id.
 * @param {number} id
 * @param {object} updates
 * @returns {object|null} Updated task or null if not found
 */
export function updateTask(id, updates) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return null;

  const allowed = ['title', 'description', 'status'];
  for (const key of allowed) {
    if (updates[key] !== undefined) {
      task[key] = updates[key];
    }
  }
  task.updatedAt = new Date().toISOString();
  return task;
}

/**
 * Deletes a task by id.
 * @param {number} id
 * @returns {boolean} True if deleted, false if not found
 */
export function deleteTask(id) {
  const index = tasks.findIndex((t) => t.id === id);
  if (index === -1) return false;
  tasks.splice(index, 1);
  return true;
}

/**
 * Resets the database to its initial empty state.
 * Intended for use in tests only.
 */
export function reset() {
  tasks.length = 0;
  nextId = 1;
}
