/**
 * Core types for the rate limiter module.
 *
 * @module @goodvibes/rate-limiter/types
 */

/**
 * Result returned by check and consume operations.
 */
export interface RateLimitResult {
  /** Whether the request is permitted. */
  allowed: boolean;
  /** Number of tokens/requests remaining in the current window. */
  remaining: number;
  /** Maximum number of tokens/requests for this limiter. */
  limit: number;
  /** Milliseconds until the client may retry. null if allowed. */
  retryAfterMs: number | null;
  /** Unix timestamp (ms) when the current limit window resets. */
  resetAtMs: number;
}

/**
 * Common interface implemented by all rate limiter algorithms.
 */
export interface IRateLimiter {
  /**
   * Check whether a request for `key` would be allowed without consuming
   * any capacity. Safe to call at high frequency.
   *
   * @param key - Arbitrary string identifying the caller (e.g. user ID, IP).
   */
  check(key: string): Promise<RateLimitResult>;

  /**
   * Attempt to consume `tokens` capacity for `key`. Decrements the available
   * allowance when allowed.
   *
   * @param key    - Arbitrary string identifying the caller.
   * @param tokens - Number of tokens to consume (default 1). Must be >= 0.
   */
  consume(key: string, tokens?: number): Promise<RateLimitResult>;

  /**
   * Reset all state for `key`, as if no requests had been made.
   *
   * @param key - Arbitrary string identifying the caller.
   */
  reset(key: string): Promise<void>;

  /**
   * Release any resources held by this limiter instance.
   * Safe to call multiple times.
   */
  dispose(): Promise<void>;
}

/**
 * Minimal key-value store contract required by all algorithms.
 *
 * Implementations must ensure that `update` is atomic -- concurrent callers
 * will not see partial writes.
 */
export interface IStore {
  /**
   * Retrieve the value for `key`. Returns `null` when absent.
   */
  get<T>(key: string): Promise<T | null>;

  /**
   * Persist `value` under `key`, optionally expiring after `ttlMs`.
   */
  set<T>(key: string, value: T, ttlMs?: number): Promise<void>;

  /**
   * Remove `key` from the store. No-op if absent.
   */
  delete(key: string): Promise<void>;

  /**
   * Atomically read-modify-write the value at `key`. The `updater` function
   * receives the current value (or `null`) and returns the new value. The
   * store MUST apply this as a single atomic unit to prevent lost updates
   * under concurrent access.
   */
  update<T>(
    key: string,
    updater: (current: T | null) => T,
    ttlMs?: number,
  ): Promise<void>;

  /**
   * Flush pending writes and release all held resources.
   * Callers must await this before process exit.
   */
  dispose(): Promise<void>;
}
