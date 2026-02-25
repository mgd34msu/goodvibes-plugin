/**
 * Rate Limiter Library
 *
 * A production-grade rate limiter supporting Token Bucket, Sliding Window,
 * and Fixed Window Counter algorithms with an Express-style middleware factory.
 *
 * @packageDocumentation
 */

export { RateLimiterError } from './errors.js';
export type { RateLimitResult, RateLimiter } from './types.js';
export { TokenBucket } from './token-bucket.js';
export type { TokenBucketOptions } from './token-bucket.js';
export { SlidingWindowLimiter } from './sliding-window.js';
export type { SlidingWindowOptions } from './sliding-window.js';
export { FixedWindowLimiter } from './fixed-window.js';
export type { FixedWindowOptions } from './fixed-window.js';
export { createRateLimitMiddleware } from './middleware.js';
export type {
  Middleware,
  MiddlewareRequest,
  MiddlewareResponse,
  RateLimitMiddlewareOptions,
} from './middleware.js';
