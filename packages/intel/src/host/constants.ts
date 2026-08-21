/**
 * Compiler-host constants (intel).
 *
 * Ported from project-engine `core/code-intel/constants.ts` and
 * `shared/constants.ts` (SOURCE_EXTENSIONS / SKIP_DIRECTORIES folded in so the
 * host is self-contained). The v1 background-cleanup knobs (`CACHE_TTL_MS`) do
 * NOT carry forward: the v2 host holds no `setInterval` (field issue 9, no
 * timers that keep the event loop alive); it bounds its cache by count instead.
 */

import ts from 'typescript';

/**
 * Default TypeScript compiler options used when no tsconfig.json is discovered.
 * Permissive on purpose, the host analyzes source, it never emits.
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

/** Regex patterns that identify a test file (excluded from "usage" counts). */
export const TEST_PATTERNS: RegExp[] = [
  /\.test\.[jt]sx?$/,
  /\.spec\.[jt]sx?$/,
  /__tests__\//,
  /\/test\//,
  /\/tests\//,
];

/** Common entry-point file names used by `detectEntryPoints`. */
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

/** Maximum character length for a reference/line preview string. */
export const MAX_PREVIEW_LENGTH = 120;

/** Source file extensions the host will discover and analyze. */
export const SOURCE_EXTENSIONS = [
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.vue', '.svelte', '.astro',
] as const;

/** Directories skipped during recursive source discovery. */
export const SKIP_DIRECTORIES = [
  'node_modules', '.git', 'dist', 'build', '.next',
  '.nuxt', '.output', 'coverage', '.turbo', '.cache',
] as const;

/**
 * Upper bound on cached LanguageService instances. When exceeded the
 * least-recently-accessed entry is disposed. Bounds memory without a timer.
 */
export const MAX_CACHED_SERVICES = 8;
