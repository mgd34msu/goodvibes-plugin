import { RateLimiterError } from './errors.js';
import type { RateLimitResult, RateLimiter } from './types.js';

/** Configuration options for {@link FixedWindowLimiter}. */
export interface FixedWindowOptions {
  /** Window duration in milliseconds. Must be a positive finite number. */
  windowMs: number;
  /** Maximum requests per window. Must be a positive finite number. */
  maxRequests: number;
}

/** Internal per-key window state. */
interface WindowState {
  /** The start timestamp of the current window (clock-aligned). */
  windowStart: number;
  /** Number of requests made in the current window. */
  count: number;
}

/**
 * Fixed window counter rate limiter.
 *
 * Divides time into fixed, clock-aligned windows of `windowMs` duration.
 * Each key gets `maxRequests` allowance per window. When the current window
 * expires a new one starts automatically.
 *
 * @example
 * ```ts
 * const limiter = new FixedWindowLimiter({ windowMs: 60_000, maxRequests: 100 });
 * const result = limiter.check('user-123'); // { allowed: true, remaining: 99, resetAt: ... }
 * ```
 */
export class FixedWindowLimiter implements RateLimiter {
  private readonly windowMs: number;
  private readonly maxRequests: number;
  /** Map from key to current window state */
  private readonly windows: Map<string, WindowState> = new Map();

  constructor(options: FixedWindowOptions) {
    const { windowMs, maxRequests } = options;
    FixedWindowLimiter.validatePositiveFinite(windowMs, 'windowMs');
    FixedWindowLimiter.validatePositiveFinite(maxRequests, 'maxRequests');
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

  /** Compute the start of the clock-aligned window containing `now`. */
  private currentWindowStart(now: number): number {
    return Math.floor(now / this.windowMs) * this.windowMs;
  }

  /**
   * Check whether a request for `key` is allowed in the current fixed window.
   * Records the request if allowed. Expired windows are replaced automatically.
   *
   * @param key - Identifier for the requester
   */
  check(key: string): RateLimitResult {
    const now = Date.now();
    const windowStart = this.currentWindowStart(now);
    const resetAt = windowStart + this.windowMs;

    let state = this.windows.get(key);

    // If no state or window has expired, start a fresh window
    if (state === undefined || state.windowStart !== windowStart) {
      state = { windowStart, count: 0 };
    }

    if (state.count < this.maxRequests) {
      state.count++;
      this.windows.set(key, state);
      return {
        allowed: true,
        remaining: this.maxRequests - state.count,
        resetAt,
      };
    }

    // Denied: retry after current window resets
    const retryAfter = resetAt - now;
    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.max(1, retryAfter),
      resetAt,
    };
  }

  /**
   * Reset state for a specific key or all keys.
   * Also prunes any expired windows (garbage collection).
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

  /**
   * Prune expired window entries to prevent memory leaks.
   * Called automatically on `reset()` when clearing all keys.
   */
  prune(): void {
    const now = Date.now();
    const currentStart = this.currentWindowStart(now);
    for (const [k, state] of this.windows) {
      if (state.windowStart < currentStart) {
        this.windows.delete(k);
      }
    }
  }
}
