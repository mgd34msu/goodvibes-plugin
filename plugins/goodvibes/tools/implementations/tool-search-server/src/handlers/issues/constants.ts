/**
 * Constants for project issues scanning
 */

export const SCAN_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.vue', '.svelte', '.py', '.rb', '.go', '.rs',
  '.java', '.kt', '.swift', '.cs', '.php',
]);

export const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out',
  '.next', '.nuxt', '.svelte-kit', 'coverage',
  '.cache', 'vendor', '__pycache__', '.venv', 'venv', 'target',
  '__tests__', 'tests', 'test', '__mocks__', 'fixtures', '__fixtures__',
]);

export const TEST_FILE_PATTERNS = [
  /\.test\.[jt]sx?$/,
  /\.spec\.[jt]sx?$/,
  /_test\.[jt]sx?$/,
  /_spec\.[jt]sx?$/,
  /\.stories\.[jt]sx?$/,
];

export const TODO_PATTERN = /\b(TODO|FIXME|HACK|XXX|BUG|NOTE)\b[:\s]*(.+?)(?:\*\/|-->|$)/gi;

export const LOCKFILES: Record<string, string> = {
  'package-lock.json': 'npm',
  'yarn.lock': 'yarn',
  'pnpm-lock.yaml': 'pnpm',
  'bun.lockb': 'bun',
};

export const SENSITIVE_PATTERNS = [
  /api[_-]?key/i,
  /secret/i,
  /password/i,
  /token/i,
  /private[_-]?key/i,
  /credentials/i,
  /auth/i,
  /aws[_-]?secret/i,
  /github[_-]?token/i,
  /jwt[_-]?secret/i,
  /encryption[_-]?key/i,
  /access[_-]?key/i,
  /client[_-]?secret/i,
];

export const ICONS = {
  error: '\u{1F534}',
  warning: '\u{1F7E1}',
  info: '\u{1F535}',
  suggestion: '\u{1F4A1}',
} as const;

export const ENV_FILES = ['.env', '.env.local', '.env.development', '.env.production'];
export const ENV_EXAMPLE_FILES = ['.env.example', '.env.sample', '.env.template'];
