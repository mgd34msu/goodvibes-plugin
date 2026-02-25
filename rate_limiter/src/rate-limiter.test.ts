import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TokenBucketRateLimiter } from './rate-limiter.js';

describe('TokenBucketRateLimiter', () => {
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
    it('throws RangeError for non-positive maxTokens', () => {
      expect(() => new TokenBucketRateLimiter(0, 1)).toThrow(RangeError);
      expect(() => new TokenBucketRateLimiter(-5, 1)).toThrow(RangeError);
    });

    it('throws RangeError for non-positive refillRate', () => {
      expect(() => new TokenBucketRateLimiter(10, 0)).toThrow(RangeError);
      expect(() => new TokenBucketRateLimiter(10, -1)).toThrow(RangeError);
    });

    it('throws RangeError for non-positive refillInterval', () => {
      expect(() => new TokenBucketRateLimiter(10, 1, 0)).toThrow(RangeError);
      expect(() => new TokenBucketRateLimiter(10, 1, -100)).toThrow(RangeError);
    });
  });

  // -------------------------------------------------------------------------
  // Initial state
  // -------------------------------------------------------------------------

  describe('initial state', () => {
    it('starts with a full bucket', () => {
      const limiter = new TokenBucketRateLimiter(10, 1);
      expect(limiter.getAvailableTokens()).toBe(10);
    });

    it('reflects the configured maxTokens capacity', () => {
      const limiter = new TokenBucketRateLimiter(100, 5);
      expect(limiter.getAvailableTokens()).toBe(100);
    });
  });

  // -------------------------------------------------------------------------
  // tryConsume — success paths
  // -------------------------------------------------------------------------

  describe('tryConsume — successful consumption', () => {
    it('returns true when consuming 1 token from a full bucket', () => {
      const limiter = new TokenBucketRateLimiter(10, 1);
      expect(limiter.tryConsume()).toBe(true);
    });

    it('reduces available tokens after consumption', () => {
      const limiter = new TokenBucketRateLimiter(10, 1);
      limiter.tryConsume(3);
      expect(limiter.getAvailableTokens()).toBe(7);
    });

    it('allows consuming all tokens', () => {
      const limiter = new TokenBucketRateLimiter(5, 1);
      expect(limiter.tryConsume(5)).toBe(true);
      expect(limiter.getAvailableTokens()).toBe(0);
    });

    it('uses default of 1 token when no argument provided', () => {
      const limiter = new TokenBucketRateLimiter(10, 1);
      limiter.tryConsume();
      expect(limiter.getAvailableTokens()).toBe(9);
    });
  });

  // -------------------------------------------------------------------------
  // tryConsume — rejection paths
  // -------------------------------------------------------------------------

  describe('tryConsume — rejected when insufficient tokens', () => {
    it('returns false when bucket is empty', () => {
      const limiter = new TokenBucketRateLimiter(5, 1);
      limiter.tryConsume(5);
      expect(limiter.tryConsume(1)).toBe(false);
    });

    it('returns false when requesting more tokens than available', () => {
      const limiter = new TokenBucketRateLimiter(5, 1);
      expect(limiter.tryConsume(10)).toBe(false);
    });

    it('does not deduct tokens on rejection', () => {
      const limiter = new TokenBucketRateLimiter(5, 1);
      limiter.tryConsume(10); // fails
      expect(limiter.getAvailableTokens()).toBe(5);
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  describe('edge cases', () => {
    it('consuming 0 tokens always returns true', () => {
      const limiter = new TokenBucketRateLimiter(5, 1);
      limiter.tryConsume(5); // empty the bucket
      expect(limiter.tryConsume(0)).toBe(true);
    });

    it('consuming 0 tokens does not change available tokens', () => {
      const limiter = new TokenBucketRateLimiter(10, 1);
      limiter.tryConsume(0);
      expect(limiter.getAvailableTokens()).toBe(10);
    });

    it('negative token count is treated as 0 (always succeeds)', () => {
      const limiter = new TokenBucketRateLimiter(5, 1);
      limiter.tryConsume(5); // empty the bucket
      expect(limiter.tryConsume(-3)).toBe(true);
    });

    it('requesting more tokens than maxTokens returns false', () => {
      const limiter = new TokenBucketRateLimiter(5, 1);
      expect(limiter.tryConsume(6)).toBe(false);
    });

    it('getAvailableTokens floors fractional tokens', () => {
      // refillRate=1 token/sec, advance 500ms -> 0.5 tokens added
      const limiter = new TokenBucketRateLimiter(10, 1);
      limiter.tryConsume(10); // empty
      vi.advanceTimersByTime(500);
      expect(limiter.getAvailableTokens()).toBe(0); // 0.5 floors to 0
    });
  });

  // -------------------------------------------------------------------------
  // Refill over time
  // -------------------------------------------------------------------------

  describe('refill over time', () => {
    it('refills tokens proportionally after elapsed time', () => {
      const limiter = new TokenBucketRateLimiter(10, 2, 1000); // 2 tokens/sec
      limiter.tryConsume(10); // drain
      vi.advanceTimersByTime(1000);
      expect(limiter.getAvailableTokens()).toBe(2);
    });

    it('does not exceed maxTokens when refilling', () => {
      const limiter = new TokenBucketRateLimiter(10, 10, 1000); // 10 tokens/sec
      vi.advanceTimersByTime(5000); // would add 50, but capped at 10
      expect(limiter.getAvailableTokens()).toBe(10);
    });

    it('accumulates fractional tokens across multiple intervals', () => {
      const limiter = new TokenBucketRateLimiter(10, 1);
      limiter.tryConsume(10); // drain
      vi.advanceTimersByTime(1500); // 1.5 tokens -> floor = 1
      expect(limiter.getAvailableTokens()).toBe(1);
    });

    it('partial refill does not allow consumption exceeding available tokens', () => {
      const limiter = new TokenBucketRateLimiter(10, 1);
      limiter.tryConsume(10); // drain
      vi.advanceTimersByTime(500); // 0.5 tokens
      expect(limiter.tryConsume(1)).toBe(false); // need 1, have <1
    });

    it('allows consumption after sufficient time has passed', () => {
      const limiter = new TokenBucketRateLimiter(10, 2);
      limiter.tryConsume(10); // drain
      vi.advanceTimersByTime(1000); // 2 tokens added
      expect(limiter.tryConsume(2)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // reset
  // -------------------------------------------------------------------------

  describe('reset', () => {
    it('restores bucket to full capacity', () => {
      const limiter = new TokenBucketRateLimiter(10, 1);
      limiter.tryConsume(8);
      limiter.reset();
      expect(limiter.getAvailableTokens()).toBe(10);
    });

    it('allows immediate consumption of full bucket after reset', () => {
      const limiter = new TokenBucketRateLimiter(5, 1);
      limiter.tryConsume(5);
      limiter.reset();
      expect(limiter.tryConsume(5)).toBe(true);
    });

    it('resets refill timer so no time credit is accumulated', () => {
      const limiter = new TokenBucketRateLimiter(10, 1);
      limiter.tryConsume(10); // drain
      vi.advanceTimersByTime(5000); // 5 tokens would accumulate
      limiter.reset(); // reset clears time credit
      // Immediately after reset, should have 10 (max)
      expect(limiter.getAvailableTokens()).toBe(10);
    });
  });

  // -------------------------------------------------------------------------
  // waitForTokens
  // -------------------------------------------------------------------------

  describe('waitForTokens', () => {
    it('resolves immediately when tokens are available', async () => {
      const limiter = new TokenBucketRateLimiter(10, 1);
      await expect(limiter.waitForTokens(1)).resolves.toBeUndefined();
    });

    it('consumes tokens when it resolves', async () => {
      const limiter = new TokenBucketRateLimiter(10, 1);
      await limiter.waitForTokens(3);
      expect(limiter.getAvailableTokens()).toBe(7);
    });

    it('resolves after refill when bucket is initially empty', async () => {
      const limiter = new TokenBucketRateLimiter(10, 5, 1000); // 5 tokens/sec
      limiter.tryConsume(10); // drain

      const promise = limiter.waitForTokens(3);

      // Advance time to trigger the refill check interval
      await vi.advanceTimersByTimeAsync(1000); // +5 tokens -> enough for 3

      await expect(promise).resolves.toBeUndefined();
    });

    it('waits multiple intervals until enough tokens accumulate', async () => {
      const limiter = new TokenBucketRateLimiter(10, 1, 1000); // 1 token/sec
      limiter.tryConsume(10); // drain

      const promise = limiter.waitForTokens(3);

      // Advance 3 intervals to accumulate 3 tokens
      await vi.advanceTimersByTimeAsync(3000);

      await expect(promise).resolves.toBeUndefined();
    });

    it('uses default of 1 token when no argument provided', async () => {
      const limiter = new TokenBucketRateLimiter(5, 1, 1000);
      limiter.tryConsume(5); // drain

      const promise = limiter.waitForTokens();
      await vi.advanceTimersByTimeAsync(1000); // +1 token

      await expect(promise).resolves.toBeUndefined();
      expect(limiter.getAvailableTokens()).toBe(0);
    });
  });
});
