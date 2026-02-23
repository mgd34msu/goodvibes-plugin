import { FixedWindowLimiter } from '../fixed-window.js';

describe('FixedWindowLimiter', () => {
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
        new FixedWindowLimiter({ windowMs: 0, maxRequests: 5, strategy: 'fixed-window' }),
      ).toThrow(RangeError);
    });

    it('throws RangeError when windowMs is negative', () => {
      expect(() =>
        new FixedWindowLimiter({ windowMs: -1, maxRequests: 5, strategy: 'fixed-window' }),
      ).toThrow(RangeError);
    });

    it('throws RangeError when maxRequests is zero', () => {
      expect(() =>
        new FixedWindowLimiter({ windowMs: 1000, maxRequests: 0, strategy: 'fixed-window' }),
      ).toThrow(RangeError);
    });

    it('throws RangeError when maxRequests is negative', () => {
      expect(() =>
        new FixedWindowLimiter({ windowMs: 1000, maxRequests: -5, strategy: 'fixed-window' }),
      ).toThrow(RangeError);
    });

    it('constructs successfully with valid config', () => {
      expect(
        () => new FixedWindowLimiter({ windowMs: 1000, maxRequests: 5, strategy: 'fixed-window' }),
      ).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // consume() — increments counter and returns result
  // -------------------------------------------------------------------------

  describe('consume()', () => {
    it('allows requests within the window limit', () => {
      // windowMs=1000: windowStart = 5000 - (5000 % 1000) = 5000
      vi.setSystemTime(5000);
      const limiter = new FixedWindowLimiter({
        windowMs: 1000,
        maxRequests: 3,
        strategy: 'fixed-window',
      });

      expect(limiter.consume('u').allowed).toBe(true);
      expect(limiter.consume('u').allowed).toBe(true);
      expect(limiter.consume('u').allowed).toBe(true);
    });

    it('blocks when the window limit is reached', () => {
      vi.setSystemTime(5000);
      const limiter = new FixedWindowLimiter({
        windowMs: 1000,
        maxRequests: 2,
        strategy: 'fixed-window',
      });

      limiter.consume('u');
      limiter.consume('u');
      expect(limiter.consume('u').allowed).toBe(false);
    });

    it('returns correct remaining count after each consume', () => {
      vi.setSystemTime(5000);
      const limiter = new FixedWindowLimiter({
        windowMs: 1000,
        maxRequests: 3,
        strategy: 'fixed-window',
      });

      expect(limiter.consume('u').remaining).toBe(2);
      expect(limiter.consume('u').remaining).toBe(1);
      expect(limiter.consume('u').remaining).toBe(0);
      // blocked — counter not incremented, remaining stays 0
      expect(limiter.consume('u').remaining).toBe(0);
    });

    it('returns limit equal to maxRequests', () => {
      vi.setSystemTime(5000);
      const limiter = new FixedWindowLimiter({
        windowMs: 1000,
        maxRequests: 7,
        strategy: 'fixed-window',
      });
      expect(limiter.consume('u').limit).toBe(7);
    });

    it('resets the counter at the window boundary', () => {
      // windowMs=1000; windowStart for t=999 is 0, for t=1000 is 1000
      vi.setSystemTime(999);
      const limiter = new FixedWindowLimiter({
        windowMs: 1000,
        maxRequests: 2,
        strategy: 'fixed-window',
      });

      limiter.consume('u');
      limiter.consume('u');
      expect(limiter.consume('u').allowed).toBe(false);

      // Move into the next window boundary
      vi.setSystemTime(1000);
      expect(limiter.consume('u').allowed).toBe(true);
    });

    it('resets at exact window boundary (no off-by-one)', () => {
      // windowMs=1000, windowStart for 999 = 0, windowStart for 1000 = 1000
      vi.setSystemTime(999);
      const limiter = new FixedWindowLimiter({
        windowMs: 1000,
        maxRequests: 1,
        strategy: 'fixed-window',
      });

      limiter.consume('u');
      expect(limiter.consume('u').allowed).toBe(false);

      vi.setSystemTime(1000); // next window starts exactly here
      expect(limiter.consume('u').allowed).toBe(true);
    });

    it('tracks separate keys independently', () => {
      vi.setSystemTime(5000);
      const limiter = new FixedWindowLimiter({
        windowMs: 1000,
        maxRequests: 1,
        strategy: 'fixed-window',
      });

      limiter.consume('alice');
      expect(limiter.consume('alice').allowed).toBe(false);
      expect(limiter.consume('bob').allowed).toBe(true);
    });

    it('handles maxRequests of 1', () => {
      vi.setSystemTime(5000);
      const limiter = new FixedWindowLimiter({
        windowMs: 1000,
        maxRequests: 1,
        strategy: 'fixed-window',
      });

      expect(limiter.consume('u').allowed).toBe(true);
      expect(limiter.consume('u').allowed).toBe(false);

      vi.setSystemTime(6000); // next window
      expect(limiter.consume('u').allowed).toBe(true);
    });

    it('resetAt is the end of the current window', () => {
      // windowMs=1000, now=500 => windowStart=0, resetAt=1000
      vi.setSystemTime(500);
      const limiter = new FixedWindowLimiter({
        windowMs: 1000,
        maxRequests: 5,
        strategy: 'fixed-window',
      });

      const r = limiter.consume('u');
      expect(r.resetAt).toBe(1000); // windowStart(0) + windowMs(1000)
    });

    it('resetAt is consistent within the same window', () => {
      // windowMs=1000, now=750 => windowStart=0, resetAt=1000
      vi.setSystemTime(750);
      const limiter = new FixedWindowLimiter({
        windowMs: 1000,
        maxRequests: 5,
        strategy: 'fixed-window',
      });

      const r1 = limiter.consume('u');
      vi.setSystemTime(800); // still same window
      const r2 = limiter.consume('u');

      expect(r1.resetAt).toBe(1000);
      expect(r2.resetAt).toBe(1000);
    });

    it('does not allow carry-over from previous window (no sliding)', () => {
      // At t=500 and t=999 are in the same window (windowStart=0).
      // At t=1000 a new window starts with count=0.
      vi.setSystemTime(500);
      const limiter = new FixedWindowLimiter({
        windowMs: 1000,
        maxRequests: 3,
        strategy: 'fixed-window',
      });

      // Consume 2 in first window
      limiter.consume('u');
      limiter.consume('u');

      // Move to next window — should have a fresh 3, not 1
      vi.setSystemTime(1000);
      expect(limiter.consume('u').remaining).toBe(2);
      expect(limiter.consume('u').remaining).toBe(1);
      expect(limiter.consume('u').remaining).toBe(0);
      expect(limiter.consume('u').allowed).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // check() — non-consuming peek
  // -------------------------------------------------------------------------

  describe('check()', () => {
    it('returns allowed without incrementing the counter', () => {
      vi.setSystemTime(5000);
      const limiter = new FixedWindowLimiter({
        windowMs: 1000,
        maxRequests: 2,
        strategy: 'fixed-window',
      });

      // Repeated checks must not consume capacity
      expect(limiter.check('u').allowed).toBe(true);
      expect(limiter.check('u').allowed).toBe(true);
      expect(limiter.consume('u').allowed).toBe(true);
      expect(limiter.consume('u').allowed).toBe(true);
      expect(limiter.check('u').allowed).toBe(false);
    });

    it('returns remaining without decrementing', () => {
      vi.setSystemTime(5000);
      const limiter = new FixedWindowLimiter({
        windowMs: 1000,
        maxRequests: 3,
        strategy: 'fixed-window',
      });
      limiter.consume('u');

      expect(limiter.check('u').remaining).toBe(2);
      expect(limiter.check('u').remaining).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // reset() and resetAll()
  // -------------------------------------------------------------------------

  describe('reset()', () => {
    it('clears the window state for the specified key', () => {
      vi.setSystemTime(5000);
      const limiter = new FixedWindowLimiter({
        windowMs: 1000,
        maxRequests: 1,
        strategy: 'fixed-window',
      });

      limiter.consume('u');
      expect(limiter.consume('u').allowed).toBe(false);

      limiter.reset('u');
      expect(limiter.consume('u').allowed).toBe(true);
    });

    it('does not affect other keys', () => {
      vi.setSystemTime(5000);
      const limiter = new FixedWindowLimiter({
        windowMs: 1000,
        maxRequests: 1,
        strategy: 'fixed-window',
      });

      limiter.consume('a');
      limiter.consume('b');
      limiter.reset('a');

      expect(limiter.consume('a').allowed).toBe(true);
      expect(limiter.consume('b').allowed).toBe(false);
    });

    it('is safe to call on an unknown key', () => {
      const limiter = new FixedWindowLimiter({
        windowMs: 1000,
        maxRequests: 5,
        strategy: 'fixed-window',
      });
      expect(() => limiter.reset('ghost')).not.toThrow();
    });
  });

  describe('resetAll()', () => {
    it('clears all window state', () => {
      vi.setSystemTime(5000);
      const limiter = new FixedWindowLimiter({
        windowMs: 1000,
        maxRequests: 1,
        strategy: 'fixed-window',
      });

      limiter.consume('a');
      limiter.consume('b');
      limiter.resetAll();

      expect(limiter.consume('a').allowed).toBe(true);
      expect(limiter.consume('b').allowed).toBe(true);
    });
  });
});
