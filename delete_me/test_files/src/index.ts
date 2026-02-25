/**
 * Rate Limiter Library
 *
 * A production-grade rate limiting library providing three algorithms:
 * - TokenBucket: continuous token refill, suited for smooth traffic shaping
 * - SlidingWindow: per-key rolling window with exact timestamp tracking
 * - FixedWindow: clock-aligned window counters with automatic pruning
 *
 * Plus an Express-compatible middleware factory.
 */

export type { RateLimitResult, RateLimiter } from './types.js';
export { RateLimiterError, validatePositiveFinite } from './errors.js';
export { TokenBucket } from './token-bucket.js';
export type { TokenBucketOptions } from './token-bucket.js';
export { SlidingWindow } from './sliding-window.js';
export type { SlidingWindowOptions } from './sliding-window.js';
export { FixedWindow } from './fixed-window.js';
export type { FixedWindowOptions } from './fixed-window.js';
export { createRateLimitMiddleware } from './middleware.js';
export type {
  Middleware,
  MiddlewareRequest,
  MiddlewareResponse,
  RateLimitMiddlewareOptions,
} from './middleware.js';
