/**
 * Sliding Window rate limiter implementation.
 */

import { RateLimiter, RateLimitResult, RateLimiterError } from './types.js';

/**
 * Configuration options for {@link SlidingWindowLimiter}.
 */
export interface SlidingWindowOptions {
  /** Window duration in milliseconds. Must be a positive finite number. */
  windowMs: number;
  /** Maximum requests allowed within the window. Must be a positive finite number. */
  maxRequests: number;
}

/**
 * Sliding Window rate limiter.
 *
 * Each key maintains a list of timestamps for accepted requests within the
 * rolling window. Expired timestamps are pruned on every `check()` call to
 * prevent unbounded memory growth.
 *
 * @example
 * ```ts
 * const limiter = new SlidingWindowLimiter({ windowMs: 60_000, maxRequests: 100 });
 * const result = limiter.check(req.ip);
 * if (!result.allowed) {
 *   console.log(`Reset at ${new Date(result.resetAt!).toISOString()}`);
 * }
 * ```
 */
export class SlidingWindowLimiter implements RateLimiter {
  private readonly windowMs: number;
  private readonly maxRequests: number;
  /** Map from key to sorted list of request timestamps (ms). */
  private readonly windows: Map<string, number[]>;

  /**
   * @param options - Window configuration.
   * @throws {@link RateLimiterError} if any option is invalid.
   */
  constructor(options: SlidingWindowOptions) {
    validatePositiveFinite(options.windowMs, 'windowMs');
    validatePositiveFinite(options.maxRequests, 'maxRequests');

    this.windowMs = options.windowMs;
    this.maxRequests = options.maxRequests;
    this.windows = new Map();
  }

  /**
   * Check whether a request for the given key is allowed.
   *
   * If allowed, the current timestamp is recorded for the key.
   *
   * @param key - Per-user or per-IP identifier.
   * @returns Result indicating whether the request was allowed.
   */
  check(key: string): RateLimitResult {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    // Retrieve and prune timestamps for this key.
    let timestamps = this.windows.get(key) ?? [];
    timestamps = timestamps.filter((t) => t > windowStart);

    const count = timestamps.length;
    const resetAt = (timestamps[0] ?? now) + this.windowMs;

    if (count < this.maxRequests) {
      timestamps.push(now);
      this.windows.set(key, timestamps);
      return {
        allowed: true,
        remaining: this.maxRequests - timestamps.length,
        resetAt,
      };
    }

    // Denied: retry after the oldest timestamp falls out of the window.
    const oldest = timestamps[0]!;
    const retryAfter = oldest + this.windowMs - now;
    return {
      allowed: false,
      remaining: 0,
      retryAfter,
      resetAt,
    };
  }

  /**
   * Reset sliding window state.
   *
   * @param key - If provided, clears only that key. Otherwise clears all keys.
   */
  reset(key?: string): void {
    if (key !== undefined) {
      this.windows.delete(key);
    } else {
      this.windows.clear();
    }
  }
}

/** Validate that a value is a positive, finite number. */
function validatePositiveFinite(value: unknown, name: string): void {
  if (typeof value !== 'number') {
    throw new RateLimiterError(`${name} must be a number, got ${typeof value}`);
  }
  if (!Number.isFinite(value)) {
    throw new RateLimiterError(`${name} must be a finite number, got ${value}`);
  }
  if (value <= 0) {
    throw new RateLimiterError(`${name} must be positive, got ${value}`);
  }
}
