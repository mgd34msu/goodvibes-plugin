import { RateLimiterError } from './errors.js';
import type { RateLimitResult, RateLimiter } from './types.js';

/** Configuration options for {@link SlidingWindowLimiter}. */
export interface SlidingWindowOptions {
  /** Window duration in milliseconds. Must be a positive finite number. */
  windowMs: number;
  /** Maximum requests allowed within the window. Must be a positive finite number. */
  maxRequests: number;
}

/**
 * Sliding window rate limiter.
 *
 * Tracks exact timestamps of recent requests per key. On each `check()` call,
 * old timestamps outside the window are pruned before deciding whether to allow
 * the new request. This avoids the burst problem of fixed windows.
 *
 * @example
 * ```ts
 * const limiter = new SlidingWindowLimiter({ windowMs: 60_000, maxRequests: 10 });
 * const result = limiter.check('user-123'); // { allowed: true, remaining: 9, resetAt: ... }
 * ```
 */
export class SlidingWindowLimiter implements RateLimiter {
  private readonly windowMs: number;
  private readonly maxRequests: number;
  /** Map from key to sorted array of request timestamps */
  private readonly windows: Map<string, number[]> = new Map();

  constructor(options: SlidingWindowOptions) {
    const { windowMs, maxRequests } = options;
    SlidingWindowLimiter.validatePositiveFinite(windowMs, 'windowMs');
    SlidingWindowLimiter.validatePositiveFinite(maxRequests, 'maxRequests');
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
  }

  private static validatePositiveFinite(value: unknown, name: string): void {
    if (typeof value !== 'number') {
      throw new RateLimiterError(
        `${name} must be a number, got ${typeof value}`,
        'INVALID_TYPE',
      );
    }
    if (!isFinite(value)) {
      throw new RateLimiterError(
        `${name} must be a finite number, got ${value}`,
        'NON_FINITE',
      );
    }
    if (value <= 0) {
      throw new RateLimiterError(
        `${name} must be positive, got ${value}`,
        'NON_POSITIVE',
      );
    }
  }

  /**
   * Check whether a request for `key` is allowed within the sliding window.
   * Records the request timestamp if allowed.
   *
   * @param key - Identifier for the requester (e.g. IP address, user ID)
   */
  check(key: string): RateLimitResult {
    const now = Date.now();
    const cutoff = now - this.windowMs;

    // Get or initialise timestamps for this key, prune old entries
    let timestamps = this.windows.get(key) ?? [];
    timestamps = timestamps.filter((t) => t > cutoff);

    const resetAt = timestamps.length > 0 ? timestamps[0] + this.windowMs : now + this.windowMs;

    if (timestamps.length < this.maxRequests) {
      timestamps.push(now);
      this.windows.set(key, timestamps);
      return {
        allowed: true,
        remaining: this.maxRequests - timestamps.length,
        resetAt,
      };
    }

    // Denied: retry after the oldest timestamp leaves the window
    const retryAfter = timestamps[0] + this.windowMs - now;
    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.max(1, retryAfter),
      resetAt,
    };
  }

  /**
   * Reset state for a specific key or all keys.
   *
   * @param key - If provided, clears only that key; otherwise clears all keys
   */
  reset(key?: string): void {
    if (key !== undefined) {
      this.windows.delete(key);
    } else {
      this.windows.clear();
    }
  }
}
