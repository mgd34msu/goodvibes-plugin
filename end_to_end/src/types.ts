/**
 * Task status representing the current state of a task.
 */
export type TaskStatus = 'pending' | 'in_progress' | 'completed';

/**
 * Core Task entity with full lifecycle metadata.
 */
export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Input required to create a new Task.
 * Description is optional and defaults to an empty string.
 */
export type CreateTaskInput = Pick<Task, 'title'> & Partial<Pick<Task, 'description'>>;

/**
 * Input for partial updates to an existing Task.
 */
export type UpdateTaskInput = Partial<Pick<Task, 'title' | 'description' | 'status'>>;
