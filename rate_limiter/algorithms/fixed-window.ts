/**
 * Fixed Window Counter Algorithm
 *
 * Divides time into discrete windows of `windowMs` duration. A counter
 * increments on each request and resets at the start of each new window.
 * This is the simplest and lowest-overhead algorithm. Its main trade-off is
 * a potential 2x burst at window boundaries (up to `maxRequests` at the end
 * of one window and another `maxRequests` at the start of the next).
 */

import type {
  RateLimiterConfig,
  RateLimitEntry,
  RateLimitResult,
  RateLimitStore,
} from '../types.js';

/**
 * Compute the start timestamp (ms) of the window that contains `now`.
 *
 * @param now      - Current timestamp in ms.
 * @param windowMs - Window duration in ms.
 */
function windowStart(now: number, windowMs: number): number {
  return Math.floor(now / windowMs) * windowMs;
}

/**
 * Return a fresh entry for the window that contains `now`.
 *
 * @param now      - Current timestamp in ms.
 * @param windowMs - Window duration in ms.
 */
function createEntry(now: number, windowMs: number): RateLimitEntry {
  const start = windowStart(now, windowMs);
  return {
    count: 0,
    tokens: 0,
    windowStart: start,
    lastRefill: 0,
    expiresAt: start + windowMs * 2,
  };
}

/**
 * Check whether the next request would be allowed without recording it.
 *
 * @param key    - Client identifier.
 * @param config - Rate-limiter configuration.
 * @param store  - Backing store.
 * @returns RateLimitResult.
 */
export async function fixedWindowCheck(
  key: string,
  config: RateLimiterConfig,
  store: RateLimitStore,
): Promise<RateLimitResult> {
  const { maxRequests, windowMs } = config;
  const now = Date.now();
  const currentWindowStart = windowStart(now, windowMs);

  let entry = await store.get(key);

  // Reset if the stored window is stale.
  if (!entry || entry.windowStart < currentWindowStart) {
    entry = createEntry(now, windowMs);
  }

  const allowed = entry.count < maxRequests;
  const remaining = Math.max(0, maxRequests - entry.count - (allowed ? 1 : 0));
  const resetAt = entry.windowStart + windowMs;
  const retryAfter = allowed ? 0 : resetAt - now;

  return { allowed, remaining, retryAfter, limit: maxRequests, resetAt };
}

/**
 * Consume one request slot for the given key.
 *
 * @param key    - Client identifier.
 * @param config - Rate-limiter configuration.
 * @param store  - Backing store.
 * @returns RateLimitResult.
 */
export async function fixedWindowConsume(
  key: string,
  config: RateLimiterConfig,
  store: RateLimitStore,
): Promise<RateLimitResult> {
  const { maxRequests, windowMs } = config;
  const now = Date.now();
  const currentWindowStart = windowStart(now, windowMs);

  // Capture the allow decision inside the closure to eliminate TOCTOU.
  // The closure runs atomically (MemoryStore: synchronous; FileStore: per-key mutex).
  let allowed = false;
  const entry = await store.atomicUpdate(key, (existing) => {
    // Reset if the stored window is stale or missing.
    const e =
      !existing || existing.windowStart < currentWindowStart
        ? createEntry(now, windowMs)
        : { ...existing };

    if (e.count < maxRequests) {
      allowed = true;
      e.count += 1;
      e.expiresAt = e.windowStart + windowMs * 2;
    }
    return e;
  });

  const remaining = Math.max(0, maxRequests - entry.count);
  const resetAt = entry.windowStart + windowMs;
  const retryAfter = allowed ? 0 : resetAt - now;

  return { allowed, remaining, retryAfter, limit: maxRequests, resetAt };
}
