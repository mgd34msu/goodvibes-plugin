import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TokenBucket } from './token-bucket.js';
import { RateLimiterError } from './types.js';

describe('TokenBucket', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor validation', () => {
    it('throws RateLimiterError for non-positive capacity', () => {
      expect(() => new TokenBucket({ capacity: 0, refillRate: 1 })).toThrow(RateLimiterError);
      expect(() => new TokenBucket({ capacity: -1, refillRate: 1 })).toThrow(RateLimiterError);
    });

    it('throws RateLimiterError for non-positive refillRate', () => {
      expect(() => new TokenBucket({ capacity: 10, refillRate: 0 })).toThrow(RateLimiterError);
      expect(() => new TokenBucket({ capacity: 10, refillRate: -5 })).toThrow(RateLimiterError);
    });

    it('throws RateLimiterError for non-finite capacity', () => {
      expect(() => new TokenBucket({ capacity: Infinity, refillRate: 1 })).toThrow(RateLimiterError);
      expect(() => new TokenBucket({ capacity: NaN, refillRate: 1 })).toThrow(RateLimiterError);
    });

    it('throws RateLimiterError for non-finite refillRate', () => {
      expect(() => new TokenBucket({ capacity: 10, refillRate: Infinity })).toThrow(RateLimiterError);
      expect(() => new TokenBucket({ capacity: 10, refillRate: NaN })).toThrow(RateLimiterError);
    });

    it('throws RateLimiterError for non-number capacity', () => {
      expect(() => new TokenBucket({ capacity: 'ten' as unknown as number, refillRate: 1 })).toThrow(RateLimiterError);
    });

    it('throws RateLimiterError for non-number refillRate', () => {
      expect(() => new TokenBucket({ capacity: 10, refillRate: 'one' as unknown as number })).toThrow(RateLimiterError);
    });

    it('accepts valid positive finite values', () => {
      expect(() => new TokenBucket({ capacity: 1, refillRate: 0.5 })).not.toThrow();
    });
  });

  describe('check()', () => {
    it('allows requests when tokens are available', () => {
      const bucket = new TokenBucket({ capacity: 5, refillRate: 1 });
      const result = bucket.check('user-1');
      expect(result.allowed).toBe(true);
    });

    it('decrements remaining tokens on each allowed request', () => {
      const bucket = new TokenBucket({ capacity: 3, refillRate: 1 });
      expect(bucket.check('x').remaining).toBe(2);
      expect(bucket.check('x').remaining).toBe(1);
      expect(bucket.check('x').remaining).toBe(0);
    });

    it('denies requests when bucket is empty', () => {
      const bucket = new TokenBucket({ capacity: 1, refillRate: 1 });
      bucket.check('x'); // consume the only token
      const result = bucket.check('x');
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('returns retryAfter when denied', () => {
      const bucket = new TokenBucket({ capacity: 1, refillRate: 1 });
      bucket.check('x');
      const result = bucket.check('x');
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it('returns resetAt when allowed', () => {
      const bucket = new TokenBucket({ capacity: 5, refillRate: 1 });
      const result = bucket.check('x');
      expect(result.resetAt).toBeDefined();
      expect(result.resetAt).toBeGreaterThan(Date.now());
    });

    it('ignores the key parameter (all callers share one bucket)', () => {
      const bucket = new TokenBucket({ capacity: 1, refillRate: 1 });
      bucket.check('user-1'); // consume
      const result = bucket.check('user-2');
      expect(result.allowed).toBe(false);
    });

    it('refills tokens over time', () => {
      const bucket = new TokenBucket({ capacity: 2, refillRate: 1 });
      bucket.check('x');
      bucket.check('x'); // now empty
      expect(bucket.check('x').allowed).toBe(false);

      vi.advanceTimersByTime(1100); // advance 1.1 seconds
      const result = bucket.check('x');
      expect(result.allowed).toBe(true);
    });

    it('does not exceed capacity on refill', () => {
      const bucket = new TokenBucket({ capacity: 3, refillRate: 10 });
      vi.advanceTimersByTime(10000); // would add 100 tokens without cap
      const result = bucket.check('x');
      expect(result.remaining).toBeLessThanOrEqual(2); // capacity - 1
    });
  });

  describe('reset()', () => {
    it('resets the bucket to full capacity', () => {
      const bucket = new TokenBucket({ capacity: 2, refillRate: 1 });
      bucket.check('x');
      bucket.check('x'); // empty
      bucket.reset();
      expect(bucket.check('x').allowed).toBe(true);
    });

    it('accepts and ignores a key argument', () => {
      const bucket = new TokenBucket({ capacity: 1, refillRate: 1 });
      bucket.check('x'); // empty
      bucket.reset('some-key');
      expect(bucket.check('x').allowed).toBe(true);
    });
  });
});
