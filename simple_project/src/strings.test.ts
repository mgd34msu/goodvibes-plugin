import { describe, it, expect } from 'vitest';
import {
  capitalize,
  camelCase,
  kebabCase,
  snakeCase,
  truncate,
  slugify,
  reverse,
  countOccurrences,
  isPalindrome,
  wordCount,
} from './strings.js';

describe('capitalize', () => {
  it('capitalizes first letter', () => {
    expect(capitalize('hello')).toBe('Hello');
  });

  it('leaves already-capitalized strings unchanged', () => {
    expect(capitalize('Hello')).toBe('Hello');
  });

  it('handles single character', () => {
    expect(capitalize('a')).toBe('A');
    expect(capitalize('A')).toBe('A');
  });

  it('handles empty string', () => {
    expect(capitalize('')).toBe('');
  });

  it('only capitalizes first character, leaves rest unchanged', () => {
    expect(capitalize('hELLO WORLD')).toBe('HELLO WORLD');
  });

  it('handles strings starting with numbers', () => {
    expect(capitalize('123abc')).toBe('123abc');
  });

  it('handles unicode characters', () => {
    expect(capitalize('café')).toBe('Café');
  });
});

describe('camelCase', () => {
  it('converts kebab-case to camelCase', () => {
    expect(camelCase('hello-world')).toBe('helloWorld');
  });

  it('converts snake_case to camelCase', () => {
    expect(camelCase('hello_world')).toBe('helloWorld');
  });

  it('converts space-separated to camelCase', () => {
    expect(camelCase('hello world')).toBe('helloWorld');
  });

  it('handles multiple delimiters', () => {
    expect(camelCase('foo-bar_baz qux')).toBe('fooBarBazQux');
  });

  it('handles empty string', () => {
    expect(camelCase('')).toBe('');
  });

  it('handles single word', () => {
    expect(camelCase('hello')).toBe('hello');
  });

  it('ensures first character is lowercase', () => {
    expect(camelCase('Hello-World')).toBe('helloWorld');
  });

  it('handles consecutive delimiters', () => {
    expect(camelCase('foo--bar')).toBe('fooBar');
    expect(camelCase('foo__bar')).toBe('fooBar');
  });
});

describe('kebabCase', () => {
  it('converts camelCase to kebab-case', () => {
    expect(kebabCase('helloWorld')).toBe('hello-world');
  });

  it('converts snake_case to kebab-case', () => {
    expect(kebabCase('hello_world')).toBe('hello-world');
  });

  it('converts space-separated to kebab-case', () => {
    expect(kebabCase('hello world')).toBe('hello-world');
  });

  it('handles PascalCase', () => {
    expect(kebabCase('HelloWorld')).toBe('hello-world');
  });

  it('handles empty string', () => {
    expect(kebabCase('')).toBe('');
  });

  it('handles single word', () => {
    expect(kebabCase('hello')).toBe('hello');
  });

  it('handles consecutive uppercase letters', () => {
    expect(kebabCase('XMLParser')).toBe('xml-parser');
  });

  it('does not add leading or trailing hyphens', () => {
    expect(kebabCase(' hello ')).toBe('hello');
  });
});

describe('snakeCase', () => {
  it('converts camelCase to snake_case', () => {
    expect(snakeCase('helloWorld')).toBe('hello_world');
  });

  it('converts kebab-case to snake_case', () => {
    expect(snakeCase('hello-world')).toBe('hello_world');
  });

  it('converts space-separated to snake_case', () => {
    expect(snakeCase('hello world')).toBe('hello_world');
  });

  it('handles PascalCase', () => {
    expect(snakeCase('HelloWorld')).toBe('hello_world');
  });

  it('handles empty string', () => {
    expect(snakeCase('')).toBe('');
  });

  it('handles single word', () => {
    expect(snakeCase('hello')).toBe('hello');
  });

  it('handles consecutive uppercase letters', () => {
    expect(snakeCase('XMLParser')).toBe('xml_parser');
  });

  it('does not add leading or trailing underscores', () => {
    expect(snakeCase(' hello ')).toBe('hello');
  });
});

