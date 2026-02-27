import type { IRateLimiter, IStore, RateLimitResult } from './types.js';
import { TokenBucket } from './algorithms/token-bucket.js';
import { SlidingWindowLog } from './algorithms/sliding-window-log.js';
import { FixedWindowCounter } from './algorithms/fixed-window-counter.js';
import { MemoryStore } from './stores/memory-store.js';

/**
 * Options for creating a TokenBucket-backed RateLimiter.
 */
export interface TokenBucketOptions {
  /** Maximum number of tokens the bucket can hold. */
  capacity: number;
  /** Number of tokens added per second. */
  refillRate: number;
  /** Optional backing store. Defaults to MemoryStore. */
  store?: IStore;
}

/**
 * Options for creating a SlidingWindow or FixedWindow-backed RateLimiter.
 */
export interface WindowOptions {
  /** Maximum number of requests allowed in the window. */
  maxRequests: number;
  /** Duration of the window in milliseconds. */
  windowMs: number;
  /** Optional backing store. Defaults to MemoryStore. */
  store?: IStore;
}

/**
 * Facade class that wraps an IRateLimiter algorithm and delegates all
 * rate-limiting operations to it. Provides static factory methods for
 * creating instances backed by common algorithms.
 *
 * @example
 * const limiter = RateLimiter.tokenBucket({ capacity: 100, refillRate: 10 });
 * const result = await limiter.check('user:42');
 */
export class RateLimiter implements IRateLimiter {
  private readonly algorithm: IRateLimiter;
  private readonly store: IStore;

  /**
   * Creates a new RateLimiter wrapping the given algorithm.
   *
   * Prefer the static factory methods ({@link RateLimiter.tokenBucket},
   * {@link RateLimiter.slidingWindow}, {@link RateLimiter.fixedWindow}) over
   * calling this constructor directly.
   *
   * @param algorithm - The underlying rate-limiting algorithm to delegate to.
   * @param store     - The backing store used by the algorithm (held for disposal).
   */
  constructor(algorithm: IRateLimiter, store: IStore) {
    this.algorithm = algorithm;
    this.store = store;
  }

  /**
   * Checks whether the given key is within the rate limit without consuming
   * a token/slot.
   *
   * @param key - Unique identifier for the rate-limited entity.
   * @returns A RateLimitResult describing the current state.
   */
  async check(key: string): Promise<RateLimitResult> {
    return this.algorithm.check(key);
  }

  /**
   * Consumes a token/slot for the given key, returning whether the request
   * is allowed.
   *
   * @param key    - Unique identifier for the rate-limited entity.
   * @param tokens - Number of tokens to consume (default: 1). Must be >= 0.
   * @returns A RateLimitResult with `allowed` indicating if the request proceeds.
   * @throws {RangeError} If `tokens` is negative or non-finite.
   */
  async consume(key: string, tokens?: number): Promise<RateLimitResult> {
    return this.algorithm.consume(key, tokens);
  }

  /**
   * Resets the rate limit state for the given key.
   *
   * @param key - Unique identifier for the rate-limited entity.
   */
  async reset(key: string): Promise<void> {
    return this.algorithm.reset(key);
  }

  /**
   * Disposes the algorithm and the backing store, releasing all resources.
   * Should be called when the limiter is no longer needed.
   */
  async dispose(): Promise<void> {
    await Promise.all([
      this.algorithm.dispose(),
      this.store.dispose(),
    ]);
  }

  // ---------------------------------------------------------------------------
  // Static factory methods
  // ---------------------------------------------------------------------------

  /**
   * Creates a RateLimiter backed by the Token Bucket algorithm.
   *
   * The bucket fills at a constant rate up to the given capacity. Requests
   * consume one token each. When the bucket is empty, requests are denied.
   *
   * @param opts.capacity - Maximum token count.
   * @param opts.refillRate - Tokens added per second.
   * @param opts.store - Optional store. Defaults to MemoryStore.
   * @returns A configured RateLimiter instance.
   */
  static tokenBucket(opts: TokenBucketOptions): RateLimiter {
    const store = opts.store ?? new MemoryStore();
    const algorithm = new TokenBucket(opts.capacity, opts.refillRate, store);
    return new RateLimiter(algorithm, store);
  }

  /**
   * Creates a RateLimiter backed by the Sliding Window Log algorithm.
   *
   * Tracks exact request timestamps in a rolling window, providing accurate
   * rate limiting at the cost of higher memory usage.
   *
   * @param opts.maxRequests - Maximum requests allowed within the window.
   * @param opts.windowMs - Window duration in milliseconds.
   * @param opts.store - Optional store. Defaults to MemoryStore.
   * @returns A configured RateLimiter instance.
   */
  static slidingWindow(opts: WindowOptions): RateLimiter {
    const store = opts.store ?? new MemoryStore();
    const algorithm = new SlidingWindowLog(opts.maxRequests, opts.windowMs, store);
    return new RateLimiter(algorithm, store);
  }

  /**
   * Creates a RateLimiter backed by the Fixed Window Counter algorithm.
   *
   * Counts requests in fixed time buckets. More memory-efficient than sliding
   * window, but can allow bursts at window boundaries.
   *
   * @param opts.maxRequests - Maximum requests allowed within each window.
   * @param opts.windowMs - Window duration in milliseconds.
   * @param opts.store - Optional store. Defaults to MemoryStore.
   * @returns A configured RateLimiter instance.
   */
  static fixedWindow(opts: WindowOptions): RateLimiter {
    const store = opts.store ?? new MemoryStore();
    const algorithm = new FixedWindowCounter(opts.maxRequests, opts.windowMs, store);
    return new RateLimiter(algorithm, store);
  }
}
