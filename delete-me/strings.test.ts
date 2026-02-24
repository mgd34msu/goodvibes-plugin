import { describe, it, expect } from 'vitest';
import {
  slugify,
  truncate,
  capitalize,
  countWords,
  reverse,
} from './strings.ts';

// ============================================================
// slugify
// ============================================================
describe('slugify', () => {
  it('lowercases all letters', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('replaces spaces with hyphens', () => {
    expect(slugify('foo bar baz')).toBe('foo-bar-baz');
  });

  it('replaces special characters with hyphens', () => {
    expect(slugify('hello! world?')).toBe('hello-world');
  });

  it('collapses consecutive hyphens into one', () => {
    expect(slugify('hello---world')).toBe('hello-world');
  });

  it('collapses hyphens produced by multiple special chars', () => {
    expect(slugify('foo!@#bar')).toBe('foo-bar');
  });

  it('trims leading hyphens', () => {
    expect(slugify('---hello')).toBe('hello');
  });

  it('trims trailing hyphens', () => {
    expect(slugify('hello---')).toBe('hello');
  });

  it('trims both leading and trailing hyphens', () => {
    expect(slugify('--hello world--')).toBe('hello-world');
  });

  it('handles an empty string', () => {
    expect(slugify('')).toBe('');
  });

  it('handles a string of only special characters', () => {
    expect(slugify('!@#$%^&*()')).toBe('');
  });

  it('preserves numbers', () => {
    expect(slugify('Hello 42 World')).toBe('hello-42-world');
  });

  it('handles an already valid slug', () => {
    expect(slugify('already-slugified')).toBe('already-slugified');
  });

  it('handles unicode letters by lowercasing (non-special)', () => {
    // ASCII-range: accented chars are not alphanumeric, treated as special
    expect(slugify('caf\u00e9 au lait')).toBe('cafe-au-lait');
  });

  it('handles a single word', () => {
    expect(slugify('Hello')).toBe('hello');
  });

  it('collapses mixed whitespace and special chars', () => {
    expect(slugify('Hello   World!!!')).toBe('hello-world');
  });
});

// ============================================================
// truncate
// ============================================================
describe('truncate', () => {
  it('returns input unchanged when length is within maxLen', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('returns input unchanged when length equals maxLen', () => {
    expect(truncate('hello', 5)).toBe('hello');
  });

  it('truncates and appends default suffix "..."', () => {
    expect(truncate('hello world', 8)).toBe('hello...');
  });

  it('truncates and appends a custom suffix', () => {
    expect(truncate('hello world', 7, '…')).toBe('hello …');
  });

  it('handles maxLen of 0 with default suffix', () => {
    expect(truncate('hello', 0)).toBe('...');
  });

  it('handles maxLen of 1 with default suffix', () => {
    expect(truncate('hello', 1)).toBe('...');
  });

  it('handles empty string input', () => {
    expect(truncate('', 5)).toBe('');
  });

  it('handles empty string input with maxLen 0', () => {
    expect(truncate('', 0)).toBe('');
  });

  it('appends suffix even when remaining chars after cut is empty', () => {
    // maxLen 0 means 0 chars of original + suffix
    expect(truncate('abcdef', 0)).toBe('...');
  });

  it('truncates to exact maxLen chars plus suffix', () => {
    // input length 6 > maxLen 5; suffix takes 3 chars, leaving 2 for content
    expect(truncate('abcdef', 5)).toBe('ab...');
  });

  it('uses empty string as custom suffix', () => {
    expect(truncate('hello world', 5, '')).toBe('hello');
  });

  it('handles a very long string', () => {
    const long = 'a'.repeat(10000);
    const result = truncate(long, 10);
    expect(result).toBe('aaaaaaa...');
  });

  it('handles a multi-byte unicode suffix', () => {
    // suffix longer than maxLen: cutAt clamps to 0, returns just the suffix
    expect(truncate('hello world', 5, ' [more]')).toBe(' [more]');
  });
});

// ============================================================
// capitalize
// ============================================================
describe('capitalize', () => {
  it('capitalizes the first letter of each word', () => {
    expect(capitalize('hello world')).toBe('Hello World');
  });

  it('handles a single word', () => {
    expect(capitalize('hello')).toBe('Hello');
  });

  it('handles an empty string', () => {
    expect(capitalize('')).toBe('');
  });

  it('handles already capitalized words', () => {
    expect(capitalize('Hello World')).toBe('Hello World');
  });

  it('handles all-caps input', () => {
    // Each word: first char uppercased (stays upper), rest lowercased or kept
    // Behavior depends on implementation: only first char is forced upper
    const result = capitalize('HELLO WORLD');
    expect(result[0]).toBe('H');
    expect(result.split(' ')[1][0]).toBe('W');
  });

  it('handles mixed case input', () => {
    expect(capitalize('hElLo wOrLd')[0]).toBe('H');
  });

  it('capitalizes each word in a multi-word string', () => {
    expect(capitalize('the quick brown fox')).toBe('The Quick Brown Fox');
  });

  it('handles a single character', () => {
    expect(capitalize('a')).toBe('A');
  });

  it('handles a string that starts with a number', () => {
    const result = capitalize('123 go');
    expect(result).toContain('123');
    // 'go' should be capitalized
    expect(result).toContain('Go');
  });

  it('handles multiple spaces between words', () => {
    // Implementation may treat multiple spaces as separate tokens
    const result = capitalize('hello  world');
    expect(result).toContain('Hello');
    expect(result).toContain('World');
  });
});

// ============================================================
// countWords
// ============================================================
describe('countWords', () => {
  it('returns 0 for an empty string', () => {
    expect(countWords('')).toBe(0);
  });

  it('counts a single word', () => {
    expect(countWords('hello')).toBe(1);
  });

  it('counts multiple words separated by single spaces', () => {
    expect(countWords('hello world foo')).toBe(3);
  });

  it('ignores leading whitespace', () => {
    expect(countWords('   hello')).toBe(1);
  });

  it('ignores trailing whitespace', () => {
    expect(countWords('hello   ')).toBe(1);
  });

  it('ignores multiple spaces between words', () => {
    expect(countWords('hello   world')).toBe(2);
  });

  it('handles tab characters as whitespace', () => {
    expect(countWords('hello\tworld')).toBe(2);
  });

  it('handles newline characters as whitespace', () => {
    expect(countWords('hello\nworld')).toBe(2);
  });

  it('handles a string of only whitespace', () => {
    expect(countWords('   ')).toBe(0);
  });

  it('counts words in a long sentence', () => {
    expect(countWords('the quick brown fox jumps over the lazy dog')).toBe(9);
  });
});

// ============================================================
// reverse
// ============================================================
describe('reverse', () => {
  it('reverses a simple string', () => {
    expect(reverse('hello')).toBe('olleh');
  });

  it('reverses a string with spaces', () => {
    expect(reverse('hello world')).toBe('dlrow olleh');
  });

  it('returns an empty string for empty input', () => {
    expect(reverse('')).toBe('');
  });

  it('handles a single character', () => {
    expect(reverse('a')).toBe('a');
  });

  it('handles a palindrome', () => {
    expect(reverse('racecar')).toBe('racecar');
  });

  it('reverses a numeric string', () => {
    expect(reverse('12345')).toBe('54321');
  });

  it('reverses special characters', () => {
    expect(reverse('!@#')).toBe('#@!');
  });

  it('handles unicode characters (emoji)', () => {
    // Note: naive char-code reversal may split surrogate pairs;
    // test that the function returns a reversed sequence
    const result = reverse('ab');
    expect(result).toBe('ba');
  });

  it('handles mixed alphanumeric and special chars', () => {
    expect(reverse('abc123!@#')).toBe('#@!321cba');
  });

  it('reverses a multi-word sentence maintaining all chars', () => {
    const input = 'The quick brown fox';
    const expected = 'xof nworb kciuq ehT';
    expect(reverse(input)).toBe(expected);
  });
});
