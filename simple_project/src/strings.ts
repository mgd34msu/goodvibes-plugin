/**
 * @module strings
 * Pure string utility functions with full TypeScript typings.
 */

/**
 * Capitalizes the first character of a string and lowercases the rest.
 *
 * @param str - The input string.
 * @returns The capitalized string, or an empty string if the input is empty.
 *
 * @example
 * capitalize('hello world') // => 'Hello world'
 * capitalize('HELLO')       // => 'Hello'
 * capitalize('')            // => ''
 */
export function capitalize(str: string): string {
  if (str.length === 0) return '';
  const chars = [...str];
  return chars[0].toUpperCase() + chars.slice(1).join('').toLowerCase();
}

/**
 * Converts a string into a URL-friendly slug.
 * Normalizes unicode characters, strips non-alphanumeric characters (except hyphens),
 * collapses consecutive hyphens, and trims leading/trailing hyphens.
 *
 * @param str - The input string.
 * @returns A lowercase hyphen-separated slug.
 *
 * @example
 * slugify('Hello World')       // => 'hello-world'
 * slugify('  foo   BAR  ')     // => 'foo-bar'
 * slugify('Crème brûlée')      // => 'creme-brulee'
 * slugify('hello---world')     // => 'hello-world'
 * slugify('')                  // => ''
 */
export function slugify(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')   // remove non-alphanumeric, non-space, non-hyphen
    .replace(/[\s-]+/g, '-')         // collapse whitespace and hyphens
    .replace(/^-+|-+$/g, '');        // trim leading/trailing hyphens
}

/**
 * Options for the {@link truncate} function.
 */
export interface TruncateOptions {
  /** The string to append when truncation occurs. Defaults to `'...'`. */
  ellipsis?: string;
}

/**
 * Truncates a string to the specified maximum length.
 * If the string (including the ellipsis) would exceed `maxLength`, it is
 * cut at `maxLength - ellipsis.length` and the ellipsis is appended.
 * The ellipsis itself is counted within `maxLength`.
 *
 * @param str       - The input string.
 * @param maxLength - Maximum allowed character length of the result.
 * @param options   - Optional configuration.
 * @returns The (possibly truncated) string.
 *
 * @example
 * truncate('Hello, World!', 8)                     // => 'Hello...'
 * truncate('Hello, World!', 8, { ellipsis: '…' })  // => 'Hello, …'
 * truncate('Hi', 10)                               // => 'Hi'
 * truncate('', 5)                                  // => ''
 */
export function truncate(
  str: string,
  maxLength: number,
  options: TruncateOptions = {},
): string {
  const ellipsis = options.ellipsis !== undefined ? options.ellipsis : '...';
  if (str.length <= maxLength) return str;
  const cutAt = maxLength - ellipsis.length;
  if (cutAt <= 0) return ellipsis.slice(0, maxLength);
  return str.slice(0, cutAt) + ellipsis;
}

/**
 * Converts a string to camelCase.
 * Splits on word boundaries (spaces, hyphens, underscores, uppercase transitions)
 * and joins them such that the first word is all lowercase and each subsequent
 * word starts with an uppercase letter.
 *
 * @param str - The input string.
 * @returns The camelCase representation of the string.
 *
 * @example
 * camelCase('hello world')  // => 'helloWorld'
 * camelCase('foo-bar-baz')  // => 'fooBarBaz'
 * camelCase('FOO_BAR')      // => 'fooBar'
 * camelCase('')             // => ''
 */
export function camelCase(str: string): string {
  const words = splitWords(str);
  if (words.length === 0) return '';
  return words
    .map((word, index) =>
      index === 0
        ? word.toLowerCase()
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
    )
    .join('');
}

/**
 * Converts a string to kebab-case.
 * Splits on word boundaries (spaces, hyphens, underscores, uppercase transitions)
 * and joins the words with hyphens, all lowercase.
 *
 * @param str - The input string.
 * @returns The kebab-case representation of the string.
 *
 * @example
 * kebabCase('Hello World') // => 'hello-world'
 * kebabCase('fooBarBaz')   // => 'foo-bar-baz'
 * kebabCase('FOO_BAR')     // => 'foo-bar'
 * kebabCase('')            // => ''
 */
export function kebabCase(str: string): string {
  const words = splitWords(str);
  return words.map((w) => w.toLowerCase()).join('-');
}

/**
 * Counts the number of words in a string.
 * Words are sequences of non-whitespace characters separated by whitespace.
 * Returns 0 for empty or whitespace-only strings.
 *
 * @param str - The input string.
 * @returns The word count.
 *
 * @example
 * wordCount('hello world')   // => 2
 * wordCount('  foo  bar  ')  // => 2
 * wordCount('')              // => 0
 * wordCount('   ')           // => 0
 * wordCount('one')           // => 1
 */
export function wordCount(str: string): number {
  const trimmed = str.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/).length;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Splits a string into its constituent words by detecting boundaries at:
 * - Whitespace runs
 * - Hyphens and underscores
 * - Transitions from lowercase to uppercase (camelCase input)
 * - Transitions from a run of uppercase to lowercase (acronym followed by word)
 *
 * @internal
 */
function splitWords(str: string): string[] {
  return (
    str
      // Insert a separator before uppercase letters that follow a lowercase letter (camelCase)
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      // Insert a separator when uppercase run transitions to lowercase-continued word
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
      // Split on whitespace, hyphens, underscores
      .split(/[\s\-_]+/)
      .filter((w) => w.length > 0)
  );
}
