/**
 * Tests for pollUntil — core/utils/poll.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { pollUntil } from '../poll.js';
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

describe('pollUntil()', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('resolves immediately when check returns a value on the first call', async () => {
    const check = vi.fn().mockReturnValue('found');
    const promise = pollUntil(check, { timeoutMs: 1000, intervalMs: 100 });
    // No timer advancement needed — first tick is synchronous
    const result = await promise;
    expect(result).toBe('found');
    expect(check).toHaveBeenCalledTimes(1);
  });

  it('resolves after multiple polls when check eventually returns a value', async () => {
    let callCount = 0;
    const check = vi.fn().mockImplementation(() => {
      callCount++;
      return callCount >= 3 ? 'ready' : null;
    });

    const promise = pollUntil(check, { timeoutMs: 1000, intervalMs: 100 });
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result).toBe('ready');
    expect(check).toHaveBeenCalledTimes(3);
  });

  it('returns null when check never returns a truthy value before timeout', async () => {
    const check = vi.fn().mockReturnValue(null);
    const promise = pollUntil(check, { timeoutMs: 300, intervalMs: 100 });
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result).toBeNull();
  });

  it('propagates errors thrown inside check immediately', async () => {
    const theError = new Error('check exploded');
    const check = vi.fn().mockImplementation(() => {
      throw theError;
    });

    const promise = pollUntil(check, { timeoutMs: 1000, intervalMs: 100 });
    await expect(promise).rejects.toThrow('check exploded');
    expect(check).toHaveBeenCalledTimes(1);
  });

  it('throws ProcessingError for negative timeoutMs', () => {
    expect(() =>
      pollUntil(() => null, { timeoutMs: -1, intervalMs: 100 }),
    ).toThrow(ProcessingError);
  });

  it('throws ProcessingError for zero intervalMs', () => {
    expect(() =>
      pollUntil(() => null, { timeoutMs: 1000, intervalMs: 0 }),
    ).toThrow(ProcessingError);
  });

  it('throws ProcessingError for negative intervalMs', () => {
    expect(() =>
      pollUntil(() => null, { timeoutMs: 1000, intervalMs: -10 }),
    ).toThrow(ProcessingError);
  });

  it('uses default intervalMs of 100ms when not provided', async () => {
    let callCount = 0;
    const check = vi.fn().mockImplementation(() => {
      callCount++;
      return callCount >= 2 ? 'done' : undefined;
    });

    const promise = pollUntil(check, { timeoutMs: 1000 });
    // Advance 100ms for the default interval
    await vi.advanceTimersByTimeAsync(100);
    const result = await promise;
    expect(result).toBe('done');
  });

  it('treats undefined as a non-value (continues polling)', async () => {
    let callCount = 0;
    const check = vi.fn().mockImplementation(() => {
      callCount++;
      return callCount === 3 ? 'found' : undefined;
    });

    const promise = pollUntil(check, { timeoutMs: 500, intervalMs: 100 });
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result).toBe('found');
  });

  it('handles timeoutMs=0 — resolves null immediately when check returns null', async () => {
    const check = vi.fn().mockReturnValue(null);
    // timeoutMs=0 means deadline is now; first tick checks then deadline passes
    const promise = pollUntil(check, { timeoutMs: 0, intervalMs: 100 });
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result).toBeNull();
  });

  it('resolves with the exact value returned by check (non-string types)', async () => {
    const obj = { id: 42, name: 'test' };
    const check = vi.fn().mockReturnValue(obj);
    const result = await pollUntil(check, { timeoutMs: 1000, intervalMs: 100 });
    expect(result).toBe(obj);
  });

  it('resolves with a numeric value', async () => {
    const check = vi.fn().mockReturnValue(0);
    // Note: 0 is falsy but the implementation checks `!== null && !== undefined`
    // So 0 should actually resolve (it is a defined non-null value)
    const result = await pollUntil(check, { timeoutMs: 1000, intervalMs: 100 });
    expect(result).toBe(0);
  });

  it('resolves with false (falsy but not null/undefined)', async () => {
    const check = vi.fn().mockReturnValue(false);
    const result = await pollUntil(check, { timeoutMs: 1000, intervalMs: 100 });
    expect(result).toBe(false);
  });

  it('stops polling after resolving (no further calls to check)', async () => {
    let callCount = 0;
    const check = vi.fn().mockImplementation(() => {
      callCount++;
      return callCount === 2 ? 'stop' : null;
    });

    const promise = pollUntil(check, { timeoutMs: 2000, intervalMs: 100 });
    await vi.runAllTimersAsync();
    await promise;
    // After resolving at call 2, no further calls should happen
    expect(check).toHaveBeenCalledTimes(2);
  });
});
