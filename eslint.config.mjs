/**
 * Root ESLint Configuration for the GoodVibes monorepo (v2).
 *
 * Lints the v2 engineering base under packages/* and the plugin content
 * under plugins/goodvibes (hooks .mjs, commands lib). Flat config, ESLint 9+.
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Use require to load packages from workspace node_modules
const eslint = require('@eslint/js');
const tseslint = require('typescript-eslint');
const globals = require('globals');

/**
 * Shared language options for TypeScript parsing
 */
const sharedLanguageOptions = {
  parser: tseslint.parser,
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  globals: {
    ...globals.node,
  },
};

/**
 * Shared plugins used across configurations
 */
const sharedPlugins = {
  '@typescript-eslint': tseslint.plugin,
};

/**
 * Base rules that apply to all TypeScript files
 */
const baseRules = {
  'no-unused-vars': 'off',
  '@typescript-eslint/no-unused-vars': [
    'error',
    {
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
    },
  ],
  '@typescript-eslint/no-explicit-any': 'warn',
  'no-console': ['warn', { allow: ['warn', 'error'] }],
  'prefer-const': 'error',
  'no-var': 'error',
  // null: 'ignore' keeps the codebase's `x != null` null-or-undefined checks.
  eqeqeq: ['error', 'always', { null: 'ignore' }],
  // Off for TypeScript, matching typescript-eslint's eslint-recommended
  // overrides: tsc reports real redeclarations, and the rule misreads the zod
  // pattern where a schema const and its inferred type share a name.
  'no-redeclare': 'off',
  curly: ['error', 'all'],
};

export default [
  /**
   * Global ignore patterns
   * WHY: Exclude build outputs, dependencies, and files that shouldn't be linted
   */
  {
    ignores: [
      // Build outputs
      '**/dist/**',
      '**/build/**',
      '**/.next/**',

      // Dependencies
      '**/node_modules/**',

      // Coverage and temp
      '**/coverage/**',
      '**/temp_check/**',

      // Test fixtures (may contain intentionally broken code for testing)
      '**/__tests__/fixtures/**',
      '**/test-fixtures/**',

      // Committed server bundles (build outputs, not source)
      'plugins/goodvibes/server/**',

      // Generated files
      '**/*.generated.*',

      // Non-source files at root
      '*.md',
      '*.json',
      '*.yaml',
      '*.yml',
    ],
  },

  /**
   * Base ESLint recommended rules
   */
  eslint.configs.recommended,

  /**
   * TypeScript source in the v2 packages
   */
  {
    files: ['packages/**/*.ts', 'packages/**/*.tsx'],
    languageOptions: sharedLanguageOptions,
    plugins: sharedPlugins,
    rules: {
      ...tseslint.configs.recommended.rules,
      ...baseRules,
      // Disable no-undef - TypeScript handles this
      'no-undef': 'off',
    },
  },

  /**
   * JavaScript/MJS config files at root and in workspaces
   */
  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    ignores: ['**/node_modules/**', '**/dist/**'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      ...eslint.configs.recommended.rules,
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
];
