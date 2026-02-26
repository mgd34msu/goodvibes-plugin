/**
 * RateLimiter — Main Class
 *
 * Unified entry point that delegates to the configured algorithm and store.
 * Supports three algorithms (token-bucket, sliding-window, fixed-window) and
 * any `RateLimitStore` implementation. Defaults to an in-process MemoryStore.
 */

import type { IRateLimiter, RateLimiterConfig, RateLimitResult, RateLimitStore } from './types.js';
import { MemoryStore } from './stores/memory-store.js'; // default store
import { tokenBucketCheck, tokenBucketConsume } from './algorithms/token-bucket.js';
import { slidingWindowCheck, slidingWindowConsume } from './algorithms/sliding-window.js';
import { fixedWindowCheck, fixedWindowConsume } from './algorithms/fixed-window.js';

/** Options for the static factory helpers. */
export interface TokenBucketOptions {
  /** Maximum token capacity. */
  capacity: number;
  /** Tokens added per window. Defaults to `capacity`. */
  refillRate?: number;
  /** Refill window in milliseconds. Defaults to 1 second (1000). */
  windowMs?: number;
  /** Custom store. Defaults to MemoryStore. */
  store?: RateLimitStore;
}

export interface SlidingWindowOptions {
  /** Maximum requests per window. */
  maxRequests: number;
  /** Window duration in milliseconds. */
  windowMs: number;
  /** Custom store. Defaults to MemoryStore. */
  store?: RateLimitStore;
}

export interface FixedWindowOptions {
  /** Maximum requests per window. */
  maxRequests: number;
  /** Window duration in milliseconds. */
  windowMs: number;
  /** Custom store. Defaults to MemoryStore. */
  store?: RateLimitStore;
}

/**
 * Production-grade rate limiter supporting multiple algorithms and storage
 * backends.
 *
 * @example Token bucket
 * ```ts
 * const limiter = RateLimiter.tokenBucket({ capacity: 100, windowMs: 1000 });
 * const result = await limiter.consume('user:42');
 * if (!result.allowed) {
 *   throw new Error(`Rate limited. Retry in ${result.retryAfter}ms`);
 * }
 * ```
 *
 * @example Custom store
 * ```ts
 * const limiter = new RateLimiter(
 *   { algorithm: 'fixed-window', maxRequests: 60, windowMs: 60_000 },
 *   myRedisStore,
 * );
 * ```
 */
export class RateLimiter implements IRateLimiter {
  private readonly _config: RateLimiterConfig;
  private readonly _store: RateLimitStore;
  private _disposed = false;

