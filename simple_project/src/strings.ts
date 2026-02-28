/**
 * String utility functions for common text transformations.
 */

/**
 * Capitalizes the first letter of a string.
 * Returns empty string unchanged.
 */
export function capitalize(str: string): string {
  if (str.length === 0) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Converts a string to a URL-friendly slug.
 * Lowercases, replaces spaces and special chars with hyphens,
 * collapses multiple hyphens, and strips leading/trailing hyphens.
 */
export function slugify(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // strip diacritics
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')     // remove non-alphanumeric (except spaces/hyphens)
    .replace(/[\s-]+/g, '-')           // collapse whitespace and hyphens to single hyphen
    .replace(/^-+|-+$/g, '');          // strip leading/trailing hyphens
}

/**
 * Truncates a string to a maximum length, appending a suffix if truncated.
 * If the string fits within maxLength, returns it unchanged.
 * If suffix is provided, the total result length does not exceed maxLength.
 */
export function truncate(str: string, maxLength: number, suffix: string = '...'): string {
  if (maxLength < 0) throw new RangeError('maxLength must be a non-negative number');
  if (str.length <= maxLength) return str;
  const cutoff = maxLength - suffix.length;
  if (cutoff <= 0) return suffix.slice(0, maxLength);
  return str.slice(0, cutoff) + suffix;
}

/**
 * Converts a camelCase string to kebab-case.
 * Handles consecutive uppercase letters (acronyms) gracefully.
 * Example: camelToKebab('camelCaseString') => 'camel-case-string'
 */
export function camelToKebab(str: string): string {
  return str
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')   // insert hyphen before uppercase after lowercase/digit
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2') // handle consecutive caps: XMLParser => XML-Parser
    .toLowerCase();
}

/**
 * Converts a kebab-case string to camelCase.
 * Example: kebabToCamel('kebab-case-string') => 'kebabCaseString'
 */
export function kebabToCamel(str: string): string {
  return str
    .toLowerCase()
    .replace(/-([a-z0-9])/g, (_, char: string) => char.toUpperCase());
}
