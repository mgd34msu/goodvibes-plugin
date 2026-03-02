/**
 * Code Intelligence Domain Constants
 *
 * @module core/code-intel/constants
 */

import ts from 'typescript';

// NOTE: SOURCE_EXTENSIONS is intentionally NOT redefined here.
// Import it from '../../shared/constants.js' instead.

/**
 * Default TypeScript compiler options for code analysis.
 * Used when no tsconfig.json is found.
 */
export const TS_ANALYSIS_OPTIONS: ts.CompilerOptions = {
  allowJs: true,
  checkJs: true,
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  lib: ['lib.esnext.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
  jsx: ts.JsxEmit.ReactJSX,
  esModuleInterop: true,
  skipLibCheck: true,
  strict: true,
  noEmit: true,
  resolveJsonModule: true,
  isolatedModules: true,
  allowSyntheticDefaultImports: true,
  forceConsistentCasingInFileNames: true,
};

/**
 * Regex patterns for identifying test files.
 */
export const TEST_PATTERNS: RegExp[] = [
  /\.test\.[jt]sx?$/,
  /\.spec\.[jt]sx?$/,
  /__tests__\//,
  /\/test\//,
  /\/tests\//,
];

/**
 * Common entry point file names for package detection.
 */
export const ENTRY_POINT_NAMES: string[] = [
  'index.ts',
  'index.tsx',
  'index.js',
  'index.jsx',
  'index.mts',
  'index.mjs',
  'main.ts',
  'main.js',
  'mod.ts',
  'mod.js',
];

/**
 * Maximum character length for line preview strings.
 */
export const MAX_PREVIEW_LENGTH = 120;

/**
 * Regex pattern for validating git refs to prevent shell injection.
 * Allows alphanumeric characters, dots, slashes, underscores, @, ~, ^, {, }, and hyphens.
 */
export const GIT_REF_PATTERN = /^[a-zA-Z0-9_./@~^{}\-]+$/;

/**
 * Cache TTL in milliseconds for Language Service instances.
 */
export const CACHE_TTL_MS = (() => {
  const DEFAULT_TTL_MS = 5 * 60 * 1000;
  const MIN_TTL_MS = 30 * 1000;
  const MAX_TTL_MS = 60 * 60 * 1000;

  const ttlMsEnv = process.env.LSP_CACHE_TTL_MS;
  if (ttlMsEnv) {
    const parsed = parseInt(ttlMsEnv, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return Math.min(Math.max(parsed, MIN_TTL_MS), MAX_TTL_MS);
    }
  }

  const ttlSecondsEnv = process.env.LSP_CACHE_TTL_SECONDS;
  if (ttlSecondsEnv) {
    const parsed = parseInt(ttlSecondsEnv, 10);
    if (!isNaN(parsed) && parsed > 0) {
      const ttlMs = parsed * 1000;
      return Math.min(Math.max(ttlMs, MIN_TTL_MS), MAX_TTL_MS);
    }
  }

  return DEFAULT_TTL_MS;
})();
