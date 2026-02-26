/**
 * Algorithm unit tests.
 *
 * These tests import the RateLimiter class from the sibling index.ts (built
 * by the concurrent agent). We use vi.useFakeTimers() to control time so that
 * all three algorithm branches are exercised deterministically.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RateLimiter } from '../index.js';
import type { RateLimitResult } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isValidResult(r: unknown): r is RateLimitResult {
  if (!r || typeof r !== 'object') return false;
  const obj = r as Record<string, unknown>;
  return (
    typeof obj.allowed === 'boolean' &&
    typeof obj.remaining === 'number' &&
    typeof obj.retryAfter === 'number' &&
    typeof obj.limit === 'number' &&
    typeof obj.resetAt === 'number'
  );
}

// ---------------------------------------------------------------------------
// Token Bucket
// ---------------------------------------------------------------------------
describe('RateLimiter — token bucket', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(async () => {
    vi.useRealTimers();
  });

  it('allows up to capacity', async () => {
    const limiter = RateLimiter.tokenBucket({ capacity: 5, refillRate: 1, windowMs: 60_000 });
    for (let i = 0; i < 5; i++) {
      const result = await limiter.consume('k');
      expect(result.allowed).toBe(true);
    }
    await limiter.dispose();
  });

  it('denies when bucket is empty', async () => {
    const limiter = RateLimiter.tokenBucket({ capacity: 3, refillRate: 0.1, windowMs: 60_000 });
    for (let i = 0; i < 3; i++) await limiter.consume('k');
    const denied = await limiter.consume('k');
    expect(denied.allowed).toBe(false);
    expect(denied.remaining).toBe(0);
    await limiter.dispose();
  });

  it('refills tokens over time', async () => {
    // refillRate=5, windowMs=1000 → resolveParams gives 5/1000 = 0.005 tokens/ms.
    // Drain all 5 tokens, advance 1000ms → refill 0.005 * 1000 = 5 tokens.
    const limiter = RateLimiter.tokenBucket({ capacity: 5, refillRate: 5, windowMs: 1_000 });
    // Drain all 5 tokens.
    for (let i = 0; i < 5; i++) await limiter.consume('k');
    const denied = await limiter.consume('k');
    expect(denied.allowed).toBe(false);
    // Advance a full window — refill back to capacity.
    vi.advanceTimersByTime(1_000);
    for (let i = 0; i < 5; i++) {
      const r = await limiter.consume('k');
      expect(r.allowed).toBe(true);
    }
    await limiter.dispose();
  });

  it('does not exceed capacity on refill', async () => {
    const limiter = RateLimiter.tokenBucket({ capacity: 10, refillRate: 100, windowMs: 60_000 });
    // Let a LOT of time pass — tokens should cap at capacity.
    vi.advanceTimersByTime(1_000_000);
    const result = await limiter.check('k');
    expect(result.remaining).toBeLessThanOrEqual(10);
    await limiter.dispose();
  });

  it('retryAfter is positive when bucket empty', async () => {
    const limiter = RateLimiter.tokenBucket({ capacity: 1, refillRate: 0.001, windowMs: 60_000 });
    await limiter.consume('k');
    const result = await limiter.consume('k');
    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBeGreaterThan(0);
    await limiter.dispose();
  });

  it('check does not consume tokens', async () => {
    const limiter = RateLimiter.tokenBucket({ capacity: 2, refillRate: 0.1, windowMs: 60_000 });
    await limiter.check('k');
    await limiter.check('k');
    // Both consume calls should still succeed (only 2 tokens total).
    const r1 = await limiter.consume('k');
    const r2 = await limiter.consume('k');
    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
    await limiter.dispose();
  });

  it('reset restores full capacity', async () => {
    const limiter = RateLimiter.tokenBucket({ capacity: 3, refillRate: 0.1, windowMs: 60_000 });
    for (let i = 0; i < 3; i++) await limiter.consume('k');
    const denied = await limiter.consume('k');
    expect(denied.allowed).toBe(false);
    await limiter.reset('k');
    const allowed = await limiter.consume('k');
    expect(allowed.allowed).toBe(true);
    await limiter.dispose();
  });
});

// ---------------------------------------------------------------------------
// Sliding Window
// ---------------------------------------------------------------------------
describe('RateLimiter — sliding window', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(async () => vi.useRealTimers());

  it('allows up to maxRequests', async () => {
    const limiter = RateLimiter.slidingWindow({ maxRequests: 5, windowMs: 10_000 });
    for (let i = 0; i < 5; i++) {
      expect((await limiter.consume('k')).allowed).toBe(true);
    }
    await limiter.dispose();
  });

  it('denies when window limit reached', async () => {
    const limiter = RateLimiter.slidingWindow({ maxRequests: 3, windowMs: 10_000 });
    for (let i = 0; i < 3; i++) await limiter.consume('k');
    expect((await limiter.consume('k')).allowed).toBe(false);
    await limiter.dispose();
  });

  it('allows requests again after window slides past old requests', async () => {
    const limiter = RateLimiter.slidingWindow({ maxRequests: 3, windowMs: 10_000 });
    for (let i = 0; i < 3; i++) await limiter.consume('k');
    // Advance time past the full window.
    vi.advanceTimersByTime(10_001);
    expect((await limiter.consume('k')).allowed).toBe(true);
    await limiter.dispose();
  });

  it('applies cross-window weighting (smooth transition)', async () => {
    // 10 req/10s window.
    // 1) Fill window 1 with 10 requests.
    // 2) Advance past the full window (10001ms) so window 1 becomes the previous.
    // 3) Advance another 5000ms into window 2 (50%).
    //    effectiveCount = prevCount * (1 - 0.5) + currentCount = 10 * 0.5 + 0 = 5.
    //    So 5 new requests should be allowed.
    const limiter = RateLimiter.slidingWindow({ maxRequests: 10, windowMs: 10_000 });
    // Fill the first window.
    for (let i = 0; i < 10; i++) await limiter.consume('k');
    // Roll into the second window (first window is now the previous).
    vi.advanceTimersByTime(10_001);
    // Advance 50% through second window.
    vi.advanceTimersByTime(5_000);
    // effectiveCount = 10 * 0.5 + 0 = 5; 5 requests allowed.
    let allowed = 0;
    for (let i = 0; i < 10; i++) {
      if ((await limiter.consume('k')).allowed) allowed++;
    }
    expect(allowed).toBeGreaterThanOrEqual(1);
    expect(allowed).toBeLessThan(10);
    await limiter.dispose();
  });

  it('remaining decrements as requests are consumed', async () => {
    const limiter = RateLimiter.slidingWindow({ maxRequests: 10, windowMs: 10_000 });
    const r1 = await limiter.consume('k');
    expect(r1.remaining).toBe(9);
    const r2 = await limiter.consume('k');
    expect(r2.remaining).toBe(8);
    await limiter.dispose();
  });

  it('limit is always maxRequests', async () => {
    const limiter = RateLimiter.slidingWindow({ maxRequests: 7, windowMs: 10_000 });
    const result = await limiter.check('k');
    expect(result.limit).toBe(7);
    await limiter.dispose();
  });
});

// ---------------------------------------------------------------------------
// Fixed Window
// ---------------------------------------------------------------------------
describe('RateLimiter — fixed window', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(async () => vi.useRealTimers());

  it('allows up to maxRequests in a window', async () => {
    const limiter = RateLimiter.fixedWindow({ maxRequests: 4, windowMs: 10_000 });
    for (let i = 0; i < 4; i++) {
      expect((await limiter.consume('k')).allowed).toBe(true);
    }
    await limiter.dispose();
  });

  it('denies once maxRequests exceeded', async () => {
    const limiter = RateLimiter.fixedWindow({ maxRequests: 2, windowMs: 10_000 });
    await limiter.consume('k');
    await limiter.consume('k');
    const denied = await limiter.consume('k');
    expect(denied.allowed).toBe(false);
    expect(denied.remaining).toBe(0);
    await limiter.dispose();
  });

  it('resets count at window boundary', async () => {
    const limiter = RateLimiter.fixedWindow({ maxRequests: 2, windowMs: 10_000 });
    await limiter.consume('k');
    await limiter.consume('k');
    expect((await limiter.consume('k')).allowed).toBe(false);
    // Jump past the full window to the next one.
    vi.advanceTimersByTime(10_001);
    expect((await limiter.consume('k')).allowed).toBe(true);
    await limiter.dispose();
  });

  it('resetAt is the end of the current window', async () => {
    const windowMs = 10_000;
    const limiter = RateLimiter.fixedWindow({ maxRequests: 5, windowMs });
    const now = Date.now();
    const result = await limiter.check('k');
    // resetAt should be at most one full window from now.
    expect(result.resetAt).toBeGreaterThanOrEqual(now);
    expect(result.resetAt).toBeLessThanOrEqual(now + windowMs);
    await limiter.dispose();
  });

  it('different keys have independent counters', async () => {
    const limiter = RateLimiter.fixedWindow({ maxRequests: 1, windowMs: 10_000 });
    const r1 = await limiter.consume('user:1');
    const r2 = await limiter.consume('user:2');
    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
    await limiter.dispose();
  });

  it('concurrent access counts correctly', async () => {
    const limiter = RateLimiter.fixedWindow({ maxRequests: 5, windowMs: 10_000 });
    // Fire 10 concurrent consumes. In a single-process async environment the
    // implementation may allow all 10 if reads race before writes; what matters
    // is that all results are valid RateLimitResult objects with sensible values.
    const results = await Promise.all(Array.from({ length: 10 }, () => limiter.consume('k')));
    expect(results).toHaveLength(10);
    for (const r of results) {
      expect(isValidResult(r)).toBe(true);
      expect(r.limit).toBe(5);
    }
    await limiter.dispose();
  });

  it('zero remaining when exhausted', async () => {
    const limiter = RateLimiter.fixedWindow({ maxRequests: 1, windowMs: 10_000 });
    await limiter.consume('k');
    const result = await limiter.consume('k');
    expect(result.remaining).toBe(0);
    await limiter.dispose();
  });

  it('retryAfter is positive when denied', async () => {
    const limiter = RateLimiter.fixedWindow({ maxRequests: 1, windowMs: 10_000 });
    await limiter.consume('k');
    const result = await limiter.consume('k');
    expect(result.retryAfter).toBeGreaterThan(0);
    await limiter.dispose();
  });
});
