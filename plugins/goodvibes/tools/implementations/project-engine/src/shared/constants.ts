/**
 * Shared constants for project-engine v2.0.0.
 */

/**
 * MCP server name identifier.
 */
export const SERVER_NAME = 'project-engine';

/**
 * MCP server version.
 */
export const SERVER_VERSION = '2.0.0';

/**
 * Source file extensions for code analysis.
 */
export const SOURCE_EXTENSIONS = [
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.vue', '.svelte', '.astro',
] as const;

/**
 * Directories to skip during file traversal.
 */
export const SKIP_DIRECTORIES = [
  'node_modules', '.git', 'dist', 'build', '.next',
  '.nuxt', '.output', 'coverage', '.turbo', '.cache',
] as const;
