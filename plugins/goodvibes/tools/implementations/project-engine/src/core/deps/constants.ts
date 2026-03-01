/**
 * Shared constants for the deps domain.
 *
 * @module core/deps/constants
 */

/**
 * Regular expressions for detecting import statements in source files.
 *
 * Matches ES6 imports, re-exports, dynamic imports, and CommonJS requires.
 */
export const IMPORT_PATTERNS: RegExp[] = [
  // ES6 imports: import ... from '...'
  /import\s+(?:[\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g,
  // ES6 re-exports: export ... from '...'
  /export\s+(?:[\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g,
  // Dynamic imports: import('...')
  /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  // CommonJS require: require('...')
  /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];
