import { Task, CreateTaskInput, UpdateTaskInput, TaskStatus } from './types.js';
import { generateId, validateCreateInput, validateUpdateInput } from './utils.js';

export class TaskStore {
  private tasks: Map<string, Task> = new Map();

  create(input: CreateTaskInput): Task {
    const validation = validateCreateInput(input);
    if (!validation.valid) {
      throw new Error(`Invalid input: ${validation.errors.join('; ')}`);
    }

    const now = new Date();
    const task: Task = {
      id: generateId(),
      title: input.title.trim(),
      description: input.description.trim(),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };

    this.tasks.set(task.id, task);
    return task;
  }

  getById(id: string): Task | undefined {
    return this.tasks.get(id);
  }

  getAll(): Task[] {
    return Array.from(this.tasks.values()).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );
  }

  update(id: string, input: UpdateTaskInput): Task {
    const existing = this.tasks.get(id);
    if (!existing) {
      throw new Error(`Task not found: ${id}`);
    }

    const validation = validateUpdateInput(input);
    if (!validation.valid) {
      throw new Error(`Invalid input: ${validation.errors.join('; ')}`);
    }

    const updated: Task = {
      ...existing,
      ...(input.title !== undefined && { title: input.title.trim() }),
      ...(input.description !== undefined && { description: input.description.trim() }),
      ...(input.status !== undefined && { status: input.status }),
      updatedAt: new Date(),
    };

    this.tasks.set(id, updated);
    return updated;
  }

  delete(id: string): boolean {
    return this.tasks.delete(id);
  }

  getByStatus(status: TaskStatus): Task[] {
    return this.getAll().filter((task) => task.status === status);
  }

  count(): number {
    return this.tasks.size;
  }

  clear(): void {
    this.tasks.clear();
  }
}
