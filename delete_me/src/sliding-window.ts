import type { RateLimiter, RateLimiterConfig, RateLimitResult } from './types.js';

/**
 * Sliding window rate limiter.
 *
 * Tracks exact request timestamps per key within a rolling time window.
 * Provides accurate burst control with no boundary artifacts.
 */
export class SlidingWindowLimiter implements RateLimiter {
  private readonly config: RateLimiterConfig;
  private readonly timestamps: Map<string, number[]> = new Map();

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
   * Check whether a request from the given key would be allowed without
   * consuming capacity. Does not record a new timestamp.
   */
  check(key: string): RateLimitResult {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    const entries = this.prune(key, windowStart);
    const count = entries.length;
    const allowed = count < this.config.maxRequests;
    const remaining = Math.max(0, this.config.maxRequests - count);

    // Reset time is when the oldest request in the window expires.
    const resetAt = entries.length > 0
      ? entries[0]! + this.config.windowMs
      : now + this.config.windowMs;

    return { allowed, remaining, resetAt, limit: this.config.maxRequests };
  }

  /**
   * Attempt to consume capacity for the given key.
   * Records a timestamp if the request is allowed.
   */
  consume(key: string): RateLimitResult {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    const entries = this.prune(key, windowStart);
    const count = entries.length;
    const allowed = count < this.config.maxRequests;

    if (allowed) {
      entries.push(now);
      this.timestamps.set(key, entries);
    }

    const remaining = Math.max(0, this.config.maxRequests - entries.length);
    const resetAt = entries.length > 0
      ? entries[0]! + this.config.windowMs
      : now + this.config.windowMs;

    return { allowed, remaining, resetAt, limit: this.config.maxRequests };
  }

  /**
   * Reset state for a specific key.
   */
  reset(key: string): void {
    this.timestamps.delete(key);
  }

  /**
   * Reset all rate limit state.
   */
  resetAll(): void {
    this.timestamps.clear();
  }

  /**
   * Remove expired timestamps and return the current (pruned) array for the key.
   * Mutates the map in-place so callers see the authoritative pruned list.
   */
  private prune(key: string, windowStart: number): number[] {
    const raw = this.timestamps.get(key);
    if (raw === undefined) {
      const empty: number[] = [];
      this.timestamps.set(key, empty);
      return empty;
    }
    // Timestamps are appended in order, so a forward scan is sufficient.
    let i = 0;
    while (i < raw.length && raw[i]! <= windowStart) {
      i++;
    }
    if (i > 0) {
      const pruned = raw.slice(i);
      this.timestamps.set(key, pruned);
      return pruned;
    }
    return raw;
  }
}
