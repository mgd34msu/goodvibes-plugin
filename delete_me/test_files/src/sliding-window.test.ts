import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SlidingWindowLimiter } from './sliding-window.js';
import { RateLimiterError } from './types.js';

describe('SlidingWindowLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor validation', () => {
    it('throws RateLimiterError for non-positive windowMs', () => {
      expect(() => new SlidingWindowLimiter({ windowMs: 0, maxRequests: 10 })).toThrow(RateLimiterError);
      expect(() => new SlidingWindowLimiter({ windowMs: -1, maxRequests: 10 })).toThrow(RateLimiterError);
    });

    it('throws RateLimiterError for non-positive maxRequests', () => {
      expect(() => new SlidingWindowLimiter({ windowMs: 1000, maxRequests: 0 })).toThrow(RateLimiterError);
      expect(() => new SlidingWindowLimiter({ windowMs: 1000, maxRequests: -5 })).toThrow(RateLimiterError);
    });

    it('throws RateLimiterError for non-finite windowMs', () => {
      expect(() => new SlidingWindowLimiter({ windowMs: Infinity, maxRequests: 10 })).toThrow(RateLimiterError);
      expect(() => new SlidingWindowLimiter({ windowMs: NaN, maxRequests: 10 })).toThrow(RateLimiterError);
    });

    it('throws RateLimiterError for non-finite maxRequests', () => {
      expect(() => new SlidingWindowLimiter({ windowMs: 1000, maxRequests: Infinity })).toThrow(RateLimiterError);
      expect(() => new SlidingWindowLimiter({ windowMs: 1000, maxRequests: NaN })).toThrow(RateLimiterError);
    });

    it('throws RateLimiterError for non-number windowMs', () => {
      expect(() => new SlidingWindowLimiter({ windowMs: 'one' as unknown as number, maxRequests: 10 })).toThrow(RateLimiterError);
    });

    it('throws RateLimiterError for non-number maxRequests', () => {
      expect(() => new SlidingWindowLimiter({ windowMs: 1000, maxRequests: 'ten' as unknown as number })).toThrow(RateLimiterError);
    });

    it('accepts valid positive finite values', () => {
      expect(() => new SlidingWindowLimiter({ windowMs: 1000, maxRequests: 5 })).not.toThrow();
    });
  });

  describe('check()', () => {
    it('allows requests within limit', () => {
      const limiter = new SlidingWindowLimiter({ windowMs: 1000, maxRequests: 3 });
      expect(limiter.check('ip').allowed).toBe(true);
      expect(limiter.check('ip').allowed).toBe(true);
      expect(limiter.check('ip').allowed).toBe(true);
    });

    it('denies the request that exceeds the limit', () => {
      const limiter = new SlidingWindowLimiter({ windowMs: 1000, maxRequests: 2 });
      limiter.check('ip');
      limiter.check('ip');
      expect(limiter.check('ip').allowed).toBe(false);
    });

    it('tracks remaining correctly', () => {
      const limiter = new SlidingWindowLimiter({ windowMs: 1000, maxRequests: 3 });
      expect(limiter.check('ip').remaining).toBe(2);
      expect(limiter.check('ip').remaining).toBe(1);
      expect(limiter.check('ip').remaining).toBe(0);
    });

    it('returns remaining 0 when denied', () => {
      const limiter = new SlidingWindowLimiter({ windowMs: 1000, maxRequests: 1 });
      limiter.check('ip');
      const result = limiter.check('ip');
      expect(result.remaining).toBe(0);
    });

    it('returns retryAfter when denied', () => {
      const limiter = new SlidingWindowLimiter({ windowMs: 1000, maxRequests: 1 });
      limiter.check('ip');
      const result = limiter.check('ip');
      expect(result.retryAfter).toBeGreaterThan(0);
      expect(result.retryAfter).toBeLessThanOrEqual(1000);
    });

    it('returns resetAt', () => {
      const limiter = new SlidingWindowLimiter({ windowMs: 1000, maxRequests: 5 });
      const result = limiter.check('ip');
      expect(result.resetAt).toBeDefined();
    });

    it('supports independent keys', () => {
      const limiter = new SlidingWindowLimiter({ windowMs: 1000, maxRequests: 1 });
      limiter.check('user-a');
      expect(limiter.check('user-a').allowed).toBe(false);
      expect(limiter.check('user-b').allowed).toBe(true);
    });

    it('allows again after the window slides past', () => {
      const limiter = new SlidingWindowLimiter({ windowMs: 1000, maxRequests: 1 });
      limiter.check('ip');
      expect(limiter.check('ip').allowed).toBe(false);

      vi.advanceTimersByTime(1100);
      expect(limiter.check('ip').allowed).toBe(true);
    });

    it('cleans up old entries to prevent memory leaks', () => {
      const limiter = new SlidingWindowLimiter({ windowMs: 500, maxRequests: 10 });
      for (let i = 0; i < 5; i++) {
        limiter.check('ip');
      }
      vi.advanceTimersByTime(600);
      // After sliding past, old entries are pruned on next check
      const result = limiter.check('ip');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9); // only this one request in window
    });
  });

  describe('reset()', () => {
    it('resets a specific key', () => {
      const limiter = new SlidingWindowLimiter({ windowMs: 1000, maxRequests: 1 });
      limiter.check('a');
      limiter.reset('a');
      expect(limiter.check('a').allowed).toBe(true);
    });

    it('does not reset other keys when resetting a specific key', () => {
      const limiter = new SlidingWindowLimiter({ windowMs: 1000, maxRequests: 1 });
      limiter.check('a');
      limiter.check('b');
      limiter.reset('a');
      expect(limiter.check('b').allowed).toBe(false);
    });

    it('resets all keys when called with no argument', () => {
      const limiter = new SlidingWindowLimiter({ windowMs: 1000, maxRequests: 1 });
      limiter.check('a');
      limiter.check('b');
      limiter.reset();
      expect(limiter.check('a').allowed).toBe(true);
      expect(limiter.check('b').allowed).toBe(true);
    });
  });
});
