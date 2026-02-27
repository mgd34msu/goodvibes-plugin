/**
 * Unit tests for computeDelay and retry
 *
 * Tests backoff computation and the full retry lifecycle:
 * first-attempt success, retry-then-succeed, exhaustion,
 * shouldRetry predicate, validation, and default options.
 *
 * Strategy:
 * - vi.useFakeTimers() prevents actual delays in retry waits.
 * - For tests that need timer advancement, we race the retry promise against
 *   vi.runAllTimersAsync() to avoid PromiseRejectionHandledWarning.
 * - Logger is mocked to suppress output.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Hoisted mock variables ───────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  const createLogger = vi.fn().mockReturnValue({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  });
  return { createLogger };
});

vi.mock('../../shared/logger.js', () => ({ createLogger: mocks.createLogger }));

// ─── Subject under test ───────────────────────────────────────────────────────

import { computeDelay, retry } from '../retry.js';

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Run `fn` and advance all fake timers concurrently until the promise settles.
 * Returns the settled result. This avoids PromiseRejectionHandledWarning by
 * ensuring the promise is always awaited immediately.
 */
async function runWithTimers<T>(fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> {
  const promise = fn();
  // Drain timers alongside the promise so delays don't block
  await Promise.allSettled([promise, vi.runAllTimersAsync()]);
  return promise.then(
    (value) => ({ ok: true as const, value }),
    (error) => ({ ok: false as const, error }),
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('computeDelay', () => {
  // ── fixed backoff ───────────────────────────────────────────────────────

  describe('fixed backoff', () => {
    it('returns baseMs regardless of attempt', () => {
      expect(computeDelay('fixed', 500, 0)).toBe(500);
      expect(computeDelay('fixed', 500, 1)).toBe(500);
      expect(computeDelay('fixed', 500, 5)).toBe(500);
    });

    it('returns baseMs on attempt 0', () => {
      expect(computeDelay('fixed', 1000, 0)).toBe(1000);
    });
  });

  // ── exponential backoff ─────────────────────────────────────────────────

  describe('exponential backoff', () => {
    it('returns baseMs * 2^attempt', () => {
      expect(computeDelay('exponential', 100, 0)).toBe(100);  // 100 * 2^0 = 100
      expect(computeDelay('exponential', 100, 1)).toBe(200);  // 100 * 2^1 = 200
      expect(computeDelay('exponential', 100, 2)).toBe(400);  // 100 * 2^2 = 400
      expect(computeDelay('exponential', 100, 3)).toBe(800);  // 100 * 2^3 = 800
    });

    it('returns baseMs on attempt 0', () => {
      expect(computeDelay('exponential', 1000, 0)).toBe(1000);
    });
  });

  it('returns 0 when baseMs is 0 regardless of strategy', () => {
    expect(computeDelay('fixed', 0, 5)).toBe(0);
    expect(computeDelay('exponential', 0, 5)).toBe(0);
  });
});

describe('retry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── success paths ───────────────────────────────────────────────────────

  it('succeeds on first attempt without retrying', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await retry(fn, { maxAttempts: 3 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries and succeeds on second attempt', async () => {
    const error = new Error('transient');
    const fn = vi.fn()
      .mockImplementationOnce(() => Promise.reject(error))
      .mockResolvedValue('recovered');

    const result = await runWithTimers(() =>
      retry(fn, { maxAttempts: 3, delayMs: 100, backoff: 'fixed' }),
    );

    expect(result).toEqual({ ok: true, value: 'recovered' });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  // ── exhaustion ──────────────────────────────────────────────────────────

  it('throws the last error when all attempts are exhausted', async () => {
    const error = new Error('persistent failure');
    const fn = vi.fn().mockImplementation(() => Promise.reject(error));

    const result = await runWithTimers(() =>
      retry(fn, { maxAttempts: 3, delayMs: 50, backoff: 'fixed' }),
    );

    expect(result).toEqual({ ok: false, error });
    expect(fn).toHaveBeenCalledTimes(3);
  });

  // ── shouldRetry predicate ───────────────────────────────────────────────

  it('stops retrying early when shouldRetry returns false', async () => {
    const error = new Error('fatal');
    const fn = vi.fn().mockImplementation(() => Promise.reject(error));
    const shouldRetry = vi.fn().mockReturnValue(false);

    const result = await runWithTimers(() =>
      retry(fn, { maxAttempts: 5, shouldRetry }),
    );

    expect(result).toEqual({ ok: false, error });
    // Called once — shouldRetry returned false, no further attempts
    expect(fn).toHaveBeenCalledTimes(1);
    expect(shouldRetry).toHaveBeenCalledWith(error);
  });

  it('continues retrying when shouldRetry returns true', async () => {
    const error = new Error('retryable');
    const fn = vi.fn().mockImplementation(() => Promise.reject(error));
    const shouldRetry = vi.fn().mockReturnValue(true);

    const result = await runWithTimers(() =>
      retry(fn, { maxAttempts: 2, delayMs: 10, backoff: 'fixed', shouldRetry }),
    );

    expect(result).toEqual({ ok: false, error });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  // ── validation ──────────────────────────────────────────────────────────

  it('throws Error("maxAttempts must be >= 1") when maxAttempts is 0', async () => {
    await expect(retry(vi.fn(), { maxAttempts: 0 })).rejects.toThrow('maxAttempts must be >= 1');
  });

  it('throws Error("maxAttempts must be >= 1") when maxAttempts is negative', async () => {
    await expect(retry(vi.fn(), { maxAttempts: -1 })).rejects.toThrow('maxAttempts must be >= 1');
  });

  // ── default options ─────────────────────────────────────────────────────

  it('uses default options (3 attempts, exponential, 1000ms base) when none provided', async () => {
    const error = new Error('always fails');
    const fn = vi.fn().mockImplementation(() => Promise.reject(error));

    const result = await runWithTimers(() => retry(fn));

    expect(result).toEqual({ ok: false, error });
    expect(fn).toHaveBeenCalledTimes(3);
  });

  // ── logging ─────────────────────────────────────────────────────────────

  it('logs debug messages with attempt number and delay on each retry', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValue(new Error('fail'));
    // createLogger is called once at module import; clearAllMocks wipes results,
    // so we invoke the mock directly to retrieve its configured return value.
    const mockLogger = mocks.createLogger();

    await runWithTimers(() => retry(fn, { maxAttempts: 3, delayMs: 100, backoff: 'fixed' }));

    expect(mockLogger.debug).toHaveBeenCalledWith('retrying', { attempt: 1, delay_ms: 100 });
    expect(mockLogger.debug).toHaveBeenCalledWith('retrying', { attempt: 2, delay_ms: 100 });
  });

  // ── single attempt ──────────────────────────────────────────────────────

  it('does not sleep when maxAttempts is 1 and fn fails', async () => {
    const error = new Error('immediate fail');
    const fn = vi.fn().mockImplementation(() => Promise.reject(error));

    const result = await runWithTimers(() => retry(fn, { maxAttempts: 1 }));

    expect(result).toEqual({ ok: false, error });
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
