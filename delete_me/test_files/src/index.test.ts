import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  RateLimiterError,
  TokenBucket,
  SlidingWindowLimiter,
  FixedWindowLimiter,
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
    const err = new RateLimiterError('test');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(RateLimiterError);
  });

  it('sets name to RateLimiterError', () => {
    const err = new RateLimiterError('oops');
    expect(err.name).toBe('RateLimiterError');
  });

  it('sets message', () => {
    const err = new RateLimiterError('bad config');
    expect(err.message).toBe('bad config');
  });

  it('uses default code RATE_LIMITER_ERROR', () => {
    const err = new RateLimiterError('msg');
    expect(err.code).toBe('RATE_LIMITER_ERROR');
  });

  it('accepts a custom code', () => {
    const err = new RateLimiterError('msg', 'INVALID_TYPE');
    expect(err.code).toBe('INVALID_TYPE');
  });
});

// ---------------------------------------------------------------------------
// TokenBucket — validation
// ---------------------------------------------------------------------------
describe('TokenBucket — constructor validation', () => {
  it('throws RateLimiterError for non-positive capacity', () => {
    expect(() => new TokenBucket({ capacity: 0, refillRate: 1 })).toThrow(RateLimiterError);
    expect(() => new TokenBucket({ capacity: -5, refillRate: 1 })).toThrow(RateLimiterError);
  });

  it('throws RateLimiterError for non-positive refillRate', () => {
    expect(() => new TokenBucket({ capacity: 10, refillRate: 0 })).toThrow(RateLimiterError);
    expect(() => new TokenBucket({ capacity: 10, refillRate: -1 })).toThrow(RateLimiterError);
  });

  it('throws for non-finite capacity', () => {
    expect(() => new TokenBucket({ capacity: Infinity, refillRate: 1 })).toThrow(RateLimiterError);
    expect(() => new TokenBucket({ capacity: NaN, refillRate: 1 })).toThrow(RateLimiterError);
  });

  it('throws for non-finite refillRate', () => {
    expect(() => new TokenBucket({ capacity: 10, refillRate: Infinity })).toThrow(RateLimiterError);
    expect(() => new TokenBucket({ capacity: 10, refillRate: NaN })).toThrow(RateLimiterError);
  });

  it('throws for invalid type on capacity', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => new TokenBucket({ capacity: 'ten' as any, refillRate: 1 })).toThrow(RateLimiterError);
  });

  it('throws for invalid type on refillRate', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => new TokenBucket({ capacity: 10, refillRate: null as any })).toThrow(RateLimiterError);
  });

  it('does not throw for valid options', () => {
    expect(() => new TokenBucket({ capacity: 10, refillRate: 1 })).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// TokenBucket — behaviour
// ---------------------------------------------------------------------------
describe('TokenBucket — consume()', () => {
  let bucket: TokenBucket;

  beforeEach(() => {
    vi.useFakeTimers();
    bucket = new TokenBucket({ capacity: 5, refillRate: 1 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts full and allows consumption', () => {
    const result = bucket.consume();
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it('drains to zero then denies', () => {
    for (let i = 0; i < 5; i++) bucket.consume();
    const result = bucket.consume();
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  it('allows consuming multiple tokens at once', () => {
    const result = bucket.consume(3);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
  });

  it('denies when requested tokens exceed available', () => {
    bucket.consume(4); // 1 remaining
    const result = bucket.consume(2); // need 2, only 1 available
    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  it('refills tokens over time', () => {
    // Drain all tokens
    for (let i = 0; i < 5; i++) bucket.consume();
    // Advance 3 seconds — should add 3 tokens
    vi.advanceTimersByTime(3000);
    const result = bucket.consume();
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2); // 3 refilled, 1 consumed = 2 remaining, floored
  });

  it('does not refill beyond capacity', () => {
    vi.advanceTimersByTime(10000); // would add 10 tokens but capacity is 5
    const r1 = bucket.consume();
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(4);
  });

  it('retryAfter reflects deficit correctly', () => {
    // Drain all tokens
    for (let i = 0; i < 5; i++) bucket.consume();
    const result = bucket.consume(1);
    // 1 token at 1/s = 1000ms retry
    expect(result.retryAfter).toBe(1000);
  });

  it('check() delegates to consume(1)', () => {
    const result = bucket.check('any-key');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it('reset() refills bucket to capacity', () => {
    for (let i = 0; i < 5; i++) bucket.consume();
    bucket.reset();
    const result = bucket.consume();
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it('reset(key) is accepted and still resets the bucket', () => {
    for (let i = 0; i < 5; i++) bucket.consume();
    bucket.reset('ignored-key');
    const result = bucket.consume();
    expect(result.allowed).toBe(true);
  });

  it('floor remaining tokens', () => {
    // Drain all, then refill partially
    for (let i = 0; i < 5; i++) bucket.consume();
    vi.advanceTimersByTime(1500); // 1.5 tokens added
    const result = bucket.consume();
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0); // floor(0.5)
  });
});

// ---------------------------------------------------------------------------
// SlidingWindowLimiter — validation
// ---------------------------------------------------------------------------
describe('SlidingWindowLimiter — constructor validation', () => {
  it('throws for non-positive windowMs', () => {
    expect(() => new SlidingWindowLimiter({ windowMs: 0, maxRequests: 5 })).toThrow(RateLimiterError);
    expect(() => new SlidingWindowLimiter({ windowMs: -100, maxRequests: 5 })).toThrow(RateLimiterError);
  });

  it('throws for non-positive maxRequests', () => {
    expect(() => new SlidingWindowLimiter({ windowMs: 1000, maxRequests: 0 })).toThrow(RateLimiterError);
    expect(() => new SlidingWindowLimiter({ windowMs: 1000, maxRequests: -1 })).toThrow(RateLimiterError);
  });

  it('throws for non-finite windowMs', () => {
    expect(() => new SlidingWindowLimiter({ windowMs: Infinity, maxRequests: 5 })).toThrow(RateLimiterError);
    expect(() => new SlidingWindowLimiter({ windowMs: NaN, maxRequests: 5 })).toThrow(RateLimiterError);
  });

  it('throws for non-finite maxRequests', () => {
    expect(() => new SlidingWindowLimiter({ windowMs: 1000, maxRequests: Infinity })).toThrow(RateLimiterError);
    expect(() => new SlidingWindowLimiter({ windowMs: 1000, maxRequests: NaN })).toThrow(RateLimiterError);
  });

  it('throws for invalid type on windowMs', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => new SlidingWindowLimiter({ windowMs: 'fast' as any, maxRequests: 5 })).toThrow(RateLimiterError);
  });

  it('throws for invalid type on maxRequests', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => new SlidingWindowLimiter({ windowMs: 1000, maxRequests: true as any })).toThrow(RateLimiterError);
  });

  it('does not throw for valid options', () => {
    expect(() => new SlidingWindowLimiter({ windowMs: 1000, maxRequests: 5 })).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// SlidingWindowLimiter — behaviour
// ---------------------------------------------------------------------------
describe('SlidingWindowLimiter — check()', () => {
  let limiter: SlidingWindowLimiter;

  beforeEach(() => {
    vi.useFakeTimers();
    limiter = new SlidingWindowLimiter({ windowMs: 1000, maxRequests: 3 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows requests up to maxRequests', () => {
    expect(limiter.check('a').allowed).toBe(true);
    expect(limiter.check('a').allowed).toBe(true);
    const third = limiter.check('a');
    expect(third.allowed).toBe(true);
    expect(third.remaining).toBe(0);
  });

  it('denies the (maxRequests+1)th request', () => {
    for (let i = 0; i < 3; i++) limiter.check('a');
    const result = limiter.check('a');
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfter).toBeGreaterThan(0);
    expect(result.resetAt).toBeDefined();
  });

  it('supports independent keys', () => {
    for (let i = 0; i < 3; i++) limiter.check('user-a');
    expect(limiter.check('user-a').allowed).toBe(false);
    expect(limiter.check('user-b').allowed).toBe(true);
  });

  it('sliding window cleans up old entries', () => {
    for (let i = 0; i < 3; i++) limiter.check('a');
    expect(limiter.check('a').allowed).toBe(false);
    // Advance past the window — all old timestamps pruned
    vi.advanceTimersByTime(1001);
    expect(limiter.check('a').allowed).toBe(true);
  });

  it('reset(key) clears only that key', () => {
    for (let i = 0; i < 3; i++) limiter.check('a');
    for (let i = 0; i < 3; i++) limiter.check('b');
    limiter.reset('a');
    expect(limiter.check('a').allowed).toBe(true);
    expect(limiter.check('b').allowed).toBe(false);
  });

  it('reset() clears all keys', () => {
    for (let i = 0; i < 3; i++) limiter.check('a');
    for (let i = 0; i < 3; i++) limiter.check('b');
    limiter.reset();
    expect(limiter.check('a').allowed).toBe(true);
    expect(limiter.check('b').allowed).toBe(true);
  });

  it('retryAfter is at least 1', () => {
    vi.setSystemTime(new Date('2024-01-01T00:00:00.999Z'));
    const limiter2 = new SlidingWindowLimiter({ windowMs: 1000, maxRequests: 1 });
    limiter2.check('a'); // uses timestamp at 999ms
    vi.advanceTimersByTime(999); // now = 1998ms, oldest = 999ms, window ends at 1999ms
    const result = limiter2.check('a');
    expect(result.retryAfter).toBeGreaterThanOrEqual(1);
  });

  it('resetAt when no prior entries is now + windowMs', () => {
    const before = Date.now();
    const result = limiter.check('fresh-key');
    const after = Date.now();
    expect(result.resetAt).toBeGreaterThanOrEqual(before + 1000);
    expect(result.resetAt).toBeLessThanOrEqual(after + 1000);
  });

  it('remaining decrements correctly', () => {
    const r1 = limiter.check('x');
    expect(r1.remaining).toBe(2);
    const r2 = limiter.check('x');
    expect(r2.remaining).toBe(1);
    const r3 = limiter.check('x');
    expect(r3.remaining).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// FixedWindowLimiter — validation
// ---------------------------------------------------------------------------
describe('FixedWindowLimiter — constructor validation', () => {
  it('throws for non-positive windowMs', () => {
    expect(() => new FixedWindowLimiter({ windowMs: 0, maxRequests: 5 })).toThrow(RateLimiterError);
    expect(() => new FixedWindowLimiter({ windowMs: -100, maxRequests: 5 })).toThrow(RateLimiterError);
  });

  it('throws for non-positive maxRequests', () => {
    expect(() => new FixedWindowLimiter({ windowMs: 1000, maxRequests: 0 })).toThrow(RateLimiterError);
    expect(() => new FixedWindowLimiter({ windowMs: 1000, maxRequests: -1 })).toThrow(RateLimiterError);
  });

  it('throws for non-finite windowMs', () => {
    expect(() => new FixedWindowLimiter({ windowMs: Infinity, maxRequests: 5 })).toThrow(RateLimiterError);
    expect(() => new FixedWindowLimiter({ windowMs: NaN, maxRequests: 5 })).toThrow(RateLimiterError);
  });

  it('throws for non-finite maxRequests', () => {
    expect(() => new FixedWindowLimiter({ windowMs: 1000, maxRequests: Infinity })).toThrow(RateLimiterError);
    expect(() => new FixedWindowLimiter({ windowMs: 1000, maxRequests: NaN })).toThrow(RateLimiterError);
  });

  it('throws for invalid type on windowMs', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => new FixedWindowLimiter({ windowMs: [] as any, maxRequests: 5 })).toThrow(RateLimiterError);
  });

  it('throws for invalid type on maxRequests', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => new FixedWindowLimiter({ windowMs: 1000, maxRequests: {} as any })).toThrow(RateLimiterError);
  });

  it('does not throw for valid options', () => {
    expect(() => new FixedWindowLimiter({ windowMs: 1000, maxRequests: 5 })).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// FixedWindowLimiter — behaviour
// ---------------------------------------------------------------------------
describe('FixedWindowLimiter — check()', () => {
  let limiter: FixedWindowLimiter;

  beforeEach(() => {
    vi.useFakeTimers();
    // Set a known time so windows are predictable
    vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
    limiter = new FixedWindowLimiter({ windowMs: 1000, maxRequests: 3 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows requests up to maxRequests', () => {
    for (let i = 0; i < 3; i++) {
      const r = limiter.check('a');
      expect(r.allowed).toBe(true);
    }
  });

  it('denies the (maxRequests+1)th request', () => {
    for (let i = 0; i < 3; i++) limiter.check('a');
    const result = limiter.check('a');
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfter).toBeGreaterThan(0);
    expect(result.resetAt).toBeDefined();
  });

  it('resets counter at window boundary (clock-aligned)', () => {
    for (let i = 0; i < 3; i++) limiter.check('a');
    expect(limiter.check('a').allowed).toBe(false);
    // Advance to the start of the next window
    vi.advanceTimersByTime(1000);
    expect(limiter.check('a').allowed).toBe(true);
  });

  it('supports independent keys', () => {
    for (let i = 0; i < 3; i++) limiter.check('ip-1');
    expect(limiter.check('ip-1').allowed).toBe(false);
    expect(limiter.check('ip-2').allowed).toBe(true);
  });

  it('reset(key) clears only that key', () => {
    for (let i = 0; i < 3; i++) limiter.check('a');
    for (let i = 0; i < 3; i++) limiter.check('b');
    limiter.reset('a');
    expect(limiter.check('a').allowed).toBe(true);
    expect(limiter.check('b').allowed).toBe(false);
  });

  it('reset() clears all keys', () => {
    for (let i = 0; i < 3; i++) limiter.check('a');
    for (let i = 0; i < 3; i++) limiter.check('b');
    limiter.reset();
    expect(limiter.check('a').allowed).toBe(true);
    expect(limiter.check('b').allowed).toBe(true);
  });

  it('prune() removes expired windows', () => {
    limiter.check('a');
    limiter.check('b');
    // Advance beyond one window so entries are stale
    vi.advanceTimersByTime(2000);
    // After prune, stale entries are removed; new check creates fresh window
    limiter.prune();
    const result = limiter.check('a');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
  });

  it('prune() keeps entries in the current window', () => {
    // Add an entry in the current window
    limiter.check('keep');
    // Do NOT advance time — entry is still in the current window
    limiter.prune();
    // Entry should still count; only 2 remaining after the original check
    const result = limiter.check('keep');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(1);
  });

  it('resetAt is end of current clock-aligned window', () => {
    const now = Date.now(); // 2024-01-01T00:00:00.000Z = 1704067200000
    const result = limiter.check('a');
    const expectedResetAt = Math.floor(now / 1000) * 1000 + 1000;
    expect(result.resetAt).toBe(expectedResetAt);
  });

  it('remaining decrements correctly', () => {
    expect(limiter.check('x').remaining).toBe(2);
    expect(limiter.check('x').remaining).toBe(1);
    expect(limiter.check('x').remaining).toBe(0);
  });

  it('retryAfter is at least 1', () => {
    // Place clock just before window boundary
    vi.setSystemTime(new Date('2024-01-01T00:00:00.999Z'));
    const limiter2 = new FixedWindowLimiter({ windowMs: 1000, maxRequests: 1 });
    limiter2.check('x');
    // Advance just before boundary so retryAfter rounds down to ~1ms
    vi.advanceTimersByTime(0);
    const result = limiter2.check('x');
    expect(result.retryAfter).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
describe('createRateLimitMiddleware', () => {
  function makeReq(ip = '1.2.3.4'): MiddlewareRequest {
    return { ip, headers: {} };
  }

  function makeRes(): MiddlewareResponse & { _status?: number; _body?: unknown } {
    const res: MiddlewareResponse & { _status?: number; _body?: unknown; headers: Record<string, string> } = {
      _status: undefined,
      _body: undefined,
      headers: {},
      status(code: number) { res._status = code; },
      json(body: unknown) { res._body = body; },
    };
    return res;
  }

  function makeResNoHeaders(): MiddlewareResponse & { _status?: number; _body?: unknown } {
    const res: MiddlewareResponse & { _status?: number; _body?: unknown } = {
      _status: undefined,
      _body: undefined,
      status(code: number) { (res as { _status?: number })._status = code; },
      json(body: unknown) { (res as { _body?: unknown })._body = body; },
    };
    return res;
  }

  let limiter: SlidingWindowLimiter;

  beforeEach(() => {
    vi.useFakeTimers();
    limiter = new SlidingWindowLimiter({ windowMs: 10_000, maxRequests: 2 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls next() when request is allowed', () => {
    const middleware = createRateLimitMiddleware(limiter);
    const next = vi.fn();
    middleware(makeReq(), makeRes(), next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('sets X-RateLimit-Remaining header when allowed', () => {
    const middleware = createRateLimitMiddleware(limiter);
    const res = makeRes();
    middleware(makeReq(), res, vi.fn());
    expect((res as { headers: Record<string, string> }).headers['X-RateLimit-Remaining']).toBe('1');
  });

  it('sets X-RateLimit-Reset header when allowed and resetAt is present', () => {
    const middleware = createRateLimitMiddleware(limiter);
    const res = makeRes();
    middleware(makeReq(), res, vi.fn());
    expect((res as { headers: Record<string, string> }).headers['X-RateLimit-Reset']).toBeDefined();
  });

  it('skips headers when res.headers is undefined', () => {
    const middleware = createRateLimitMiddleware(limiter);
    const res = makeResNoHeaders();
    const next = vi.fn();
    // Should not throw and should still call next
    expect(() => middleware(makeReq(), res, next)).not.toThrow();
    expect(next).toHaveBeenCalledOnce();
  });

  it('returns 429 and does not call next() when denied', () => {
    const middleware = createRateLimitMiddleware(limiter);
    const next = vi.fn();
    const req = makeReq('5.5.5.5');
    middleware(req, makeRes(), vi.fn()); // request 1
    middleware(req, makeRes(), vi.fn()); // request 2 — limit reached
    const res = makeRes();
    middleware(req, res, next); // request 3 — denied
    expect(next).not.toHaveBeenCalled();
    expect((res as { _status?: number })._status).toBe(429);
    expect((res as { _body?: unknown })._body).toMatchObject({
      error: 'Too Many Requests',
    });
  });

  it('uses req.ip as default key', () => {
    const middleware = createRateLimitMiddleware(limiter);
    // Two different IPs should not interfere with each other
    middleware(makeReq('10.0.0.1'), makeRes(), vi.fn());
    middleware(makeReq('10.0.0.1'), makeRes(), vi.fn());
    const res2a = makeRes();
    const next2a = vi.fn();
    middleware(makeReq('10.0.0.1'), res2a, next2a);
    expect(next2a).not.toHaveBeenCalled(); // ip1 exhausted

    const next2b = vi.fn();
    middleware(makeReq('10.0.0.2'), makeRes(), next2b);
    expect(next2b).toHaveBeenCalledOnce(); // ip2 unaffected
  });

  it('uses custom keyExtractor when provided', () => {
    const middleware = createRateLimitMiddleware(limiter, {
      keyExtractor: (req) => req.headers['x-user-id'] ?? req.ip,
    });
    const reqA = { ip: '1.2.3.4', headers: { 'x-user-id': 'user-99' } };
    middleware(reqA, makeRes(), vi.fn());
    middleware(reqA, makeRes(), vi.fn());
    const res = makeRes();
    const next = vi.fn();
    middleware(reqA, res, next);
    expect(next).not.toHaveBeenCalled(); // user-99 exhausted
  });

  it('retryAfter is included in the 429 body', () => {
    const middleware = createRateLimitMiddleware(limiter);
    const ip = '9.9.9.9';
    middleware(makeReq(ip), makeRes(), vi.fn());
    middleware(makeReq(ip), makeRes(), vi.fn());
    const res = makeRes();
    middleware(makeReq(ip), res, vi.fn());
    const body = (res as { _body?: unknown })._body as Record<string, unknown>;
    expect(body.retryAfter).toBeDefined();
  });

  it('does not set X-RateLimit-Reset when resetAt is undefined (TokenBucket)', () => {
    // TokenBucket.consume() does not set resetAt
    const bucket = new TokenBucket({ capacity: 10, refillRate: 1 });
    const middleware = createRateLimitMiddleware(bucket);
    const res = makeRes();
    middleware(makeReq(), res, vi.fn());
    // X-RateLimit-Remaining should be set, X-RateLimit-Reset should not
    expect((res as { headers: Record<string, string> }).headers['X-RateLimit-Remaining']).toBeDefined();
    expect((res as { headers: Record<string, string> }).headers['X-RateLimit-Reset']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Interface compliance: all limiters implement RateLimiter
// ---------------------------------------------------------------------------
describe('RateLimiter interface compliance', () => {
  const cases: Array<[string, () => RateLimiter]> = [
    ['TokenBucket', () => new TokenBucket({ capacity: 5, refillRate: 1 })],
    ['SlidingWindowLimiter', () => new SlidingWindowLimiter({ windowMs: 1000, maxRequests: 5 })],
    ['FixedWindowLimiter', () => new FixedWindowLimiter({ windowMs: 1000, maxRequests: 5 })],
  ];

  it.each(cases)('%s implements check() and reset()', (_name, factory) => {
    const limiter = factory();
    expect(typeof limiter.check).toBe('function');
    expect(typeof limiter.reset).toBe('function');
    const result: RateLimitResult = limiter.check('test');
    expect(result).toHaveProperty('allowed');
    expect(result).toHaveProperty('remaining');
    limiter.reset('test');
    limiter.reset();
  });
});
