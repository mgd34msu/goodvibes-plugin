/**
 * String utility functions for common transformations.
 * All functions are pure — no side effects, no mutation.
 */

/**
 * Capitalizes the first character of a string.
 * Returns an empty string unchanged.
 *
 * @param str - The input string
 * @returns The string with its first character uppercased
 *
 * @example
 * capitalize('hello') // 'Hello'
 * capitalize('') // ''
 * capitalize('a') // 'A'
 */
export function capitalize(str: string): string {
  if (str.length === 0) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Converts a string to a URL-friendly slug.
 * Normalizes unicode (NFD decomposition, strips combining diacritics),
 * lowercases, replaces non-alphanumeric characters with hyphens,
 * collapses consecutive hyphens, and trims leading/trailing hyphens.
 *
 * Non-Latin scripts (e.g. CJK, Arabic, Cyrillic, Hebrew) that do not
 * decompose to Latin characters via NFD are silently dropped. Pass only
 * Latin-based text, or pre-transliterate non-Latin input, for predictable
 * results.
 *
 * @param str - The input string
 * @returns A lowercase, hyphen-separated slug; may be empty if the input
 *   contains only non-Latin characters or punctuation
 *
 * @example
 * slugify('Hello World') // 'hello-world'
 * slugify('  foo  BAR  ') // 'foo-bar'
 * slugify('caf\u00e9 au lait') // 'cafe-au-lait'
 * slugify('') // ''
 * slugify('\u4e2d\u6587') // '' (CJK characters are dropped)
 */
export function slugify(str: string): string {
  return str
    .normalize('NFD') // decompose unicode characters
    .replace(/[\u0300-\u036f]/g, '') // strip combining diacritical marks
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // replace non-alphanumeric runs with hyphen
    .replace(/^-+|-+$/g, ''); // trim leading and trailing hyphens
}

/**
 * Truncates a string to a maximum length, appending a suffix when truncated.
 * If the string fits within maxLength, it is returned unchanged.
 * The suffix counts toward the maxLength budget.
 *
 * @param str - The input string
 * @param maxLength - Maximum allowed length of the result (inclusive)
 * @param suffix - String appended when truncation occurs (default: '...')
 * @returns The original string or a truncated version with the suffix appended
 * @throws {RangeError} If maxLength is negative or less than suffix.length
 *
 * @example
 * truncate('Hello, World!', 8) // 'Hello...'
 * truncate('Hi', 10) // 'Hi'
 * truncate('Hello', 5) // 'Hello'
 * truncate('Hello', 4, '!') // 'Hel!'
 */
export function truncate(
  str: string,
  maxLength: number,
  suffix: string = '...'
): string {
  if (maxLength < 0) {
    throw new RangeError(`maxLength must be non-negative, got ${maxLength}`);
  }
  if (str.length <= maxLength) return str;
  const cutLength = maxLength - suffix.length;
  if (cutLength < 0) {
    // suffix alone exceeds maxLength — return suffix truncated to maxLength
    return suffix.slice(0, maxLength);
  }
  return str.slice(0, cutLength) + suffix;
}

/**
 * Converts a camelCase or PascalCase string to kebab-case.
 * Handles consecutive uppercase sequences (acronyms) gracefully.
 *
 * @param str - A camelCase or PascalCase string
 * @returns The kebab-case equivalent
 *
 * @example
 * camelToKebab('helloWorld') // 'hello-world'
 * camelToKebab('myHTTPRequest') // 'my-http-request'
 * camelToKebab('XMLParser') // 'xml-parser'
 * camelToKebab('') // ''
 */
export function camelToKebab(str: string): string {
  return str
    // Insert hyphen between a lowercase/digit and an uppercase letter
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    // Insert hyphen between consecutive uppercase letters followed by lowercase
    // e.g. "HTTPRequest" -> "HTTP-Request" (handled above), "XMLParser" -> "XML-Parser"
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}

/**
 * Converts a kebab-case string to camelCase.
 * Handles multiple consecutive hyphens and leading/trailing hyphens.
 * Trailing hyphens are stripped. Leading hyphens capitalise the first segment.
 *
 * @param str - A kebab-case string (words separated by hyphens)
 * @returns The camelCase equivalent
 *
 * @example
 * kebabToCamel('hello-world') // 'helloWorld'
 * kebabToCamel('my-http-request') // 'myHttpRequest'
 * kebabToCamel('-leading') // 'Leading' (leading hyphen capitalises first word)
 * kebabToCamel('trailing-') // 'trailing' (trailing hyphen is stripped)
 * kebabToCamel('') // ''
 */
export function kebabToCamel(str: string): string {
  return str
    .replace(/-+$/g, '') // strip trailing hyphens
    .replace(/-+([a-zA-Z0-9])/g, (_, char: string) => char.toUpperCase());
}
