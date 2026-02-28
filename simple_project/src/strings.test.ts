import { describe, it, expect } from 'vitest';
import {
  capitalize,
  slugify,
  truncate,
  camelToKebab,
  kebabToCamel,
} from './strings.js';

// ---------------------------------------------------------------------------
// capitalize
// ---------------------------------------------------------------------------
describe('capitalize', () => {
  it('capitalizes the first character of a lowercase string', () => {
    expect(capitalize('hello')).toBe('Hello');
  });

  it('leaves an already-capitalized string unchanged', () => {
    expect(capitalize('Hello')).toBe('Hello');
  });

  it('returns empty string unchanged', () => {
    expect(capitalize('')).toBe('');
  });

  it('handles a single lowercase character', () => {
    expect(capitalize('a')).toBe('A');
  });

  it('handles a single uppercase character', () => {
    expect(capitalize('A')).toBe('A');
  });

  it('does not alter characters beyond the first', () => {
    expect(capitalize('hELLO')).toBe('HELLO');
  });

  it('handles a string that starts with a digit', () => {
    expect(capitalize('1up')).toBe('1up');
  });

  it('handles unicode first character', () => {
    expect(capitalize('\u00e9lan')).toBe('\u00c9lan'); // 'élan' -> 'Élan'
  });

  it('handles whitespace-only string', () => {
    expect(capitalize('  hello')).toBe('  hello');
  });
});

