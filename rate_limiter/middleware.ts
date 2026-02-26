import type { RateLimitResult, IRateLimiter } from './types.js';

/**
 * Alias for `IRateLimiter` — re-exported for backward compatibility.
 * New code should import `IRateLimiter` directly from `types.js`.
 *
 * @deprecated Use `IRateLimiter` from `./types.js` directly.
 */
export type RateLimiterLike = IRateLimiter;

// ---------------------------------------------------------------------------
// RateLimitError
// ---------------------------------------------------------------------------

/**
 * Thrown by withRateLimit when the rate limit is exceeded.
 * The `result` property contains the full RateLimitResult for inspection.
 */
export class RateLimitError extends Error {
  readonly result: RateLimitResult;

  constructor(result: RateLimitResult) {
    super(
      `Rate limit exceeded. Retry after ${result.retryAfter}ms. ` +
        `Limit: ${result.limit}, remaining: ${result.remaining}.`,
    );
    this.name = 'RateLimitError';
    this.result = result;
  }
}

// ---------------------------------------------------------------------------
// withRateLimit
// ---------------------------------------------------------------------------

/**
 * Consume one token from `limiter` for `key`. If allowed, execute `fn` and
 * return its result. If not allowed, throw RateLimitError without calling `fn`.
 *
 * @example
 * const data = await withRateLimit(limiter, 'user:42', () => fetchData());
 */
export async function withRateLimit<T>(
  limiter: RateLimiterLike,
  key: string,
  fn: () => Promise<T>,
): Promise<T> {
  const result = await limiter.consume(key);
  if (!result.allowed) {
    throw new RateLimitError(result);
  }
  return fn();
}

// ---------------------------------------------------------------------------
// batchRateLimit
// ---------------------------------------------------------------------------

/**
 * Check (without consuming) multiple keys in parallel.
 * Returns a Map from key to its RateLimitResult.
 *
 * @example
 * const results = await batchRateLimit(limiter, ['user:1', 'user:2']);
 * if (results.get('user:1')!.allowed) { ... }
 */
export async function batchRateLimit(
  limiter: RateLimiterLike,
  keys: string[],
): Promise<Map<string, RateLimitResult>> {
  const pairs = await Promise.all(
    keys.map(async (key) => [key, await limiter.check(key)] as const),
  );
  return new Map(pairs);
}

// ---------------------------------------------------------------------------
// composeLimiters
// ---------------------------------------------------------------------------

/**
 * Returns a RateLimiter-like object that requires ALL provided limiters to
 * allow a request. On consume, all limiters are checked first; if any denies,
 * no tokens are consumed and the most-restrictive result is returned.
 *
 * On check, all limiters are checked in parallel and the strictest result
 * (lowest remaining, soonest resetAt) is returned.
 *
 * On dispose, all underlying limiters are disposed.
 *
 * @note **TOCTOU limitation**: `consume` is not fully atomic under concurrency.
 * There is a window between the pre-flight `check` phase and the actual
 * `consume` phase during which another caller may exhaust tokens in one of the
 * underlying limiters. For strict atomicity, use a single shared limiter
 * instead of composed ones, or implement rollback on partial failure.
 */
export function composeLimiters(...limiters: RateLimiterLike[]): RateLimiterLike {
  if (limiters.length === 0) {
    throw new Error('composeLimiters requires at least one limiter');
  }

  function strictest(results: RateLimitResult[]): RateLimitResult {
    // If any deny, the composition denies.
    const denied = results.find((r) => !r.allowed);
    if (denied) {
      return {
        allowed: false,
        remaining: Math.min(...results.map((r) => r.remaining)),
        retryAfter: Math.max(...results.map((r) => r.retryAfter)),
        limit: Math.min(...results.map((r) => r.limit)),
        resetAt: Math.max(...results.map((r) => r.resetAt)),
      };
    }
    // All allow — return the most constrained passing result.
    return {
      allowed: true,
      remaining: Math.min(...results.map((r) => r.remaining)),
      retryAfter: 0,
      limit: Math.min(...results.map((r) => r.limit)),
      resetAt: Math.max(...results.map((r) => r.resetAt)),
    };
  }

  return {
    async check(key: string): Promise<RateLimitResult> {
      const results = await Promise.all(limiters.map((l) => l.check(key)));
      return strictest(results);
    },

    async consume(key: string, tokens?: number): Promise<RateLimitResult> {
      // Pre-flight: check all without consuming.
      const checks = await Promise.all(limiters.map((l) => l.check(key)));
      const preResult = strictest(checks);
      if (!preResult.allowed) {
        return preResult;
      }
      // All allow — now consume from all.
      //
      // TOCTOU note: There is a window between the check phase above and the
      // consume phase below during which another caller may consume tokens from
      // one of the underlying limiters, causing the consume to fail even though
      // the check passed. This means composeLimiters does NOT provide atomic
      // all-or-nothing semantics.
      //
      // Mitigation for production use:
      //   • Use a single shared rate-limiter instead of composed ones for
      //     strict atomicity requirements.
      //   • Or implement rollback by calling reset() on successfully consumed
      //     limiters when a later one denies, accepting the extra overhead.
      const consumed = await Promise.all(limiters.map((l) => l.consume(key, tokens)));
      return strictest(consumed);
    },

    async reset(key: string): Promise<void> {
      await Promise.all(limiters.map((l) => l.reset(key)));
    },

    async dispose(): Promise<void> {
      await Promise.all(limiters.map((l) => l.dispose()));
    },
  };
}
