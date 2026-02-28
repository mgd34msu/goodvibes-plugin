import { describe, it, expect } from 'vitest';
import {
  capitalize,
  camelCase,
  snakeCase,
  kebabCase,
  titleCase,
} from './transform.js';
import {
  isEmail,
  isUrl,
  isEmpty,
  isPalindrome,
  isNumeric,
} from './validate.js';

// =============================================================================
// transform.ts
// =============================================================================

describe('capitalize', () => {
  it('capitalizes the first letter and lowercases the rest', () => {
    expect(capitalize('hello')).toBe('Hello');
    expect(capitalize('WORLD')).toBe('World');
    expect(capitalize('hELLo WoRLd')).toBe('Hello world');
  });

  it('returns an empty string for empty input', () => {
    expect(capitalize('')).toBe('');
  });

  it('handles a single character', () => {
    expect(capitalize('a')).toBe('A');
    expect(capitalize('Z')).toBe('Z');
  });

  it('handles strings that start with a number', () => {
    expect(capitalize('1abc')).toBe('1abc');
  });
});

describe('camelCase', () => {
  it('converts space-separated words', () => {
    expect(camelCase('hello world')).toBe('helloWorld');
    expect(camelCase('foo bar baz')).toBe('fooBarBaz');
  });

  it('converts hyphen-separated words', () => {
    expect(camelCase('hello-world')).toBe('helloWorld');
    expect(camelCase('my-component-name')).toBe('myComponentName');
  });

  it('converts underscore-separated words', () => {
    expect(camelCase('hello_world')).toBe('helloWorld');
    expect(camelCase('snake_case_string')).toBe('snakeCaseString');
  });

  it('converts PascalCase input', () => {
    expect(camelCase('HelloWorld')).toBe('helloWorld');
    expect(camelCase('MyComponentName')).toBe('myComponentName');
  });

  it('converts already-camelCase input (identity-ish)', () => {
    expect(camelCase('helloWorld')).toBe('helloWorld');
  });

  it('handles mixed delimiters', () => {
    expect(camelCase('hello_world-foo bar')).toBe('helloWorldFooBar');
  });

  it('returns an empty string for empty input', () => {
    expect(camelCase('')).toBe('');
  });

  it('returns an empty string for delimiter-only input', () => {
    expect(camelCase('---')).toBe('');
    expect(camelCase('   ')).toBe('');
    expect(camelCase('___')).toBe('');
  });

  it('handles a single word', () => {
    expect(camelCase('hello')).toBe('hello');
  });

  it('handles acronyms (XMLParser, getHTTPResponse)', () => {
    expect(camelCase('XMLParser')).toBe('xmlParser');
    expect(camelCase('getHTTPResponse')).toBe('getHttpResponse');
  });
});

describe('snakeCase', () => {
  it('converts space-separated words', () => {
    expect(snakeCase('hello world')).toBe('hello_world');
    expect(snakeCase('foo bar baz')).toBe('foo_bar_baz');
  });

  it('converts hyphen-separated words', () => {
    expect(snakeCase('hello-world')).toBe('hello_world');
  });

  it('converts camelCase input', () => {
    expect(snakeCase('helloWorld')).toBe('hello_world');
    expect(snakeCase('myComponentName')).toBe('my_component_name');
  });

  it('converts PascalCase input', () => {
    expect(snakeCase('HelloWorld')).toBe('hello_world');
  });

  it('handles mixed delimiters', () => {
    expect(snakeCase('hello_world-foo bar')).toBe('hello_world_foo_bar');
  });

  it('returns an empty string for empty input', () => {
    expect(snakeCase('')).toBe('');
  });

  it('returns an empty string for delimiter-only input', () => {
    expect(snakeCase('---')).toBe('');
  });

  it('handles a single word', () => {
    expect(snakeCase('hello')).toBe('hello');
  });

  it('lowercases the result', () => {
    expect(snakeCase('HELLO WORLD')).toBe('hello_world');
  });

  it('handles acronyms (XMLParser, getHTTPResponse)', () => {
    expect(snakeCase('XMLParser')).toBe('xml_parser');
    expect(snakeCase('getHTTPResponse')).toBe('get_http_response');
  });
});

describe('kebabCase', () => {
  it('converts space-separated words', () => {
    expect(kebabCase('hello world')).toBe('hello-world');
    expect(kebabCase('foo bar baz')).toBe('foo-bar-baz');
  });

  it('converts underscore-separated words', () => {
    expect(kebabCase('hello_world')).toBe('hello-world');
  });

  it('converts camelCase input', () => {
    expect(kebabCase('helloWorld')).toBe('hello-world');
    expect(kebabCase('myComponentName')).toBe('my-component-name');
  });

  it('converts PascalCase input', () => {
    expect(kebabCase('HelloWorld')).toBe('hello-world');
  });

  it('handles mixed delimiters', () => {
    expect(kebabCase('hello_world-foo bar')).toBe('hello-world-foo-bar');
  });

  it('returns an empty string for empty input', () => {
    expect(kebabCase('')).toBe('');
  });

  it('returns an empty string for delimiter-only input', () => {
    expect(kebabCase('___')).toBe('');
  });

  it('handles a single word', () => {
    expect(kebabCase('hello')).toBe('hello');
  });

  it('lowercases the result', () => {
    expect(kebabCase('HELLO WORLD')).toBe('hello-world');
  });

  it('handles acronyms (XMLParser, getHTTPResponse)', () => {
    expect(kebabCase('XMLParser')).toBe('xml-parser');
    expect(kebabCase('getHTTPResponse')).toBe('get-http-response');
  });
});

