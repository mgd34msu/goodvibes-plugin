/**
 * Tests for retry utilities — core/utils/retry.ts
 *
 * Note: Tests that use vi.useFakeTimers() with retry() run
 * vi.runAllTimersAsync() concurrently with the promise assertion
 * using Promise.all() to avoid PromiseRejectionHandledWarnings.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { computeDelay, retry } from '../retry.js';
import { ProcessingError } from '../../../shared/errors.js';

// Mock logger to suppress output
vi.mock('../../../shared/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('computeDelay()', () => {
  it('returns baseMs for fixed backoff on attempt 0', () => {
    expect(computeDelay('fixed', 1000, 0)).toBe(1000);
  });

  it('returns baseMs for fixed backoff regardless of attempt number', () => {
    expect(computeDelay('fixed', 500, 0)).toBe(500);
    expect(computeDelay('fixed', 500, 1)).toBe(500);
    expect(computeDelay('fixed', 500, 5)).toBe(500);
  });

  it('returns baseMs * 2^attempt for exponential backoff', () => {
    expect(computeDelay('exponential', 100, 0)).toBe(100);  // 100 * 1
    expect(computeDelay('exponential', 100, 1)).toBe(200);  // 100 * 2
    expect(computeDelay('exponential', 100, 2)).toBe(400);  // 100 * 4
    expect(computeDelay('exponential', 100, 3)).toBe(800);  // 100 * 8
  });

  it('handles baseMs=0 for both strategies', () => {
    expect(computeDelay('fixed', 0, 5)).toBe(0);
    expect(computeDelay('exponential', 0, 5)).toBe(0);
  });
});

describe('retry()', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('returns result immediately when fn succeeds on first try', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const result = await retry(fn);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('succeeds after one failure when maxAttempts > 1', async () => {
    let attempts = 0;
    const fn = vi.fn().mockImplementation(async () => {
      attempts++;
      if (attempts === 1) throw new Error('first fail');
      return 'ok';
    });

    const promise = retry(fn, { maxAttempts: 3, delayMs: 100, backoff: 'fixed' });
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws last error when all attempts fail', async () => {
    let count = 0;
    const fn = vi.fn().mockImplementation(async () => {
      count++;
      throw new Error(`fail attempt ${count}`);
    });

    // Run timer advancement concurrently so the rejection is always handled
    await Promise.all([
      vi.runAllTimersAsync(),
      expect(
        retry(fn, { maxAttempts: 3, delayMs: 100, backoff: 'fixed' }),
      ).rejects.toThrow('fail attempt 3'),
    ]);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws ProcessingError immediately when maxAttempts < 1', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    await expect(retry(fn, { maxAttempts: 0 })).rejects.toThrow(ProcessingError);
    expect(fn).not.toHaveBeenCalled();
  });

  it('stops retrying immediately when shouldRetry returns false', async () => {
    let count = 0;
    const fn = vi.fn().mockImplementation(async () => {
      count++;
      throw new Error('unretryable');
    });
    const shouldRetry = vi.fn().mockReturnValue(false);

    // fn throws synchronously after shouldRetry=false, no timers needed
    await Promise.all([
      vi.runAllTimersAsync(),
      expect(
        retry(fn, { maxAttempts: 5, delayMs: 100, shouldRetry }),
      ).rejects.toThrow('unretryable'),
    ]);
    // shouldRetry called once after first failure; fn called once
    expect(fn).toHaveBeenCalledTimes(1);
    expect(shouldRetry).toHaveBeenCalledTimes(1);
  });

  it('calls shouldRetry with the thrown error', async () => {
    let count = 0;
    const theError = new Error('specific error');
    const fn = vi.fn().mockImplementation(async () => {
      count++;
      throw theError;
    });
    const shouldRetry = vi.fn().mockReturnValue(false);

    await Promise.all([
      vi.runAllTimersAsync(),
      expect(
        retry(fn, { maxAttempts: 3, shouldRetry }),
      ).rejects.toThrow('specific error'),
    ]);
    expect(shouldRetry).toHaveBeenCalledWith(theError);
  });

  it('uses exponential backoff delays between attempts', async () => {
    let count = 0;
    const fn = vi.fn().mockImplementation(async () => {
      count++;
      throw new Error('fail');
    });
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

    await Promise.all([
      vi.runAllTimersAsync(),
      expect(
        retry(fn, { maxAttempts: 4, delayMs: 100, backoff: 'exponential' }),
      ).rejects.toThrow('fail'),
    ]);

    // Delays should be: 100 (attempt 0), 200 (attempt 1), 400 (attempt 2)
    // No delay after last attempt
    const delays = setTimeoutSpy.mock.calls
      .map(([, ms]) => ms as number)
      .filter((ms) => ms > 0);

    expect(delays).toEqual([100, 200, 400]);
    setTimeoutSpy.mockRestore();
  });

  it('uses fixed backoff delays between attempts', async () => {
    let count = 0;
    const fn = vi.fn().mockImplementation(async () => {
      count++;
      throw new Error('fail');
    });
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

    await Promise.all([
      vi.runAllTimersAsync(),
      expect(
        retry(fn, { maxAttempts: 3, delayMs: 250, backoff: 'fixed' }),
      ).rejects.toThrow('fail'),
    ]);

    const delays = setTimeoutSpy.mock.calls
      .map(([, ms]) => ms as number)
      .filter((ms) => ms > 0);

    expect(delays).toEqual([250, 250]);
    setTimeoutSpy.mockRestore();
  });

  it('defaults to maxAttempts=3, exponential backoff, delayMs=1000', async () => {
    let calls = 0;
    const fn = vi.fn().mockImplementation(async () => {
      calls++;
      throw new Error(`fail ${calls}`);
    });

    await Promise.all([
      vi.runAllTimersAsync(),
      expect(retry(fn)).rejects.toThrow('fail 3'),
    ]);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not delay after the last failed attempt', async () => {
    let count = 0;
    const fn = vi.fn().mockImplementation(async () => {
      count++;
      throw new Error('fail');
    });
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

    await Promise.all([
      vi.runAllTimersAsync(),
      expect(
        retry(fn, { maxAttempts: 2, delayMs: 1000, backoff: 'fixed' }),
      ).rejects.toThrow('fail'),
    ]);

    // With maxAttempts=2, there should be only 1 delay (between attempt 0 and 1)
    // attempt 1 is the last, so no delay after it
    const delays = setTimeoutSpy.mock.calls
      .map(([, ms]) => ms as number)
      .filter((ms) => ms > 0);
    expect(delays).toHaveLength(1);
    setTimeoutSpy.mockRestore();
  });

  it('maxAttempts=1 tries exactly once and throws on failure', async () => {
    let count = 0;
    const fn = vi.fn().mockImplementation(async () => {
      count++;
      throw new Error('fail');
    });

    await Promise.all([
      vi.runAllTimersAsync(),
      expect(retry(fn, { maxAttempts: 1 })).rejects.toThrow('fail'),
    ]);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
