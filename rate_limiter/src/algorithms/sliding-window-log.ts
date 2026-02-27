/**
 * Sliding Window Log rate limiting algorithm.
 *
 * Maintains a log of request timestamps per key. On each operation the log
 * is pruned to the current window, and the count of remaining entries
 * determines allowance. This is the most accurate sliding-window variant
 * but uses O(n) storage per key.
 *
 * @module @goodvibes/rate-limiter/algorithms/sliding-window-log
 */

import type { IStore, IRateLimiter, RateLimitResult } from '../types.js';

/**
 * Milliseconds added to the TTL beyond the window duration to tolerate
 * clock skew and late store eviction.
 */
const TTL_BUFFER_MS = 5_000;

/** Persisted log state. */
interface WindowState {
  /** Sorted array of request timestamps (ms, ascending). */
  timestamps: number[];
}

/**
 * Sliding Window Log rate limiter.
 *
 * @example
 * ```ts
 * // Allow 100 requests per 60 seconds
 * const limiter = new SlidingWindowLog(100, 60_000, store);
 * const result = await limiter.consume('user:42');
 * ```
 */
export class SlidingWindowLog implements IRateLimiter {
  private readonly _maxRequests: number;
  private readonly _windowMs: number;
  private readonly _store: IStore;
  private _disposed = false;

  /**
   * @param maxRequests - Maximum requests allowed within the window.
   * @param windowMs    - Window duration in milliseconds.
   * @param store       - Backing store.
   */
  constructor(maxRequests: number, windowMs: number, store: IStore) {
    if (!Number.isFinite(maxRequests)) throw new RangeError('maxRequests must be a finite number');
    if (!Number.isFinite(windowMs)) throw new RangeError('windowMs must be a finite number');
    if (maxRequests < 0) throw new RangeError('maxRequests must be >= 0');
    if (windowMs <= 0) throw new RangeError('windowMs must be > 0');
    this._maxRequests = maxRequests;
    this._windowMs = windowMs;
    this._store = store;
  }

  /**
   * Check whether a request would be allowed without recording it.
   */
  async check(key: string): Promise<RateLimitResult> {
    this._assertNotDisposed();
    const storeKey = this._storeKey(key);
    const now = Date.now();
    const state = await this._store.get<WindowState>(storeKey);
    const active = this._pruneTimestamps(state?.timestamps ?? [], now);
    return this._buildResult(active, now, 0);
  }

  /**
   * Attempt to record a request for `key`.
   *
   * Passing `tokens = 0` is a no-op probe: no timestamps are recorded and
   * the result reflects current availability.
   *
   * @param key    - Caller identifier.
   * @param tokens - Requests to record (default 1). Must be >= 0.
   * @throws {RangeError} If `tokens` is negative or non-finite.
   */
  async consume(key: string, tokens = 1): Promise<RateLimitResult> {
    this._assertNotDisposed();
    if (!Number.isFinite(tokens)) throw new RangeError('tokens must be a finite number');
    if (tokens < 0) throw new RangeError('tokens must be >= 0');

    const storeKey = this._storeKey(key);
    const now = Date.now();
    let result!: RateLimitResult;

    await this._store.update<WindowState>(
      storeKey,
      (current) => {
        const active = this._pruneTimestamps(current?.timestamps ?? [], now);
        const allowed = active.length + tokens <= this._maxRequests && this._maxRequests > 0;

        let newTimestamps: number[];
        if (allowed) {
          // Append `tokens` timestamps at `now`
          newTimestamps = [...active];
          for (let i = 0; i < tokens; i++) newTimestamps.push(now);
        } else {
          newTimestamps = active;
        }

        result = this._buildResult(active, now, allowed ? tokens : 0);
        return { timestamps: newTimestamps };
      },
      this._windowMs + TTL_BUFFER_MS,
    );

    return result;
  }

  /**
   * Clear all recorded timestamps for `key`.
   */
  async reset(key: string): Promise<void> {
    this._assertNotDisposed();
    await this._store.delete(this._storeKey(key));
  }

  /**
   * Mark this instance as disposed. Subsequent calls to `check`, `consume`,
   * or `reset` will throw. The backing store is **not** disposed here — that
   * responsibility belongs to the owner (e.g. {@link RateLimiter}).
   */
  async dispose(): Promise<void> {
    this._disposed = true;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private _storeKey(key: string): string {
    return `rl:sw:${key}`;
  }

  /**
   * Return only timestamps that fall within the current window.
   * Input array is assumed to be in ascending order.
   */
  private _pruneTimestamps(timestamps: number[], now: number): number[] {
    const cutoff = now - this._windowMs;
    // Binary search for the first timestamp >= cutoff (O(log n) scan)
    let lo = 0;
    let hi = timestamps.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if ((timestamps[mid] as number) < cutoff) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    return lo === 0 ? timestamps : timestamps.slice(lo);
  }

  /**
   * Build the result object.
   *
   * @param activeBeforeConsume - Active timestamps BEFORE the current request.
   * @param now                 - Current timestamp.
   * @param tokensConsumed      - Number of tokens actually consumed (0 for check).
   */
  private _buildResult(
    activeBeforeConsume: number[],
    now: number,
    tokensConsumed: number,
  ): RateLimitResult {
    const usedCount = activeBeforeConsume.length;
    const allowed = tokensConsumed > 0
      ? true
      : usedCount < this._maxRequests && this._maxRequests > 0;
    const remaining = Math.max(0, this._maxRequests - usedCount - tokensConsumed);

    // The window resets when the oldest active timestamp expires
    const oldest = activeBeforeConsume[0];
    const resetAtMs = oldest !== undefined ? oldest + this._windowMs : now + this._windowMs;

    let retryAfterMs: number | null = null;
    if (!allowed && oldest !== undefined) {
      retryAfterMs = Math.max(1, oldest + this._windowMs - now);
    }

    return {
      allowed,
      remaining: Math.max(0, remaining),
      limit: this._maxRequests,
      retryAfterMs,
      resetAtMs,
    };
  }

  private _assertNotDisposed(): void {
    if (this._disposed) throw new Error('SlidingWindowLog has been disposed');
  }
}
