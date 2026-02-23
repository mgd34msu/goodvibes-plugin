import type { RateLimiter, RateLimiterConfig, RateLimitResult } from './types.js';

interface WindowState {
  count: number;
  windowStart: number;
}

/**
 * Fixed window rate limiter.
 *
 * Divides time into non-overlapping windows of `windowMs` duration.
 * The counter resets at each window boundary. Simpler and lower-memory than
 * sliding-window but susceptible to burst traffic at window boundaries.
 */
export class FixedWindowLimiter implements RateLimiter {
  private readonly config: RateLimiterConfig;
  private readonly windows: Map<string, WindowState> = new Map();

  constructor(config: RateLimiterConfig) {
    if (config.windowMs <= 0) {
      throw new RangeError('windowMs must be a positive number');
    }
    if (config.maxRequests <= 0) {
      throw new RangeError('maxRequests must be a positive number');
    }
    this.config = config;
  }

  /**
   * Check whether a request from the given key would be allowed in the
   * current window without incrementing the counter.
   */
  check(key: string): RateLimitResult {
    const now = Date.now();
    const state = this.getWindow(key, now);
    const allowed = state.count < this.config.maxRequests;
    const remaining = Math.max(0, this.config.maxRequests - state.count);
    const resetAt = state.windowStart + this.config.windowMs;
    return { allowed, remaining, resetAt, limit: this.config.maxRequests };
  }

  /**
   * Attempt to consume capacity in the current window for the given key.
   */
  consume(key: string): RateLimitResult {
    const now = Date.now();
    const state = this.getWindow(key, now);
    const allowed = state.count < this.config.maxRequests;

    if (allowed) {
      state.count += 1;
    }

    const remaining = Math.max(0, this.config.maxRequests - state.count);
    const resetAt = state.windowStart + this.config.windowMs;
    return { allowed, remaining, resetAt, limit: this.config.maxRequests };
  }

  /**
   * Reset state for a specific key.
   */
  reset(key: string): void {
    this.windows.delete(key);
  }

  /**
   * Reset all rate limit state.
   */
  resetAll(): void {
    this.windows.clear();
  }

  /**
   * Return the window state for the given key, advancing to the current
   * window if it has expired. Creates a new entry if none exists.
   */
  private getWindow(key: string, now: number): WindowState {
    const windowStart = now - (now % this.config.windowMs);
    let state = this.windows.get(key);
    if (state === undefined || state.windowStart < windowStart) {
      state = { count: 0, windowStart };
      this.windows.set(key, state);
    }
    return state;
  }
}
