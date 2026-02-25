import { describe, it, expect, vi } from 'vitest';
import { createRateLimitMiddleware } from './middleware.js';
import type { RateLimiter, RateLimitResult } from './types.js';
import type { MiddlewareRequest, MiddlewareResponse } from './middleware.js';

/** Create a minimal mock rate limiter that always returns the given result. */
function mockLimiter(result: RateLimitResult): RateLimiter {
  return {
    check: vi.fn().mockReturnValue(result),
    reset: vi.fn(),
  };
}

/** Build a minimal request object. */
function makeReq(ip = '127.0.0.1', headers: Record<string, string> = {}): MiddlewareRequest {
  return { ip, headers };
}

/** Build a minimal response object with optional header support. */
function makeRes(withHeaders = true): MiddlewareResponse & { headers: Record<string, string> } {
  const res: MiddlewareResponse & { headers: Record<string, string> } = {
    headers: {},
    status: vi.fn(),
    json: vi.fn(),
  };
  if (!withHeaders) {
    delete (res as Partial<typeof res>).headers;
  }
  return res;
}

describe('createRateLimitMiddleware', () => {
  describe('when request is allowed', () => {
    it('calls next()', () => {
      const limiter = mockLimiter({ allowed: true, remaining: 9, resetAt: Date.now() + 1000 });
      const middleware = createRateLimitMiddleware(limiter);
      const next = vi.fn();
      middleware(makeReq(), makeRes(), next);
      expect(next).toHaveBeenCalledOnce();
    });

    it('does not call res.status or res.json', () => {
      const limiter = mockLimiter({ allowed: true, remaining: 9, resetAt: Date.now() + 1000 });
      const middleware = createRateLimitMiddleware(limiter);
      const res = makeRes();
      middleware(makeReq(), res, vi.fn());
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });

    it('sets X-RateLimit-Remaining header', () => {
      const limiter = mockLimiter({ allowed: true, remaining: 7, resetAt: Date.now() + 1000 });
      const middleware = createRateLimitMiddleware(limiter);
      const res = makeRes();
      middleware(makeReq(), res, vi.fn());
      expect(res.headers['X-RateLimit-Remaining']).toBe('7');
    });

    it('sets X-RateLimit-Reset header when resetAt is present', () => {
      const resetAt = Date.now() + 5000;
      const limiter = mockLimiter({ allowed: true, remaining: 3, resetAt });
      const middleware = createRateLimitMiddleware(limiter);
      const res = makeRes();
      middleware(makeReq(), res, vi.fn());
      expect(res.headers['X-RateLimit-Reset']).toBe(String(resetAt));
    });

    it('skips setting headers when res.headers is undefined', () => {
      const limiter = mockLimiter({ allowed: true, remaining: 5, resetAt: Date.now() + 1000 });
      const middleware = createRateLimitMiddleware(limiter);
      const res = makeRes(false);
      const next = vi.fn();
      // Should not throw and should still call next
      expect(() => middleware(makeReq(), res, next)).not.toThrow();
      expect(next).toHaveBeenCalled();
    });

    it('does not set X-RateLimit-Reset when resetAt is absent', () => {
      const limiter = mockLimiter({ allowed: true, remaining: 5 });
      const middleware = createRateLimitMiddleware(limiter);
      const res = makeRes();
      middleware(makeReq(), res, vi.fn());
      expect(res.headers['X-RateLimit-Reset']).toBeUndefined();
    });
  });

  describe('when request is denied', () => {
    it('calls res.status(429)', () => {
      const limiter = mockLimiter({ allowed: false, remaining: 0, retryAfter: 500 });
      const middleware = createRateLimitMiddleware(limiter);
      const res = makeRes();
      middleware(makeReq(), res, vi.fn());
      expect(res.status).toHaveBeenCalledWith(429);
    });

    it('calls res.json with error body', () => {
      const limiter = mockLimiter({ allowed: false, remaining: 0, retryAfter: 500 });
      const middleware = createRateLimitMiddleware(limiter);
      const res = makeRes();
      middleware(makeReq(), res, vi.fn());
      expect(res.json).toHaveBeenCalledWith({ error: 'Too Many Requests', retryAfter: 500 });
    });

    it('does not call next()', () => {
      const limiter = mockLimiter({ allowed: false, remaining: 0, retryAfter: 500 });
      const middleware = createRateLimitMiddleware(limiter);
      const next = vi.fn();
      const res2 = makeRes();
      middleware(makeReq(), res2, next);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('key extraction', () => {
    it('uses req.ip as default key', () => {
      const limiter = mockLimiter({ allowed: true, remaining: 5 });
      const middleware = createRateLimitMiddleware(limiter);
      middleware(makeReq('10.0.0.1'), makeRes(), vi.fn());
      expect(limiter.check).toHaveBeenCalledWith('10.0.0.1');
    });

    it('uses custom keyExtractor when provided', () => {
      const limiter = mockLimiter({ allowed: true, remaining: 5 });
      const middleware = createRateLimitMiddleware(limiter, {
        keyExtractor: (req) => req.headers['x-user-id'] ?? req.ip,
      });
      middleware(
        makeReq('10.0.0.1', { 'x-user-id': 'user-42' }),
        makeRes(),
        vi.fn(),
      );
      expect(limiter.check).toHaveBeenCalledWith('user-42');
    });

    it('falls back to req.ip when custom extractor returns req.ip', () => {
      const limiter = mockLimiter({ allowed: true, remaining: 5 });
      const middleware = createRateLimitMiddleware(limiter, {
        keyExtractor: (req) => req.headers['x-user-id'] ?? req.ip,
      });
      middleware(
        makeReq('192.168.0.1'),
        makeRes(),
        vi.fn(),
      );
      expect(limiter.check).toHaveBeenCalledWith('192.168.0.1');
    });
  });
});
