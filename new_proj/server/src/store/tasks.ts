import { v4 as uuidv4 } from 'uuid';
import { Task, CreateTaskInput, UpdateTaskInput } from '../types/task';

/** Map preserves insertion order; tasks are always appended, never reordered. */
const tasks: Map<string, Task> = new Map();

export function getAllTasks(): Task[] {
  // Insertion order == creation order; no re-parsing needed.
  return Array.from(tasks.values());
}

export function getTaskById(id: string): Task | undefined {
  return tasks.get(id);
}

export function createTask(input: CreateTaskInput): Task {
  const task: Task = {
    id: uuidv4(),
    title: input.title,
    description: input.description ?? '',
    completed: false,
    /** ISO 8601 UTC timestamp, e.g. "2024-01-15T10:30:00.000Z" */
    createdAt: new Date().toISOString(),
  };
  tasks.set(task.id, task);
  return task;
}

export function updateTask(id: string, input: UpdateTaskInput): Task | undefined {
  const existing = tasks.get(id);
  if (!existing) return undefined;

  const updated: Task = {
    ...existing,
    ...(input.title !== undefined && { title: input.title }),
    ...(input.description !== undefined && { description: input.description }),
    ...(input.completed !== undefined && { completed: input.completed }),
  };
  tasks.set(id, updated);
  return updated;
}

export function deleteTask(id: string): boolean {
  return tasks.delete(id);
}

/** Reset store — for use in tests only. */
export function _resetStore(): void {
  tasks.clear();
}
