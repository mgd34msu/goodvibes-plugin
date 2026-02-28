/**
 * String transformation utilities.
 */

/**
 * Capitalizes the first letter of a string and lowercases the rest.
 * Returns an empty string if input is empty.
 */
export function capitalize(str: string): string {
  if (str.length === 0) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Converts a string to camelCase.
 * Handles spaces, hyphens, underscores, and mixed casing.
 * Returns an empty string if input is empty or only delimiters.
 */
export function camelCase(str: string): string {
  const words = tokenize(str);
  if (words.length === 0) return '';
  const [first, ...rest] = words;
  return first.toLowerCase() + rest.map((w) => capitalize(w)).join('');
}

/**
 * Converts a string to snake_case.
 * Handles spaces, hyphens, underscores, and mixed casing.
 * Returns an empty string if input is empty or only delimiters.
 */
export function snakeCase(str: string): string {
  return tokenize(str).join('_').toLowerCase();
}

/**
 * Converts a string to kebab-case.
 * Handles spaces, hyphens, underscores, and mixed casing.
 * Returns an empty string if input is empty or only delimiters.
 */
export function kebabCase(str: string): string {
  return tokenize(str).join('-').toLowerCase();
}

/**
 * Converts a string to Title Case.
 * Each word's first letter is uppercased, the rest lowercased.
 * Returns an empty string if input is empty or only delimiters.
 */
export function titleCase(str: string): string {
  return tokenize(str).map((w) => capitalize(w)).join(' ');
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Splits a string into word tokens.
 * Handles camelCase boundaries, spaces, hyphens, and underscores.
 */
function tokenize(str: string): string[] {
  if (str.length === 0) return [];

  // Handle acronyms: insert space between consecutive uppercase and following capitalized word (e.g. XMLParser → XML Parser)
  const acronymSplit = str.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
  // Insert a space before uppercase letters that follow a lowercase letter (camelCase split)
  const spaced = acronymSplit.replace(/([a-z])([A-Z])/g, '$1 $2');

  // Split on whitespace, hyphens, and underscores; filter empty tokens
  return spaced.split(/[\s\-_]+/).filter((token) => token.length > 0);
}
