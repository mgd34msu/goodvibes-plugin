import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
  generateId,
  generateEventId,
  generateWorkflowId,
  timestamp,
  toErrorMessage,
  assertNever,
  parseRelativeTime,
} from '../utils.js';

describe('generateId', () => {
  it('returns a non-empty string', () => {
    expect(typeof generateId()).toBe('string');
    expect(generateId().length).toBeGreaterThan(0);
  });

  it('returns a RFC 4122 v4 UUID format', () => {
    const id = generateId();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('returns unique values on successive calls', () => {
    const ids = new Set(Array.from({ length: 100 }, generateId));
    expect(ids.size).toBe(100);
  });
});

describe('generateEventId', () => {
  it('returns a string prefixed with "evt_"', () => {
    expect(generateEventId()).toMatch(/^evt_/);
  });

  it('suffix is a valid UUID', () => {
    const id = generateEventId();
    const suffix = id.slice('evt_'.length);
    expect(suffix).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('returns unique values on successive calls', () => {
    const ids = new Set(Array.from({ length: 100 }, generateEventId));
    expect(ids.size).toBe(100);
  });
});

describe('generateWorkflowId', () => {
  it('returns a string prefixed with "wf_"', () => {
    expect(generateWorkflowId()).toMatch(/^wf_/);
  });

  it('suffix is a valid UUID', () => {
    const id = generateWorkflowId();
    const suffix = id.slice('wf_'.length);
    expect(suffix).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('returns unique values on successive calls', () => {
    const ids = new Set(Array.from({ length: 100 }, generateWorkflowId));
    expect(ids.size).toBe(100);
  });
});

describe('timestamp', () => {
  it('returns a number (epoch milliseconds)', () => {
    const ts = timestamp();
    expect(typeof ts).toBe('number');
    expect(ts).toBeGreaterThan(0);
  });

  it('returns a value usable as a Date constructor argument', () => {
    const ts = timestamp();
    const d = new Date(ts);
    expect(d.getTime()).not.toBeNaN();
  });

  it('returns the current time (within 1 second tolerance)', () => {
    const before = Date.now();
    const ts = timestamp();
    const after = Date.now();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});

describe('toErrorMessage', () => {
  it('returns the message of an Error instance', () => {
    expect(toErrorMessage(new Error('oops'))).toBe('oops');
  });

  it('returns String() of a non-Error value', () => {
    expect(toErrorMessage('a string error')).toBe('a string error');
    expect(toErrorMessage(42)).toBe('42');
    expect(toErrorMessage(null)).toBe('null');
    expect(toErrorMessage(undefined)).toBe('undefined');
    expect(toErrorMessage({ toString: () => 'custom' })).toBe('custom');
  });

  it('returns empty string for Error with empty message', () => {
    expect(toErrorMessage(new Error(''))).toBe('');
  });
});

describe('assertNever', () => {
  it('always throws an Error', () => {
    expect(() => assertNever('unexpected' as never)).toThrow(Error);
  });

  it('includes the value in the error message', () => {
    expect(() => assertNever('bad-value' as never)).toThrow('bad-value');
  });

  it('includes the string conversion of any value', () => {
    expect(() => assertNever(42 as never)).toThrow('42');
  });
});

describe('parseRelativeTime', () => {
  let now: number;
  let dateSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    now = 1_700_000_000_000;
    dateSpy = vi.spyOn(Date, 'now').mockReturnValue(now);
  });

  afterEach(() => {
    dateSpy.mockRestore();
  });

  it('parses seconds ("30s")', () => {
    const result = parseRelativeTime('30s');
    expect(result.getTime()).toBe(now + 30_000);
  });

  it('parses minutes ("5m")', () => {
    const result = parseRelativeTime('5m');
    expect(result.getTime()).toBe(now + 5 * 60_000);
  });

  it('parses hours ("2h")', () => {
    const result = parseRelativeTime('2h');
    expect(result.getTime()).toBe(now + 2 * 3_600_000);
  });

  it('parses days ("1d")', () => {
    const result = parseRelativeTime('1d');
    expect(result.getTime()).toBe(now + 86_400_000);
  });

  it('parses fractional values ("1.5h")', () => {
    const result = parseRelativeTime('1.5h');
    expect(result.getTime()).toBe(now + 1.5 * 3_600_000);
  });

  it('trims leading/trailing whitespace', () => {
    const result = parseRelativeTime('  10s  ');
    expect(result.getTime()).toBe(now + 10_000);
  });

  it('throws on empty string', () => {
    expect(() => parseRelativeTime('')).toThrow();
  });

  it('throws on invalid format (no unit)', () => {
    expect(() => parseRelativeTime('30')).toThrow();
  });

  it('throws on invalid format (no number)', () => {
    expect(() => parseRelativeTime('m')).toThrow();
  });

  it('throws on invalid unit', () => {
    expect(() => parseRelativeTime('30x')).toThrow();
  });

  it('throws on negative value', () => {
    expect(() => parseRelativeTime('-5m')).toThrow();
  });

  it('returns a Date instance', () => {
    expect(parseRelativeTime('1s')).toBeInstanceOf(Date);
  });
});
