/**
 * Rate Limiter Library
 *
 * Provides three rate limiting algorithms — Token Bucket, Sliding Window, and
 * Fixed Window Counter — sharing a common `RateLimiter` interface, plus an
 * Express-style middleware factory.
 *
 * @module
 */

export type { RateLimitResult, RateLimiter } from './types.js';
export { RateLimiterError } from './types.js';
export { TokenBucket } from './token-bucket.js';
export type { TokenBucketOptions } from './token-bucket.js';
export { SlidingWindowLimiter } from './sliding-window.js';
export type { SlidingWindowOptions } from './sliding-window.js';
export { FixedWindowCounter } from './fixed-window.js';
export type { FixedWindowOptions } from './fixed-window.js';
export { createRateLimitMiddleware } from './middleware.js';
export type { Middleware, MiddlewareOptions, MiddlewareRequest, MiddlewareResponse } from './middleware.js';
