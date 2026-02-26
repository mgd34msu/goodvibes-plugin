/**
 * Sliding Window Counter Algorithm
 *
 * Blends the count from the previous completed window and the count in the
 * current window using a weighted average based on the fraction of the
 * current window that has elapsed. This eliminates the hard-reset spike that
 * affects fixed-window implementations while keeping memory usage constant
 * (only two window buckets per key).
 *
 * Formula:
 *   effectiveCount = previousCount * (1 - elapsed/windowMs) + currentCount
 */

import type {
  RateLimiterConfig,
  RateLimitEntry,
  RateLimitResult,
  RateLimitStore,
} from '../types.js';

/**
 * Return a fresh entry for the current window.
 *
 * @param now      - Current timestamp in ms.
 * @param windowMs - Window duration in ms.
 */
function createEntry(now: number, windowMs: number): RateLimitEntry {
  return {
    count: 0,
    tokens: 0, // stores previous-window count
    windowStart: now,
    lastRefill: 0, // unused for sliding-window
    expiresAt: now + windowMs * 2,
  };
}

/**
 * Calculate the weighted effective request count.
 *
 * @param entry    - Current store entry.
 * @param now      - Current timestamp in ms.
 * @param windowMs - Window duration in ms.
 * @returns Fractional effective count (may be non-integer).
 */
function effectiveCount(
  entry: RateLimitEntry,
  now: number,
  windowMs: number,
): number {
  const elapsed = now - entry.windowStart;
  const prevWeight = Math.max(0, 1 - elapsed / windowMs);
  // `tokens` field repurposed to hold the previous window count.
  return entry.tokens * prevWeight + entry.count;
}

/**
 * Roll the window forward if the current window has expired.
 * Mutates entry in place.
 *
 * @param entry    - Mutable store entry.
 * @param now      - Current timestamp in ms.
 * @param windowMs - Window duration in ms.
 */
function maybeRollWindow(
  entry: RateLimitEntry,
  now: number,
  windowMs: number,
): void {
  const elapsed = now - entry.windowStart;
  if (elapsed >= windowMs) {
    // How many full windows have passed?
    const windowsSkipped = Math.floor(elapsed / windowMs);
    if (windowsSkipped === 1) {
      // Previous window becomes old; current count becomes new previous.
      entry.tokens = entry.count;
    } else {
      // More than one window has passed — previous is effectively zero.
      entry.tokens = 0;
    }
    entry.count = 0;
    entry.windowStart = entry.windowStart + windowsSkipped * windowMs;
  }
}

/**
 * Check whether the next request would be allowed without recording it.
 *
 * @param key    - Client identifier.
 * @param config - Rate-limiter configuration.
 * @param store  - Backing store.
 * @returns RateLimitResult.
 */
export async function slidingWindowCheck(
  key: string,
  config: RateLimiterConfig,
  store: RateLimitStore,
): Promise<RateLimitResult> {
  const { maxRequests, windowMs } = config;
  const now = Date.now();

  let entry = await store.get(key);
  if (!entry) {
    entry = createEntry(now, windowMs);
  } else {
    maybeRollWindow(entry, now, windowMs);
  }

  const current = effectiveCount(entry, now, windowMs);
  const allowed = current < maxRequests;
  const remaining = Math.max(0, Math.floor(maxRequests - current));

  // retryAfter: how long until effective count drops below the limit.
  let retryAfter = 0;
  if (!allowed) {
    // Effective count decreases as prev-window weight decreases.
    // Solve: tokens * (1 - x/windowMs) + count - 1 < maxRequests for x.
    // x = windowMs * (1 - (maxRequests - count) / tokens)
    const prevCount = entry.tokens;
    if (prevCount > 0) {
      const needed = maxRequests - entry.count;
      if (needed < 0) {
        // Even ignoring prev window, still over limit — wait full window.
        retryAfter = windowMs - (now - entry.windowStart);
      } else {
        const ratio = 1 - needed / prevCount;
        retryAfter = Math.ceil(ratio * windowMs) - (now - entry.windowStart);
      }
    } else {
      retryAfter = windowMs - (now - entry.windowStart);
    }
    retryAfter = Math.max(0, retryAfter);
  }

  const resetAt = entry.windowStart + windowMs;

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
export async function slidingWindowConsume(
  key: string,
  config: RateLimiterConfig,
  store: RateLimitStore,
): Promise<RateLimitResult> {
  const { maxRequests, windowMs } = config;
  const now = Date.now();

  // Use atomicUpdate to prevent the race condition where two concurrent
  // callers both read the same state and both decide to allow the request.
  // Capture the allow decision inside the closure to eliminate TOCTOU.
  let allowed = false;
  const entry = await store.atomicUpdate(key, (existing) => {
    const e = existing ? { ...existing } : createEntry(now, windowMs);
    if (existing) maybeRollWindow(e, now, windowMs);

    const current = effectiveCount(e, now, windowMs);
    if (current < maxRequests) {
      allowed = true;
      e.count += 1;
    }
    e.expiresAt = now + windowMs * 2;
    return e;
  });

  const postCount = effectiveCount(entry, now, windowMs);
  const remaining = Math.max(0, Math.floor(maxRequests - postCount));

  let retryAfter = 0;
  if (!allowed) {
    const prevCount = entry.tokens;
    if (prevCount > 0) {
      const needed = maxRequests - entry.count;
      if (needed < 0) {
        retryAfter = windowMs - (now - entry.windowStart);
      } else {
        const ratio = 1 - needed / prevCount;
        retryAfter = Math.ceil(ratio * windowMs) - (now - entry.windowStart);
      }
    } else {
      retryAfter = windowMs - (now - entry.windowStart);
    }
    retryAfter = Math.max(0, retryAfter);
  }

  const resetAt = entry.windowStart + windowMs;

  return { allowed, remaining, retryAfter, limit: maxRequests, resetAt };
}