describe('titleCase', () => {
  it('converts space-separated lowercase words', () => {
    expect(titleCase('hello world')).toBe('Hello World');
    expect(titleCase('the quick brown fox')).toBe('The Quick Brown Fox');
  });

  it('converts hyphen-separated words', () => {
    expect(titleCase('hello-world')).toBe('Hello World');
  });

  it('converts underscore-separated words', () => {
    expect(titleCase('hello_world')).toBe('Hello World');
  });

  it('converts camelCase input', () => {
    expect(titleCase('helloWorld')).toBe('Hello World');
  });

  it('converts PascalCase input', () => {
    expect(titleCase('HelloWorld')).toBe('Hello World');
  });

  it('handles mixed delimiters', () => {
    expect(titleCase('hello_world-foo bar')).toBe('Hello World Foo Bar');
  });

  it('returns an empty string for empty input', () => {
    expect(titleCase('')).toBe('');
  });

  it('returns an empty string for delimiter-only input', () => {
    expect(titleCase('---')).toBe('');
  });

  it('handles a single word', () => {
    expect(titleCase('hello')).toBe('Hello');
  });

  it('uppercases all-caps words correctly (lowercases then re-capitalizes)', () => {
    expect(titleCase('HELLO WORLD')).toBe('Hello World');
  });

  it('handles acronyms (XMLParser, getHTTPResponse)', () => {
    expect(titleCase('XMLParser')).toBe('Xml Parser');
    expect(titleCase('getHTTPResponse')).toBe('Get Http Response');
  });

  it('handles strings with accented characters (Unicode passthrough)', () => {
    expect(titleCase('caf\u00e9 monde')).toBe('Caf\u00e9 Monde');
  });
});

// =============================================================================
// validate.ts
// =============================================================================

describe('isEmail', () => {
  it('accepts standard email addresses', () => {
    expect(isEmail('user@example.com')).toBe(true);
    expect(isEmail('user.name@example.com')).toBe(true);
    expect(isEmail('user+tag@example.co.uk')).toBe(true);
    expect(isEmail('firstname.lastname@subdomain.example.com')).toBe(true);
  });

  it('accepts emails with special characters in local part', () => {
    expect(isEmail('user!#$%&@example.com')).toBe(true);
    expect(isEmail('user_name@example.org')).toBe(true);
    expect(isEmail('user-name@example.net')).toBe(true);
  });

  it('rejects missing @ symbol', () => {
    expect(isEmail('userexample.com')).toBe(false);
  });

  it('rejects missing domain', () => {
    expect(isEmail('user@')).toBe(false);
  });

  it('rejects missing local part', () => {
    expect(isEmail('@example.com')).toBe(false);
  });

  it('rejects missing TLD', () => {
    expect(isEmail('user@example')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isEmail('')).toBe(false);
  });

  it('rejects strings with spaces', () => {
    expect(isEmail('user @example.com')).toBe(false);
    expect(isEmail('user@ example.com')).toBe(false);
  });

  it('rejects double-dot in domain', () => {
    expect(isEmail('user@ex..ample.com')).toBe(false);
  });
});

describe('isUrl', () => {
  it('accepts valid http URLs', () => {
    expect(isUrl('http://example.com')).toBe(true);
    expect(isUrl('http://www.example.com/path?q=1&b=2')).toBe(true);
  });

  it('accepts valid https URLs', () => {
    expect(isUrl('https://example.com')).toBe(true);
    expect(isUrl('https://sub.example.co.uk/path#anchor')).toBe(true);
  });

  it('accepts URLs with ports', () => {
    expect(isUrl('http://localhost:3000')).toBe(true);
    expect(isUrl('https://example.com:8443/api')).toBe(true);
  });

  it('rejects ftp and other non-http protocols', () => {
    expect(isUrl('ftp://example.com')).toBe(false);
    expect(isUrl('file:///etc/hosts')).toBe(false);
    expect(isUrl('mailto:user@example.com')).toBe(false);
  });

  it('rejects strings without a protocol', () => {
    expect(isUrl('example.com')).toBe(false);
    expect(isUrl('www.example.com')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isUrl('')).toBe(false);
  });

  it('rejects arbitrary strings', () => {
    expect(isUrl('not a url at all')).toBe(false);
  });
});

