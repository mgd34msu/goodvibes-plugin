/**
 * Fixed Window Counter rate limiting algorithm.
 *
 * Divides time into fixed-size windows aligned to clock boundaries.
 * Counts requests per window and resets when the window expires.
 */

import type { RateLimitResult, RateLimiter } from './types.js';
import { validatePositiveFinite } from './errors.js';

export interface FixedWindowOptions {
  /** Duration of each fixed window in milliseconds. */
  windowMs: number;
  /** Maximum number of requests allowed within each window. */
  maxRequests: number;
}

interface WindowEntry {
  count: number;
  windowStart: number;
}

/**
 * Fixed Window Counter rate limiter.
 *
 * Each key gets an independent window counter that resets at clock-aligned
 * boundaries (e.g. every minute, aligned to the minute). Expired windows are
 * pruned to prevent memory leaks.
 */
export class FixedWindow implements RateLimiter {
  private readonly windowMs: number;
  private readonly maxRequests: number;
  private readonly entries: Map<string, WindowEntry>;
  private lastPruneTime: number;

  constructor(options: FixedWindowOptions) {
    validatePositiveFinite(options.windowMs, 'windowMs');
    validatePositiveFinite(options.maxRequests, 'maxRequests');

    this.windowMs = options.windowMs;
    this.maxRequests = options.maxRequests;
    this.entries = new Map();
    this.lastPruneTime = Date.now();
  }

  /**
   * Get the start of the current window for a given timestamp.
   * Windows are aligned to multiples of windowMs from the Unix epoch.
   */
  private getWindowStart(now: number): number {
    return Math.floor(now / this.windowMs) * this.windowMs;
  }

  /**
   * Remove all stale entries.
   * Only prunes if at least one full window has elapsed since the last prune.
   * Since entries are only inserted at check() time (current window), any entry
   * in the map when a subsequent window's prune fires is by definition stale.
   */
  private maybePrune(now: number): void {
    if (now - this.lastPruneTime < this.windowMs) return;
    this.lastPruneTime = now;
    this.entries.clear();
  }

  /**
   * Check whether a request from `key` is allowed within the current window.
   *
   * @param key - Unique identifier (e.g. user ID, IP address)
   * @returns RateLimitResult with remaining count and resetAt timestamp.
   */
  check(key: string): RateLimitResult {
    const now = Date.now();
    this.maybePrune(now);

    const windowStart = this.getWindowStart(now);
    const resetAt = windowStart + this.windowMs;

    let entry = this.entries.get(key);

    // New window or no entry — start fresh.
    if (entry === undefined || entry.windowStart !== windowStart) {
      entry = { count: 0, windowStart };
    }

    if (entry.count >= this.maxRequests) {
      this.entries.set(key, entry);
      return {
        allowed: false,
        remaining: 0,
        retryAfter: resetAt - now,
        resetAt,
      };
    }

    entry.count++;
    this.entries.set(key, entry);

    return {
      allowed: true,
      remaining: this.maxRequests - entry.count,
      resetAt,
    };
  }

  /**
   * Reset rate-limit state.
   *
   * @param key - When provided, resets only that key; otherwise clears all keys.
   */
  reset(key?: string): void {
    if (key !== undefined) {
      this.entries.delete(key);
    } else {
      this.entries.clear();
    }
  }
}
