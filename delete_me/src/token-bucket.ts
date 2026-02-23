import type { RateLimiter, RateLimiterConfig, RateLimitResult } from './types.js';

interface BucketState {
  tokens: number;
  lastRefillMs: number;
}

/**
 * Token bucket rate limiter with continuous (fractional) token refill.
 *
 * Tokens accumulate at `refillRate` tokens-per-second up to `maxRequests`.
 * Each consumed request deducts one token. The bucket starts full.
 */
export class TokenBucketLimiter implements RateLimiter {
  private readonly config: RateLimiterConfig;
  /** Tokens refilled per millisecond (derived from refillRate tokens/sec). */
  private readonly refillRatePerMs: number;
  private readonly buckets: Map<string, BucketState> = new Map();

  /**
   * @param config  Standard rate limiter config.
   * @param refillRate  Tokens refilled per second. Defaults to
   *   `maxRequests / (windowMs / 1000)` — i.e. one full refill per window.
   */
  constructor(config: RateLimiterConfig, refillRate?: number) {
    if (config.windowMs <= 0) {
      throw new RangeError('windowMs must be a positive number');
    }
    if (config.maxRequests <= 0) {
      throw new RangeError('maxRequests must be a positive number');
    }
    this.config = config;
    const rate = refillRate ?? config.maxRequests / (config.windowMs / 1000);
    if (rate <= 0) {
      throw new RangeError('refillRate must be a positive number');
    }
    this.refillRatePerMs = rate / 1000;
  }

  /**
   * Check whether a request from the given key would be allowed without
   * consuming a token.
   */
  check(key: string): RateLimitResult {
    const now = Date.now();
    const state = this.getRefreshedState(key, now);
    const allowed = state.tokens >= 1;
    const remaining = Math.floor(state.tokens);
    const resetAt = this.computeResetAt(state, now);
    return { allowed, remaining, resetAt, limit: this.config.maxRequests };
  }

  /**
   * Consume one token for the given key if available.
   */
  consume(key: string): RateLimitResult {
    const now = Date.now();
    const state = this.getRefreshedState(key, now);
    const allowed = state.tokens >= 1;

    if (allowed) {
      state.tokens -= 1;
    }

    const remaining = Math.floor(state.tokens);
    const resetAt = this.computeResetAt(state, now);
    return { allowed, remaining, resetAt, limit: this.config.maxRequests };
  }

  /**
   * Reset state for a specific key.
   */
  reset(key: string): void {
    this.buckets.delete(key);
  }

  /**
   * Reset all rate limit state.
   */
  resetAll(): void {
    this.buckets.clear();
  }

  /**
   * Return a refilled bucket state for the given key, creating it if needed.
   * Mutates the stored state in-place.
   */
  private getRefreshedState(key: string, now: number): BucketState {
    let state = this.buckets.get(key);
    if (state === undefined) {
      state = { tokens: this.config.maxRequests, lastRefillMs: now };
      this.buckets.set(key, state);
      return state;
    }
    const elapsed = now - state.lastRefillMs;
    if (elapsed > 0) {
      state.tokens = Math.min(
        this.config.maxRequests,
        state.tokens + elapsed * this.refillRatePerMs,
      );
      state.lastRefillMs = now;
    }
    return state;
  }

  /**
   * Estimate when the bucket will next have at least one token.
   * Returns `now` immediately when the bucket is already non-empty.
   */
  private computeResetAt(state: BucketState, now: number): number {
    if (state.tokens >= 1) {
      return now;
    }
    const tokensNeeded = 1 - state.tokens;
    const msUntilToken = tokensNeeded / this.refillRatePerMs;
    return Math.ceil(now + msUntilToken);
  }
}
