/**
 * Unit tests for `lib/args.ts`, ported from v1 precision-engine
 * `__tests__/handlers/bug-fixes.test.ts` (`ensureArray` describe block). These
 * cover MCP serialization edge cases the search/read trio's batch inputs
 * (`files`, `queries`, `patterns_base64`) rely on.
 */

import { describe, it, expect } from 'vitest';
import { ensureArray, parseJsonField, resolveStringOrBase64 } from '../lib/args.js';

describe('ensureArray', () => {
  it('returns null for null/undefined', () => {
    expect(ensureArray(null)).toBeNull();
    expect(ensureArray(undefined)).toBeNull();
  });

  it('returns array as-is', () => {
    const arr = [{ a: 1 }, { b: 2 }];
    expect(ensureArray(arr)).toBe(arr);
  });

  it('parses a JSON string into an array', () => {
    expect(ensureArray('[{"a":1},{"b":2}]')).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it('returns null for a non-array JSON string', () => {
    expect(ensureArray('"hello"')).toBeNull();
    expect(ensureArray('42')).toBeNull();
  });

  it('converts an object with numeric keys to an array, preserving order', () => {
    expect(ensureArray({ '2': 'c', '0': 'a', '1': 'b' })).toEqual(['a', 'b', 'c']);
  });

  it('wraps a single object with a known spec key in an array', () => {
    expect(ensureArray({ path: 'a.ts' })).toEqual([{ path: 'a.ts' }]);
    expect(ensureArray({ id: 'q1', pattern: 'x' })).toEqual([{ id: 'q1', pattern: 'x' }]);
  });

  it('returns null for an object with no known spec keys', () => {
    expect(ensureArray({ foo: 'bar' })).toBeNull();
  });

  it('returns null for non-convertible values', () => {
    expect(ensureArray(42)).toBeNull();
    expect(ensureArray(true)).toBeNull();
  });
});

describe('parseJsonField', () => {
  it('parses a JSON object string', () => {
    expect(parseJsonField('{"mode":"matches"}')).toEqual({ mode: 'matches' });
  });

  it('passes through non-string values unchanged', () => {
    const obj = { mode: 'matches' };
    expect(parseJsonField(obj)).toBe(obj);
  });

  it('returns the original string when it is not valid JSON', () => {
    expect(parseJsonField('not json')).toBe('not json');
  });
});

describe('resolveStringOrBase64', () => {
  it('resolves a direct value', () => {
    expect(resolveStringOrBase64({ pattern: 'foo' }, 'pattern')).toBe('foo');
  });

  it('decodes a base64 alternate', () => {
    const b64 = Buffer.from('foo(bar)').toString('base64');
    expect(resolveStringOrBase64({ pattern_base64: b64 }, 'pattern')).toBe('foo(bar)');
  });

  it('throws when both the direct and base64 forms are provided', () => {
    const b64 = Buffer.from('foo').toString('base64');
    expect(() => resolveStringOrBase64({ pattern: 'foo', pattern_base64: b64 }, 'pattern')).toThrow(/Multiple input sources/);
  });

  it('returns undefined when neither form is provided', () => {
    expect(resolveStringOrBase64({}, 'pattern')).toBeUndefined();
  });
});
