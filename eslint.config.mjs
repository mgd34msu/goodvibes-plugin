/**
 * Root ESLint Configuration for Vibeplug Monorepo
 *
 * This configuration provides baseline linting for the root level and
 * delegates to workspace-specific configs where they exist.
 *
 * Workspaces with their own eslint.config.js:
 * - plugins/goodvibes/hooks/scripts (comprehensive TypeScript config)
 *
 * WHY flat config: ESLint 9+ uses flat config by default, providing
 * better performance and clearer configuration inheritance.
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
  eqeqeq: ['error', 'always'],
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

      // Workspaces with their own ESLint config (they handle their own linting)
      'plugins/goodvibes/hooks/scripts/**',

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
   * TypeScript files in plugins/goodvibes (excluding hooks/scripts which has its own config)
   */
  {
    files: ['plugins/goodvibes/**/*.ts', 'plugins/goodvibes/**/*.tsx'],
    ignores: ['plugins/goodvibes/hooks/scripts/**'],
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
   * TypeScript files in tool-search-server
   */
  {
    files: ['plugins/goodvibes/tools/implementations/tool-search-server/**/*.ts'],
    languageOptions: sharedLanguageOptions,
    plugins: sharedPlugins,
    rules: {
      ...tseslint.configs.recommended.rules,
      ...baseRules,
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
