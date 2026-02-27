import type { IRateLimiter, RateLimitResult } from './types.js';

/**
 * Error thrown when a rate limit check denies a request.
 *
 * Contains the full RateLimitResult for introspection and a convenience
 * `retryAfterMs` field for consumer retry logic.
 *
 * @example
 * try {
 *   await withRateLimit(limiter, 'user:42', () => callApi());
 * } catch (err) {
 *   if (err instanceof RateLimitError) {
 *     console.log(`Retry in ${err.retryAfterMs}ms`);
 *   }
 * }
 */
export class RateLimitError extends Error {
  /** The full rate limit result that caused the denial. */
  readonly result: RateLimitResult;

  /**
   * Milliseconds until the client may retry, or null if unknown.
   * Derived from `result.retryAfterMs` when available.
   */
  readonly retryAfterMs: number | null;

  /**
   * @param result - The RateLimitResult returned by the limiter.
   */
  constructor(result: RateLimitResult) {
    super(
      `Rate limit exceeded. Retry after ${
        result.retryAfterMs != null ? `${result.retryAfterMs}ms` : 'an unknown duration'
      }.`
    );
    this.name = 'RateLimitError';
    this.result = result;
    this.retryAfterMs = result.retryAfterMs ?? null;

    // Maintain proper prototype chain for instanceof checks.
    Object.setPrototypeOf(this, RateLimitError.prototype);
  }
}

/**
 * Higher-order function that gates execution of `fn` behind a rate limit check.
 *
 * Consumes one or more tokens for `key`. If the limiter denies the request,
 * throws a `RateLimitError` without calling `fn`. Otherwise, calls and awaits `fn`.
 *
 * @param limiter - The rate limiter to use.
 * @param key     - Unique identifier for the rate-limited entity.
 * @param fn      - Async function to execute if the request is allowed.
 * @param tokens  - Tokens to consume. Default: 1.
 * @returns The resolved value of `fn`.
 * @throws {RateLimitError} If the rate limit is exceeded.
 * @throws Propagates any error thrown by `fn` without affecting the rate limit state.
 *
 * @example
 * const data = await withRateLimit(limiter, `user:${userId}`, () => fetchData());
 */
export async function withRateLimit<T>(
  limiter: IRateLimiter,
  key: string,
  fn: () => Promise<T>,
  tokens?: number,
): Promise<T> {
  const result = await limiter.consume(key, tokens);

  if (!result.allowed) {
    throw new RateLimitError(result);
  }

  return fn();
}

/**
 * Combines multiple rate limiters into a single logical limiter.
 *
 * All limiters are checked in parallel. A request is allowed only when every
 * limiter allows it. The result reflects the most restrictive outcome:
 * - `allowed` is true only if all limiters allow.
 * - `remaining` is the minimum remaining across all limiters.
 * - `retryAfterMs` is the maximum retry delay across denying limiters.
 * - `resetAtMs` is the maximum reset time across all limiters.
 * - `limit` is the minimum limit across all limiters.
 *
 * @remarks
 * **Consumption is not atomic.** When `consume` is called, all composed
 * limiters consume capacity concurrently — even if one or more of them deny
 * the request. If atomic all-or-nothing behaviour is required, check first
 * with `check()` and only call `consume()` when all limiters would allow.
 *
 * @param limiters - One or more limiters to compose.
 * @returns A synthetic IRateLimiter that enforces all composed policies.
 * @throws {Error} If called with zero limiters.
 *
 * @example
 * const composed = composeLimiters(perUserLimiter, globalLimiter);
 * const result = await composed.consume('user:42');
 */
export function composeLimiters(...limiters: IRateLimiter[]): IRateLimiter {
  if (limiters.length === 0) {
    throw new Error('composeLimiters requires at least one limiter.');
  }

  /**
   * Merges an array of RateLimitResults into the most restrictive outcome.
   */
  function mergeResults(results: RateLimitResult[]): RateLimitResult {
    const allowed = results.every((r) => r.allowed);

    const denyingResults = results.filter((r) => !r.allowed);
    // -Infinity seed + isFinite() guard: if all denying limiters return retryAfterMs: null,
    // the reduce never updates from -Infinity, and isFinite(-Infinity) === false yields null.
    const rawRetryAfterMs = denyingResults.reduce<number>(
      (max, r) => (r.retryAfterMs != null ? Math.max(max, r.retryAfterMs) : max),
      -Infinity
    );
    const retryAfterMs: number | null = isFinite(rawRetryAfterMs) ? rawRetryAfterMs : null;

    const remaining = results.reduce(
      (min, r) => Math.min(min, r.remaining),
      Infinity
    );

    const resetAtMs = results.reduce(
      (max, r) => Math.max(max, r.resetAtMs),
      -Infinity
    );

    const limit = results.reduce(
      (min, r) => Math.min(min, r.limit),
      Infinity
    );

    return {
      allowed,
      remaining: isFinite(remaining) ? remaining : 0,
      retryAfterMs,
      resetAtMs: isFinite(resetAtMs) ? resetAtMs : Date.now(),
      limit: isFinite(limit) ? limit : 0,
    };
  }

  return {
    async check(key: string): Promise<RateLimitResult> {
      const results = await Promise.all(limiters.map((l) => l.check(key)));
      return mergeResults(results);
    },

    async consume(key: string, tokens?: number): Promise<RateLimitResult> {
      const results = await Promise.all(limiters.map((l) => l.consume(key, tokens)));
      return mergeResults(results);
    },

    async reset(key: string): Promise<void> {
      await Promise.all(limiters.map((l) => l.reset(key)));
    },

    async dispose(): Promise<void> {
      await Promise.all(limiters.map((l) => l.dispose()));
    },
  };
}

/**
 * Consumes rate limit capacity for multiple keys in parallel.
 *
 * Each key is processed concurrently using `limiter.consume()` — this deducts
 * capacity for each key, not just checks it. Use `limiter.check()` directly
 * if you want a read-only probe that does not consume capacity.
 *
 * Results are collected into a Map keyed by the original key string.
 *
 * @param limiter - The rate limiter to consume against.
 * @param keys    - Array of keys to consume. An empty array returns an empty Map.
 * @param tokens  - Tokens to consume per key. Default: 1.
 * @returns A Map from each key to its RateLimitResult.
 *
 * @example
 * const results = await batchConsume(limiter, ['user:1', 'user:2', 'user:3']);
 * for (const [key, result] of results) {
 *   if (!result.allowed) console.log(`${key} is rate limited`);
 * }
 */
export async function batchRateLimit(
  limiter: IRateLimiter,
  keys: string[],
  tokens?: number,
): Promise<Map<string, RateLimitResult>> {
  const entries = await Promise.all(
    keys.map(async (key) => {
      const result = await limiter.consume(key, tokens);
      return [key, result] as const;
    })
  );

  return new Map(entries);
}