describe('isEmpty', () => {
  it('returns true for an empty string', () => {
    expect(isEmpty('')).toBe(true);
  });

  it('returns true for whitespace-only strings', () => {
    expect(isEmpty('   ')).toBe(true);
    expect(isEmpty('\t\n\r')).toBe(true);
    expect(isEmpty('  \t  ')).toBe(true);
  });

  it('returns false for non-empty strings', () => {
    expect(isEmpty('hello')).toBe(false);
    expect(isEmpty('  hello  ')).toBe(false);
    expect(isEmpty('a')).toBe(false);
  });

  it('returns false for strings that are just punctuation', () => {
    expect(isEmpty('.')).toBe(false);
    expect(isEmpty('!')).toBe(false);
  });

  it('returns false for emoji strings', () => {
    expect(isEmpty('\uD83D\uDE00')).toBe(false);
    expect(isEmpty('hello \uD83D\uDE00')).toBe(false);
  });
});

describe('isPalindrome', () => {
  it('returns true for simple palindromes', () => {
    expect(isPalindrome('racecar')).toBe(true);
    expect(isPalindrome('madam')).toBe(true);
    expect(isPalindrome('level')).toBe(true);
    expect(isPalindrome('noon')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isPalindrome('RaceCar')).toBe(true);
    expect(isPalindrome('Madam')).toBe(true);
    expect(isPalindrome('A')).toBe(true);
  });

  it('ignores non-alphanumeric characters', () => {
    expect(isPalindrome('A man, a plan, a canal: Panama')).toBe(true);
    expect(isPalindrome("Was it a car or a cat I saw?")).toBe(true);
    expect(isPalindrome("No 'x' in Nixon")).toBe(true);
  });

  it('returns false for non-palindromes', () => {
    expect(isPalindrome('hello')).toBe(false);
    expect(isPalindrome('world')).toBe(false);
    expect(isPalindrome('abc')).toBe(false);
  });

  it('returns true for empty string (vacuous truth)', () => {
    expect(isPalindrome('')).toBe(true);
  });

  it('returns true for single character', () => {
    expect(isPalindrome('a')).toBe(true);
    expect(isPalindrome('Z')).toBe(true);
  });

  it('returns true for strings that normalize to empty (all special chars)', () => {
    expect(isPalindrome('!@#$%')).toBe(true);
  });

  it('strips Unicode/accented characters (only ASCII alphanumeric is kept)', () => {
    // The regex [^a-z0-9] strips non-ASCII letters such as accented chars.
    // 'aba' with a middle accented char strips to 'aba' — still a palindrome.
    expect(isPalindrome('aébéa')).toBe(true);
    // 'café' strips to 'caf' — not a palindrome.
    expect(isPalindrome('café')).toBe(false);
    // A string composed entirely of accented chars normalizes to empty — vacuously true.
    expect(isPalindrome('éàü')).toBe(true);
  });

  it('handles numeric palindromes', () => {
    expect(isPalindrome('121')).toBe(true);
    expect(isPalindrome('12321')).toBe(true);
    expect(isPalindrome('123')).toBe(false);
  });

  it('handles very long palindromes efficiently', () => {
    const longPalindrome = 'a'.repeat(10000) + 'a'.repeat(10000);
    expect(isPalindrome(longPalindrome)).toBe(true);
    const longNonPalindrome = 'a'.repeat(9999) + 'b' + 'a'.repeat(10000);
    expect(isPalindrome(longNonPalindrome)).toBe(false);
  });
});

describe('isNumeric', () => {
  it('returns true for integer strings', () => {
    expect(isNumeric('0')).toBe(true);
    expect(isNumeric('42')).toBe(true);
    expect(isNumeric('-7')).toBe(true);
    expect(isNumeric('1000000')).toBe(true);
  });

  it('returns true for decimal strings', () => {
    expect(isNumeric('3.14')).toBe(true);
    expect(isNumeric('-0.5')).toBe(true);
    expect(isNumeric('0.0')).toBe(true);
  });

  it('accepts leading and trailing whitespace', () => {
    expect(isNumeric('  42  ')).toBe(true);
    expect(isNumeric(' 3.14 ')).toBe(true);
  });

  it('returns false for empty string', () => {
    expect(isNumeric('')).toBe(false);
  });

  it('returns false for whitespace-only string', () => {
    expect(isNumeric('   ')).toBe(false);
  });

  it('returns false for non-numeric strings', () => {
    expect(isNumeric('hello')).toBe(false);
    expect(isNumeric('12abc')).toBe(false);
    expect(isNumeric('abc12')).toBe(false);
    expect(isNumeric('12.34.56')).toBe(false);
  });

  it('returns false for Infinity', () => {
    expect(isNumeric('Infinity')).toBe(false);
    expect(isNumeric('-Infinity')).toBe(false);
  });

  it('returns false for NaN string', () => {
    expect(isNumeric('NaN')).toBe(false);
  });

  it('returns true for scientific notation', () => {
    expect(isNumeric('1e5')).toBe(true);
    expect(isNumeric('1.5e-3')).toBe(true);
  });

  it('returns true for hex and octal numeric strings', () => {
    expect(isNumeric('0x1A')).toBe(true);
    expect(isNumeric('0o17')).toBe(true);
  });
});
