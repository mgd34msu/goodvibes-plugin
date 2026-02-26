/**
 * Rate Limiter — Core Types
 *
 * All shared interfaces, types, and enums for the rate limiter module.
 */

// ---------------------------------------------------------------------------
// Algorithm
// ---------------------------------------------------------------------------

/**
 * Supported rate-limiting algorithms.
 *
 * - `token-bucket`    — Smooth bursting; tokens refill continuously.
 * - `sliding-window`  — Weighted blend of two fixed windows; no hard resets.
 * - `fixed-window`    — Simple counter reset per window; lowest overhead.
 */
export type Algorithm = 'token-bucket' | 'sliding-window' | 'fixed-window';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Configuration for a RateLimiter instance.
 */
export interface RateLimiterConfig {
  /** Algorithm to use for rate limiting. */
  algorithm: Algorithm;

  /**
   * Maximum number of requests (or tokens for token-bucket) allowed within
   * `windowMs`. For token-bucket, this value is used when
   * `tokenBucketCapacity` is not explicitly set.
   */
  maxRequests: number;

  /**
   * Window duration in milliseconds.
   *
   * - `fixed-window` / `sliding-window`: the counting window.
   * - `token-bucket`: the refill period for `tokenBucketRefillRate` tokens.
   */
  windowMs: number;

  /**
   * Maximum token capacity for the token-bucket algorithm.
   * Defaults to `maxRequests` when omitted.
   */
  tokenBucketCapacity?: number;

  /**
   * Number of tokens added per `windowMs` period for the token-bucket
   * algorithm. Defaults to `maxRequests` when omitted.
   */
  tokenBucketRefillRate?: number;
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

/**
 * Result returned by every check / consume call.
 */
export interface RateLimitResult {
  /** Whether the request is allowed. */
  allowed: boolean;

  /** Remaining requests (or tokens) in the current window/bucket. */
  remaining: number;

  /**
   * Milliseconds until the client should retry.
   * `0` when the request is allowed.
   */
  retryAfter: number;

  /** The configured request limit (capacity). */
  limit: number;

  /** Unix timestamp (ms) when the current window / bucket fully resets. */
  resetAt: number;
}

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// IRateLimiter interface
// ---------------------------------------------------------------------------

/**
 * Public interface for all rate limiter implementations.
 *
 * Extracted so that `RateLimiterLike` in middleware and the concrete
 * `RateLimiter` class can both satisfy a single shared contract without
 * duplication.
 */
export interface IRateLimiter {
  check(key: string): Promise<RateLimitResult>;
  consume(key: string, tokens?: number): Promise<RateLimitResult>;
  reset(key: string): Promise<void>;
  dispose(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Store entry
// ---------------------------------------------------------------------------

/**
 * Persistent entry stored per rate-limit key.
 *
 * Field semantics vary by algorithm — see inline notes.
 */
export interface RateLimitEntry {
  /**
   * Running request count.
   *
   * - `fixed-window`   — requests in the current window. Resets each window.
   * - `sliding-window` — requests in the current (partial) window.
   * - `token-bucket`   — cumulative tokens consumed (informational; not used
   *                      by the algorithm itself for gating decisions).
   */
  count: number;

  /**
   * Algorithm-specific secondary counter.
   *
   * - `token-bucket`   — current available token count (fractional; capped at
   *                      `capacity`). Decremented on consume, refilled over time.
   * - `sliding-window` — **repurposed** to hold the *previous* window's request
   *                      count, used by the weighted-blend formula. Do not
   *                      interpret as "tokens" in this context.
   * - `fixed-window`   — unused; always `0`.
   */
  tokens: number;

  /**
   * Unix timestamp (ms) at which the current window started.
   *
   * - `fixed-window` / `sliding-window` — the aligned window boundary.
   * - `token-bucket`   — the timestamp when the entry was first created.
   */
  windowStart: number;

  /**
   * Unix timestamp (ms) of the most recent token refill.
   *
   * - `token-bucket`   — updated on every get/consume call to enable fractional
   *                      token accumulation since the last access.
   * - Other algorithms — set to `0`; unused.
   */
  lastRefill: number;

  /** Unix timestamp (ms) after which the entry may be garbage-collected. */
  expiresAt: number;
}

/**
 * Storage backend used by the rate limiter.
 *
 * All methods are asynchronous to allow both in-process and remote
 * implementations (Redis, DynamoDB, etc.) behind a single interface.
 */
export interface RateLimitStore {
  /**
   * Retrieve an entry by key.
   * Resolves to `undefined` when the key does not exist or has expired.
   */
  get(key: string): Promise<RateLimitEntry | undefined>;

  /**
   * Persist an entry.
   * Any existing entry for the key is replaced entirely.
   */
  set(key: string, entry: RateLimitEntry): Promise<void>;

  /**
   * Remove an entry.
   * Silently succeeds when the key does not exist.
   */
  delete(key: string): Promise<void>;

  /**
   * Atomically increment the `count` field of an existing entry.
   * Returns the new count after incrementing.
   *
   * If no entry exists the implementation should create one with sensible
   * defaults before incrementing.
   */
  increment(key: string, by?: number): Promise<number>;

  /**
   * Atomically read-modify-write an entry.
   *
   * The supplied `fn` receives the current entry (or `undefined` if none
   * exists) and must return the new entry to persist. The implementation
   * guarantees that no concurrent caller can observe a partial update:
   *
   * - `MemoryStore` — synchronous map update; no I/O between read and write.
   * - `FileStore`   — per-key async mutex; concurrent calls for the same key
   *                    are serialised.
   *
   * @param key - Store key.
   * @param fn  - Pure transform: `(current) => next`.
   * @returns The entry returned by `fn` after it has been persisted.
   */
  atomicUpdate(
    key: string,
    fn: (entry: RateLimitEntry | undefined) => RateLimitEntry,
  ): Promise<RateLimitEntry>;

  /**
   * Remove all expired entries from the store.
   * Implementations may call this on a schedule or lazily.
   */
  cleanup(): Promise<void>;

  /**
   * Release all resources held by the store (timers, file handles, etc.).
   * Optional — implementations that hold no persistent resources may omit it.
   * The store must not be used after `dispose()` is called.
   */
  dispose?(): Promise<void>;
}
