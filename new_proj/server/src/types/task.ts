export interface Task {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  /** ISO 8601 UTC timestamp, e.g. "2024-01-15T10:30:00.000Z" */
  createdAt: string;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  completed?: boolean;
}
