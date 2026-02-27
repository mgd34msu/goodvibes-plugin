/**
 * Token Bucket rate limiting algorithm.
 *
 * Tokens accumulate at a fixed `refillRate` per second up to `capacity`.
 * Each request consumes one or more tokens. Requests that would exceed the
 * available token count are denied.
 *
 * Refill is lazy: tokens are computed on every check/consume call based on
 * elapsed time since the last operation, avoiding background timers.
 *
 * @module @goodvibes/rate-limiter/algorithms/token-bucket
 */

import type { IStore, IRateLimiter, RateLimitResult } from '../types.js';

/**
 * Milliseconds added to TTL beyond the minimum refill time, to tolerate
 * clock skew and late store eviction.
 */
const TTL_BUFFER_MS = 5_000;

/** Persisted bucket state kept in the store. */
interface BucketState {
  /** Current token count (may be fractional during computation). */
  tokens: number;
  /** Unix timestamp (ms) of the last refill calculation. */
  lastRefillAt: number;
}

/**
 * Token Bucket rate limiter.
 *
 * @example
 * ```ts
 * const limiter = new TokenBucket(10, 1, store); // 10 tokens, 1/s refill
 * const result = await limiter.consume('user:42');
 * if (!result.allowed) throw new TooManyRequestsError(result.retryAfterMs);
 * ```
 */
export class TokenBucket implements IRateLimiter {
  private readonly _capacity: number;
  private readonly _refillRate: number; // tokens per millisecond
  private readonly _store: IStore;
  private _disposed = false;

  /**
   * @param capacity   - Maximum number of tokens in the bucket.
   * @param refillRate - Tokens added per second (must be > 0 for non-trivial use).
   * @param store      - Backing store for bucket state.
   */
  constructor(capacity: number, refillRate: number, store: IStore) {
    if (!Number.isFinite(capacity)) throw new RangeError('capacity must be a finite number');
    if (!Number.isFinite(refillRate)) throw new RangeError('refillRate must be a finite number');
    if (capacity < 0) throw new RangeError('capacity must be >= 0');
    if (refillRate < 0) throw new RangeError('refillRate must be >= 0');
    if (capacity === 0 && refillRate === 0) {
      // Both parameters are zero: every request will be permanently denied.
      // This is a degenerate configuration but not an error — callers may
      // intentionally block all traffic (e.g. during maintenance mode).
    }
    this._capacity = capacity;
    this._refillRate = refillRate / 1000; // convert to per-ms
    this._store = store;
  }

  /**
   * Check availability without consuming tokens.
   */
  async check(key: string): Promise<RateLimitResult> {
    this._assertNotDisposed();
    const storeKey = this._storeKey(key);
    const now = Date.now();
    const state = await this._store.get<BucketState>(storeKey);
    const tokens = this._computeTokens(state, now);
    return this._buildResult(tokens, now);
  }

  /**
   * Consume `tokens` from the bucket for `key`.
   *
   * Passing `tokens = 0` is a no-op probe: the bucket state is not modified
   * and the result reflects availability for a single future token.
   *
   * @param key    - Caller identifier.
   * @param tokens - Tokens to consume. Must be >= 0. Default: 1.
   * @throws {RangeError} If `tokens` is negative or non-finite.
   */
  async consume(key: string, tokens = 1): Promise<RateLimitResult> {
    this._assertNotDisposed();
    if (!Number.isFinite(tokens)) throw new RangeError('tokens must be a finite number');
    if (tokens < 0) throw new RangeError('tokens must be >= 0');

    const storeKey = this._storeKey(key);
    const now = Date.now();
    let result!: RateLimitResult;

    await this._store.update<BucketState>(
      storeKey,
      (current) => {
        const available = this._computeTokens(current, now);
        const allowed = available >= tokens && this._capacity > 0;
        const newTokens = allowed ? available - tokens : available;
        result = this._buildResult(newTokens, now, allowed ? tokens : 0);
        return { tokens: newTokens, lastRefillAt: now };
      },
      this._ttlMs(),
    );

    return result;
  }

  /**
   * Reset the bucket for `key`, restoring it to full capacity.
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
    return `rl:tb:${key}`;
  }

  /**
   * Compute the refilled token count without writing to the store.
   * Handles clock drift by clamping elapsed time to >= 0.
   */
  private _computeTokens(state: BucketState | null, now: number): number {
    if (this._capacity === 0) return 0;
    if (state === null) return this._capacity;

    const elapsed = Math.max(0, now - state.lastRefillAt);
    const refilled = elapsed * this._refillRate;
    return Math.min(this._capacity, state.tokens + refilled);
  }

  /**
   * Build the result object.
   *
   * @param availableAfter - Token count after the operation.
   * @param now            - Current timestamp used for reset calculation.
   * @param tokensConsumed - Tokens actually consumed (0 for check / denied).
   */
  private _buildResult(
    availableAfter: number,
    now: number,
    tokensConsumed = 0,
  ): RateLimitResult {
    const allowed = tokensConsumed > 0 ? true : availableAfter > 0 && this._capacity > 0;
    const remaining = Math.floor(Math.max(0, availableAfter));

    let retryAfterMs: number | null = null;
    let resetAtMs: number;

    if (!allowed) {
      // Time until at least one token is available.
      if (this._refillRate > 0) {
        // Tokens needed to make the next single-token request succeed.
        const tokensNeeded = 1;
        const msPerToken = 1 / this._refillRate;
        retryAfterMs = Math.ceil((tokensNeeded - availableAfter) * msPerToken);
        resetAtMs = now + retryAfterMs;
      } else {
        // refillRate=0 means the limiter will never recover; return null
        retryAfterMs = null;
        resetAtMs = now;
      }
    } else {
      resetAtMs = this._refillRate > 0
        ? now + Math.ceil((this._capacity - remaining) / this._refillRate)
        : now;
    }

    return {
      allowed,
      remaining,
      limit: this._capacity,
      retryAfterMs,
      resetAtMs,
    };
  }

  /**
   * TTL for store entries: time to fully refill an empty bucket plus a buffer
   * to tolerate clock skew and late eviction.
   */
  private _ttlMs(): number {
    return this._refillRate > 0
      ? Math.ceil(this._capacity / this._refillRate) + TTL_BUFFER_MS
      : 60_000;
  }

  private _assertNotDisposed(): void {
    if (this._disposed) throw new Error('TokenBucket has been disposed');
  }
}
