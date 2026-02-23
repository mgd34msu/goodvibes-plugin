/**
 * Strategy for rate limiting requests.
 *
 * - `sliding-window` — Tracks requests within a rolling time window
 * - `token-bucket` — Refills tokens at a steady rate, each request consumes a token
 * - `fixed-window` — Resets the counter at fixed interval boundaries
 */
export type RateLimitStrategy = 'sliding-window' | 'token-bucket' | 'fixed-window';

/**
 * Configuration for a rate limiter instance.
 */
export interface RateLimiterConfig {
  /** Duration of the rate limit window in milliseconds */
  readonly windowMs: number;

  /** Maximum number of requests allowed within the window */
  readonly maxRequests: number;

  /** Rate limiting strategy to use */
  readonly strategy: RateLimitStrategy;
}

/**
 * Result of a rate limit check.
 */
export interface RateLimitResult {
  /** Whether the request is allowed */
  readonly allowed: boolean;

  /** Number of remaining requests in the current window */
  readonly remaining: number;

  /** Unix timestamp (ms) when the rate limit resets */
  readonly resetAt: number;

  /** Total requests allowed per window */
  readonly limit: number;
}

/**
 * Interface that all rate limiter implementations must satisfy.
 */
export interface RateLimiter {
  /** Check if a request from the given key is allowed */
  check(key: string): RateLimitResult;

  /** Reset the rate limit state for a given key */
  reset(key: string): void;

  /** Reset all rate limit state */
  resetAll(): void;
}
