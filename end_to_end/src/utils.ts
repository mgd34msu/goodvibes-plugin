import { CreateTaskInput, Task, TaskStatus, UpdateTaskInput } from './types.js';

const VALID_STATUSES: TaskStatus[] = ['pending', 'in_progress', 'completed'];

/**
 * Type guard that checks if a value is a non-empty string.
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Generates a cryptographically random UUID.
 */
export function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Validation result returned by input validators.
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates input for creating a new task.
 * Ensures title is a non-empty string.
 */
export function validateCreateInput(input: CreateTaskInput): ValidationResult {
  const errors: string[] = [];

  if (!isNonEmptyString(input.title)) {
    errors.push('title must be a non-empty string');
  }

  if (input.description !== undefined && typeof input.description !== 'string') {
    errors.push('description must be a string');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates input for updating an existing task.
 * Ensures at least one field is present and status (if provided) is valid.
 */
export function validateUpdateInput(input: UpdateTaskInput): ValidationResult {
  const errors: string[] = [];
  const keys = Object.keys(input) as Array<keyof UpdateTaskInput>;

  if (keys.length === 0) {
    errors.push('at least one field must be provided for update');
  }

  if (input.title !== undefined && (typeof input.title !== 'string' || input.title.trim().length === 0)) {
    errors.push('title must be a non-empty string');
  }

  if (input.description !== undefined && typeof input.description !== 'string') {
    errors.push('description must be a string');
  }

  if (input.status !== undefined && !VALID_STATUSES.includes(input.status)) {
    errors.push(`status must be one of: ${VALID_STATUSES.join(', ')}`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Returns a human-readable string representation of a Task.
 */
export function formatTask(task: Task): string {
  return [
    `[${task.id}] ${task.title}`,
    `  Status: ${task.status}`,
    `  Description: ${task.description}`,
    `  Created: ${task.createdAt.toISOString()}`,
    `  Updated: ${task.updatedAt.toISOString()}`,
  ].join('\n');
}
