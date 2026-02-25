/**
 * Shared types for the rate limiter library.
 */

/**
 * Result returned by a rate limiter check.
 */
export interface RateLimitResult {
  /** Whether the request is allowed to proceed. */
  allowed: boolean;
  /** Number of remaining requests/tokens before the next denial. */
  remaining: number;
  /** Milliseconds until the next request will be allowed (only when denied). */
  retryAfter?: number;
  /** Unix timestamp (ms) when the current window or bucket resets. */
  resetAt?: number;
}

/**
 * Common interface implemented by all rate limiting algorithms.
 */
export interface RateLimiter {
  /**
   * Check whether the request identified by `key` should be allowed.
   * @param key - Unique identifier (e.g. user ID, IP address)
   */
  check(key: string): RateLimitResult;

  /**
   * Reset the rate-limit state.
   * @param key - When provided, resets only that key; otherwise resets all keys.
   */
  reset(key?: string): void;
}
