/**
 * @goodvibes/rate-limiter
 *
 * Standalone TypeScript rate limiting library. Provides three battle-tested
 * algorithms backed by a pluggable store interface:
 *
 * - {@link TokenBucket}        -- smooth burst control
 * - {@link SlidingWindowLog}   -- precise per-window counting
 * - {@link FixedWindowCounter} -- lightweight fixed-window counter
 *
 * @module @goodvibes/rate-limiter
 */

// Core types
export type { RateLimitResult, IRateLimiter, IStore } from './types.js';

// Algorithm implementations
export { TokenBucket } from './algorithms/token-bucket.js';
export { SlidingWindowLog } from './algorithms/sliding-window-log.js';
export { FixedWindowCounter } from './algorithms/fixed-window-counter.js';

// Facade
export { RateLimiter } from './rate-limiter.js';
export type { TokenBucketOptions, WindowOptions } from './rate-limiter.js';

// Middleware utilities
export { RateLimitError, withRateLimit, composeLimiters, batchRateLimit } from './middleware.js';

// Presets
export { PRESETS, fromPreset } from './presets.js';
export type { PresetName } from './presets.js';

// Store implementations
export { FileStore, MemoryStore } from './stores/index.js';
export type { FileStoreOptions, MemoryStoreOptions } from './stores/index.js';
