/**
 * Result returned by rate limiter check operations.
 */
export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Number of requests/tokens remaining in the current window or bucket */
  remaining: number;
  /** Milliseconds until the next allowed request (only set when denied) */
  retryAfter?: number;
  /** Unix timestamp (ms) when the window or bucket resets */
  resetAt?: number;
}

/**
 * Common interface implemented by all rate limiter algorithms.
 */
export interface RateLimiter {
  /**
   * Check whether a request identified by `key` is allowed.
   * Records the request if allowed.
   * @param key - Identifier for the request (e.g. IP address, user ID)
   */
  check(key: string): RateLimitResult;

  /**
   * Reset state for a specific key or all keys.
   * @param key - If provided, resets only that key; otherwise resets all state
   */
  reset(key?: string): void;
}
