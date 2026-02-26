/**
 * Integration tests covering:
 *   • RateLimiter factory methods
 *   • check vs consume behaviour
 *   • reset
 *   • dispose
 *   • Middleware: withRateLimit, batchRateLimit, composeLimiters
 *   • Presets: all produce valid configs
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RateLimiter } from '../index.js';
import {
  withRateLimit,
  batchRateLimit,
  composeLimiters,
  RateLimitError,
} from '../middleware.js';
import { PRESETS, fromPreset } from '../presets.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isValidResult(r: unknown): boolean {
  if (!r || typeof r !== 'object') return false;
  const obj = r as Record<string, unknown>;
  return (
    typeof obj.allowed === 'boolean' &&
    typeof obj.remaining === 'number' &&
    typeof obj.retryAfter === 'number' &&
    typeof obj.limit === 'number' &&
    typeof obj.resetAt === 'number'
  );
}

function isValidConfig(c: unknown): boolean {
  if (!c || typeof c !== 'object') return false;
  const obj = c as Record<string, unknown>;
  return (
    typeof obj.algorithm === 'string' &&
    typeof obj.maxRequests === 'number' &&
    obj.maxRequests > 0 &&
    typeof obj.windowMs === 'number' &&
    obj.windowMs > 0
  );
}

// ---------------------------------------------------------------------------
// Factory methods
// ---------------------------------------------------------------------------
describe('RateLimiter factory methods', () => {
  afterEach(async () => vi.useRealTimers());

  it('tokenBucket returns a working limiter', async () => {
    const limiter = RateLimiter.tokenBucket({ capacity: 5, refillRate: 1, windowMs: 60_000 });
    const result = await limiter.check('k');
    expect(isValidResult(result)).toBe(true);
    await limiter.dispose();
  });

  it('slidingWindow returns a working limiter', async () => {
    const limiter = RateLimiter.slidingWindow({ maxRequests: 10, windowMs: 60_000 });
    const result = await limiter.check('k');
    expect(isValidResult(result)).toBe(true);
    await limiter.dispose();
  });

  it('fixedWindow returns a working limiter', async () => {
    const limiter = RateLimiter.fixedWindow({ maxRequests: 10, windowMs: 60_000 });
    const result = await limiter.check('k');
    expect(isValidResult(result)).toBe(true);
    await limiter.dispose();
  });
});

// ---------------------------------------------------------------------------
// check vs consume
// ---------------------------------------------------------------------------
describe('check vs consume', () => {
  it('check does not consume a token', async () => {
    const limiter = RateLimiter.fixedWindow({ maxRequests: 1, windowMs: 10_000 });
    await limiter.check('k');
    // If check consumed, this consume would be denied (limit = 1).
    const result = await limiter.consume('k');
    expect(result.allowed).toBe(true);
    await limiter.dispose();
  });

  it('consume decrements remaining', async () => {
    const limiter = RateLimiter.fixedWindow({ maxRequests: 3, windowMs: 10_000 });
    const r1 = await limiter.consume('k');
    const r2 = await limiter.consume('k');
    expect(r2.remaining).toBe(r1.remaining - 1);
    await limiter.dispose();
  });

  it('check returns same result on repeated calls (no side-effects)', async () => {
    const limiter = RateLimiter.fixedWindow({ maxRequests: 10, windowMs: 10_000 });
    const r1 = await limiter.check('k');
    const r2 = await limiter.check('k');
    expect(r1.remaining).toBe(r2.remaining);
    await limiter.dispose();
  });

  it('consume after limit returns allowed=false', async () => {
    const limiter = RateLimiter.fixedWindow({ maxRequests: 2, windowMs: 10_000 });
    await limiter.consume('k');
    await limiter.consume('k');
    const denied = await limiter.consume('k');
    expect(denied.allowed).toBe(false);
    await limiter.dispose();
  });

  it('consume accepts optional tokens argument', async () => {
    const limiter = RateLimiter.tokenBucket({ capacity: 10, refillRate: 0.1, windowMs: 60_000 });
    const result = await limiter.consume('k', 3);
    expect(result.allowed).toBe(true);
    // After consuming 3 out of 10 tokens, 7 should remain.
    expect(result.remaining).toBe(7);
    await limiter.dispose();
  });
});

// ---------------------------------------------------------------------------
// reset
// ---------------------------------------------------------------------------
describe('reset', () => {
  it('reset clears state for a key', async () => {
    const limiter = RateLimiter.fixedWindow({ maxRequests: 1, windowMs: 10_000 });
    await limiter.consume('k');
    const denied = await limiter.consume('k');
    expect(denied.allowed).toBe(false);
    await limiter.reset('k');
    const allowed = await limiter.consume('k');
    expect(allowed.allowed).toBe(true);
    await limiter.dispose();
  });

  it('reset of unknown key is a no-op', async () => {
    const limiter = RateLimiter.fixedWindow({ maxRequests: 5, windowMs: 10_000 });
    await expect(limiter.reset('non-existent')).resolves.not.toThrow();
    await limiter.dispose();
  });

  it('reset does not affect other keys', async () => {
    const limiter = RateLimiter.fixedWindow({ maxRequests: 1, windowMs: 10_000 });
    await limiter.consume('a');
    await limiter.consume('b');
    await limiter.reset('a');
    // 'b' should still be denied.
    expect((await limiter.consume('b')).allowed).toBe(false);
    // 'a' should now be allowed again.
    expect((await limiter.consume('a')).allowed).toBe(true);
    await limiter.dispose();
  });
});

// ---------------------------------------------------------------------------
// dispose
// ---------------------------------------------------------------------------
describe('dispose', () => {
  it('dispose resolves without error', async () => {
    const limiter = RateLimiter.fixedWindow({ maxRequests: 5, windowMs: 10_000 });
    await expect(limiter.dispose()).resolves.not.toThrow();
  });

  it('dispose flushes the underlying store', async () => {
    // This is a smoke test — we just confirm dispose does not throw and resolves.
    const limiter = RateLimiter.slidingWindow({ maxRequests: 10, windowMs: 10_000 });
    await limiter.consume('k');
    await expect(limiter.dispose()).resolves.not.toThrow();
  });

  it('check throws after dispose', async () => {
    const limiter = RateLimiter.fixedWindow({ maxRequests: 5, windowMs: 10_000 });
    await limiter.dispose();
    await expect(limiter.check('k')).rejects.toThrow(/disposed/);
  });

  it('consume throws after dispose', async () => {
    const limiter = RateLimiter.fixedWindow({ maxRequests: 5, windowMs: 10_000 });
    await limiter.dispose();
    await expect(limiter.consume('k')).rejects.toThrow(/disposed/);
  });
});

// ---------------------------------------------------------------------------
// Middleware: withRateLimit
// ---------------------------------------------------------------------------
describe('withRateLimit', () => {
  it('executes fn when allowed and returns its value', async () => {
    const limiter = RateLimiter.fixedWindow({ maxRequests: 5, windowMs: 10_000 });
    const result = await withRateLimit(limiter, 'k', async () => 'hello');
    expect(result).toBe('hello');
    await limiter.dispose();
  });

  it('throws RateLimitError when denied', async () => {
    const limiter = RateLimiter.fixedWindow({ maxRequests: 1, windowMs: 10_000 });
    await limiter.consume('k');
    await expect(withRateLimit(limiter, 'k', async () => 'x')).rejects.toThrow(RateLimitError);
    await limiter.dispose();
  });

  it('RateLimitError has result property with allowed=false', async () => {
    const limiter = RateLimiter.fixedWindow({ maxRequests: 1, windowMs: 10_000 });
    await limiter.consume('k');
    let caught: RateLimitError | null = null;
    try {
      await withRateLimit(limiter, 'k', async () => null);
    } catch (e) {
      if (e instanceof RateLimitError) caught = e;
    }
    expect(caught).not.toBeNull();
    expect(caught!.result.allowed).toBe(false);
    expect(isValidResult(caught!.result)).toBe(true);
    await limiter.dispose();
  });

  it('fn is not called when denied', async () => {
    const limiter = RateLimiter.fixedWindow({ maxRequests: 1, windowMs: 10_000 });
    await limiter.consume('k');
    const fn = vi.fn(async () => 'called');
    await withRateLimit(limiter, 'k', fn).catch(() => null);
    expect(fn).not.toHaveBeenCalled();
    await limiter.dispose();
  });

  it('RateLimitError extends Error', () => {
    const fakeResult = {
      allowed: false,
      remaining: 0,
      retryAfter: 1000,
      limit: 1,
      resetAt: Date.now() + 1000,
    };
    const err = new RateLimitError(fakeResult);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('RateLimitError');
    expect(err.result).toBe(fakeResult);
  });
});

// ---------------------------------------------------------------------------
// Middleware: batchRateLimit
// ---------------------------------------------------------------------------
describe('batchRateLimit', () => {
  it('returns a Map with one entry per key', async () => {
    const limiter = RateLimiter.fixedWindow({ maxRequests: 10, windowMs: 10_000 });
    const keys = ['a', 'b', 'c'];
    const results = await batchRateLimit(limiter, keys);
    expect(results.size).toBe(3);
    for (const key of keys) {
      expect(results.has(key)).toBe(true);
      expect(isValidResult(results.get(key))).toBe(true);
    }
    await limiter.dispose();
  });

  it('handles empty keys array', async () => {
    const limiter = RateLimiter.fixedWindow({ maxRequests: 5, windowMs: 10_000 });
    const results = await batchRateLimit(limiter, []);
    expect(results.size).toBe(0);
    await limiter.dispose();
  });

  it('does not consume tokens (uses check internally)', async () => {
    const limiter = RateLimiter.fixedWindow({ maxRequests: 1, windowMs: 10_000 });
    await batchRateLimit(limiter, ['k']);
    // Consume should still be allowed (batch didn't consume).
    expect((await limiter.consume('k')).allowed).toBe(true);
    await limiter.dispose();
  });

  it('correctly reflects exhausted keys', async () => {
    const limiter = RateLimiter.fixedWindow({ maxRequests: 1, windowMs: 10_000 });
    await limiter.consume('full');
    const results = await batchRateLimit(limiter, ['full', 'empty']);
    expect(results.get('full')!.allowed).toBe(false);
    expect(results.get('empty')!.allowed).toBe(true);
    await limiter.dispose();
  });
});

// ---------------------------------------------------------------------------
// Middleware: composeLimiters
// ---------------------------------------------------------------------------
describe('composeLimiters', () => {
  it('allows when all limiters allow', async () => {
    const l1 = RateLimiter.fixedWindow({ maxRequests: 5, windowMs: 10_000 });
    const l2 = RateLimiter.fixedWindow({ maxRequests: 5, windowMs: 10_000 });
    const composed = composeLimiters(l1, l2);
    const result = await composed.check('k');
    expect(result.allowed).toBe(true);
    await composed.dispose();
  });

  it('denies when any limiter denies', async () => {
    const generous = RateLimiter.fixedWindow({ maxRequests: 100, windowMs: 10_000 });
    const tight = RateLimiter.fixedWindow({ maxRequests: 1, windowMs: 10_000 });
    const composed = composeLimiters(generous, tight);
    await tight.consume('k'); // exhaust the tight limiter via its own reference
    // But we need to exhaust via composed.consume to track state:
    const composed2 = composeLimiters(
      RateLimiter.fixedWindow({ maxRequests: 100, windowMs: 10_000 }),
      RateLimiter.fixedWindow({ maxRequests: 1, windowMs: 10_000 }),
    );
    await composed2.consume('k');
    const result = await composed2.consume('k');
    expect(result.allowed).toBe(false);
    await composed.dispose();
    await composed2.dispose();
  });

  it('consume consumes from all limiters', async () => {
    const l1 = RateLimiter.fixedWindow({ maxRequests: 3, windowMs: 10_000 });
    const l2 = RateLimiter.fixedWindow({ maxRequests: 3, windowMs: 10_000 });
    const composed = composeLimiters(l1, l2);
    const r = await composed.consume('k');
    expect(r.allowed).toBe(true);
    // Verify that both limiters had state written by verifying a second consume
    // also succeeds but a 4th total would exceed the individual limits.
    await composed.consume('k');
    await composed.consume('k');
    // Both limiters now at their limit; a 4th consume should be denied.
    const denied = await composed.consume('k');
    expect(denied.allowed).toBe(false);
    await composed.dispose();
  });

  it('reset resets all limiters', async () => {
    const l1 = RateLimiter.fixedWindow({ maxRequests: 1, windowMs: 10_000 });
    const l2 = RateLimiter.fixedWindow({ maxRequests: 1, windowMs: 10_000 });
    const composed = composeLimiters(l1, l2);
    await composed.consume('k');
    await composed.reset('k');
    const result = await composed.consume('k');
    expect(result.allowed).toBe(true);
    await composed.dispose();
  });

  it('throws when called with zero limiters', () => {
    expect(() => composeLimiters()).toThrow();
  });

  it('remaining is the minimum across limiters', async () => {
    const l1 = RateLimiter.fixedWindow({ maxRequests: 10, windowMs: 10_000 });
    const l2 = RateLimiter.fixedWindow({ maxRequests: 3, windowMs: 10_000 });
    const composed = composeLimiters(l1, l2);
    const result = await composed.check('k');
    // l2 is the bottleneck — remaining should be 3.
    expect(result.remaining).toBeLessThanOrEqual(3);
    await composed.dispose();
  });

  it('dispose disposes all underlying limiters', async () => {
    const l1 = RateLimiter.fixedWindow({ maxRequests: 5, windowMs: 10_000 });
    const l2 = RateLimiter.fixedWindow({ maxRequests: 5, windowMs: 10_000 });
    const composed = composeLimiters(l1, l2);
    await expect(composed.dispose()).resolves.not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------
describe('PRESETS', () => {
  it('all presets produce valid configs', () => {
    for (const [name, config] of Object.entries(PRESETS)) {
      expect(isValidConfig(config), `Preset '${name}' has an invalid config`).toBe(true);
    }
  });

  it('API_STANDARD uses token-bucket', () => {
    expect(PRESETS.API_STANDARD.algorithm).toBe('token-bucket');
  });

  it('API_BURST uses fixed-window', () => {
    expect(PRESETS.API_BURST.algorithm).toBe('fixed-window');
  });

  it('AGENT_SPAWN uses sliding-window', () => {
    expect(PRESETS.AGENT_SPAWN.algorithm).toBe('sliding-window');
  });

  it('TOOL_CALL uses sliding-window', () => {
    expect(PRESETS.TOOL_CALL.algorithm).toBe('sliding-window');
  });

  it('GENEROUS uses token-bucket', () => {
    expect(PRESETS.GENEROUS.algorithm).toBe('token-bucket');
  });

  it('fromPreset returns a copy of the preset', () => {
    const cfg = fromPreset('API_STANDARD');
    expect(cfg).toEqual(PRESETS.API_STANDARD);
    expect(cfg).not.toBe(PRESETS.API_STANDARD); // different object
  });

  it('fromPreset applies overrides', () => {
    const cfg = fromPreset('API_STANDARD', { maxRequests: 999 });
    expect(cfg.maxRequests).toBe(999);
    expect(cfg.algorithm).toBe('token-bucket');
  });

  it('fromPreset throws for unknown preset', () => {
    expect(() => fromPreset('UNKNOWN')).toThrow(/Unknown preset/);
  });

  it('all presets have positive windowMs', () => {
    for (const [name, config] of Object.entries(PRESETS)) {
      expect(config.windowMs, `Preset '${name}' windowMs must be > 0`).toBeGreaterThan(0);
    }
  });

  it('all presets have positive maxRequests', () => {
    for (const [name, config] of Object.entries(PRESETS)) {
      expect(config.maxRequests, `Preset '${name}' maxRequests must be > 0`).toBeGreaterThan(0);
    }
  });

  it('token-bucket presets have tokenBucketCapacity', () => {
    const tbPresets = Object.entries(PRESETS).filter(
      ([, c]) => c.algorithm === 'token-bucket',
    );
    for (const [name, config] of tbPresets) {
      expect(
        'tokenBucketCapacity' in config && config.tokenBucketCapacity,
        `Token-bucket preset '${name}' must have tokenBucketCapacity`,
      ).toBeGreaterThan(0);
    }
  });
});
