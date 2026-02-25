/**
 * Token Bucket rate limiter implementation.
 */

import { RateLimiter, RateLimitResult, RateLimiterError } from './types.js';

/**
 * Configuration options for {@link TokenBucket}.
 */
export interface TokenBucketOptions {
  /** Maximum number of tokens the bucket can hold. Must be a positive finite number. */
  capacity: number;
  /** Tokens added per second (continuous refill). Must be a positive finite number. */
  refillRate: number;
}

/**
 * Token Bucket rate limiter.
 *
 * Tokens accumulate continuously at `refillRate` per second up to `capacity`.
 * Because the `TokenBucket` is a single-resource limiter, the `key` parameter
 * of `check()` is accepted but ignored — all callers share one bucket.
 *
 * @example
 * ```ts
 * const limiter = new TokenBucket({ capacity: 10, refillRate: 1 });
 * const result = limiter.check('user-1');
 * if (!result.allowed) {
 *   console.log(`Retry in ${result.retryAfter} ms`);
 * }
 * ```
 */
export class TokenBucket implements RateLimiter {
  private readonly capacity: number;
  private readonly refillRate: number;
  private tokens: number;
  private lastRefillTime: number;

  /**
   * @param options - Bucket configuration.
   * @throws {@link RateLimiterError} if any option is invalid.
   */
  constructor(options: TokenBucketOptions) {
    validatePositiveFinite(options.capacity, 'capacity');
    validatePositiveFinite(options.refillRate, 'refillRate');

    this.capacity = options.capacity;
    this.refillRate = options.refillRate;
    this.tokens = options.capacity;
    this.lastRefillTime = Date.now();
  }

  /**
   * Attempt to consume one token from the bucket.
   *
   * The `key` parameter is accepted for interface compatibility but is ignored;
   * all checks operate on the same bucket.
   *
   * @param key - Ignored. Present only to satisfy {@link RateLimiter}.
   * @returns Result indicating whether the request was allowed.
   */
  check(key: string): RateLimitResult {
    void key; // intentionally unused
    this.refill();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      const resetAt = Date.now() + Math.ceil((this.capacity - this.tokens) / this.refillRate) * 1000;
      return {
        allowed: true,
        remaining: Math.floor(this.tokens),
        resetAt,
      };
    }

    // Denied: calculate how long until 1 token is available.
    const msPerToken = 1000 / this.refillRate;
    const retryAfter = Math.ceil((1 - this.tokens) * msPerToken);
    return {
      allowed: false,
      remaining: 0,
      retryAfter,
    };
  }

  /**
   * Reset the bucket to full capacity.
   *
   * The `key` parameter is accepted for interface compatibility but is ignored.
   *
   * @param _key - Ignored.
   */
  reset(_key?: string): void {
    this.tokens = this.capacity;
    this.lastRefillTime = Date.now();
  }

  /** Refill tokens based on elapsed time since the last refill. */
  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefillTime) / 1000; // seconds
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillRate);
    this.lastRefillTime = now;
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
