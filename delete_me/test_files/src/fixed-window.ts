/**
 * Fixed Window Counter rate limiter implementation.
 */

import { RateLimiter, RateLimitResult, RateLimiterError } from './types.js';

/**
 * Configuration options for {@link FixedWindowCounter}.
 */
export interface FixedWindowOptions {
  /** Window duration in milliseconds. Must be a positive finite number. */
  windowMs: number;
  /** Maximum requests per window. Must be a positive finite number. */
  maxRequests: number;
}

/** Internal state stored per key per window. */
interface WindowEntry {
  /** The window start timestamp (aligned to clock boundary). */
  windowStart: number;
  /** Number of requests made in the current window. */
  count: number;
}

/**
 * Fixed Window Counter rate limiter.
 *
 * Each key is tracked within a fixed-duration window that aligns to clock
 * boundaries. When the window expires, the counter resets.
 *
 * @example
 * ```ts
 * const limiter = new FixedWindowCounter({ windowMs: 60_000, maxRequests: 100 });
 * const result = limiter.check(req.ip);
 * if (!result.allowed) {
 *   console.log(`Window resets at ${new Date(result.resetAt!).toISOString()}`);
 * }
 * ```
 */
export class FixedWindowCounter implements RateLimiter {
  private readonly windowMs: number;
  private readonly maxRequests: number;
  /** Map from key to the current window entry. */
  private readonly counters: Map<string, WindowEntry>;

  /**
   * @param options - Counter configuration.
   * @throws {@link RateLimiterError} if any option is invalid.
   */
  constructor(options: FixedWindowOptions) {
    validatePositiveFinite(options.windowMs, 'windowMs');
    validatePositiveFinite(options.maxRequests, 'maxRequests');

    this.windowMs = options.windowMs;
    this.maxRequests = options.maxRequests;
    this.counters = new Map();
  }

  /**
   * Check whether a request for the given key is allowed.
   *
   * If the current window has expired, the counter is reset before checking.
   *
   * @param key - Per-user or per-IP identifier.
   * @returns Result indicating whether the request was allowed.
   */
  check(key: string): RateLimitResult {
    const now = Date.now();
    const windowStart = Math.floor(now / this.windowMs) * this.windowMs;
    const resetAt = windowStart + this.windowMs;

    let entry = this.counters.get(key);

    // Start fresh if no entry exists or the window has rolled over.
    if (entry === undefined || entry.windowStart < windowStart) {
      entry = { windowStart, count: 0 };
    }

    if (entry.count < this.maxRequests) {
      entry.count += 1;
      this.counters.set(key, entry);
      return {
        allowed: true,
        remaining: this.maxRequests - entry.count,
        resetAt,
      };
    }

    // Denied: window has not rolled over yet.
    const retryAfter = resetAt - now;
    return {
      allowed: false,
      remaining: 0,
      retryAfter,
      resetAt,
    };
  }

  /**
   * Reset counter state.
   *
   * @param key - If provided, clears only that key. Otherwise clears all keys.
   */
  reset(key?: string): void {
    if (key !== undefined) {
      this.counters.delete(key);
    } else {
      this.counters.clear();
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
