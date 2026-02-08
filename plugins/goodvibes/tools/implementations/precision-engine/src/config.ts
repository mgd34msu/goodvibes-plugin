/**
 * Configuration constants for precision-engine.
 */


export const SERVER_NAME = 'precision-engine';
export const SERVER_VERSION = '1.0.0';

/**
 * Default values for various parameters.
 */
export const DEFAULTS = {
  MAX_FILES: 100,
  MAX_MATCHES: 100,
  MAX_MATCHES_PER_FILE: 10,
  MAX_LINES_PER_FILE: 2000,
  CONTEXT_BEFORE: 0,
  CONTEXT_AFTER: 0,
  PREVIEW_LINES: 10,
  MAX_DEPTH: 10,
};


/**
 * File extensions considered as text files.
 */
export const TEXT_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.json', '.yaml', '.yml', '.toml', '.xml',
  '.md', '.mdx', '.txt', '.rst',
  '.html', '.css', '.scss', '.sass', '.less',
  '.py', '.rb', '.go', '.rs', '.java', '.kt', '.scala',
  '.c', '.cpp', '.h', '.hpp',
  '.sh', '.bash', '.zsh', '.fish',
  '.sql', '.graphql', '.gql',
  '.env', '.env.local', '.env.example',
  '.gitignore', '.dockerignore', '.eslintrc', '.prettierrc',
]);

/**
 * Default patterns to exclude from searches.
 */
export const DEFAULT_EXCLUDES = [
  'node_modules/**',
  '.git/**',
  'dist/**',
  'build/**',
  'coverage/**',
  '.next/**',
  '.nuxt/**',
  '.cache/**',
  '*.lock',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
];

/**
 * Get project root from environment or cwd.
 */
export function getProjectRoot(): string {
  return process.env.PROJECT_ROOT || process.cwd();
}
