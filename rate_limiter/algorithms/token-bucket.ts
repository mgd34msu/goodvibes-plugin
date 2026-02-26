/**
 * Token Bucket Algorithm
 *
 * Tokens accumulate continuously at a fixed refill rate up to a maximum
 * capacity. Each request consumes one or more tokens. Supports smooth
 * bursting: a client that has been idle accumulates tokens and can burst
 * up to the full bucket capacity without being penalised.
 */

import type {
  RateLimiterConfig,
  RateLimitEntry,
  RateLimitResult,
  RateLimitStore,
} from '../types.js';

/**
 * Derive effective bucket parameters from the supplied config.
 */
function resolveParams(config: RateLimiterConfig): {
  capacity: number;
  refillRate: number; // tokens per ms
  windowMs: number;
} {
  const capacity = config.tokenBucketCapacity ?? config.maxRequests;
  const refillPerWindow = config.tokenBucketRefillRate ?? config.maxRequests;
  // Convert tokens-per-window to tokens-per-millisecond for fractional accumulation.
  const refillRate = refillPerWindow / config.windowMs;
  return { capacity, refillRate, windowMs: config.windowMs };
}

/**
 * Return a fresh entry initialised to a full bucket.
 *
 * @param capacity - Maximum token count.
 * @param windowMs - Used to calculate the expiry TTL.
 */
function createEntry(capacity: number, windowMs: number): RateLimitEntry {
  const now = Date.now();
  return {
    count: 0,
    tokens: capacity,
    windowStart: now,
    lastRefill: now,
    expiresAt: now + windowMs * 2,
  };
}

/**
 * Refill the bucket based on elapsed time since `lastRefill`.
 * Mutates the entry in place; token count is capped at `capacity`.
 *
 * @param entry     - Mutable store entry.
 * @param now       - Current timestamp in ms.
 * @param refillRate - Tokens added per millisecond.
 * @param capacity  - Maximum tokens allowed.
 */
function refillTokens(
  entry: RateLimitEntry,
  now: number,
  refillRate: number,
  capacity: number,
): void {
  const elapsed = now - entry.lastRefill;
  if (elapsed > 0) {
    const gained = elapsed * refillRate;
    entry.tokens = Math.min(capacity, entry.tokens + gained);
    entry.lastRefill = now;
  }
}

/**
 * Check whether `tokens` are available without consuming them.
 *
 * @param key     - Client identifier.
 * @param config  - Rate-limiter configuration.
 * @param store   - Backing store.
 * @param tokens  - Tokens to check (default 1).
 * @returns RateLimitResult with accurate remaining / retryAfter values.
 */
export async function tokenBucketCheck(
  key: string,
  config: RateLimiterConfig,
  store: RateLimitStore,
  tokens: number = 1,
): Promise<RateLimitResult> {
  const { capacity, refillRate, windowMs } = resolveParams(config);
  const now = Date.now();

  let entry = await store.get(key);
  if (!entry) {
    entry = createEntry(capacity, windowMs);
  } else {
    refillTokens(entry, now, refillRate, capacity);
  }

  const remaining = Math.floor(entry.tokens);
  const allowed = entry.tokens >= tokens;

  // Milliseconds until enough tokens accumulate for the requested amount.
  let retryAfter = 0;
  if (!allowed) {
    const deficit = tokens - entry.tokens;
    retryAfter = Math.ceil(deficit / refillRate);
  }

  // resetAt: when the bucket would be completely full from the current level.
  const tokensNeeded = capacity - entry.tokens;
  const resetAt = now + Math.ceil(tokensNeeded / refillRate);

  return { allowed, remaining, retryAfter, limit: capacity, resetAt };
}

/**
 * Consume `tokens` from the bucket if available.
 *
 * @param key     - Client identifier.
 * @param config  - Rate-limiter configuration.
 * @param store   - Backing store.
 * @param tokens  - Tokens to consume (default 1).
 * @returns RateLimitResult with accurate remaining / retryAfter values.
 */
export async function tokenBucketConsume(
  key: string,
  config: RateLimiterConfig,
  store: RateLimitStore,
  tokens: number = 1,
): Promise<RateLimitResult> {
  const { capacity, refillRate, windowMs } = resolveParams(config);
  const now = Date.now();

  // Capture the allow decision inside the atomic closure to prevent TOCTOU.
  // The closure is called synchronously (MemoryStore) or under a per-key
  // mutex (FileStore), so no concurrent caller can interleave.
  let allowed = false;
  const entry = await store.atomicUpdate(key, (existing) => {
    const e = existing ? { ...existing } : createEntry(capacity, windowMs);
    if (existing) refillTokens(e, now, refillRate, capacity);

    if (e.tokens >= tokens) {
      allowed = true;
      e.tokens -= tokens;
      e.count += tokens;
    }
    // Update TTL: keep alive for at least one more refill window.
    e.expiresAt = now + windowMs * 2;
    return e;
  });

  const remaining = Math.max(0, Math.floor(entry.tokens));

  let retryAfter = 0;
  if (!allowed) {
    const deficit = tokens - entry.tokens;
    retryAfter = Math.ceil(deficit / refillRate);
  }

  const tokensNeeded = capacity - entry.tokens;
  const resetAt = now + Math.ceil(Math.max(0, tokensNeeded) / refillRate);

  return { allowed, remaining, retryAfter, limit: capacity, resetAt };
}
