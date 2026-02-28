import { describe, it, expect } from 'vitest';
import { capitalize, slugify, truncate, camelToKebab, kebabToCamel } from './strings';

describe('capitalize', () => {
  it('capitalizes the first letter', () => {
    expect(capitalize('hello')).toBe('Hello');
  });

  it('leaves already-capitalized strings unchanged', () => {
    expect(capitalize('Hello')).toBe('Hello');
  });

  it('handles all-uppercase strings', () => {
    expect(capitalize('HELLO')).toBe('HELLO');
  });

  it('returns empty string unchanged', () => {
    expect(capitalize('')).toBe('');
  });

  it('handles single character', () => {
    expect(capitalize('a')).toBe('A');
    expect(capitalize('A')).toBe('A');
  });

  it('only capitalizes the first character', () => {
    expect(capitalize('hello world')).toBe('Hello world');
  });

  it('handles unicode characters', () => {
    expect(capitalize('éclair')).toBe('\u00C9clair');
    expect(capitalize('\u4e2d\u6587')).toBe('\u4e2d\u6587'); // Chinese chars unchanged
  });

  it('handles strings starting with numbers', () => {
    expect(capitalize('123abc')).toBe('123abc');
  });
});

describe('slugify', () => {
  it('converts spaces to hyphens', () => {
    expect(slugify('hello world')).toBe('hello-world');
  });

  it('lowercases the string', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('removes special characters', () => {
    expect(slugify('hello & world!')).toBe('hello-world');
  });

  it('collapses multiple spaces', () => {
    expect(slugify('hello   world')).toBe('hello-world');
  });

  it('collapses multiple hyphens', () => {
    expect(slugify('hello--world')).toBe('hello-world');
  });

  it('strips leading and trailing hyphens', () => {
    expect(slugify('-hello world-')).toBe('hello-world');
  });

  it('handles empty string', () => {
    expect(slugify('')).toBe('');
  });

  it('handles strings with only special characters', () => {
    expect(slugify('!@#$%')).toBe('');
  });

  it('strips diacritics', () => {
    expect(slugify('cafe\u0301')).toBe('cafe'); // e + combining accent
    expect(slugify('r\u00e9sum\u00e9')).toBe('resume');
  });

  it('preserves numbers', () => {
    expect(slugify('hello world 42')).toBe('hello-world-42');
  });

  it('trims whitespace', () => {
    expect(slugify('  hello world  ')).toBe('hello-world');
  });
});

describe('truncate', () => {
  it('returns string unchanged when within maxLength', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('returns string unchanged when equal to maxLength', () => {
    expect(truncate('hello', 5)).toBe('hello');
  });

  it('truncates and appends default suffix', () => {
    expect(truncate('hello world', 8)).toBe('hello...');
  });

  it('truncates and appends custom suffix', () => {
    expect(truncate('hello world', 7, '!')).toBe('hello w!');
  });

  it('handles empty suffix', () => {
    expect(truncate('hello world', 5, '')).toBe('hello');
  });

  it('handles empty string', () => {
    expect(truncate('', 5)).toBe('');
  });

  it('handles maxLength of 0', () => {
    expect(truncate('hello', 0)).toBe('...');
  });

  it('handles maxLength smaller than suffix length', () => {
    // suffix is '...' (3 chars), maxLength is 2 — result is first 2 chars of suffix
    expect(truncate('hello', 2)).toBe('..');
  });

  it('throws on negative maxLength', () => {
    expect(() => truncate('hello', -1)).toThrow(RangeError);
  });

  it('handles single character string', () => {
    expect(truncate('a', 1)).toBe('a');
    expect(truncate('a', 0)).toBe('...');
  });

  it('handles unicode correctly', () => {
    expect(truncate('\u4e2d\u6587\u5185\u5bb9', 3, '...')).toBe('...');
  });
});

describe('camelToKebab', () => {
  it('converts camelCase to kebab-case', () => {
    expect(camelToKebab('camelCase')).toBe('camel-case');
  });

  it('converts multi-word camelCase', () => {
    expect(camelToKebab('camelCaseString')).toBe('camel-case-string');
  });

  it('handles already lowercase strings', () => {
    expect(camelToKebab('hello')).toBe('hello');
  });

  it('handles empty string', () => {
    expect(camelToKebab('')).toBe('');
  });

  it('handles single character', () => {
    expect(camelToKebab('a')).toBe('a');
    expect(camelToKebab('A')).toBe('a');
  });

  it('handles PascalCase', () => {
    expect(camelToKebab('PascalCase')).toBe('pascal-case');
  });

  it('handles consecutive uppercase (acronyms)', () => {
    expect(camelToKebab('XMLParser')).toBe('xml-parser');
    expect(camelToKebab('parseHTML')).toBe('parse-html');
  });

  it('handles numbers in string', () => {
    expect(camelToKebab('convert2String')).toBe('convert2-string');
  });
});

describe('kebabToCamel', () => {
  it('converts kebab-case to camelCase', () => {
    expect(kebabToCamel('kebab-case')).toBe('kebabCase');
  });

  it('converts multi-segment kebab-case', () => {
    expect(kebabToCamel('kebab-case-string')).toBe('kebabCaseString');
  });

  it('handles already lowercase strings without hyphens', () => {
    expect(kebabToCamel('hello')).toBe('hello');
  });

  it('handles empty string', () => {
    expect(kebabToCamel('')).toBe('');
  });

  it('handles single character', () => {
    expect(kebabToCamel('a')).toBe('a');
  });

  it('lowercases the input before converting', () => {
    expect(kebabToCamel('HELLO-WORLD')).toBe('helloWorld');
  });

  it('handles numbers in string', () => {
    expect(kebabToCamel('item-2-value')).toBe('item2Value');
  });

  it('is the inverse of camelToKebab for simple cases', () => {
    const original = 'camelCaseString';
    expect(kebabToCamel(camelToKebab(original))).toBe(original);
  });
});
