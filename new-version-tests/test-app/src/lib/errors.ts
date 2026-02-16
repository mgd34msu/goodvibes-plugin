/**
 * Custom error classes for better error handling
 */

import type { ErrorResponse } from '@/types/api';

export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public details?: string
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON(): ErrorResponse {
    return {
      error: this.message,
      details: this.details,
    };
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: string) {
    super(message, 400, details);
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Invalid credentials') {
    super(message, 401);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string = 'Resource') {
    super(`${resource} not found`, 404);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: string) {
    super(message, 409, details);
  }
}

export class RateLimitError extends AppError {
  constructor(public retryAfter: number) {
    super('Too many requests', 429, `Please try again in ${Math.ceil(retryAfter / 1000)} seconds`);
  }
}
