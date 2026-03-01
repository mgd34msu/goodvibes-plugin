/**
 * Security domain constants
 *
 * Deduplicated constants shared across secrets scanner,
 * permissions checker, and environment auditor.
 *
 * @module core/security/constants
 */

// =============================================================================
// Skip Patterns (deduplicated from secrets + permissions)
// =============================================================================

/**
 * Files and directories to skip during security scanning.
 * Superset of patterns from both secrets and permissions scanners.
 */
export const SECURITY_SKIP_PATTERNS: string[] = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'coverage',
  '.nyc_output',
  '*.min.js',
  '*.min.css',
  '*.map',
  '*.lock',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  '*.png',
  '*.jpg',
  '*.jpeg',
  '*.gif',
  '*.ico',
  '*.svg',
  '*.woff',
  '*.woff2',
  '*.ttf',
  '*.eot',
];

// =============================================================================
// Scannable Extensions (deduplicated from secrets + permissions)
// =============================================================================

/**
 * File extensions scannable for secrets (broader set).
 * Includes config, data, and script formats in addition to source code.
 */
export const SCANNABLE_EXTENSIONS: string[] = [
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.json', '.yaml', '.yml',
  '.env', '.env.local', '.env.development', '.env.production',
  '.sh', '.bash',
  '.py',
  '.rb',
  '.go',
  '.java',
  '.cs',
  '.php',
  '.config', '.conf', '.cfg',
  '.xml',
  '.properties',
  '.ini',
  '.toml',
];

/**
 * File extensions scannable for permission patterns (source code only).
 */
export const SOURCE_CODE_EXTENSIONS: string[] = [
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
];

// =============================================================================
// Environment Audit Constants
// =============================================================================

/**
 * File extensions to scan for environment variable usage.
 */
export const SCAN_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.vue', '.svelte',
]);

/**
 * Directories to skip during environment variable scanning.
 */
export const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out',
  '.next', '.nuxt', '.svelte-kit', 'coverage',
  '.cache', 'vendor', '__pycache__', '.venv', 'venv', 'target',
]);

/**
 * Regex patterns to match environment variable access in source files.
 */
export const ENV_PATTERNS: RegExp[] = [
  // process.env.VAR_NAME
  /process\.env\.([A-Z_][A-Z0-9_]*)/g,
  // process.env['VAR_NAME'] or process.env["VAR_NAME"]
  /process\.env\[['"]([A-Z_][A-Z0-9_]*)['"]\]/g,
  // import.meta.env.VAR_NAME (Vite)
  /import\.meta\.env\.([A-Z_][A-Z0-9_]*)/g,
  // Deno.env.get('VAR_NAME')
  /Deno\.env\.get\(['"]([A-Z_][A-Z0-9_]*)['"]\)/g,
];

/**
 * Patterns that indicate a default/fallback value is provided.
 */
export const DEFAULT_PATTERNS: RegExp[] = [
  /process\.env\.([A-Z_][A-Z0-9_]*)\s*\|\|/,
  /process\.env\.([A-Z_][A-Z0-9_]*)\s*\?\?/,
  /process\.env\[['"]([A-Z_][A-Z0-9_]*)['"]\]\s*\|\|/,
  /process\.env\[['"]([A-Z_][A-Z0-9_]*)['"]\]\s*\?\?/,
  /import\.meta\.env\.([A-Z_][A-Z0-9_]*)\s*\|\|/,
  /import\.meta\.env\.([A-Z_][A-Z0-9_]*)\s*\?\?/,
];

/**
 * Built-in environment variable names to skip during auditing.
 */
export const BUILTIN_VARS = new Set([
  'NODE_ENV', 'MODE', 'DEV', 'PROD', 'SSR', 'BASE_URL',
]);

// =============================================================================
// Depth Configuration
// =============================================================================

/**
 * Get the default max scan depth from environment variable or use 10.
 *
 * Environment variable: SECRETS_SCAN_MAX_DEPTH
 * Default: 10, Minimum: 1, Maximum: 50
 *
 * @returns Clamped depth value
 */
export function getDefaultMaxDepth(): number {
  const DEFAULT_DEPTH = 10;
  const MIN_DEPTH = 1;
  const MAX_DEPTH = 50;

  const envDepth = process.env.SECRETS_SCAN_MAX_DEPTH;
  if (envDepth) {
    const parsed = parseInt(envDepth, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return Math.min(Math.max(parsed, MIN_DEPTH), MAX_DEPTH);
    }
  }

  return DEFAULT_DEPTH;
}
