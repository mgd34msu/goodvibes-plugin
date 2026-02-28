import { describe, it, expect } from 'vitest';
import {
  capitalize,
  slugify,
  truncate,
  camelToKebab,
  wordCount,
} from './strings.js';

describe('capitalize', () => {
  it('capitalizes the first letter of a lowercase string', () => {
    expect(capitalize('hello')).toBe('Hello');
  });

  it('leaves an already-capitalized string unchanged', () => {
    expect(capitalize('Hello')).toBe('Hello');
  });

  it('returns an empty string unchanged', () => {
    expect(capitalize('')).toBe('');
  });

  it('capitalizes a single lowercase letter', () => {
    expect(capitalize('a')).toBe('A');
  });

  it('only capitalizes the first letter, leaving the rest intact', () => {
    expect(capitalize('hELLO wORLD')).toBe('HELLO wORLD');
  });

  it('handles strings that start with a digit', () => {
    expect(capitalize('123abc')).toBe('123abc');
  });

  it('handles a whitespace-only string', () => {
    expect(capitalize('   ')).toBe('   ');
  });

  it('handles unicode characters', () => {
    expect(capitalize('über')).toBe('Über');
  });

  it('handles a string that starts with a symbol', () => {
    expect(capitalize('!hello')).toBe('!hello');
  });
});

describe('slugify', () => {
  it('converts a simple sentence to a slug', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('strips special characters', () => {
    expect(slugify('Hello, World!')).toBe('hello-world');
  });

  it('returns an empty string for an empty input', () => {
    expect(slugify('')).toBe('');
  });

  it('returns an empty string for a whitespace-only input', () => {
    expect(slugify('   ')).toBe('');
  });

  it('collapses multiple spaces into a single hyphen', () => {
    expect(slugify('hello   world')).toBe('hello-world');
  });

  it('collapses mixed whitespace into a single hyphen', () => {
    expect(slugify('hello\t\nworld')).toBe('hello-world');
  });

  it('strips leading and trailing hyphens after processing', () => {
    expect(slugify('---hello---')).toBe('hello');
  });

  it('converts underscores to hyphens', () => {
    expect(slugify('hello_world')).toBe('hello-world');
  });

  it('handles a string that is already a valid slug', () => {
    expect(slugify('hello-world')).toBe('hello-world');
  });

  it('handles numbers in the string', () => {
    expect(slugify('Article 42')).toBe('article-42');
  });

  it('handles strings with only special characters', () => {
    expect(slugify('!@#$%')).toBe('');
  });

  it('trims surrounding whitespace', () => {
    expect(slugify('  hello world  ')).toBe('hello-world');
  });

  it('strips diacritics from accented characters', () => {
    expect(slugify('café latté')).toBe('cafe-latte');
  });

  it('strips diacritics from mixed accented and plain characters', () => {
    expect(slugify('résumé')).toBe('resume');
  });

  it('strips non-Latin characters', () => {
    expect(slugify('東京 Tokyo')).toBe('tokyo');
  });
});

describe('truncate', () => {
  it('returns the string unchanged when shorter than maxLength', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('returns the string unchanged when equal to maxLength', () => {
    expect(truncate('hello', 5)).toBe('hello');
  });

  it('truncates and appends the default suffix', () => {
    expect(truncate('hello world', 8)).toBe('hello...');
  });

  it('truncates and appends a custom suffix', () => {
    expect(truncate('hello world foo', 12, ' [more]')).toBe('hello [more]');
  });

  it('handles an empty string', () => {
    expect(truncate('', 5)).toBe('');
  });

  it('handles maxLength of 0 by returning an empty string', () => {
    expect(truncate('hello', 0)).toBe('');
  });

  it('handles maxLength smaller than the suffix', () => {
    expect(truncate('hello world', 2)).toBe('he');
  });

  it('handles maxLength equal to the suffix length', () => {
    // suffix is '...' (3 chars), maxLength is 3 — truncatedLength would be 0
    expect(truncate('hello world', 3)).toBe('hel');
  });

  it('handles an empty custom suffix', () => {
    expect(truncate('hello world', 5, '')).toBe('hello');
  });

  it('handles unicode in the string', () => {
    expect(truncate('Héllo wörld', 8)).toBe('Héllo...');
  });

  it('returns empty string for negative maxLength', () => {
    expect(truncate('hello', -1)).toBe('');
  });
});

describe('camelToKebab', () => {
  it('converts a simple camelCase word', () => {
    expect(camelToKebab('helloWorld')).toBe('hello-world');
  });

  it('converts multiple segments', () => {
    expect(camelToKebab('myVariableName')).toBe('my-variable-name');
  });

  it('returns a lowercase string unchanged', () => {
    expect(camelToKebab('hello')).toBe('hello');
  });

  it('returns an empty string unchanged', () => {
    expect(camelToKebab('')).toBe('');
  });

  it('converts PascalCase correctly', () => {
    expect(camelToKebab('HelloWorld')).toBe('hello-world');
  });

  it('handles a string starting with uppercase', () => {
    expect(camelToKebab('MyComponent')).toBe('my-component');
  });

  it('handles consecutive uppercase letters (acronym) at end', () => {
    expect(camelToKebab('parseURL')).toBe('parse-url');
  });

  it('handles acronym followed by capitalized word (XMLParser)', () => {
    expect(camelToKebab('XMLParser')).toBe('xml-parser');
  });

  it('handles acronym mid-string (parseURLString)', () => {
    expect(camelToKebab('parseURLString')).toBe('parse-url-string');
  });

  it('handles digits before uppercase letters', () => {
    expect(camelToKebab('html5Parser')).toBe('html5-parser');
  });

  it('handles an already-kebab string (no uppercase)', () => {
    expect(camelToKebab('already-kebab')).toBe('already-kebab');
  });

  it('converts a single uppercase letter', () => {
    expect(camelToKebab('A')).toBe('a');
  });
});

describe('wordCount', () => {
  it('counts words in a simple sentence', () => {
    expect(wordCount('hello world')).toBe(2);
  });

  it('returns 0 for an empty string', () => {
    expect(wordCount('')).toBe(0);
  });

  it('returns 0 for a whitespace-only string', () => {
    expect(wordCount('   ')).toBe(0);
  });

  it('returns 0 for a tab-only string', () => {
    expect(wordCount('\t\t')).toBe(0);
  });

  it('handles multiple spaces between words', () => {
    expect(wordCount('hello   world')).toBe(2);
  });

  it('handles tabs between words', () => {
    expect(wordCount('hello\tworld')).toBe(2);
  });

  it('handles newlines between words', () => {
    expect(wordCount('hello\nworld')).toBe(2);
  });

  it('handles mixed whitespace between words', () => {
    expect(wordCount('hello\t\n world')).toBe(2);
  });

  it('returns 1 for a single word', () => {
    expect(wordCount('hello')).toBe(1);
  });

  it('handles leading and trailing whitespace', () => {
    expect(wordCount('  hello world  ')).toBe(2);
  });

  it('counts words in a longer sentence', () => {
    expect(wordCount('the quick brown fox jumps over the lazy dog')).toBe(9);
  });

  it('handles a string with only one character', () => {
    expect(wordCount('a')).toBe(1);
  });

  it('handles a mix of newlines and spaces', () => {
    expect(wordCount('one\ntwo\nthree four')).toBe(4);
  });
});
