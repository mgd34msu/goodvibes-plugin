import { TokenBucketLimiter } from '../token-bucket.js';

describe('TokenBucketLimiter', () => {
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
        new TokenBucketLimiter({ windowMs: 0, maxRequests: 5, strategy: 'token-bucket' }),
      ).toThrow(RangeError);
    });

    it('throws RangeError when windowMs is negative', () => {
      expect(() =>
        new TokenBucketLimiter({ windowMs: -500, maxRequests: 5, strategy: 'token-bucket' }),
      ).toThrow(RangeError);
    });

    it('throws RangeError when maxRequests is zero', () => {
      expect(() =>
        new TokenBucketLimiter({ windowMs: 1000, maxRequests: 0, strategy: 'token-bucket' }),
      ).toThrow(RangeError);
    });

    it('throws RangeError when maxRequests is negative', () => {
      expect(() =>
        new TokenBucketLimiter({ windowMs: 1000, maxRequests: -1, strategy: 'token-bucket' }),
      ).toThrow(RangeError);
    });

    it('throws RangeError when explicit refillRate is zero', () => {
      expect(() =>
        new TokenBucketLimiter(
          { windowMs: 1000, maxRequests: 5, strategy: 'token-bucket' },
          0,
        ),
      ).toThrow(RangeError);
    });

    it('throws RangeError when explicit refillRate is negative', () => {
      expect(() =>
        new TokenBucketLimiter(
          { windowMs: 1000, maxRequests: 5, strategy: 'token-bucket' },
          -1,
        ),
      ).toThrow(RangeError);
    });

    it('constructs successfully with valid config and no refillRate', () => {
      expect(
        () => new TokenBucketLimiter({ windowMs: 1000, maxRequests: 5, strategy: 'token-bucket' }),
      ).not.toThrow();
    });

    it('constructs successfully with explicit positive refillRate', () => {
      expect(
        () =>
          new TokenBucketLimiter(
            { windowMs: 1000, maxRequests: 5, strategy: 'token-bucket' },
            10,
          ),
      ).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // consume() — deducts a token and returns result
  // -------------------------------------------------------------------------

  describe('consume()', () => {
    it('allows requests when tokens are available', () => {
      vi.setSystemTime(1000);
      const limiter = new TokenBucketLimiter({
        windowMs: 10000,
        maxRequests: 3,
        strategy: 'token-bucket',
      });

      expect(limiter.consume('u').allowed).toBe(true);
      expect(limiter.consume('u').allowed).toBe(true);
      expect(limiter.consume('u').allowed).toBe(true);
    });

    it('blocks when the bucket is empty', () => {
      vi.setSystemTime(1000);
      const limiter = new TokenBucketLimiter({
        windowMs: 10000,
        maxRequests: 2,
        strategy: 'token-bucket',
      });

      limiter.consume('u');
      limiter.consume('u');
      expect(limiter.consume('u').allowed).toBe(false);
    });

    it('returns correct remaining after each consume', () => {
      vi.setSystemTime(1000);
      const limiter = new TokenBucketLimiter({
        windowMs: 10000,
        maxRequests: 3,
        strategy: 'token-bucket',
      });

      // Bucket starts full (3 tokens)
      expect(limiter.consume('u').remaining).toBe(2);
      expect(limiter.consume('u').remaining).toBe(1);
      expect(limiter.consume('u').remaining).toBe(0);
      // blocked — token not consumed, remaining stays 0
      expect(limiter.consume('u').remaining).toBe(0);
    });

    it('returns limit equal to maxRequests', () => {
      vi.setSystemTime(1000);
      const limiter = new TokenBucketLimiter({
        windowMs: 1000,
        maxRequests: 10,
        strategy: 'token-bucket',
      });
      expect(limiter.consume('u').limit).toBe(10);
    });

    it('bucket starts full on first use', () => {
      vi.setSystemTime(1000);
      const limiter = new TokenBucketLimiter({
        windowMs: 1000,
        maxRequests: 5,
        strategy: 'token-bucket',
      });
      // First consume returns remaining = maxRequests - 1
      expect(limiter.consume('u').remaining).toBe(4);
    });

    it('tracks multiple keys independently', () => {
      vi.setSystemTime(1000);
      const limiter = new TokenBucketLimiter({
        windowMs: 10000,
        maxRequests: 1,
        strategy: 'token-bucket',
      });

      limiter.consume('alice');
      // alice is exhausted; bob still has a full bucket
      expect(limiter.consume('alice').allowed).toBe(false);
      expect(limiter.consume('bob').allowed).toBe(true);
    });

    it('handles burst: maxRequests consecutive requests all succeed', () => {
      vi.setSystemTime(1000);
      const maxRequests = 5;
      const limiter = new TokenBucketLimiter({
        windowMs: 60000,
        maxRequests,
        strategy: 'token-bucket',
      });

      for (let i = 0; i < maxRequests; i++) {
        expect(limiter.consume('u').allowed).toBe(true);
      }
      // One over the burst limit is blocked
      expect(limiter.consume('u').allowed).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Token refill behaviour
  // -------------------------------------------------------------------------

  describe('token refill', () => {
    it('refills tokens over time (full refill after one window)', () => {
      vi.setSystemTime(0);
      // 2 tokens per 1000ms => 1 full refill per second
      const limiter = new TokenBucketLimiter({
        windowMs: 1000,
        maxRequests: 2,
        strategy: 'token-bucket',
      });

      // Drain the bucket
      limiter.consume('u');
      limiter.consume('u');
      expect(limiter.consume('u').allowed).toBe(false);

      // Advance by one full window — bucket should be full again
      vi.setSystemTime(1000);
      expect(limiter.consume('u').allowed).toBe(true);
    });

    it('partial refill after less than one window', () => {
      vi.setSystemTime(0);
      // 10 req / 1000ms => refill rate 10 tokens/sec = 0.01 tokens/ms
      const limiter = new TokenBucketLimiter({
        windowMs: 1000,
        maxRequests: 10,
        strategy: 'token-bucket',
      });

      // Drain all tokens
      for (let i = 0; i < 10; i++) {
        limiter.consume('u');
      }
      expect(limiter.consume('u').allowed).toBe(false);

      // Advance 500ms => 500 * 0.01 = 5 tokens refilled
      vi.setSystemTime(500);
      const r = limiter.consume('u');
      expect(r.allowed).toBe(true);
      // After consuming one of the 5 refilled tokens, 4 remain
      expect(r.remaining).toBe(4);
    });

    it('does not exceed maxRequests after a long idle period', () => {
      vi.setSystemTime(0);
      const limiter = new TokenBucketLimiter({
        windowMs: 1000,
        maxRequests: 3,
        strategy: 'token-bucket',
      });

      // Let a large amount of time pass without any consume
      vi.setSystemTime(100000);
      // First check should show maxRequests remaining before any consume
      const r = limiter.check('u');
      expect(r.remaining).toBe(3); // capped at maxRequests
    });

    it('refills with a custom refillRate', () => {
      vi.setSystemTime(0);
      // maxRequests=5, but refill at 20 tokens/sec = 0.02 tokens/ms
      const limiter = new TokenBucketLimiter(
        { windowMs: 1000, maxRequests: 5, strategy: 'token-bucket' },
        20,
      );

      // Drain all 5 tokens
      for (let i = 0; i < 5; i++) {
        limiter.consume('u');
      }
      expect(limiter.consume('u').allowed).toBe(false);

      // 50ms * 0.02/ms = 1 token refilled
      vi.setSystemTime(50);
      expect(limiter.consume('u').allowed).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // check() — non-consuming peek
  // -------------------------------------------------------------------------

  describe('check()', () => {
    it('returns allowed without consuming a token', () => {
      vi.setSystemTime(1000);
      const limiter = new TokenBucketLimiter({
        windowMs: 10000,
        maxRequests: 1,
        strategy: 'token-bucket',
      });

      expect(limiter.check('u').allowed).toBe(true);
      expect(limiter.check('u').allowed).toBe(true); // still true — not consumed
      expect(limiter.consume('u').allowed).toBe(true);
      expect(limiter.check('u').allowed).toBe(false); // now empty
    });

    it('returns remaining without decrementing', () => {
      vi.setSystemTime(1000);
      const limiter = new TokenBucketLimiter({
        windowMs: 1000,
        maxRequests: 5,
        strategy: 'token-bucket',
      });

      // New key — bucket full
      expect(limiter.check('u').remaining).toBe(5);
      expect(limiter.check('u').remaining).toBe(5);
    });

    it('resetAt is now when bucket is non-empty', () => {
      vi.setSystemTime(1000);
      const limiter = new TokenBucketLimiter({
        windowMs: 1000,
        maxRequests: 5,
        strategy: 'token-bucket',
      });

      const r = limiter.check('u');
      expect(r.resetAt).toBe(1000); // tokens >= 1, so resetAt = now
    });

    it('resetAt is in the future when bucket is empty', () => {
      vi.setSystemTime(0);
      // 1 token / 1000ms = 0.001 tokens/ms
      const limiter = new TokenBucketLimiter({
        windowMs: 1000,
        maxRequests: 1,
        strategy: 'token-bucket',
      });

      limiter.consume('u'); // drain the single token
      const r = limiter.check('u');
      expect(r.allowed).toBe(false);
      // tokens = 0, need 1 more. 1 / 0.001 = 1000ms from now
      expect(r.resetAt).toBe(1000);
    });
  });

  // -------------------------------------------------------------------------
  // reset() and resetAll()
  // -------------------------------------------------------------------------

  describe('reset()', () => {
    it('restores a full bucket for the specified key', () => {
      vi.setSystemTime(1000);
      const limiter = new TokenBucketLimiter({
        windowMs: 10000,
        maxRequests: 1,
        strategy: 'token-bucket',
      });

      limiter.consume('u');
      expect(limiter.consume('u').allowed).toBe(false);

      limiter.reset('u');
      expect(limiter.consume('u').allowed).toBe(true);
    });

    it('does not affect other keys', () => {
      vi.setSystemTime(1000);
      const limiter = new TokenBucketLimiter({
        windowMs: 10000,
        maxRequests: 1,
        strategy: 'token-bucket',
      });

      limiter.consume('a');
      limiter.consume('b');
      limiter.reset('a');

      expect(limiter.consume('a').allowed).toBe(true);
      expect(limiter.consume('b').allowed).toBe(false);
    });

    it('is safe to call on an unknown key', () => {
      const limiter = new TokenBucketLimiter({
        windowMs: 1000,
        maxRequests: 5,
        strategy: 'token-bucket',
      });
      expect(() => limiter.reset('ghost')).not.toThrow();
    });
  });

  describe('resetAll()', () => {
    it('clears all bucket state', () => {
      vi.setSystemTime(1000);
      const limiter = new TokenBucketLimiter({
        windowMs: 10000,
        maxRequests: 1,
        strategy: 'token-bucket',
      });

      limiter.consume('a');
      limiter.consume('b');
      limiter.resetAll();

      expect(limiter.consume('a').allowed).toBe(true);
      expect(limiter.consume('b').allowed).toBe(true);
    });
  });
});
