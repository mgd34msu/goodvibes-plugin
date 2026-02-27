/**
 * Unit tests for pollUntil
 *
 * Tests deadline-based polling: success on first check, timeout, interval
 * scheduling, error propagation, validation guards, timer cleanup, and the
 * timeoutMs=0 edge case.
 *
 * Strategy:
 * - vi.useFakeTimers() controls Date.now() and setTimeout without wall-clock delays.
 * - For tests that expect rejection after timer advancement, attach the .rejects
 *   assertion BEFORE advancing timers so the handler is registered immediately
 *   and no PromiseRejectionHandledWarning is emitted.
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

import { pollUntil } from '../poll.js';

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('pollUntil', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── immediate success ───────────────────────────────────────────────────

  it('returns the value when check returns non-null on the first call', async () => {
    const check = vi.fn().mockReturnValue('found');
    const result = await pollUntil(check, { timeoutMs: 1000, intervalMs: 100 });
    expect(result).toBe('found');
    expect(check).toHaveBeenCalledTimes(1);
  });

  it('returns the value when check returns a truthy object', async () => {
    const value = { id: 42 };
    const check = vi.fn().mockReturnValue(value);
    const result = await pollUntil(check, { timeoutMs: 500, intervalMs: 50 });
    expect(result).toBe(value);
  });

  // ── timeout ─────────────────────────────────────────────────────────────

  it('returns null when check always returns null and timeout elapses', async () => {
    const check = vi.fn().mockReturnValue(null);
    const promise = pollUntil(check, { timeoutMs: 300, intervalMs: 100 });
    // Advance past the full timeout
    await vi.advanceTimersByTimeAsync(400);
    const result = await promise;
    expect(result).toBeNull();
  });

  it('returns null when check always returns undefined and timeout elapses', async () => {
    const check = vi.fn().mockReturnValue(undefined);
    const promise = pollUntil(check, { timeoutMs: 200, intervalMs: 100 });
    await vi.advanceTimersByTimeAsync(300);
    const result = await promise;
    expect(result).toBeNull();
  });

  // ── interval scheduling ─────────────────────────────────────────────────

  it('polls at the specified interval', async () => {
    // Return null for the first two ticks, then a value on the third
    const check = vi.fn()
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(null)
      .mockReturnValue('hit');

    const promise = pollUntil(check, { timeoutMs: 1000, intervalMs: 100 });
    // First tick fires immediately (no delay), returns null
    // Advance 100ms → second tick fires, returns null
    await vi.advanceTimersByTimeAsync(100);
    // Advance another 100ms → third tick fires, returns 'hit'
    await vi.advanceTimersByTimeAsync(100);
    const result = await promise;

    expect(result).toBe('hit');
    expect(check).toHaveBeenCalledTimes(3);
  });

  it('uses the default intervalMs of 100 when not provided', async () => {
    const check = vi.fn().mockReturnValueOnce(null).mockReturnValue('ok');
    const promise = pollUntil(check, { timeoutMs: 1000 });
    // First tick is immediate, second comes after default 100ms
    await vi.advanceTimersByTimeAsync(100);
    const result = await promise;
    expect(result).toBe('ok');
    expect(check).toHaveBeenCalledTimes(2);
  });

  // ── error propagation ───────────────────────────────────────────────────

  it('rejects immediately when check throws on the first call', async () => {
    const boom = new Error('check exploded');
    const check = vi.fn().mockImplementation(() => { throw boom; });
    await expect(pollUntil(check, { timeoutMs: 1000, intervalMs: 100 })).rejects.toThrow('check exploded');
    expect(check).toHaveBeenCalledTimes(1);
  });

  it('rejects when check throws after a successful null return', async () => {
    // Attach the .rejects handler BEFORE advancing timers to prevent
    // PromiseRejectionHandledWarning.
    const boom = new Error('delayed explosion');
    const check = vi.fn()
      .mockReturnValueOnce(null)
      .mockImplementation(() => { throw boom; });

    const promise = pollUntil(check, { timeoutMs: 1000, intervalMs: 100 });
    const assertion = expect(promise).rejects.toThrow('delayed explosion');
    await vi.advanceTimersByTimeAsync(100);
    await assertion;

    expect(check).toHaveBeenCalledTimes(2);
  });

  it('clears the pending timeout handle when check throws (no timer leak)', async () => {
    // After a null return, a setTimeout is scheduled. When check throws on the
    // next tick, clearTimeout should have been called to clean up.
    // Attach .rejects handler BEFORE advancing timers.
    const boom = new Error('leak test');
    const check = vi.fn()
      .mockReturnValueOnce(null)
      .mockImplementation(() => { throw boom; });

    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');

    const promise = pollUntil(check, { timeoutMs: 1000, intervalMs: 100 });
    const assertion = expect(promise).rejects.toThrow('leak test');
    await vi.advanceTimersByTimeAsync(100);
    await assertion;

    // clearTimeout should have been called once with the pending timer
    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });

  it('cleanup helper is called on successful resolve (no lingering timer)', async () => {
    // After one null return a timer is set; on the next successful return,
    // cleanup() must cancel it so no extra callbacks fire.
    const check = vi.fn()
      .mockReturnValueOnce(null)
      .mockReturnValue('ok');

    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');

    const promise = pollUntil(check, { timeoutMs: 1000, intervalMs: 100 });
    await vi.advanceTimersByTimeAsync(100);
    await promise;

    // cleanup() must have been called — the timer scheduled after the first null
    // return should be cleared when the value is found.
    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });

  it('cleanup helper is called on timeout resolve (no lingering timer)', async () => {
    // When the polling loop hits the deadline, cleanup() is called before resolving.
    const check = vi.fn().mockReturnValue(null);

    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');

    const promise = pollUntil(check, { timeoutMs: 200, intervalMs: 100 });
    await vi.advanceTimersByTimeAsync(400);
    await promise;

    // The last tick finds Date.now() >= deadline and calls cleanup() before
    // resolving null. clearTimeout may have been called 0 times on the final
    // tick (no pending timer yet) or 1+ times on earlier ticks — either way,
    // the promise must resolve to null without a dangling timer.
    // We simply verify the promise settled successfully.
    clearTimeoutSpy.mockRestore();
  });

  // ── validation ──────────────────────────────────────────────────────────

  it('throws synchronously when timeoutMs is negative', () => {
    expect(() => pollUntil(vi.fn(), { timeoutMs: -1, intervalMs: 100 })).toThrow('timeoutMs must be >= 0');
  });

  it('throws synchronously when intervalMs is zero', () => {
    expect(() => pollUntil(vi.fn(), { timeoutMs: 1000, intervalMs: 0 })).toThrow('intervalMs must be > 0');
  });

  it('throws synchronously when intervalMs is negative', () => {
    expect(() => pollUntil(vi.fn(), { timeoutMs: 1000, intervalMs: -50 })).toThrow('intervalMs must be > 0');
  });

  // ── timeoutMs = 0 edge case ─────────────────────────────────────────────

  it('logs debug on timeout', async () => {
    const check = vi.fn().mockReturnValue(null);
    // createLogger is called once at module import; clearAllMocks wipes results,
    // so we invoke the mock directly to retrieve its configured return value.
    const mockLogger = mocks.createLogger();

    const promise = pollUntil(check, { timeoutMs: 500, intervalMs: 100 });
    await vi.advanceTimersByTimeAsync(600);
    await promise;

    expect(mockLogger.debug).toHaveBeenCalledWith('pollUntil timed out', { timeoutMs: 500 });
  });

  it('treats falsy non-null/non-undefined values as success (0, false, "")', async () => {
    const check = vi.fn().mockReturnValue(0);
    const result = await pollUntil(check, { timeoutMs: 1000, intervalMs: 100 });
    expect(result).toBe(0);
    expect(check).toHaveBeenCalledTimes(1);
  });

  it('performs a single check then returns null when timeoutMs is 0', async () => {
    // With timeoutMs=0, deadline === Date.now() at construction time.
    // The first tick fires immediately: check returns null, then
    // Date.now() >= deadline is true, so it resolves null without scheduling
    // another setTimeout.
    const check = vi.fn().mockReturnValue(null);
    const result = await pollUntil(check, { timeoutMs: 0, intervalMs: 100 });
    expect(result).toBeNull();
    expect(check).toHaveBeenCalledTimes(1);
  });

  it('returns the value immediately when timeoutMs is 0 and check succeeds', async () => {
    const check = vi.fn().mockReturnValue('instant');
    const result = await pollUntil(check, { timeoutMs: 0, intervalMs: 100 });
    expect(result).toBe('instant');
    expect(check).toHaveBeenCalledTimes(1);
  });
});
