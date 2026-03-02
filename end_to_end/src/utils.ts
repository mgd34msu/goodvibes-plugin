import { CreateTaskInput, Task, TaskStatus, UpdateTaskInput } from './types.js';

export function generateId(): string {
  return crypto.randomUUID();
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateCreateInput(input: CreateTaskInput): ValidationResult {
  const errors: string[] = [];

  if (typeof input.title !== 'string' || input.title.trim().length === 0) {
    errors.push('title must be a non-empty string');
  }

  if (typeof input.description !== 'string' || input.description.trim().length === 0) {
    errors.push('description must be a non-empty string');
  }

  return { valid: errors.length === 0, errors };
}

const VALID_STATUSES: TaskStatus[] = ['pending', 'in_progress', 'completed'];

export function validateUpdateInput(input: UpdateTaskInput): ValidationResult {
  const errors: string[] = [];

  const hasFields = Object.keys(input).some(
    (key) => input[key as keyof UpdateTaskInput] !== undefined
  );

  if (!hasFields) {
    errors.push('at least one field must be provided for update');
  }

  if (input.title !== undefined && (typeof input.title !== 'string' || input.title.trim().length === 0)) {
    errors.push('title must be a non-empty string');
  }

  if (input.description !== undefined && (typeof input.description !== 'string' || input.description.trim().length === 0)) {
    errors.push('description must be a non-empty string');
  }

  if (input.status !== undefined && !VALID_STATUSES.includes(input.status)) {
    errors.push(`status must be one of: ${VALID_STATUSES.join(', ')}`);
  }

  return { valid: errors.length === 0, errors };
}

export function formatTask(task: Task): string {
  const statusLabel = task.status.replace('_', ' ');
  return [
    `Task [${task.id}]`,
    `  Title:       ${task.title}`,
    `  Description: ${task.description}`,
    `  Status:      ${statusLabel}`,
    `  Created:     ${task.createdAt.toISOString()}`,
    `  Updated:     ${task.updatedAt.toISOString()}`,
  ].join('\n');
}