// ---------------------------------------------------------------------------
// slugify
// ---------------------------------------------------------------------------
describe('slugify', () => {
  it('converts a simple title to a slug', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('lowercases all characters', () => {
    expect(slugify('UPPER CASE')).toBe('upper-case');
  });

  it('replaces spaces with hyphens', () => {
    expect(slugify('foo bar baz')).toBe('foo-bar-baz');
  });

  it('collapses multiple spaces or special chars into one hyphen', () => {
    expect(slugify('hello   world')).toBe('hello-world');
    expect(slugify('hello -- world')).toBe('hello-world');
  });

  it('trims leading and trailing hyphens', () => {
    expect(slugify('  foo  ')).toBe('foo');
    expect(slugify('---bar---')).toBe('bar');
  });

  it('returns empty string for empty input', () => {
    expect(slugify('')).toBe('');
  });

  it('returns empty string for whitespace-only input', () => {
    expect(slugify('   ')).toBe('');
  });

  it('handles unicode by stripping diacritics', () => {
    expect(slugify('caf\u00e9 au lait')).toBe('cafe-au-lait');
    expect(slugify('r\u00e9sum\u00e9')).toBe('resume');
    expect(slugify('na\u00efve')).toBe('naive');
  });

  it('preserves numbers', () => {
    expect(slugify('post 42 draft')).toBe('post-42-draft');
    expect(slugify('v1.2.3')).toBe('v1-2-3');
  });

  it('strips non-alphanumeric punctuation', () => {
    expect(slugify('hello, world!')).toBe('hello-world');
    expect(slugify('it\'s a test')).toBe('it-s-a-test');
  });

  it('handles a single character', () => {
    expect(slugify('a')).toBe('a');
  });

  it('drops non-Latin scripts that do not decompose to ASCII', () => {
    // CJK, Arabic, and similar scripts are not representable as Latin
    // after NFD normalisation and diacritic stripping, so they are dropped.
    // Callers should pre-transliterate such input for predictable results.
    expect(slugify('\u4e2d\u6587')).toBe(''); // Chinese characters dropped
    expect(slugify('\u0645\u0631\u062d\u0628\u0627')).toBe(''); // Arabic dropped
    expect(slugify('hello \u4e16\u754c')).toBe('hello'); // mixed: Latin preserved
  });
});

// ---------------------------------------------------------------------------
// truncate
// ---------------------------------------------------------------------------
describe('truncate', () => {
  it('returns the original string when within maxLength', () => {
    expect(truncate('Hello', 10)).toBe('Hello');
  });

  it('returns the original string when exactly at maxLength', () => {
    expect(truncate('Hello', 5)).toBe('Hello');
  });

  it('truncates and appends default suffix', () => {
    expect(truncate('Hello, World!', 8)).toBe('Hello...');
  });

  it('truncates and appends custom suffix', () => {
    expect(truncate('Hello, World!', 7, ' [...]')).toBe('H [...]');
  });

  it('handles empty string', () => {
    expect(truncate('', 5)).toBe('');
    expect(truncate('', 0)).toBe('');
  });

  it('handles maxLength of 0 with no suffix', () => {
    expect(truncate('Hello', 0, '')).toBe('');
  });

  it('handles maxLength equal to suffix length', () => {
    // 'Hello' truncated to 3 chars with '...' means cutLength=0 -> '...'
    expect(truncate('Hello', 3)).toBe('...');
  });

  it('handles maxLength less than suffix length', () => {
    // suffix '...' length 3, maxLength 2 -> suffix truncated to maxLength
    expect(truncate('Hello', 2)).toBe('..');
  });

  it('handles empty suffix', () => {
    expect(truncate('Hello, World!', 5, '')).toBe('Hello');
  });

  it('handles single character string at exact maxLength', () => {
    expect(truncate('a', 1)).toBe('a');
  });

  it('throws RangeError for negative maxLength', () => {
    expect(() => truncate('Hello', -1)).toThrow(RangeError);
  });

  it('handles unicode characters', () => {
    // 'caf\u00e9' has length 4 in JS
    expect(truncate('caf\u00e9 latte', 7)).toBe('caf\u00e9...');
  });

  it('handles maxLength of 0 with default suffix returns truncated suffix', () => {
    expect(truncate('abc', 0, '...')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// camelToKebab
// ---------------------------------------------------------------------------
describe('camelToKebab', () => {
  it('converts camelCase to kebab-case', () => {
    expect(camelToKebab('helloWorld')).toBe('hello-world');
  });

  it('converts PascalCase to kebab-case', () => {
    expect(camelToKebab('HelloWorld')).toBe('hello-world');
  });

  it('handles consecutive uppercase (acronym) in middle', () => {
    expect(camelToKebab('myHTTPRequest')).toBe('my-http-request');
  });

  it('handles leading acronym', () => {
    expect(camelToKebab('XMLParser')).toBe('xml-parser');
  });

  it('handles trailing acronym', () => {
    expect(camelToKebab('parseXML')).toBe('parse-xml');
  });

  it('returns empty string unchanged', () => {
    expect(camelToKebab('')).toBe('');
  });

  it('returns already-lowercase string unchanged', () => {
    expect(camelToKebab('hello')).toBe('hello');
  });

  it('handles single uppercase character', () => {
    expect(camelToKebab('A')).toBe('a');
  });

  it('handles single-word PascalCase', () => {
    expect(camelToKebab('Hello')).toBe('hello');
  });

  it('handles digits followed by uppercase', () => {
    expect(camelToKebab('version2Alpha')).toBe('version2-alpha');
  });

  it('does not alter an all-uppercase string', () => {
    expect(camelToKebab('HTTP')).toBe('http');
  });
});

// ---------------------------------------------------------------------------
// kebabToCamel
// ---------------------------------------------------------------------------
describe('kebabToCamel', () => {
  it('converts kebab-case to camelCase', () => {
    expect(kebabToCamel('hello-world')).toBe('helloWorld');
  });

  it('converts multi-segment kebab to camelCase', () => {
    expect(kebabToCamel('my-http-request')).toBe('myHttpRequest');
  });

  it('returns empty string unchanged', () => {
    expect(kebabToCamel('')).toBe('');
  });

  it('returns a string with no hyphens unchanged', () => {
    expect(kebabToCamel('hello')).toBe('hello');
  });

  it('handles leading hyphen', () => {
    expect(kebabToCamel('-hello')).toBe('Hello');
  });

  it('strips trailing hyphen', () => {
    expect(kebabToCamel('hello-')).toBe('hello');
  });

  it('collapses consecutive hyphens', () => {
    expect(kebabToCamel('hello--world')).toBe('helloWorld');
  });

  it('handles single character segments', () => {
    expect(kebabToCamel('a-b-c')).toBe('aBC');
  });

  it('handles digits after hyphen', () => {
    expect(kebabToCamel('post-42')).toBe('post42');
  });

  it('handles all-uppercase segments', () => {
    expect(kebabToCamel('parse-XML')).toBe('parseXML');
  });
});
