import { describe, it, expect } from 'vitest';
import { capitalize, reverse, truncate, slugify } from './string.js';

describe('capitalize', () => {
  it('capitalizes the first letter and lowercases the rest', () => {
    expect(capitalize('hello')).toBe('Hello');
    expect(capitalize('WORLD')).toBe('World');
    expect(capitalize('hELLO wORLD')).toBe('Hello world');
  });

  it('handles single character strings', () => {
    expect(capitalize('a')).toBe('A');
    expect(capitalize('Z')).toBe('Z');
  });

  it('returns empty string unchanged', () => {
    expect(capitalize('')).toBe('');
  });

  it('handles strings starting with numbers or symbols', () => {
    expect(capitalize('123abc')).toBe('123abc');
    expect(capitalize('!hello')).toBe('!hello');
  });

  it('handles strings with only spaces', () => {
    expect(capitalize('   ')).toBe('   ');
  });
});

describe('reverse', () => {
  it('reverses a simple string', () => {
    expect(reverse('hello')).toBe('olleh');
    expect(reverse('world')).toBe('dlrow');
  });

  it('returns empty string unchanged', () => {
    expect(reverse('')).toBe('');
  });

  it('handles palindromes correctly', () => {
    expect(reverse('racecar')).toBe('racecar');
    expect(reverse('level')).toBe('level');
    expect(reverse('madam')).toBe('madam');
  });

  it('handles single character strings', () => {
    expect(reverse('a')).toBe('a');
  });

  it('handles strings with spaces', () => {
    expect(reverse('hello world')).toBe('dlrow olleh');
  });

  it('handles numeric strings', () => {
    expect(reverse('12345')).toBe('54321');
  });

  it('handles special characters', () => {
    expect(reverse('!@#$%')).toBe('%$#@!');
  });

  it('handles Unicode multi-byte characters (emoji)', () => {
    expect(reverse('abc😀')).toBe('😀cba');
  });

  it('handles surrogate pairs (spread operator preserves code points)', () => {
    expect(reverse('\u{1F600}abc')).toBe('cba\u{1F600}');
  });

  it('demonstrates grapheme cluster limitation with ZWJ sequences', () => {
    // Family emoji (👨‍👩‍👧) is a ZWJ grapheme cluster: man + ZWJ + woman + ZWJ + girl.
    // The spread operator splits on code points, not grapheme clusters,
    // so reversing it yields a visually broken/different sequence.
    const family = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}';
    const reversed = reverse(family);
    // The reversed code-point sequence is NOT equal to the original
    expect(reversed).not.toBe(family);
    // And the reversed string is longer in visual rendering but same byte length
    expect([...reversed].length).toBe([...family].length);
  });
});

describe('truncate', () => {
  it('truncates a string exceeding maxLength', () => {
    expect(truncate('Hello, World!', 8)).toBe('Hello...');
    expect(truncate('Hello, World!', 5)).toBe('He...');
  });

  it('does not truncate a string within maxLength', () => {
    expect(truncate('Hello', 10)).toBe('Hello');
    expect(truncate('Hello', 5)).toBe('Hello');
  });

  it('uses custom ellipsis', () => {
    expect(truncate('Hello, World!', 8, ' ...')).toBe('Hell ...');
    expect(truncate('Hello, World!', 7, '—')).toBe('Hello,—');
  });

  it('handles empty string', () => {
    expect(truncate('', 5)).toBe('');
    expect(truncate('', 0)).toBe('');
  });

  it('handles maxLength exactly equal to string length', () => {
    expect(truncate('Hello', 5)).toBe('Hello');
  });

  it('handles maxLength smaller than ellipsis length', () => {
    expect(truncate('Hello', 2)).toBe('..');
    expect(truncate('Hello', 1)).toBe('.');
    expect(truncate('Hello', 0)).toBe('');
  });

  it('handles maxLength of 0', () => {
    expect(truncate('Hello', 0)).toBe('');
  });

  it('throws RangeError for negative maxLength', () => {
    expect(() => truncate('Hello', -1)).toThrow(RangeError);
  });

  it('throws RangeError for NaN maxLength', () => {
    expect(() => truncate('Hello', NaN)).toThrow(RangeError);
  });

  it('throws RangeError for Infinity maxLength', () => {
    expect(() => truncate('Hello', Infinity)).toThrow(RangeError);
    expect(() => truncate('Hello', -Infinity)).toThrow(RangeError);
  });

  it('floors fractional maxLength values', () => {
    // 5.7 is treated as 5, so 'Hello' (length 5) is not truncated
    expect(truncate('Hello', 5.7)).toBe('Hello');
    // 4.9 is treated as 4: truncatedLength = 4 - 3 = 1, result is 'H...'
    expect(truncate('Hello, World!', 4.9)).toBe('H...');
    // 3.1 is treated as 3: truncatedLength = 3 - 3 = 0, falls back to ellipsis slice
    expect(truncate('Hello', 3.1)).toBe('...');
  });

  it('handles string that fits exactly with ellipsis space', () => {
    // 'Hi' is 2 chars, ellipsis '...' is 3. 2 <= 5. No truncation needed.
    expect(truncate('Hi', 5)).toBe('Hi');
  });
});

describe('slugify', () => {
  it('converts spaces to hyphens and lowercases', () => {
    expect(slugify('Hello World')).toBe('hello-world');
    expect(slugify('The Quick Brown Fox')).toBe('the-quick-brown-fox');
  });

  it('removes special characters', () => {
    expect(slugify('Hello, World!')).toBe('hello-world');
    expect(slugify('foo@bar.baz')).toBe('foobarbaz');
  });

  it('collapses multiple spaces/hyphens into one', () => {
    expect(slugify('hello   world')).toBe('hello-world');
    expect(slugify('hello---world')).toBe('hello-world');
    expect(slugify('hello - world')).toBe('hello-world');
  });

  it('strips leading and trailing hyphens', () => {
    expect(slugify('  hello  ')).toBe('hello');
    expect(slugify('-hello-')).toBe('hello');
  });

  it('handles empty string', () => {
    expect(slugify('')).toBe('');
  });

  it('handles strings with only special characters', () => {
    expect(slugify('!@#$%^&*()')).toBe('');
  });

  it('handles strings with numbers', () => {
    expect(slugify('Hello 123 World')).toBe('hello-123-world');
    expect(slugify('version 2.0 release')).toBe('version-20-release');
  });

  it('strips diacritics from accented characters', () => {
    expect(slugify('caf\u00e9')).toBe('cafe');
    expect(slugify('na\u00efve')).toBe('naive');
    expect(slugify('\u00e9l\u00e8ve')).toBe('eleve');
  });

  it('handles already-valid slugs', () => {
    expect(slugify('hello-world')).toBe('hello-world');
    expect(slugify('my-blog-post-123')).toBe('my-blog-post-123');
  });

  it('handles mixed case with hyphens', () => {
    expect(slugify('My Blog Post')).toBe('my-blog-post');
  });
});
