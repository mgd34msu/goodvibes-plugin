import { describe, it, expect } from 'vitest';
import {
  capitalize,
  slugify,
  truncate,
  camelCase,
  kebabCase,
  wordCount,
} from './strings';

// ---------------------------------------------------------------------------
// capitalize
// ---------------------------------------------------------------------------
describe('capitalize', () => {
  it('capitalizes the first letter and lowercases the rest', () => {
    expect(capitalize('hello world')).toBe('Hello world');
  });

  it('lowercases an all-uppercase string (first char uppercased, rest lowercased)', () => {
    expect(capitalize('HELLO')).toBe('Hello');
  });

  it('handles a single character', () => {
    expect(capitalize('a')).toBe('A');
    expect(capitalize('Z')).toBe('Z');
  });

  it('returns empty string for empty input', () => {
    expect(capitalize('')).toBe('');
  });

  it('handles unicode multi-byte characters', () => {
    expect(capitalize('café LATTE')).toBe('Café latte');
  });

  it('handles a string that is already capitalized correctly', () => {
    expect(capitalize('Hello')).toBe('Hello');
  });

  it('handles numbers and special characters at the start', () => {
    expect(capitalize('123abc')).toBe('123abc');
    expect(capitalize('!hello')).toBe('!hello');
  });

  it('handles a string with only spaces', () => {
    expect(capitalize('   ')).toBe('   ');
  });

  it('handles emoji leading character', () => {
    // emoji should remain as-is; toUpperCase on emoji is a no-op
    expect(capitalize('😀hello')).toBe('😀hello');
  });
});

