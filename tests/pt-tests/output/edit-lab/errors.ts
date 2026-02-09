export class ApplicationError extends Error {
  constructor(
    message: string,
    public code: number = 500,
    public details?: unknown
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 404);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends AppError {
  constructor(field: string, reason: string) {
    super(`Validation failed for ${field}: ${reason}`, 400);
    this.name = "ValidationError";
  }
}