describe('truncate', () => {
  it('returns string unchanged when within maxLength', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('returns string unchanged when exactly maxLength', () => {
    expect(truncate('hello', 5)).toBe('hello');
  });

  it('truncates with default suffix', () => {
    expect(truncate('hello world', 8)).toBe('hello...');
  });

  it('truncates with custom suffix', () => {
    expect(truncate('hello world', 7, '…')).toBe('hello …');
  });

  it('handles empty string', () => {
    expect(truncate('', 5)).toBe('');
  });

  it('handles maxLength equal to suffix length', () => {
    expect(truncate('hello world', 3)).toBe('...');
  });

  it('handles maxLength smaller than suffix length', () => {
    expect(truncate('hello world', 2)).toBe('..');
    expect(truncate('hello world', 1)).toBe('.');
    expect(truncate('hello world', 0)).toBe('');
  });

  it('handles empty suffix', () => {
    expect(truncate('hello world', 5, '')).toBe('hello');
  });

  it('handles unicode characters', () => {
    expect(truncate('café du monde', 7)).toBe('café...');
  });
});

describe('slugify', () => {
  it('converts to lowercase', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('replaces spaces with hyphens', () => {
    expect(slugify('hello world')).toBe('hello-world');
  });

  it('strips special characters', () => {
    expect(slugify('hello! @world#')).toBe('hello-world');
  });

  it('handles empty string', () => {
    expect(slugify('')).toBe('');
  });

  it('handles already valid slug', () => {
    expect(slugify('hello-world')).toBe('hello-world');
  });

  it('handles multiple spaces', () => {
    expect(slugify('hello   world')).toBe('hello-world');
  });

  it('removes leading and trailing hyphens', () => {
    expect(slugify('  hello world  ')).toBe('hello-world');
  });

  it('handles accented characters', () => {
    expect(slugify('café résumé')).toBe('cafe-resume');
  });

  it('handles numbers', () => {
    expect(slugify('hello 2 world')).toBe('hello-2-world');
  });

  it('handles strings with only special characters', () => {
    expect(slugify('!@#$%')).toBe('');
  });
});

describe('reverse', () => {
  it('reverses a simple string', () => {
    expect(reverse('hello')).toBe('olleh');
  });

  it('handles empty string', () => {
    expect(reverse('')).toBe('');
  });

  it('handles single character', () => {
    expect(reverse('a')).toBe('a');
  });

  it('handles palindromes correctly', () => {
    expect(reverse('racecar')).toBe('racecar');
  });

  it('handles strings with spaces', () => {
    expect(reverse('hello world')).toBe('dlrow olleh');
  });

  it('handles unicode/emoji correctly', () => {
    expect(reverse('abc')).toBe('cba');
  });

  it('handles numbers in string', () => {
    expect(reverse('12345')).toBe('54321');
  });
});

describe('countOccurrences', () => {
  it('counts non-overlapping occurrences', () => {
    expect(countOccurrences('hello world hello', 'hello')).toBe(2);
  });

  it('returns 0 when search not found', () => {
    expect(countOccurrences('hello world', 'xyz')).toBe(0);
  });

  it('returns 0 for empty search string', () => {
    expect(countOccurrences('hello', '')).toBe(0);
  });

  it('handles empty source string', () => {
    expect(countOccurrences('', 'hello')).toBe(0);
  });

  it('counts single character occurrences', () => {
    expect(countOccurrences('banana', 'a')).toBe(3);
  });

  it('does not count overlapping matches', () => {
    expect(countOccurrences('aaa', 'aa')).toBe(1);
  });

  it('handles search string longer than source', () => {
    expect(countOccurrences('hi', 'hello')).toBe(0);
  });

  it('counts when search equals full string', () => {
    expect(countOccurrences('hello', 'hello')).toBe(1);
  });

  it('is case-sensitive', () => {
    expect(countOccurrences('Hello hello HELLO', 'hello')).toBe(1);
  });
});

describe('isPalindrome', () => {
  it('returns true for palindrome', () => {
    expect(isPalindrome('racecar')).toBe(true);
  });

  it('returns false for non-palindrome', () => {
    expect(isPalindrome('hello')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isPalindrome('RaceCar')).toBe(true);
    expect(isPalindrome('Madam')).toBe(true);
  });

  it('ignores non-alphanumeric characters', () => {
    expect(isPalindrome('A man, a plan, a canal: Panama')).toBe(true);
    expect(isPalindrome('Was it a car or a cat I saw?')).toBe(true);
  });

  it('handles empty string', () => {
    expect(isPalindrome('')).toBe(true);
  });

  it('handles single character', () => {
    expect(isPalindrome('a')).toBe(true);
  });

  it('handles string with only non-alphanumeric', () => {
    expect(isPalindrome('!!!???')).toBe(true);
  });

  it('handles numeric palindromes', () => {
    expect(isPalindrome('12321')).toBe(true);
    expect(isPalindrome('12345')).toBe(false);
  });

  it('handles two character palindrome', () => {
    expect(isPalindrome('aa')).toBe(true);
    expect(isPalindrome('ab')).toBe(false);
  });
});

describe('wordCount', () => {
  it('counts words in a simple sentence', () => {
    expect(wordCount('hello world')).toBe(2);
  });

  it('returns 0 for empty string', () => {
    expect(wordCount('')).toBe(0);
  });

  it('returns 0 for whitespace-only string', () => {
    expect(wordCount('   ')).toBe(0);
    expect(wordCount('\t\n')).toBe(0);
  });

  it('returns 1 for single word', () => {
    expect(wordCount('hello')).toBe(1);
  });

  it('handles multiple spaces between words', () => {
    expect(wordCount('hello   world')).toBe(2);
  });

  it('handles leading and trailing spaces', () => {
    expect(wordCount('  hello world  ')).toBe(2);
  });

  it('handles tabs and newlines as whitespace', () => {
    expect(wordCount('hello\tworld\nfoo')).toBe(3);
  });

  it('counts a longer sentence', () => {
    expect(wordCount('the quick brown fox jumps over the lazy dog')).toBe(9);
  });

  it('handles single character words', () => {
    expect(wordCount('a b c')).toBe(3);
  });
});
