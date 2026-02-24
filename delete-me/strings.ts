/**
 * String utility library
 */

/**
 * Convert a string to a URL-friendly slug.
 * Lowercases, replaces spaces and special characters with hyphens,
 * collapses consecutive hyphens, and trims leading/trailing hyphens.
 */
export function slugify(input: string): string {
  if (!input) return '';
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/[^a-z0-9\s-]/g, '-')   // replace non-alphanumeric (except spaces/hyphens) with hyphens
    .replace(/[\s]+/g, '-')           // replace whitespace with hyphens
    .replace(/-{2,}/g, '-')           // collapse consecutive hyphens
    .replace(/^-+|-+$/g, '');         // trim leading/trailing hyphens
}

/**
 * Truncate a string to a maximum length, appending a suffix if truncated.
 * Returns input as-is if its length is <= maxLen.
 */
export function truncate(input: string, maxLen: number, suffix = '...'): string {
  if (!input || input.length <= maxLen) return input ?? '';
  // Ensure room for suffix; if maxLen is smaller than suffix, just cut hard
  const cutAt = Math.max(0, maxLen - suffix.length);
  return input.slice(0, cutAt) + suffix;
}

/**
 * Capitalize the first letter of each word in a string.
 * Non-alphabetic first characters are preserved unchanged.
 */
export function capitalize(input: string): string {
  if (!input) return '';
  return input.replace(/\b\w/g, (char) => char.toUpperCase());
}

/**
 * Count the number of words in a string (split on whitespace).
 * Returns 0 for empty or whitespace-only strings.
 */
export function countWords(input: string): number {
  if (!input || !input.trim()) return 0;
  return input.trim().split(/\s+/).length;
}

/**
 * Reverse a string, correctly handling Unicode surrogate pairs.
 */
export function reverse(input: string): string {
  if (!input) return '';
  // Spread into array to handle multi-byte Unicode code points correctly
  return [...input].reverse().join('');
}
