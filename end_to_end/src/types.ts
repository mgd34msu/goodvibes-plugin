export type TaskStatus = 'pending' | 'in_progress' | 'completed';

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  createdAt: Date;
  updatedAt: Date;
}

export type CreateTaskInput = Pick<Task, 'title' | 'description'>;

export type UpdateTaskInput = Partial<Pick<Task, 'title' | 'description' | 'status'>>;
