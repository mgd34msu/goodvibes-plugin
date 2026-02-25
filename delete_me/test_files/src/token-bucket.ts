import { RateLimiterError } from './errors.js';
import type { RateLimitResult, RateLimiter } from './types.js';

/** Configuration options for {@link TokenBucket}. */
export interface TokenBucketOptions {
  /** Maximum number of tokens the bucket can hold. Must be a positive finite number. */
  capacity: number;
  /** Number of tokens added per second (continuous). Must be a positive finite number. */
  refillRate: number;
}

/**
 * Token bucket rate limiter.
 *
 * Tokens accumulate continuously at `refillRate` tokens per second up to
 * `capacity`. Each call to `consume()` attempts to spend tokens. Implements
 * the `RateLimiter` interface — `check(key)` delegates to `consume(1)`,
 * ignoring the key (single-bucket semantics).
 *
 * @example
 * ```ts
 * const bucket = new TokenBucket({ capacity: 10, refillRate: 1 });
 * const result = bucket.consume(); // { allowed: true, remaining: 9 }
 * ```
 */
export class TokenBucket implements RateLimiter {
  private readonly capacity: number;
  private readonly refillRate: number;
  private tokens: number;
  private lastRefillTime: number;

  constructor(options: TokenBucketOptions) {
    const { capacity, refillRate } = options;
    TokenBucket.validatePositiveFinite(capacity, 'capacity');
    TokenBucket.validatePositiveFinite(refillRate, 'refillRate');
    this.capacity = capacity;
    this.refillRate = refillRate;
    this.tokens = capacity;
    this.lastRefillTime = Date.now();
  }

  private static validatePositiveFinite(value: unknown, name: string): void {
    if (typeof value !== 'number') {
      throw new RateLimiterError(
        `${name} must be a number, got ${typeof value}`,
        'INVALID_TYPE',
      );
    }
    if (!isFinite(value)) {
      throw new RateLimiterError(
        `${name} must be a finite number, got ${value}`,
        'NON_FINITE',
      );
    }
    if (value <= 0) {
      throw new RateLimiterError(
        `${name} must be positive, got ${value}`,
        'NON_POSITIVE',
      );
    }
  }

  /** Refill tokens based on elapsed time since last refill. */
  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefillTime) / 1000; // seconds
    const newTokens = elapsed * this.refillRate;
    this.tokens = Math.min(this.capacity, this.tokens + newTokens);
    this.lastRefillTime = now;
  }

  /**
   * Attempt to consume `tokens` from the bucket.
   *
   * @param tokens - Number of tokens to consume (default: 1)
   * @returns Result indicating whether consumption was allowed
   */
  consume(tokens: number = 1): RateLimitResult {
    this.refill();
    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return {
        allowed: true,
        remaining: Math.floor(this.tokens),
      };
    }
    // Denied: compute how long until enough tokens are available
    const deficit = tokens - this.tokens;
    const retryAfter = Math.ceil((deficit / this.refillRate) * 1000);
    return {
      allowed: false,
      remaining: Math.floor(this.tokens),
      retryAfter,
    };
  }

  /**
   * Implements {@link RateLimiter.check}. Ignores `key` (single-bucket semantics).
   * Equivalent to calling `consume(1)`.
   */
  check(_key: string): RateLimitResult {
    return this.consume(1);
  }

  /**
   * Reset the bucket to full capacity.
   * Ignores `key` parameter (single-bucket semantics).
   */
  reset(_key?: string): void {
    this.tokens = this.capacity;
    this.lastRefillTime = Date.now();
  }
}
