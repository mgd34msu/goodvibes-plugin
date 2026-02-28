/**
 * String utility functions.
 */

/**
 * Capitalizes the first letter of a string.
 * Returns the string unchanged if it is empty.
 */
export function capitalize(str: string): string {
  if (str.length === 0) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Converts a string to a URL-friendly slug.
 * Lowercases the input, strips special characters, and replaces whitespace
 * and separator sequences with a single hyphen.
 *
 * Note: Non-Latin characters (CJK, Cyrillic, etc.) are stripped. For full
 * Unicode-to-ASCII conversion, consider a dedicated library like `unidecode`.
 */
export function slugify(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strips diacritics from accented chars
    .replace(/[^\w\s-]/g, '')      // strip non-word, non-space, non-hyphen chars
    .replace(/[\s_-]+/g, '-')      // collapse whitespace/underscores/hyphens into one hyphen
    .replace(/^-+|-+$/g, '');      // strip leading/trailing hyphens
}

/**
 * Truncates a string to at most `maxLength` characters.
 * If the string exceeds `maxLength`, it is cut and the `suffix` (default `'...'`) is appended.
 * If `maxLength` is less than or equal to the suffix length the string is truncated to `maxLength`
 * characters and no suffix is added to avoid the result exceeding `maxLength`.
 */
export function truncate(str: string, maxLength: number, suffix = '...'): string {
  if (maxLength <= 0) return '';
  if (str.length <= maxLength) return str;
  const truncatedLength = maxLength - suffix.length;
  if (truncatedLength <= 0) {
    return str.slice(0, maxLength);
  }
  return str.slice(0, truncatedLength) + suffix;
}

/**
 * Converts a camelCase string to kebab-case.
 * Handles sequences of uppercase letters (acronyms) correctly:
 * - A run of uppercase letters followed by a capitalized word is split before the last uppercase letter.
 *   e.g. 'XMLParser' -> 'xml-parser', 'parseURLString' -> 'parse-url-string'
 * - A single uppercase letter following a lowercase letter or digit gets a hyphen inserted before it.
 *   e.g. 'helloWorld' -> 'hello-world'
 */
export function camelToKebab(str: string): string {
  return str
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase();
}

/**
 * Counts the number of words in a string.
 * Words are separated by one or more whitespace characters (spaces, tabs, newlines).
 * Returns 0 for empty or whitespace-only strings.
 */
export function wordCount(str: string): number {
  const trimmed = str.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/).length;
}
