import { SlidingWindowLimiter } from '../sliding-window.js';

describe('SlidingWindowLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // Constructor validation
  // -------------------------------------------------------------------------

  describe('constructor', () => {
    it('throws RangeError when windowMs is zero', () => {
      expect(() =>
        new SlidingWindowLimiter({ windowMs: 0, maxRequests: 5, strategy: 'sliding-window' }),
      ).toThrow(RangeError);
    });

    it('throws RangeError when windowMs is negative', () => {
      expect(() =>
        new SlidingWindowLimiter({ windowMs: -1000, maxRequests: 5, strategy: 'sliding-window' }),
      ).toThrow(RangeError);
    });

    it('throws RangeError when maxRequests is zero', () => {
      expect(() =>
        new SlidingWindowLimiter({ windowMs: 1000, maxRequests: 0, strategy: 'sliding-window' }),
      ).toThrow(RangeError);
    });

    it('throws RangeError when maxRequests is negative', () => {
      expect(() =>
        new SlidingWindowLimiter({ windowMs: 1000, maxRequests: -1, strategy: 'sliding-window' }),
      ).toThrow(RangeError);
    });

    it('constructs successfully with valid config', () => {
      expect(
        () => new SlidingWindowLimiter({ windowMs: 1000, maxRequests: 5, strategy: 'sliding-window' }),
      ).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // consume() — records request and returns result
  // -------------------------------------------------------------------------

  describe('consume()', () => {
    it('allows requests within the limit', () => {
      vi.setSystemTime(1000);
      const limiter = new SlidingWindowLimiter({
        windowMs: 10000,
        maxRequests: 3,
        strategy: 'sliding-window',
      });

      const r1 = limiter.consume('user');
      const r2 = limiter.consume('user');
      const r3 = limiter.consume('user');

      expect(r1.allowed).toBe(true);
      expect(r2.allowed).toBe(true);
      expect(r3.allowed).toBe(true);
    });

    it('blocks the request when the limit is exceeded', () => {
      vi.setSystemTime(1000);
      const limiter = new SlidingWindowLimiter({
        windowMs: 10000,
        maxRequests: 2,
        strategy: 'sliding-window',
      });

      limiter.consume('user');
      limiter.consume('user');
      const blocked = limiter.consume('user');

      expect(blocked.allowed).toBe(false);
    });

    it('returns correct remaining count after each consume', () => {
      vi.setSystemTime(5000);
      const limiter = new SlidingWindowLimiter({
        windowMs: 10000,
        maxRequests: 3,
        strategy: 'sliding-window',
      });

      expect(limiter.consume('k').remaining).toBe(2);
      expect(limiter.consume('k').remaining).toBe(1);
      expect(limiter.consume('k').remaining).toBe(0);
      // blocked — remaining stays 0
      expect(limiter.consume('k').remaining).toBe(0);
    });

    it('returns limit equal to maxRequests in every result', () => {
      vi.setSystemTime(1000);
      const limiter = new SlidingWindowLimiter({
        windowMs: 10000,
        maxRequests: 5,
        strategy: 'sliding-window',
      });
      expect(limiter.consume('x').limit).toBe(5);
    });

    it('resets after the window expires', () => {
      vi.setSystemTime(1000);
      const limiter = new SlidingWindowLimiter({
        windowMs: 5000,
        maxRequests: 2,
        strategy: 'sliding-window',
      });

      limiter.consume('user');
      limiter.consume('user');
      expect(limiter.consume('user').allowed).toBe(false);

      // Advance past the window so all timestamps expire.
      // First timestamp recorded at t=1000; window is 5000ms, so expires at 6001.
      vi.setSystemTime(6001);
      expect(limiter.consume('user').allowed).toBe(true);
    });

    it('tracks separate keys independently', () => {
      vi.setSystemTime(1000);
      const limiter = new SlidingWindowLimiter({
        windowMs: 10000,
        maxRequests: 1,
        strategy: 'sliding-window',
      });

      limiter.consume('alice');
      // alice is exhausted but bob has a fresh window
      expect(limiter.consume('alice').allowed).toBe(false);
      expect(limiter.consume('bob').allowed).toBe(true);
    });

    it('handles rapid sequential requests correctly', () => {
      vi.setSystemTime(1000);
      const limiter = new SlidingWindowLimiter({
        windowMs: 1000,
        maxRequests: 5,
        strategy: 'sliding-window',
      });

      const results: boolean[] = [];
      for (let i = 0; i < 7; i++) {
        results.push(limiter.consume('user').allowed);
      }

      // First 5 allowed, next 2 blocked
      expect(results).toEqual([true, true, true, true, true, false, false]);
    });

    it('handles maxRequests of 1 correctly', () => {
      vi.setSystemTime(2000);
      const limiter = new SlidingWindowLimiter({
        windowMs: 1000,
        maxRequests: 1,
        strategy: 'sliding-window',
      });

      expect(limiter.consume('u').allowed).toBe(true);
      expect(limiter.consume('u').allowed).toBe(false);

      // After window expires the single slot is available again
      vi.setSystemTime(3001);
      expect(limiter.consume('u').allowed).toBe(true);
    });

    it('resetAt is in the future when window is active', () => {
      vi.setSystemTime(1000);
      const limiter = new SlidingWindowLimiter({
        windowMs: 5000,
        maxRequests: 3,
        strategy: 'sliding-window',
      });

      const r = limiter.consume('u');
      // resetAt = timestamp of oldest entry + windowMs = 1000 + 5000
      expect(r.resetAt).toBe(6000);
    });

    it('resetAt falls back to now + windowMs when no entries exist', () => {
      vi.setSystemTime(2000);
      const limiter = new SlidingWindowLimiter({
        windowMs: 3000,
        maxRequests: 5,
        strategy: 'sliding-window',
      });

      // check() before any consume — no entries yet
      const r = limiter.check('new-key');
      expect(r.resetAt).toBe(5000); // 2000 + 3000
    });
  });

  // -------------------------------------------------------------------------
  // check() — non-consuming peek
  // -------------------------------------------------------------------------

  describe('check()', () => {
    it('returns allowed when under limit without consuming capacity', () => {
      vi.setSystemTime(1000);
      const limiter = new SlidingWindowLimiter({
        windowMs: 10000,
        maxRequests: 2,
        strategy: 'sliding-window',
      });

      // check twice — must not consume
      expect(limiter.check('u').allowed).toBe(true);
      expect(limiter.check('u').allowed).toBe(true);
      // consume is still available
      expect(limiter.consume('u').allowed).toBe(true);
      expect(limiter.consume('u').allowed).toBe(true);
      // now exhausted
      expect(limiter.check('u').allowed).toBe(false);
    });

    it('returns remaining without decrementing', () => {
      vi.setSystemTime(1000);
      const limiter = new SlidingWindowLimiter({
        windowMs: 10000,
        maxRequests: 3,
        strategy: 'sliding-window',
      });
      limiter.consume('u');

      // Two identical check() calls must return the same remaining
      expect(limiter.check('u').remaining).toBe(2);
      expect(limiter.check('u').remaining).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // reset() and resetAll()
  // -------------------------------------------------------------------------

  describe('reset()', () => {
    it('clears state for the specified key', () => {
      vi.setSystemTime(1000);
      const limiter = new SlidingWindowLimiter({
        windowMs: 10000,
        maxRequests: 1,
        strategy: 'sliding-window',
      });

      limiter.consume('alice');
      expect(limiter.consume('alice').allowed).toBe(false);

      limiter.reset('alice');
      expect(limiter.consume('alice').allowed).toBe(true);
    });

    it('does not affect other keys', () => {
      vi.setSystemTime(1000);
      const limiter = new SlidingWindowLimiter({
        windowMs: 10000,
        maxRequests: 1,
        strategy: 'sliding-window',
      });

      limiter.consume('alice');
      limiter.consume('bob');

      limiter.reset('alice');
      // alice is reset, bob is still exhausted
      expect(limiter.consume('alice').allowed).toBe(true);
      expect(limiter.consume('bob').allowed).toBe(false);
    });

    it('is safe to call on a key that has never been used', () => {
      const limiter = new SlidingWindowLimiter({
        windowMs: 1000,
        maxRequests: 5,
        strategy: 'sliding-window',
      });
      expect(() => limiter.reset('unknown')).not.toThrow();
    });
  });

  describe('resetAll()', () => {
    it('clears state for all keys', () => {
      vi.setSystemTime(1000);
      const limiter = new SlidingWindowLimiter({
        windowMs: 10000,
        maxRequests: 1,
        strategy: 'sliding-window',
      });

      limiter.consume('alice');
      limiter.consume('bob');

      limiter.resetAll();

      expect(limiter.consume('alice').allowed).toBe(true);
      expect(limiter.consume('bob').allowed).toBe(true);
    });
  });
});
