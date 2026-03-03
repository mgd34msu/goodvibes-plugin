export interface Task {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'done';
  createdAt: string;
  updatedAt: string;
}

export type CreateTaskInput = Pick<Task, 'title' | 'description'>;
export type UpdateTaskInput = Partial<Pick<Task, 'title' | 'description' | 'status'>>;
