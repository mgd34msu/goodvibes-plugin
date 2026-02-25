/**
 * Smoke test ensuring all public exports are accessible from the barrel entry point.
 */
import { describe, it, expect } from 'vitest';
import {
  RateLimiterError,
  TokenBucket,
  SlidingWindowLimiter,
  FixedWindowCounter,
  createRateLimitMiddleware,
} from './index.js';

describe('barrel export (index.ts)', () => {
  it('exports RateLimiterError', () => {
    expect(RateLimiterError).toBeDefined();
    expect(new RateLimiterError('test')).toBeInstanceOf(RateLimiterError);
  });

  it('exports TokenBucket', () => {
    expect(TokenBucket).toBeDefined();
    const b = new TokenBucket({ capacity: 5, refillRate: 1 });
    expect(b.check('k').allowed).toBe(true);
  });

  it('exports SlidingWindowLimiter', () => {
    expect(SlidingWindowLimiter).toBeDefined();
    const s = new SlidingWindowLimiter({ windowMs: 1000, maxRequests: 10 });
    expect(s.check('k').allowed).toBe(true);
  });

  it('exports FixedWindowCounter', () => {
    expect(FixedWindowCounter).toBeDefined();
    const f = new FixedWindowCounter({ windowMs: 1000, maxRequests: 10 });
    expect(f.check('k').allowed).toBe(true);
  });

  it('exports createRateLimitMiddleware', () => {
    expect(createRateLimitMiddleware).toBeDefined();
    expect(typeof createRateLimitMiddleware).toBe('function');
  });
});
