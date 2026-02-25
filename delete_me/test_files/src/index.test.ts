/**
 * Comprehensive tests for the rate limiter library.
 * Covers all algorithms, middleware, error handling, and edge cases.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  RateLimiterError,
  validatePositiveFinite,
  TokenBucket,
  SlidingWindow,
  FixedWindow,
  createRateLimitMiddleware,
} from './index.js';
import type {
  RateLimitResult,
  RateLimiter,
  MiddlewareRequest,
  MiddlewareResponse,
} from './index.js';

// ---------------------------------------------------------------------------
// RateLimiterError
// ---------------------------------------------------------------------------

describe('RateLimiterError', () => {
  it('extends Error', () => {
    const err = new RateLimiterError('oops');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(RateLimiterError);
  });

  it('sets name to RateLimiterError', () => {
    const err = new RateLimiterError('oops');
    expect(err.name).toBe('RateLimiterError');
  });

  it('sets message correctly', () => {
    const err = new RateLimiterError('test message');
    expect(err.message).toBe('test message');
  });

  it('has correct prototype chain for instanceof', () => {
    const err = new RateLimiterError('oops');
    expect(Object.getPrototypeOf(err)).toBe(RateLimiterError.prototype);
  });
});

// ---------------------------------------------------------------------------
// validatePositiveFinite
// ---------------------------------------------------------------------------

describe('validatePositiveFinite', () => {
  it('accepts positive finite numbers', () => {
    expect(() => validatePositiveFinite(1, 'field')).not.toThrow();
    expect(() => validatePositiveFinite(0.001, 'field')).not.toThrow();
    expect(() => validatePositiveFinite(1e6, 'field')).not.toThrow();
  });

  it('throws for non-number types', () => {
    expect(() => validatePositiveFinite('5', 'field')).toThrow(RateLimiterError);
    expect(() => validatePositiveFinite(null, 'field')).toThrow(RateLimiterError);
    expect(() => validatePositiveFinite(undefined, 'field')).toThrow(RateLimiterError);
    expect(() => validatePositiveFinite(true, 'field')).toThrow(RateLimiterError);
  });

  it('throws for non-finite numbers', () => {
    expect(() => validatePositiveFinite(Infinity, 'field')).toThrow(RateLimiterError);
    expect(() => validatePositiveFinite(-Infinity, 'field')).toThrow(RateLimiterError);
    expect(() => validatePositiveFinite(NaN, 'field')).toThrow(RateLimiterError);
  });

  it('throws for zero and negative numbers', () => {
    expect(() => validatePositiveFinite(0, 'field')).toThrow(RateLimiterError);
    expect(() => validatePositiveFinite(-1, 'field')).toThrow(RateLimiterError);
  });

  it('includes field name in the error message', () => {
    try {
      validatePositiveFinite(0, 'myCapacity');
    } catch (e) {
      expect((e as Error).message).toContain('myCapacity');
    }
  });
});

// ---------------------------------------------------------------------------
// TokenBucket
// ---------------------------------------------------------------------------

describe('TokenBucket', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('throws RateLimiterError for invalid capacity', () => {
    expect(() => new TokenBucket({ capacity: 0, refillRate: 1 })).toThrow(RateLimiterError);
    expect(() => new TokenBucket({ capacity: -1, refillRate: 1 })).toThrow(RateLimiterError);
    expect(() => new TokenBucket({ capacity: Infinity, refillRate: 1 })).toThrow(RateLimiterError);
    expect(() => new TokenBucket({ capacity: NaN, refillRate: 1 })).toThrow(RateLimiterError);
  });

  it('throws RateLimiterError for invalid refillRate', () => {
    expect(() => new TokenBucket({ capacity: 10, refillRate: 0 })).toThrow(RateLimiterError);
    expect(() => new TokenBucket({ capacity: 10, refillRate: -1 })).toThrow(RateLimiterError);
    expect(() => new TokenBucket({ capacity: 10, refillRate: Infinity })).toThrow(RateLimiterError);
  });

  it('starts with full bucket', () => {
    const bucket = new TokenBucket({ capacity: 10, refillRate: 1 });
    const result = bucket.consume(1);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
  });

  it('allows requests up to capacity', () => {
    const bucket = new TokenBucket({ capacity: 5, refillRate: 1 });
    for (let i = 0; i < 5; i++) {
      expect(bucket.consume().allowed).toBe(true);
    }
  });

  it('denies requests when bucket is empty', () => {
    const bucket = new TokenBucket({ capacity: 2, refillRate: 1 });
    bucket.consume();
    bucket.consume();
    const result = bucket.consume();
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  it('refills tokens over time', () => {
    const bucket = new TokenBucket({ capacity: 10, refillRate: 10 }); // 10 tokens/s
    // Drain all tokens
    for (let i = 0; i < 10; i++) bucket.consume();
    expect(bucket.consume().allowed).toBe(false);

    // Advance 1 second — should have 10 new tokens
    vi.advanceTimersByTime(1000);
    const result = bucket.consume();
    expect(result.allowed).toBe(true);
  });

  it('does not exceed capacity on refill', () => {
    const bucket = new TokenBucket({ capacity: 5, refillRate: 10 });
    // Drain one token
    bucket.consume();
    // Wait a long time — tokens should cap at capacity
    vi.advanceTimersByTime(10_000);
    const result = bucket.consume();
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBeLessThanOrEqual(4); // consumed 1 of capped 5
  });

  it('returns retryAfter when denied', () => {
    const bucket = new TokenBucket({ capacity: 1, refillRate: 1 }); // 1 token/s
    bucket.consume();
    const result = bucket.consume();
    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBeGreaterThan(0);
    expect(result.resetAt).toBeGreaterThan(Date.now() - 1);
  });

  it('check() delegates to consume', () => {
    const bucket = new TokenBucket({ capacity: 3, refillRate: 1 });
    const r1 = bucket.check('any-key');
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);
  });

  it('reset() restores full capacity', () => {
    const bucket = new TokenBucket({ capacity: 3, refillRate: 1 });
    bucket.consume();
    bucket.consume();
    bucket.reset();
    // After reset, all 3 tokens available again
    const r = bucket.consume();
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(2);
  });

  it('reset() with key argument still resets the bucket', () => {
    const bucket = new TokenBucket({ capacity: 3, refillRate: 1 });
    bucket.consume();
    bucket.consume();
    bucket.reset('some-key');
    const r = bucket.consume();
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(2);
  });

  it('denies consume larger than capacity', () => {
    const bucket = new TokenBucket({ capacity: 5, refillRate: 1 });
    const result = bucket.consume(10);
    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  it('throws RangeError for zero or negative consume', () => {
    const bucket = new TokenBucket({ capacity: 5, refillRate: 1 });
    expect(() => bucket.consume(0)).toThrow(RangeError);
    expect(() => bucket.consume(-1)).toThrow(RangeError);
  });

  it('satisfies RateLimiter interface', () => {
    const bucket: RateLimiter = new TokenBucket({ capacity: 5, refillRate: 1 });
    expect(bucket.check).toBeTypeOf('function');
    expect(bucket.reset).toBeTypeOf('function');
  });
});

// ---------------------------------------------------------------------------
// SlidingWindow
// ---------------------------------------------------------------------------

describe('SlidingWindow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('throws RateLimiterError for invalid windowMs', () => {
    expect(() => new SlidingWindow({ windowMs: 0, maxRequests: 5 })).toThrow(RateLimiterError);
    expect(() => new SlidingWindow({ windowMs: -1000, maxRequests: 5 })).toThrow(RateLimiterError);
    expect(() => new SlidingWindow({ windowMs: Infinity, maxRequests: 5 })).toThrow(RateLimiterError);
    expect(() => new SlidingWindow({ windowMs: NaN, maxRequests: 5 })).toThrow(RateLimiterError);
  });

  it('throws RateLimiterError for invalid maxRequests', () => {
    expect(() => new SlidingWindow({ windowMs: 1000, maxRequests: 0 })).toThrow(RateLimiterError);
    expect(() => new SlidingWindow({ windowMs: 1000, maxRequests: -5 })).toThrow(RateLimiterError);
    expect(() => new SlidingWindow({ windowMs: 1000, maxRequests: NaN })).toThrow(RateLimiterError);
  });

  it('allows requests up to maxRequests', () => {
    const sw = new SlidingWindow({ windowMs: 1000, maxRequests: 3 });
    expect(sw.check('user1').allowed).toBe(true); // remaining: 2
    expect(sw.check('user1').allowed).toBe(true); // remaining: 1
    expect(sw.check('user1').allowed).toBe(true); // remaining: 0
  });

  it('denies the request that exceeds maxRequests', () => {
    const sw = new SlidingWindow({ windowMs: 1000, maxRequests: 2 });
    sw.check('u');
    sw.check('u');
    const result = sw.check('u');
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  it('tracks keys independently', () => {
    const sw = new SlidingWindow({ windowMs: 1000, maxRequests: 1 });
    expect(sw.check('a').allowed).toBe(true);
    expect(sw.check('b').allowed).toBe(true);
    expect(sw.check('a').allowed).toBe(false);
    expect(sw.check('b').allowed).toBe(false);
  });

  it('allows requests again after window expires', () => {
    const sw = new SlidingWindow({ windowMs: 1000, maxRequests: 1 });
    sw.check('u');
    expect(sw.check('u').allowed).toBe(false);
    vi.advanceTimersByTime(1001);
    expect(sw.check('u').allowed).toBe(true);
  });

  it('provides resetAt timestamp', () => {
    const sw = new SlidingWindow({ windowMs: 1000, maxRequests: 5 });
    const before = Date.now();
    const result = sw.check('u');
    expect(result.resetAt).toBeGreaterThanOrEqual(before + 1000);
  });

  it('reset() clears a single key', () => {
    const sw = new SlidingWindow({ windowMs: 1000, maxRequests: 1 });
    sw.check('a');
    sw.check('b');
    sw.reset('a');
    expect(sw.check('a').allowed).toBe(true);
    expect(sw.check('b').allowed).toBe(false);
  });

  it('reset() with no key clears all keys', () => {
    const sw = new SlidingWindow({ windowMs: 1000, maxRequests: 1 });
    sw.check('a');
    sw.check('b');
    sw.reset();
    expect(sw.check('a').allowed).toBe(true);
    expect(sw.check('b').allowed).toBe(true);
  });

  it('prunes old entries preventing memory leaks', () => {
    const sw = new SlidingWindow({ windowMs: 100, maxRequests: 10 });
    // Make 5 requests, then advance past window
    for (let i = 0; i < 5; i++) sw.check('u');
    vi.advanceTimersByTime(200);
    // Old timestamps should be pruned on the next check
    const result = sw.check('u');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9); // 10 - 1 (the new request)
  });

  it('satisfies RateLimiter interface', () => {
    const sw: RateLimiter = new SlidingWindow({ windowMs: 1000, maxRequests: 5 });
    expect(sw.check).toBeTypeOf('function');
    expect(sw.reset).toBeTypeOf('function');
  });
});

// ---------------------------------------------------------------------------
// FixedWindow
// ---------------------------------------------------------------------------

describe('FixedWindow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('throws RateLimiterError for invalid windowMs', () => {
    expect(() => new FixedWindow({ windowMs: 0, maxRequests: 5 })).toThrow(RateLimiterError);
    expect(() => new FixedWindow({ windowMs: -1000, maxRequests: 5 })).toThrow(RateLimiterError);
    expect(() => new FixedWindow({ windowMs: Infinity, maxRequests: 5 })).toThrow(RateLimiterError);
    expect(() => new FixedWindow({ windowMs: NaN, maxRequests: 5 })).toThrow(RateLimiterError);
  });

  it('throws RateLimiterError for invalid maxRequests', () => {
    expect(() => new FixedWindow({ windowMs: 1000, maxRequests: 0 })).toThrow(RateLimiterError);
    expect(() => new FixedWindow({ windowMs: 1000, maxRequests: -5 })).toThrow(RateLimiterError);
    expect(() => new FixedWindow({ windowMs: 1000, maxRequests: NaN })).toThrow(RateLimiterError);
  });

  it('allows requests up to maxRequests', () => {
    const fw = new FixedWindow({ windowMs: 1000, maxRequests: 3 });
    expect(fw.check('u').allowed).toBe(true);
    expect(fw.check('u').allowed).toBe(true);
    expect(fw.check('u').allowed).toBe(true);
  });

  it('denies requests beyond maxRequests', () => {
    const fw = new FixedWindow({ windowMs: 1000, maxRequests: 2 });
    fw.check('u');
    fw.check('u');
    const result = fw.check('u');
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  it('tracks keys independently', () => {
    const fw = new FixedWindow({ windowMs: 1000, maxRequests: 1 });
    expect(fw.check('a').allowed).toBe(true);
    expect(fw.check('b').allowed).toBe(true);
    expect(fw.check('a').allowed).toBe(false);
    expect(fw.check('b').allowed).toBe(false);
  });

  it('resets at window boundary', () => {
    const fw = new FixedWindow({ windowMs: 1000, maxRequests: 2 });
    fw.check('u');
    fw.check('u');
    expect(fw.check('u').allowed).toBe(false);
    // Advance to next window
    vi.advanceTimersByTime(1001);
    expect(fw.check('u').allowed).toBe(true);
  });

  it('windows align to clock boundaries', () => {
    // windowMs = 1000; window starts at floor(now/1000)*1000
    const fw = new FixedWindow({ windowMs: 1000, maxRequests: 3 });
    const result = fw.check('u');
    const now = Date.now();
    const expectedWindowStart = Math.floor(now / 1000) * 1000;
    expect(result.resetAt).toBe(expectedWindowStart + 1000);
  });

  it('provides correct remaining count', () => {
    const fw = new FixedWindow({ windowMs: 1000, maxRequests: 5 });
    expect(fw.check('u').remaining).toBe(4);
    expect(fw.check('u').remaining).toBe(3);
    expect(fw.check('u').remaining).toBe(2);
  });

  it('reset() clears a single key', () => {
    const fw = new FixedWindow({ windowMs: 1000, maxRequests: 1 });
    fw.check('a');
    fw.check('b');
    fw.reset('a');
    expect(fw.check('a').allowed).toBe(true);
    expect(fw.check('b').allowed).toBe(false);
  });

  it('reset() with no key clears all keys', () => {
    const fw = new FixedWindow({ windowMs: 1000, maxRequests: 1 });
    fw.check('a');
    fw.check('b');
    fw.reset();
    expect(fw.check('a').allowed).toBe(true);
    expect(fw.check('b').allowed).toBe(true);
  });

  it('prunes expired entries and deletes old keys', () => {
    const fw = new FixedWindow({ windowMs: 100, maxRequests: 1 });
    fw.check('a'); // fills 'a' window
    fw.check('b'); // fills 'b' window
    // Both are denied in current window
    expect(fw.check('a').allowed).toBe(false);
    expect(fw.check('b').allowed).toBe(false);
    // Advance past one full window to trigger pruning
    vi.advanceTimersByTime(200);
    // Check 'c' to trigger maybePrune — old entries for 'a' and 'b' get deleted
    fw.check('c');
    // 'a' and 'b' should now be in a fresh window (allowed again)
    expect(fw.check('a').allowed).toBe(true);
    expect(fw.check('b').allowed).toBe(true);
  });

  it('satisfies RateLimiter interface', () => {
    const fw: RateLimiter = new FixedWindow({ windowMs: 1000, maxRequests: 5 });
    expect(fw.check).toBeTypeOf('function');
    expect(fw.reset).toBeTypeOf('function');
  });
});

// ---------------------------------------------------------------------------
// createRateLimitMiddleware
// ---------------------------------------------------------------------------

describe('createRateLimitMiddleware', () => {
  let req: MiddlewareRequest;
  let res: MiddlewareResponse & { headers: Record<string, string> };
  let next: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    req = { ip: '127.0.0.1', headers: {} };
    res = {
      headers: {},
      status: vi.fn(),
      json: vi.fn(),
    };
    next = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls next() when request is allowed', () => {
    const limiter = new SlidingWindow({ windowMs: 1000, maxRequests: 5 });
    const mw = createRateLimitMiddleware({ limiter });
    mw(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 429 when request is denied', () => {
    const limiter = new SlidingWindow({ windowMs: 1000, maxRequests: 1 });
    const mw = createRateLimitMiddleware({ limiter });
    mw(req, res, next); // allowed
    mw(req, res, next); // denied
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Too Many Requests' })
    );
  });

  it('includes retryAfter in the 429 body', () => {
    const limiter = new SlidingWindow({ windowMs: 1000, maxRequests: 1 });
    const mw = createRateLimitMiddleware({ limiter });
    mw(req, res, next);
    mw(req, res, next);
    const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>;
    expect(body.retryAfter).toBeGreaterThan(0);
  });

  it('does not call next() when denied', () => {
    const limiter = new SlidingWindow({ windowMs: 1000, maxRequests: 1 });
    const mw = createRateLimitMiddleware({ limiter });
    mw(req, res, next);
    const nextCallCount = (next as ReturnType<typeof vi.fn>).mock.calls.length;
    mw(req, res, next);
    expect((next as ReturnType<typeof vi.fn>).mock.calls.length).toBe(nextCallCount);
  });

  it('sets X-RateLimit-Remaining header', () => {
    const limiter = new SlidingWindow({ windowMs: 1000, maxRequests: 5 });
    const mw = createRateLimitMiddleware({ limiter });
    mw(req, res, next);
    expect(res.headers['X-RateLimit-Remaining']).toBe('4');
  });

  it('sets X-RateLimit-Reset header', () => {
    const limiter = new SlidingWindow({ windowMs: 1000, maxRequests: 5 });
    const mw = createRateLimitMiddleware({ limiter });
    mw(req, res, next);
    expect(res.headers['X-RateLimit-Reset']).toBeDefined();
    expect(Number(res.headers['X-RateLimit-Reset'])).toBeGreaterThan(0);
  });

  it('does not throw if res.headers is undefined', () => {
    const limiter = new SlidingWindow({ windowMs: 1000, maxRequests: 5 });
    const mw = createRateLimitMiddleware({ limiter });
    const resNoHeaders: MiddlewareResponse = { status: vi.fn(), json: vi.fn() };
    expect(() => mw(req, resNoHeaders, next)).not.toThrow();
    expect(next).toHaveBeenCalled();
  });

  it('uses custom keyExtractor when provided', () => {
    const limiter = new SlidingWindow({ windowMs: 1000, maxRequests: 1 });
    const mw = createRateLimitMiddleware({
      limiter,
      keyExtractor: (r) => r.headers['x-user-id'] ?? r.ip,
    });
    const reqA = { ip: '1.2.3.4', headers: { 'x-user-id': 'alice' } };
    const reqB = { ip: '1.2.3.4', headers: { 'x-user-id': 'bob' } };
    // Both users share the same IP but different keys — both should be allowed
    expect(mw(reqA, res, next), 'alice allowed').toBeUndefined();
    expect(mw(reqB, res, next), 'bob allowed').toBeUndefined();
    expect((next as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
  });

  it('defaults key extraction to req.ip', () => {
    const limiter = new SlidingWindow({ windowMs: 1000, maxRequests: 1 });
    const mw = createRateLimitMiddleware({ limiter });
    const req1 = { ip: '1.2.3.4', headers: {} };
    const req2 = { ip: '9.9.9.9', headers: {} };
    mw(req1, res, next);
    mw(req2, res, next);
    // Both distinct IPs should be allowed on first request
    expect((next as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
  });

  it('works with TokenBucket limiter', () => {
    const limiter = new TokenBucket({ capacity: 1, refillRate: 1 });
    const mw = createRateLimitMiddleware({ limiter });
    mw(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    mw(req, res, next);
    expect(res.status).toHaveBeenCalledWith(429);
  });

  it('works with FixedWindow limiter', () => {
    const limiter = new FixedWindow({ windowMs: 1000, maxRequests: 1 });
    const mw = createRateLimitMiddleware({ limiter });
    mw(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    mw(req, res, next);
    expect(res.status).toHaveBeenCalledWith(429);
  });
});

// ---------------------------------------------------------------------------
// RateLimitResult type conformance
// ---------------------------------------------------------------------------

describe('RateLimitResult type conformance', () => {
  it('has required fields', () => {
    const result: RateLimitResult = { allowed: true, remaining: 5 };
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(5);
    expect(result.retryAfter).toBeUndefined();
    expect(result.resetAt).toBeUndefined();
  });

  it('may include optional fields', () => {
    const result: RateLimitResult = {
      allowed: false,
      remaining: 0,
      retryAfter: 1000,
      resetAt: Date.now() + 1000,
    };
    expect(result.retryAfter).toBe(1000);
    expect(result.resetAt).toBeGreaterThan(0);
  });
});
