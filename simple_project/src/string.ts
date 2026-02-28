/**
 * Capitalizes the first character of a string and lowercases the rest.
 *
 * @param str - The input string
 * @returns The capitalized string
 */
export function capitalize(str: string): string {
  if (str.length === 0) return str;
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Reverses the characters of a string.
 *
 * Note: This implementation splits on Unicode code points (spread operator),
 * which correctly handles most multi-byte characters (emoji, surrogate pairs).
 * However, it does not account for grapheme clusters (e.g., combined emoji
 * sequences using zero-width joiners) — those require a Intl.Segmenter approach.
 *
 * @param str - The input string
 * @returns The reversed string
 */
export function reverse(str: string): string {
  return [...str].reverse().join('');
}

/**
 * Truncates a string to the specified maximum length, appending an ellipsis
 * if the string was truncated.
 *
 * @param str - The input string
 * @param maxLength - The maximum length of the output string (including ellipsis)
 * @param ellipsis - The ellipsis string to append (default: '...')
 * @returns The truncated string
 */
export function truncate(str: string, maxLength: number, ellipsis: string = '...'): string {
  if (!Number.isFinite(maxLength)) {
    throw new RangeError('maxLength must be a finite number');
  }
  if (maxLength < 0) {
    throw new RangeError('maxLength must be a non-negative number');
  }
  // Normalize -0 to 0 (Object.is(-0, 0) === false but -0 < 0 === false,
  // so -0 would silently pass the guard above and produce correct output;
  // normalizing here makes the intent explicit).
  if (Object.is(maxLength, -0)) maxLength = 0;
  maxLength = Math.floor(maxLength);
  if (str.length <= maxLength) return str;
  const truncatedLength = maxLength - ellipsis.length;
  if (truncatedLength <= 0) return ellipsis.slice(0, maxLength);
  return str.slice(0, truncatedLength) + ellipsis;
}

/**
 * Converts a string to a URL-friendly slug.
 * Lowercases the string, replaces spaces and special characters with hyphens,
 * and removes leading/trailing hyphens.
 *
 * @param str - The input string
 * @returns The slugified string
 */
export function slugify(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/[^a-z0-9\s-]/g, '')   // remove non-alphanumeric except spaces and hyphens
    .trim()
    .replace(/[\s-]+/g, '-')        // collapse spaces/hyphens to single hyphen
    .replace(/^-+|-+$/g, '');       // trim leading/trailing hyphens
}
