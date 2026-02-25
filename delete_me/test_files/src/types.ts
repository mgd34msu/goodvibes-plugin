/**
 * Core types and interfaces for the rate limiter library.
 */

/**
 * Result returned by all rate limiter check operations.
 */
export interface RateLimitResult {
  /** Whether the request is allowed. */
  allowed: boolean;
  /** Number of remaining requests/tokens. */
  remaining: number;
  /** Milliseconds until the next request is allowed (only present when denied). */
  retryAfter?: number;
  /** Timestamp (ms since epoch) when the window or bucket resets. */
  resetAt?: number;
}

/**
 * Common interface implemented by all rate limiter algorithms.
 */
export interface RateLimiter {
  /**
   * Check whether a request for the given key is allowed.
   * @param key - Identifier for the resource being rate limited (e.g., user ID, IP).
   * @returns A {@link RateLimitResult} describing the outcome.
   */
  check(key: string): RateLimitResult;

  /**
   * Reset the rate limit state.
   * @param key - If provided, resets only that key. Otherwise resets all state.
   */
  reset(key?: string): void;
}

/**
 * Custom error thrown when rate limiter configuration is invalid.
 */
export class RateLimiterError extends Error {
  /** Always `'RateLimiterError'` for programmatic detection. */
  readonly name = 'RateLimiterError';

  /**
   * @param message - Human-readable description of what is invalid.
   */
  constructor(message: string) {
    super(message);
    // Restore prototype chain for instanceof checks after transpilation.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
