/**
 * String utility functions.
 * Pure TypeScript, no external dependencies.
 */

/**
 * Capitalize the first letter of a string.
 */
export function capitalize(str: string): string {
  if (str.length === 0) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Convert a string to camelCase.
 * Handles kebab-case, snake_case, and space-separated words.
 */
export function camelCase(str: string): string {
  if (str.length === 0) return str;
  return str
    .replace(/[-_\s]+(.)/g, (_, char: string) => char.toUpperCase())
    .replace(/^(.)/, (char: string) => char.toLowerCase());
}

/**
 * Convert a string to kebab-case.
 */
export function kebabCase(str: string): string {
  if (str.length === 0) return str;
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .replace(/[_\s]+/g, '-')
    .toLowerCase()
    .replace(/^-+|-+$/g, '');
}

/**
 * Convert a string to snake_case.
 */
export function snakeCase(str: string): string {
  if (str.length === 0) return str;
  return str
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/[-\s]+/g, '_')
    .toLowerCase()
    .replace(/^_+|_+$/g, '');
}

/**
 * Truncate a string to a maximum length, appending a suffix if truncated.
 * @param str - The string to truncate
 * @param maxLength - Maximum length of the result (including suffix)
 * @param suffix - Suffix to append when truncated (default: '...')
 */
export function truncate(str: string, maxLength: number, suffix = '...'): string {
  if (str.length <= maxLength) return str;
  if (maxLength <= suffix.length) return suffix.slice(0, maxLength);
  return str.slice(0, maxLength - suffix.length) + suffix;
}

/**
 * Convert a string to a URL-safe slug.
 * Lowercases, replaces spaces/special chars with hyphens, strips non-alphanumeric.
 */
export function slugify(str: string): string {
  if (str.length === 0) return str;
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Reverse a string.
 */
export function reverse(str: string): string {
  return [...str].reverse().join('');
}

/**
 * Count non-overlapping occurrences of a search string within a string.
 * Returns 0 if search is empty.
 */
export function countOccurrences(str: string, search: string): number {
  if (search.length === 0) return 0;
  let count = 0;
  let pos = 0;
  while ((pos = str.indexOf(search, pos)) !== -1) {
    count++;
    pos += search.length;
  }
  return count;
}

/**
 * Check if a string is a palindrome.
 * Case-insensitive and ignores non-alphanumeric characters.
 */
export function isPalindrome(str: string): boolean {
  const cleaned = str.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (cleaned.length === 0) return true;
  return cleaned === [...cleaned].reverse().join('');
}

/**
 * Count words in a string (whitespace-separated).
 * Returns 0 for empty or whitespace-only strings.
 */
export function wordCount(str: string): number {
  const trimmed = str.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/).length;
}