  /**
   * Create a new RateLimiter.
   *
   * @param config - Algorithm and limit configuration.
   * @param store  - Optional backing store. Defaults to a new MemoryStore.
   */
  constructor(config: RateLimiterConfig, store?: RateLimitStore) {
    this._config = { ...config };
    this._store = store ?? new MemoryStore();
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Check whether a request from `key` would be allowed **without** consuming
   * any capacity. Useful for read-ahead checks or UI feedback.
   *
   * @param key - Client identifier (e.g. IP address, user ID, API key).
   * @returns RateLimitResult describing current capacity.
   */
  async check(key: string, tokens: number = 1): Promise<RateLimitResult> {
    this._assertNotDisposed();
    if (tokens < 1) {
      throw new RangeError(`tokens must be >= 1, received ${tokens}`);
    }
    return this._dispatch('check', key, tokens);
  }

  /**
   * Consume capacity for a request from `key`. If the request is allowed, the
   * capacity is decremented before returning.
   *
   * @param key    - Client identifier.
   * @param tokens - Number of tokens to consume (token-bucket only; defaults
   *                 to 1 for other algorithms).
   * @returns RateLimitResult describing updated capacity.
   */
  async consume(key: string, tokens: number = 1): Promise<RateLimitResult> {
    this._assertNotDisposed();
    if (tokens < 1) {
      throw new RangeError(`tokens must be >= 1, received ${tokens}`);
    }
    return this._dispatch('consume', key, tokens);
  }

  /**
   * Reset all rate-limit state for `key`.
   *
   * @param key - Client identifier.
   */
  async reset(key: string): Promise<void> {
    this._assertNotDisposed();
    await this._store.delete(key);
  }

  /**
   * Release all resources (stops timers, clears store).
   * The instance must not be used after calling dispose.
   */
  async dispose(): Promise<void> {
    if (this._disposed) return;
    this._disposed = true;

    // Use optional chaining on the interface-defined `dispose?()` method
    // rather than casting to a concrete type. Any store that implements
    // the optional `dispose` will be cleaned up correctly.
    await this._store.dispose?.();
  }

  // ---------------------------------------------------------------------------
  // Static factory helpers
  // ---------------------------------------------------------------------------

  /**
   * Create a token-bucket rate limiter.
   *
   * @example
   * ```ts
   * // Allow 10 req/s with bursting up to 10 tokens.
   * const limiter = RateLimiter.tokenBucket({ capacity: 10, windowMs: 1000 });
   * ```
   */
  static tokenBucket(opts: TokenBucketOptions): RateLimiter {
    const config: RateLimiterConfig = {
      algorithm: 'token-bucket',
      maxRequests: opts.capacity,
      windowMs: opts.windowMs ?? 1_000,
      tokenBucketCapacity: opts.capacity,
      tokenBucketRefillRate: opts.refillRate ?? opts.capacity,
    };
    return new RateLimiter(config, opts.store);
  }

  /**
   * Create a sliding-window rate limiter.
   *
   * @example
   * ```ts
   * // Allow 100 req per 60-second window.
   * const limiter = RateLimiter.slidingWindow({ maxRequests: 100, windowMs: 60_000 });
   * ```
   */
  static slidingWindow(opts: SlidingWindowOptions): RateLimiter {
    const config: RateLimiterConfig = {
      algorithm: 'sliding-window',
      maxRequests: opts.maxRequests,
      windowMs: opts.windowMs,
    };
    return new RateLimiter(config, opts.store);
  }

  /**
   * Create a fixed-window rate limiter.
   *
   * @example
   * ```ts
   * // Allow 1000 req per hour.
   * const limiter = RateLimiter.fixedWindow({ maxRequests: 1000, windowMs: 3_600_000 });
   * ```
   */
  static fixedWindow(opts: FixedWindowOptions): RateLimiter {
    const config: RateLimiterConfig = {
      algorithm: 'fixed-window',
      maxRequests: opts.maxRequests,
      windowMs: opts.windowMs,
    };
    return new RateLimiter(config, opts.store);
  }

  // ---------------------------------------------------------------------------
  // Internal dispatch
  // ---------------------------------------------------------------------------

  private async _dispatch(
    mode: 'check' | 'consume',
    key: string,
    tokens: number = 1,
  ): Promise<RateLimitResult> {
    switch (this._config.algorithm) {
      case 'token-bucket':
        return mode === 'check'
          ? tokenBucketCheck(key, this._config, this._store, tokens)
          : tokenBucketConsume(key, this._config, this._store, tokens);

      case 'sliding-window':
        return mode === 'check'
          ? slidingWindowCheck(key, this._config, this._store)
          : slidingWindowConsume(key, this._config, this._store);

      case 'fixed-window':
        return mode === 'check'
          ? fixedWindowCheck(key, this._config, this._store)
          : fixedWindowConsume(key, this._config, this._store);

      default: {
        // TypeScript exhaustiveness guard.
        const _never: never = this._config.algorithm;
        throw new Error(`Unknown algorithm: ${String(_never)}`);
      }
    }
  }

  private _assertNotDisposed(): void {
    if (this._disposed) {
      throw new Error('RateLimiter has been disposed and cannot be used.');
    }
  }
}
