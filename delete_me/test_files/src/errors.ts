/**
 * Custom error class for rate limiter configuration validation.
 */
export class RateLimiterError extends Error {
  /** Machine-readable error code */
  public readonly code: string;

  constructor(message: string, code: string = 'RATE_LIMITER_ERROR') {
    super(message);
    this.name = 'RateLimiterError';
    this.code = code;
    // Restore prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
