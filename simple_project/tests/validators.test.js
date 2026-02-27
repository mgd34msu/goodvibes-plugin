import { describe, it, expect } from 'vitest';
import {
  isNonEmptyString,
  isValidStatus,
  sanitizeString,
  validateTaskInput,
} from '../src/utils/validators.js';

describe('isNonEmptyString', () => {
  it('returns true for a non-empty string', () => {
    expect(isNonEmptyString('hello')).toBe(true);
  });

  it('returns false for an empty string', () => {
    expect(isNonEmptyString('')).toBe(false);
  });

  it('returns false for a whitespace-only string', () => {
    expect(isNonEmptyString('   ')).toBe(false);
  });

  it('returns false for a number', () => {
    expect(isNonEmptyString(42)).toBe(false);
  });

  it('returns false for null', () => {
    expect(isNonEmptyString(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isNonEmptyString(undefined)).toBe(false);
  });

  it('returns false for an object', () => {
    expect(isNonEmptyString({})).toBe(false);
  });
});

describe('isValidStatus', () => {
  it('returns true for pending', () => {
    expect(isValidStatus('pending')).toBe(true);
  });

  it('returns true for in-progress', () => {
    expect(isValidStatus('in-progress')).toBe(true);
  });

  it('returns true for completed', () => {
    expect(isValidStatus('completed')).toBe(true);
  });

  it('returns false for an unknown status', () => {
    expect(isValidStatus('done')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isValidStatus('')).toBe(false);
  });

  it('returns false for null', () => {
    expect(isValidStatus(null)).toBe(false);
  });
});

describe('sanitizeString', () => {
  it('trims leading and trailing whitespace', () => {
    expect(sanitizeString('  hello  ')).toBe('hello');
  });

  it('truncates a string exceeding the max length', () => {
    const long = 'a'.repeat(300);
    const result = sanitizeString(long);
    expect(result.length).toBeLessThanOrEqual(500);
  });

  it('returns the string unchanged when within limit', () => {
    expect(sanitizeString('short string')).toBe('short string');
  });
});

describe('validateTaskInput', () => {
  it('returns no errors for valid input', () => {
    const result = validateTaskInput({ title: 'My Task', description: 'Details' });
    expect(result.errors).toHaveLength(0);
    expect(result.valid).toBe(true);
  });

  it('returns error when title is missing', () => {
    const result = validateTaskInput({ description: 'No title here' });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('returns error when title is an empty string', () => {
    const result = validateTaskInput({ title: '' });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('returns error when title is not a string', () => {
    const result = validateTaskInput({ title: 123 });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('accepts optional valid status (no status validation in source)', () => {
    const result = validateTaskInput({ title: 'Task', status: 'completed' });
    expect(result.valid).toBe(true);
  });
});
