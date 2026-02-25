import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { FixedWindowCounter } from './fixed-window.js';
import { RateLimiterError } from './types.js';

describe('FixedWindowCounter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor validation', () => {
    it('throws RateLimiterError for non-positive windowMs', () => {
      expect(() => new FixedWindowCounter({ windowMs: 0, maxRequests: 10 })).toThrow(RateLimiterError);
      expect(() => new FixedWindowCounter({ windowMs: -100, maxRequests: 10 })).toThrow(RateLimiterError);
    });

    it('throws RateLimiterError for non-positive maxRequests', () => {
      expect(() => new FixedWindowCounter({ windowMs: 1000, maxRequests: 0 })).toThrow(RateLimiterError);
      expect(() => new FixedWindowCounter({ windowMs: 1000, maxRequests: -1 })).toThrow(RateLimiterError);
    });

    it('throws RateLimiterError for non-finite windowMs', () => {
      expect(() => new FixedWindowCounter({ windowMs: Infinity, maxRequests: 10 })).toThrow(RateLimiterError);
      expect(() => new FixedWindowCounter({ windowMs: NaN, maxRequests: 10 })).toThrow(RateLimiterError);
    });

    it('throws RateLimiterError for non-finite maxRequests', () => {
      expect(() => new FixedWindowCounter({ windowMs: 1000, maxRequests: Infinity })).toThrow(RateLimiterError);
      expect(() => new FixedWindowCounter({ windowMs: 1000, maxRequests: NaN })).toThrow(RateLimiterError);
    });

    it('throws RateLimiterError for non-number windowMs', () => {
      expect(() => new FixedWindowCounter({ windowMs: 'fast' as unknown as number, maxRequests: 10 })).toThrow(RateLimiterError);
    });

    it('throws RateLimiterError for non-number maxRequests', () => {
      expect(() => new FixedWindowCounter({ windowMs: 1000, maxRequests: 'many' as unknown as number })).toThrow(RateLimiterError);
    });

    it('accepts valid positive finite values', () => {
      expect(() => new FixedWindowCounter({ windowMs: 1000, maxRequests: 5 })).not.toThrow();
    });
  });

  describe('check()', () => {
    it('allows requests within the limit', () => {
      const limiter = new FixedWindowCounter({ windowMs: 1000, maxRequests: 3 });
      expect(limiter.check('ip').allowed).toBe(true);
      expect(limiter.check('ip').allowed).toBe(true);
      expect(limiter.check('ip').allowed).toBe(true);
    });

    it('denies the request that exceeds the limit', () => {
      const limiter = new FixedWindowCounter({ windowMs: 1000, maxRequests: 2 });
      limiter.check('ip');
      limiter.check('ip');
      expect(limiter.check('ip').allowed).toBe(false);
    });

    it('tracks remaining correctly', () => {
      const limiter = new FixedWindowCounter({ windowMs: 1000, maxRequests: 3 });
      expect(limiter.check('ip').remaining).toBe(2);
      expect(limiter.check('ip').remaining).toBe(1);
      expect(limiter.check('ip').remaining).toBe(0);
    });

    it('returns remaining 0 when denied', () => {
      const limiter = new FixedWindowCounter({ windowMs: 1000, maxRequests: 1 });
      limiter.check('ip');
      expect(limiter.check('ip').remaining).toBe(0);
    });

    it('returns resetAt aligned to window boundary', () => {
      vi.setSystemTime(new Date('2024-01-01T00:00:30.000Z')); // 30s into a 60s window
      const limiter = new FixedWindowCounter({ windowMs: 60_000, maxRequests: 10 });
      const result = limiter.check('ip');
      // Window started at :00:00, resets at :01:00
      expect(result.resetAt).toBe(new Date('2024-01-01T00:01:00.000Z').getTime());
    });

    it('returns retryAfter when denied', () => {
      const limiter = new FixedWindowCounter({ windowMs: 1000, maxRequests: 1 });
      limiter.check('ip');
      const result = limiter.check('ip');
      expect(result.retryAfter).toBeGreaterThan(0);
      expect(result.retryAfter).toBeLessThanOrEqual(1000);
    });

    it('supports independent keys', () => {
      const limiter = new FixedWindowCounter({ windowMs: 1000, maxRequests: 1 });
      limiter.check('user-a');
      expect(limiter.check('user-a').allowed).toBe(false);
      expect(limiter.check('user-b').allowed).toBe(true);
    });

    it('allows again after the window rolls over', () => {
      const limiter = new FixedWindowCounter({ windowMs: 1000, maxRequests: 1 });
      limiter.check('ip');
      expect(limiter.check('ip').allowed).toBe(false);

      vi.advanceTimersByTime(1100);
      expect(limiter.check('ip').allowed).toBe(true);
    });

    it('aligns window to clock boundary, not first request', () => {
      vi.setSystemTime(500); // halfway through a 1000ms window
      const limiter = new FixedWindowCounter({ windowMs: 1000, maxRequests: 1 });
      limiter.check('ip');

      vi.advanceTimersByTime(600); // now at t=1100, next window started at t=1000
      expect(limiter.check('ip').allowed).toBe(true);
    });
  });

  describe('reset()', () => {
    it('resets a specific key', () => {
      const limiter = new FixedWindowCounter({ windowMs: 1000, maxRequests: 1 });
      limiter.check('a');
      limiter.reset('a');
      expect(limiter.check('a').allowed).toBe(true);
    });

    it('does not reset other keys when resetting a specific key', () => {
      const limiter = new FixedWindowCounter({ windowMs: 1000, maxRequests: 1 });
      limiter.check('a');
      limiter.check('b');
      limiter.reset('a');
      expect(limiter.check('b').allowed).toBe(false);
    });

    it('resets all keys when called with no argument', () => {
      const limiter = new FixedWindowCounter({ windowMs: 1000, maxRequests: 1 });
      limiter.check('a');
      limiter.check('b');
      limiter.reset();
      expect(limiter.check('a').allowed).toBe(true);
      expect(limiter.check('b').allowed).toBe(true);
    });
  });
});
