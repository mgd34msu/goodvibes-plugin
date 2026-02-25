/**
 * Token Bucket rate limiting algorithm.
 *
 * Tokens are refilled continuously at a constant rate. Requests consume tokens.
 * When the bucket is empty, requests are denied until enough tokens refill.
 */

import type { RateLimitResult, RateLimiter } from './types.js';
import { validatePositiveFinite } from './errors.js';

export interface TokenBucketOptions {
  /** Maximum number of tokens the bucket can hold. */
  capacity: number;
  /** Number of tokens added per second (continuous refill). */
  refillRate: number;
}

/**
 * Token Bucket rate limiter.
 *
 * Implements continuous token refill. Suitable for bursty traffic that should
 * be smoothed over time.
 */
export class TokenBucket implements RateLimiter {
  private readonly capacity: number;
  private readonly refillRate: number;
  private tokens: number;
  private lastRefillTime: number;

  constructor(options: TokenBucketOptions) {
    validatePositiveFinite(options.capacity, 'capacity');
    validatePositiveFinite(options.refillRate, 'refillRate');

    this.capacity = options.capacity;
    this.refillRate = options.refillRate;
    this.tokens = options.capacity;
    this.lastRefillTime = Date.now();
  }

  /**
   * Refill tokens based on elapsed time since the last refill.
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefillTime) / 1000; // seconds
    const tokensToAdd = elapsed * this.refillRate;
    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefillTime = now;
  }

  /**
   * Attempt to consume tokens from the bucket.
   *
   * @param tokens - Number of tokens to consume (default: 1)
   * @returns RateLimitResult indicating whether the request was allowed.
   */
  consume(tokens = 1): RateLimitResult {
    if (tokens <= 0) {
      throw new RangeError('tokens must be positive');
    }

    this.refill();

    if (tokens > this.capacity) {
      // Can never be satisfied
      const retryAfter = Math.ceil(((tokens - this.capacity) / this.refillRate) * 1000);
      return {
        allowed: false,
        remaining: Math.floor(this.tokens),
        retryAfter,
        resetAt: Date.now() + retryAfter,
      };
    }

    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return {
        allowed: true,
        remaining: Math.floor(this.tokens),
      };
    }

    // Calculate time until enough tokens are available
    const tokensNeeded = tokens - this.tokens;
    const retryAfter = Math.ceil((tokensNeeded / this.refillRate) * 1000);
    return {
      allowed: false,
      remaining: Math.floor(this.tokens),
      retryAfter,
      resetAt: Date.now() + retryAfter,
    };
  }

  /**
   * Implements RateLimiter.check — delegates to consume(1), ignores key.
   *
   * @param _key - Not used (token bucket is a single global bucket)
   */
  check(_key: string): RateLimitResult {
    return this.consume();
  }

  /**
   * Reset the bucket to full capacity.
   * The key parameter is ignored (single bucket).
   */
  reset(_key?: string): void {
    this.tokens = this.capacity;
    this.lastRefillTime = Date.now();
  }

}