// ---------------------------------------------------------------------------
// slugify
// ---------------------------------------------------------------------------
describe('slugify', () => {
  it('converts spaces to hyphens and lowercases', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('strips diacritics', () => {
    expect(slugify('Crème brûlée')).toBe('creme-brulee');
  });

  it('collapses multiple consecutive spaces and hyphens', () => {
    expect(slugify('hello---world')).toBe('hello-world');
    expect(slugify('hello   world')).toBe('hello-world');
  });

  it('trims leading and trailing whitespace', () => {
    expect(slugify('  foo   BAR  ')).toBe('foo-bar');
  });

  it('returns empty string for empty input', () => {
    expect(slugify('')).toBe('');
  });

  it('returns empty string for whitespace-only input', () => {
    expect(slugify('   ')).toBe('');
  });

  it('strips special characters', () => {
    expect(slugify('foo & bar!')).toBe('foo-bar');
    expect(slugify('hello.world')).toBe('helloworld');
  });

  it('trims leading and trailing hyphens', () => {
    expect(slugify('-hello-')).toBe('hello');
    expect(slugify('---hello---world---')).toBe('hello-world');
  });

  it('handles already lowercase, hyphenated input', () => {
    expect(slugify('foo-bar-baz')).toBe('foo-bar-baz');
  });

  it('handles numbers', () => {
    expect(slugify('section 42')).toBe('section-42');
    expect(slugify('2024-01-01')).toBe('2024-01-01');
  });

  it('handles unicode letters that are not diacritics (kept as-is after normalization)', () => {
    // CJK characters: not ASCII but also not diacritics, stripped by the alphanumeric filter
    expect(slugify('中文')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// truncate
// ---------------------------------------------------------------------------
describe('truncate', () => {
  it('truncates with default ellipsis when string exceeds maxLength', () => {
    expect(truncate('Hello, World!', 8)).toBe('Hello...');
  });

  it('does not truncate when string length equals maxLength', () => {
    expect(truncate('Hello', 5)).toBe('Hello');
  });

  it('does not truncate when string length is less than maxLength', () => {
    expect(truncate('Hi', 10)).toBe('Hi');
  });

  it('returns empty string for empty input', () => {
    expect(truncate('', 5)).toBe('');
    expect(truncate('', 0)).toBe('');
  });

  it('uses a custom ellipsis', () => {
    expect(truncate('Hello, World!', 8, { ellipsis: '…' })).toBe('Hello, …');
  });

  it('uses an empty ellipsis (hard cut)', () => {
    expect(truncate('Hello, World!', 5, { ellipsis: '' })).toBe('Hello');
  });

  it('handles maxLength smaller than or equal to ellipsis length', () => {
    // cutAt <= 0, so returns ellipsis sliced to maxLength
    expect(truncate('Hello', 2)).toBe('..');
    expect(truncate('Hello', 3)).toBe('...');
    expect(truncate('Hello', 1)).toBe('.');
  });

  it('handles maxLength of 0', () => {
    expect(truncate('Hello', 0)).toBe('');
  });

  it('handles unicode multi-byte characters in the string', () => {
    // 'café' is 4 chars, truncating to 3 gives 'ca...'
    expect(truncate('café world', 6)).toBe('caf...');
  });

  it('handles a custom ellipsis that is longer than maxLength', () => {
    // cutAt = 2 - 5 = -3 <= 0, so return '12345'.slice(0, 2) => '12'
    expect(truncate('Hello World', 2, { ellipsis: '12345' })).toBe('12');
  });
});

// ---------------------------------------------------------------------------
// camelCase
// ---------------------------------------------------------------------------
describe('camelCase', () => {
  it('converts space-separated words', () => {
    expect(camelCase('hello world')).toBe('helloWorld');
  });

  it('converts hyphen-separated words', () => {
    expect(camelCase('foo-bar-baz')).toBe('fooBarBaz');
  });

  it('converts underscore-separated words', () => {
    expect(camelCase('foo_bar_baz')).toBe('fooBarBaz');
  });

  it('converts PascalCase input', () => {
    expect(camelCase('FooBarBaz')).toBe('fooBarBaz');
  });

  it('converts SCREAMING_SNAKE_CASE', () => {
    expect(camelCase('FOO_BAR')).toBe('fooBar');
  });

  it('converts ALL CAPS words', () => {
    expect(camelCase('HTML Parser')).toBe('htmlParser');
  });

  it('returns empty string for empty input', () => {
    expect(camelCase('')).toBe('');
  });

  it('handles single word', () => {
    expect(camelCase('hello')).toBe('hello');
    expect(camelCase('HELLO')).toBe('hello');
  });

  it('handles mixed separators', () => {
    expect(camelCase('foo-bar_baz quux')).toBe('fooBarBazQuux');
  });

  it('collapses multiple separators', () => {
    expect(camelCase('foo--bar')).toBe('fooBar');
    expect(camelCase('foo   bar')).toBe('fooBar');
  });

  it('handles already camelCase input', () => {
    expect(camelCase('helloWorld')).toBe('helloWorld');
  });

  it('handles input with numbers', () => {
    expect(camelCase('foo 42 bar')).toBe('foo42Bar');
  });
});

// ---------------------------------------------------------------------------
// kebabCase
// ---------------------------------------------------------------------------
describe('kebabCase', () => {
  it('converts space-separated words', () => {
    expect(kebabCase('Hello World')).toBe('hello-world');
  });

  it('converts camelCase input', () => {
    expect(kebabCase('fooBarBaz')).toBe('foo-bar-baz');
  });

  it('converts PascalCase input', () => {
    expect(kebabCase('FooBarBaz')).toBe('foo-bar-baz');
  });

  it('converts underscore-separated words', () => {
    expect(kebabCase('foo_bar_baz')).toBe('foo-bar-baz');
  });

  it('converts SCREAMING_SNAKE_CASE', () => {
    expect(kebabCase('FOO_BAR')).toBe('foo-bar');
  });

  it('returns empty string for empty input', () => {
    expect(kebabCase('')).toBe('');
  });

  it('handles a single word', () => {
    expect(kebabCase('hello')).toBe('hello');
    expect(kebabCase('HELLO')).toBe('hello');
  });

  it('collapses multiple separators', () => {
    expect(kebabCase('foo--bar')).toBe('foo-bar');
    expect(kebabCase('foo   bar')).toBe('foo-bar');
  });

  it('handles mixed separators', () => {
    expect(kebabCase('foo-bar_baz quux')).toBe('foo-bar-baz-quux');
  });

  it('handles already kebab-case input', () => {
    expect(kebabCase('foo-bar-baz')).toBe('foo-bar-baz');
  });

  it('handles input with numbers', () => {
    expect(kebabCase('foo 42 bar')).toBe('foo-42-bar');
  });
});

// ---------------------------------------------------------------------------
// wordCount
// ---------------------------------------------------------------------------
describe('wordCount', () => {
  it('counts words separated by spaces', () => {
    expect(wordCount('hello world')).toBe(2);
  });

  it('counts words with multiple spaces between them', () => {
    expect(wordCount('  foo  bar  ')).toBe(2);
  });

  it('returns 0 for empty string', () => {
    expect(wordCount('')).toBe(0);
  });

  it('returns 0 for whitespace-only string', () => {
    expect(wordCount('   ')).toBe(0);
    expect(wordCount('\t\n')).toBe(0);
  });

  it('counts a single word', () => {
    expect(wordCount('one')).toBe(1);
  });

  it('counts words separated by tabs and newlines', () => {
    expect(wordCount('foo\tbar\nbaz')).toBe(3);
  });

  it('handles punctuation as part of words', () => {
    // Punctuation is not whitespace, so "hello," is one word
    expect(wordCount('hello, world!')).toBe(2);
  });

  it('handles unicode words', () => {
    expect(wordCount('中文 文字')).toBe(2);
    expect(wordCount('café au lait')).toBe(3);
  });

  it('handles a long sentence', () => {
    expect(wordCount('the quick brown fox jumps over the lazy dog')).toBe(9);
  });
});
