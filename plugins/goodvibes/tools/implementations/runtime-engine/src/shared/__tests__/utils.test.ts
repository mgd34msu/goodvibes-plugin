import { vi } from 'vitest';
import {
  generateId,
  timestamp,
  generateEventId,
  generateWorkflowId,
  parseRelativeTime,
  toErrorMessage,
} from '../utils.js';

describe('utils', () => {
  // ─── generateId ──────────────────────────────────────────────────────────────

  describe('generateId', () => {
    it('returns a string', () => {
      expect(typeof generateId()).toBe('string');
    });

    it('returns a RFC 4122 v4 UUID format', () => {
      const id = generateId();
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it('returns a unique value on each call', () => {
      const ids = new Set(Array.from({ length: 100 }, () => generateId()));
      expect(ids.size).toBe(100);
    });
  });

  // ─── timestamp ───────────────────────────────────────────────────────────────

  describe('timestamp', () => {
    it('returns a string', () => {
      expect(typeof timestamp()).toBe('string');
    });

    it('returns a valid ISO-8601 date string', () => {
      const ts = timestamp();
      expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('returns a date close to the current time', () => {
      const before = Date.now();
      const ts = timestamp();
      const after = Date.now();
      const parsed = new Date(ts).getTime();
      expect(parsed).toBeGreaterThanOrEqual(before);
      expect(parsed).toBeLessThanOrEqual(after);
    });

    it('returns unique values across calls (different milliseconds)', () => {
      vi.useFakeTimers();
      const ts1 = timestamp();
      vi.advanceTimersByTime(10);
      const ts2 = timestamp();
      vi.useRealTimers();
      expect(ts1).not.toBe(ts2);
    });
  });

  // ─── generateEventId ─────────────────────────────────────────────────────────

  describe('generateEventId', () => {
    it('returns a string prefixed with "evt_"', () => {
      expect(generateEventId()).toMatch(/^evt_/);
    });

    it('contains a valid UUID after the prefix', () => {
      const id = generateEventId();
      const uuid = id.slice('evt_'.length);
      expect(uuid).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it('returns unique values on each call', () => {
      const ids = new Set(Array.from({ length: 50 }, () => generateEventId()));
      expect(ids.size).toBe(50);
    });
  });

  // ─── generateWorkflowId ──────────────────────────────────────────────────────

  describe('generateWorkflowId', () => {
    it('returns a string prefixed with "wf_"', () => {
      expect(generateWorkflowId()).toMatch(/^wf_/);
    });

    it('contains a valid UUID after the prefix', () => {
      const id = generateWorkflowId();
      const uuid = id.slice('wf_'.length);
      expect(uuid).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it('returns unique values on each call', () => {
      const ids = new Set(Array.from({ length: 50 }, () => generateWorkflowId()));
      expect(ids.size).toBe(50);
    });
  });

  // ─── toErrorMessage ──────────────────────────────────────────────────────────

  describe('toErrorMessage', () => {
    it('returns the message from an Error instance', () => {
      expect(toErrorMessage(new Error('something went wrong'))).toBe('something went wrong');
    });

    it('returns String() of a non-Error value', () => {
      expect(toErrorMessage('plain string')).toBe('plain string');
    });

    it('handles numbers', () => {
      expect(toErrorMessage(42)).toBe('42');
    });

    it('handles null', () => {
      expect(toErrorMessage(null)).toBe('null');
    });

    it('handles undefined', () => {
      expect(toErrorMessage(undefined)).toBe('undefined');
    });

    it('handles objects', () => {
      expect(toErrorMessage({ code: 'ERR' })).toBe('[object Object]');
    });

    it('returns empty string for Error with empty message', () => {
      expect(toErrorMessage(new Error(''))).toBe('');
    });
  });

  // ─── parseRelativeTime ───────────────────────────────────────────────────────

  describe('parseRelativeTime', () => {
    it('parses seconds (s)', () => {
      const before = Date.now();
      const result = parseRelativeTime('30s');
      const after = Date.now();
      const ms = result.getTime();
      expect(ms).toBeGreaterThanOrEqual(before + 30_000);
      expect(ms).toBeLessThanOrEqual(after + 30_000);
    });

    it('parses minutes (m)', () => {
      const before = Date.now();
      const result = parseRelativeTime('5m');
      const after = Date.now();
      const ms = result.getTime();
      expect(ms).toBeGreaterThanOrEqual(before + 5 * 60_000);
      expect(ms).toBeLessThanOrEqual(after + 5 * 60_000);
    });

    it('parses hours (h)', () => {
      const before = Date.now();
      const result = parseRelativeTime('2h');
      const after = Date.now();
      const ms = result.getTime();
      expect(ms).toBeGreaterThanOrEqual(before + 2 * 3_600_000);
      expect(ms).toBeLessThanOrEqual(after + 2 * 3_600_000);
    });

    it('parses days (d)', () => {
      const before = Date.now();
      const result = parseRelativeTime('1d');
      const after = Date.now();
      const ms = result.getTime();
      expect(ms).toBeGreaterThanOrEqual(before + 86_400_000);
      expect(ms).toBeLessThanOrEqual(after + 86_400_000);
    });

    it('parses decimal values (1.5h)', () => {
      const before = Date.now();
      const result = parseRelativeTime('1.5h');
      const after = Date.now();
      const ms = result.getTime();
      expect(ms).toBeGreaterThanOrEqual(before + 1.5 * 3_600_000);
      expect(ms).toBeLessThanOrEqual(after + 1.5 * 3_600_000);
    });

    it('parses "0s" as a date close to now', () => {
      const before = Date.now();
      const result = parseRelativeTime('0s');
      const after = Date.now();
      expect(result.getTime()).toBeGreaterThanOrEqual(before);
      expect(result.getTime()).toBeLessThanOrEqual(after);
    });

    it('trims surrounding whitespace before parsing', () => {
      const before = Date.now();
      const result = parseRelativeTime('  10s  ');
      const after = Date.now();
      expect(result.getTime()).toBeGreaterThanOrEqual(before + 10_000);
      expect(result.getTime()).toBeLessThanOrEqual(after + 10_000);
    });

    it('returns a Date object', () => {
      expect(parseRelativeTime('5m')).toBeInstanceOf(Date);
    });

    it('throws for an invalid format (no unit)', () => {
      expect(() => parseRelativeTime('100')).toThrow(/Invalid relative time format/);
    });

    it('throws for an empty string', () => {
      expect(() => parseRelativeTime('')).toThrow(/Invalid relative time format/);
    });

    it('throws for an unrecognised unit', () => {
      expect(() => parseRelativeTime('5x')).toThrow(/Invalid relative time format/);
    });

    it('throws for a value without a number', () => {
      expect(() => parseRelativeTime('ms')).toThrow(/Invalid relative time format/);
    });

    it('throws for negative values', () => {
      expect(() => parseRelativeTime('-5m')).toThrow(/Invalid relative time format/);
    });
  });
});
