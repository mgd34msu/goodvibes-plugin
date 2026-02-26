/**
 * Rate Limiter — Public API
 *
 * Re-exports all public types, store implementations, and the main
 * `RateLimiter` class. Import from this barrel for application code.
 *
 * @example
 * ```ts
 * import { RateLimiter } from './rate_limiter/index.js';
 *
 * const limiter = RateLimiter.tokenBucket({ capacity: 100, windowMs: 1000 });
 * const result = await limiter.consume('user:42');
 * ```
 */

// Core class and factory options
export {
  RateLimiter,
  type TokenBucketOptions,
  type SlidingWindowOptions,
  type FixedWindowOptions,
} from './rate-limiter.js';

// Types
export type {
  Algorithm,
  IRateLimiter,
  RateLimiterConfig,
  RateLimitResult,
  RateLimitStore,
  RateLimitEntry,
} from './types.js';

// Stores
export { MemoryStore, FileStore } from './stores/index.js';
export type { MemoryStoreOptions, FileStoreOptions } from './stores/index.js';

// Algorithm primitives (advanced usage)
export {
  tokenBucketCheck,
  tokenBucketConsume,
  slidingWindowCheck,
  slidingWindowConsume,
  fixedWindowCheck,
  fixedWindowConsume,
} from './algorithms/index.js';
