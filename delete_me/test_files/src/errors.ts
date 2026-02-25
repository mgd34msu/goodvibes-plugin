/**
 * Custom error class for rate limiter configuration errors.
 */

/**
 * Thrown at construction time when a rate limiter receives an invalid configuration.
 */
export class RateLimiterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RateLimiterError';
    // Maintain proper prototype chain in transpiled environments.
    Object.setPrototypeOf(this, RateLimiterError.prototype);
  }
}

/**
 * Validate that a numeric config value is a positive, finite number.
 * @throws {RateLimiterError} If the value fails validation.
 */
export function validatePositiveFinite(value: unknown, fieldName: string): void {
  if (typeof value !== 'number') {
    throw new RateLimiterError(
      `${fieldName} must be a number, got ${typeof value}`
    );
  }
  if (!Number.isFinite(value)) {
    throw new RateLimiterError(
      `${fieldName} must be a finite number, got ${value}`
    );
  }
  if (value <= 0) {
    throw new RateLimiterError(
      `${fieldName} must be positive, got ${value}`
    );
  }
}
