import { type Task, type TaskStatus, type CreateTaskInput, type UpdateTaskInput } from './types.js';
import { generateId, isNonEmptyString } from './utils.js';

/**
 * In-memory task store with full CRUD operations.
 */
export class TaskStore {
  private tasks: Map<string, Task> = new Map();

  /**
   * Creates a new task from a CreateTaskInput.
   * Throws if title is empty.
   */
  create(input: CreateTaskInput): Task {
    if (!isNonEmptyString(input.title)) {
      throw new Error('Task title must be a non-empty string.');
    }
    const now = new Date();
    const task: Task = {
      id: generateId(),
      title: input.title.trim(),
      description: input.description ?? '',
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };
    this.tasks.set(task.id, task);
    return task;
  }

  /**
   * Convenience method: creates a task from a title string.
   * Compatible with CLI usage: store.addTask('title').
   */
  addTask(title: string): Task {
    return this.create({ title });
  }

  /**
   * Retrieves a task by ID. Returns undefined if not found.
   */
  getById(id: string): Task | undefined {
    return this.tasks.get(id);
  }

  /**
   * Returns all tasks sorted by createdAt descending (newest first).
   */
  getAll(): Task[] {
    return Array.from(this.tasks.values()).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );
  }

  /**
   * Alias for getAll() — compatible with CLI usage: store.listTasks().
   */
  listTasks(): Task[] {
    return this.getAll();
  }

  /**
   * Updates a task by ID using an UpdateTaskInput.
   * Throws if the task is not found or if validation fails.
   */
  update(id: string, input: UpdateTaskInput): Task {
    const task = this.tasks.get(id);
    if (!task) {
      throw new Error(`Task not found: ${id}`);
    }
    if (input.title !== undefined && !isNonEmptyString(input.title)) {
      throw new Error('Task title must be a non-empty string.');
    }
    const updated: Task = {
      ...task,
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      updatedAt: new Date(),
    };
    this.tasks.set(id, updated);
    return updated;
  }

  /**
   * Convenience method: updates a task, returns Task | undefined.
   * Compatible with CLI usage: store.updateTask(id, { status: 'in_progress' }).
   */
  updateTask(id: string, input: UpdateTaskInput): Task | undefined {
    try {
      return this.update(id, input);
    } catch {
      return undefined;
    }
  }

  /**
   * Deletes a task by ID. Returns true if deleted, false if not found.
   */
  delete(id: string): boolean {
    return this.tasks.delete(id);
  }

  /**
   * Alias for delete() — compatible with CLI usage: store.deleteTask(id).
   */
  deleteTask(id: string): boolean {
    return this.delete(id);
  }

  /**
   * Returns all tasks with the given status, sorted by createdAt descending.
   */
  getByStatus(status: TaskStatus): Task[] {
    return this.getAll().filter((task) => task.status === status);
  }

  /**
   * Alias for getByStatus() — compatible with CLI usage.
   */
  getTasksByStatus(status: TaskStatus): Task[] {
    return this.getByStatus(status);
  }

  /**
   * Returns the total number of tasks.
   */
  count(): number {
    return this.tasks.size;
  }

  /**
   * Removes all tasks from the store.
   */
  clear(): void {
    this.tasks.clear();
  }
}
