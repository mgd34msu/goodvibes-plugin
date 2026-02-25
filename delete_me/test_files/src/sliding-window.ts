/**
 * Sliding Window rate limiting algorithm.
 *
 * Tracks exact timestamps of each request within a rolling time window.
 * Provides precise control without the boundary spikes of fixed windows.
 */

import type { RateLimitResult, RateLimiter } from './types.js';
import { validatePositiveFinite } from './errors.js';

export interface SlidingWindowOptions {
  /** Duration of the sliding window in milliseconds. */
  windowMs: number;
  /** Maximum number of requests allowed within the window. */
  maxRequests: number;
}

/**
 * Sliding Window rate limiter.
 *
 * Maintains a per-key log of request timestamps within the current window.
 * Old entries are pruned on each check to prevent memory leaks.
 */
export class SlidingWindow implements RateLimiter {
  private readonly windowMs: number;
  private readonly maxRequests: number;
  /** Map from key to sorted array of request timestamps (ms). */
  private readonly windows: Map<string, number[]>;

  constructor(options: SlidingWindowOptions) {
    validatePositiveFinite(options.windowMs, 'windowMs');
    validatePositiveFinite(options.maxRequests, 'maxRequests');

    this.windowMs = options.windowMs;
    this.maxRequests = options.maxRequests;
    this.windows = new Map();
  }

  /**
   * Remove timestamps that have fallen outside the current window.
   */
  private prune(timestamps: number[], now: number): number[] {
    const cutoff = now - this.windowMs;
    // Timestamps are appended in order, so find the first valid index.
    let start = 0;
    while (start < timestamps.length && timestamps[start] <= cutoff) {
      start++;
    }
    return start === 0 ? timestamps : timestamps.slice(start);
  }

  /**
   * Check whether a request from `key` is allowed.
   *
   * @param key - Unique identifier (e.g. user ID, IP address)
   * @returns RateLimitResult with remaining count and resetAt timestamp.
   */
  check(key: string): RateLimitResult {
    const now = Date.now();
    let timestamps = this.windows.get(key) ?? [];
    timestamps = this.prune(timestamps, now);

    const count = timestamps.length;
    const remaining = Math.max(0, this.maxRequests - count - 1);

    // resetAt = when the oldest request in the window expires
    const oldestTimestamp = timestamps[0];
    const resetAt = oldestTimestamp !== undefined
      ? oldestTimestamp + this.windowMs
      : now + this.windowMs;

    if (count >= this.maxRequests) {
      this.windows.set(key, timestamps);
      return {
        allowed: false,
        remaining: 0,
        retryAfter: resetAt - now,
        resetAt,
      };
    }

    timestamps.push(now);
    this.windows.set(key, timestamps);

    return {
      allowed: true,
      remaining,
      resetAt: timestamps[0]! + this.windowMs,
    };
  }

  /**
   * Reset rate-limit state.
   *
   * @param key - When provided, resets only that key; otherwise clears all keys.
   */
  reset(key?: string): void {
    if (key !== undefined) {
      this.windows.delete(key);
    } else {
      this.windows.clear();
    }
  }
}
