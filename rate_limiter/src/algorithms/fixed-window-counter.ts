/**
 * Fixed Window Counter rate limiting algorithm.
 *
 * Divides time into discrete windows of `windowMs` milliseconds. Each
 * window maintains a counter that resets at the start of the next window.
 * This is the most memory-efficient algorithm but can allow up to 2x the
 * configured rate at window boundaries.
 *
 * @module @goodvibes/rate-limiter/algorithms/fixed-window-counter
 */

import type { IStore, IRateLimiter, RateLimitResult } from '../types.js';

/**
 * Milliseconds added to the TTL beyond the window duration to tolerate
 * clock skew and late store eviction.
 */
const TTL_BUFFER_MS = 5_000;

/** Persisted window state. */
interface WindowState {
  /** Number of requests recorded in the current window. */
  count: number;
  /** Unix timestamp (ms) at which the current window started. */
  windowStart: number;
}

/**
 * Fixed Window Counter rate limiter.
 *
 * @example
 * ```ts
 * // Allow 1000 requests per 60 seconds per key
 * const limiter = new FixedWindowCounter(1000, 60_000, store);
 * const result = await limiter.consume('user:42');
 * ```
 */
export class FixedWindowCounter implements IRateLimiter {
  private readonly _maxRequests: number;
  private readonly _windowMs: number;
  private readonly _store: IStore;
  private _disposed = false;

  /**
   * @param maxRequests - Maximum requests allowed per window.
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
   * Check whether a request would be allowed without incrementing the counter.
   */
  async check(key: string): Promise<RateLimitResult> {
    this._assertNotDisposed();
    const storeKey = this._storeKey(key);
    const now = Date.now();
    const state = await this._store.get<WindowState>(storeKey);
    const { count, windowStart } = this._resolveWindow(state, now);
    return this._buildResult(count, windowStart, now, 0);
  }

  /**
   * Attempt to consume `tokens` requests in the current window for `key`.
   *
   * Passing `tokens = 0` is a no-op probe: the counter is not incremented and
   * the result reflects current availability.
   *
   * @param key    - Caller identifier.
   * @param tokens - Requests to consume (default 1). Must be >= 0.
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
        const { count, windowStart } = this._resolveWindow(current, now);
        const allowed = count + tokens <= this._maxRequests && this._maxRequests > 0;
        const newCount = allowed ? count + tokens : count;
        result = this._buildResult(count, windowStart, now, allowed ? tokens : 0);
        return { count: newCount, windowStart };
      },
      this._windowMs + TTL_BUFFER_MS,
    );

    return result;
  }

  /**
   * Reset the counter for `key` immediately.
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
    return `rl:fw:${key}`;
  }

  /**
   * Determine the effective window start and request count for `now`.
   * If the persisted window has expired, returns a fresh window.
   */
  private _resolveWindow(
    state: WindowState | null,
    now: number,
  ): { count: number; windowStart: number } {
    if (state === null) {
      return { count: 0, windowStart: this._windowFloor(now) };
    }
    const currentWindowStart = this._windowFloor(now);
    if (state.windowStart < currentWindowStart) {
      // Window has rolled — start fresh
      return { count: 0, windowStart: currentWindowStart };
    }
    return { count: state.count, windowStart: state.windowStart };
  }

  /**
   * Compute the floor (start) of the window containing `now`.
   */
  private _windowFloor(now: number): number {
    return Math.floor(now / this._windowMs) * this._windowMs;
  }

  /**
   * Build the result object.
   *
   * @param countBeforeConsume - Request count BEFORE the current operation.
   * @param windowStart        - Start of the current window.
   * @param now                - Current timestamp.
   * @param tokensConsumed     - Number of tokens actually consumed (0 for check).
   */
  private _buildResult(
    countBeforeConsume: number,
    windowStart: number,
    now: number,
    tokensConsumed: number,
  ): RateLimitResult {
    const resetAtMs = windowStart + this._windowMs;
    const used = countBeforeConsume + tokensConsumed;
    const remaining = Math.max(0, this._maxRequests - used);
    const allowed = tokensConsumed > 0
      ? true
      : countBeforeConsume < this._maxRequests && this._maxRequests > 0;

    const retryAfterMs: number | null = allowed ? null : Math.max(1, resetAtMs - now);

    return {
      allowed,
      remaining,
      limit: this._maxRequests,
      retryAfterMs,
      resetAtMs,
    };
  }

  private _assertNotDisposed(): void {
    if (this._disposed) throw new Error('FixedWindowCounter has been disposed');
  }
}
