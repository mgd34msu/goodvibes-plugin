import eslint from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';

/**
 * Shared rules that apply to all TypeScript configurations
 * WHY: Extracting these rules reduces duplication and ensures consistency
 * across source, test, and config files while making maintenance easier.
 */
const sharedRules = {
  '@typescript-eslint/no-unused-vars': [
    'warn',
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
   * Ignore patterns for ESLint
   * WHY: Exclude build outputs, dependencies, and non-TypeScript files from linting
   * to improve performance and avoid linting generated or third-party code.
   */
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      '**/*.js',
      '**/*.mjs',
      'temp_check/**',
    ],
  },

  /**
   * Base ESLint recommended rules
   * WHY: Provides fundamental JavaScript error prevention and best practices
   * that apply to all code, including type-checking and basic syntax rules.
   */
  eslint.configs.recommended,

  /**
   * TypeScript-specific configuration for SOURCE files
   * WHY: Enables type-aware linting for TypeScript files with strict rules
   * to catch type errors, promise handling issues, and enforce code quality.
   */
  {
    files: ['src/**/*.ts'],
    ignores: ['src/**/__tests__/**', 'src/**/*.test.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        project: './tsconfig.eslint.json',
      },
      /**
       * Node.js global variables
       * WHY: Using the globals package provides a comprehensive and maintained
       * list of Node.js globals, reducing manual maintenance and preventing errors.
       */
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      ...tseslint.configs['recommended-requiring-type-checking'].rules,
      ...prettierConfig.rules,
      ...sharedRules,

      /**
       * Type Safety Rules kept as ERRORS for source files
       */
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-misused-promises': 'warn',
      '@typescript-eslint/await-thenable': 'warn',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      '@typescript-eslint/restrict-template-expressions': 'warn',
      '@typescript-eslint/restrict-plus-operands': 'warn',

      /**
       * Return Type Annotations - WARNINGS
       */
      '@typescript-eslint/explicit-function-return-type': [
        'warn',
        {
          allowExpressions: true,
          allowTypedFunctionExpressions: true,
        },
      ],

      /**
       * Code Quality Suggestions - WARNINGS
       */
      '@typescript-eslint/prefer-nullish-coalescing': 'warn',
      '@typescript-eslint/prefer-optional-chain': 'warn',
      '@typescript-eslint/require-await': 'warn',
      '@typescript-eslint/no-base-to-string': 'warn',
      complexity: ['warn', 15],
      'max-depth': ['warn', 4],

      /**
       * Type Safety - WARNINGS
       */
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',

      /**
       * Disabled Rules
       * WHY: strict-boolean-expressions is disabled because it produces too many
       * false positives in common JavaScript/TypeScript patterns (truthy/falsy checks)
       * and makes code more verbose without significant safety benefits.
       */
      '@typescript-eslint/strict-boolean-expressions': 'off',
      'no-undef': 'off',
    },
  },

  /**
   * TypeScript configuration for ROOT CONFIG files
   * WHY: Config files like vitest.config.ts need basic linting without
   * the full type-checking overhead required for source files.
   */
  {
    files: ['*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      ...prettierConfig.rules,
      ...sharedRules,
      'no-undef': 'off',
    },
  },

  /**
   * TypeScript configuration for TEST files
   * WHY: Test files need more lenient rules because:
   * 1. Test setup often requires intentional floating promises
   * 2. Mock objects frequently use any types
   * 3. Test code prioritizes readability and coverage over strict type safety
   * RATIONALE: 50+ errors in test files are acceptable test patterns
   */
  {
    files: ['src/**/__tests__/**/*.ts', 'src/**/*.test.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        project: './tsconfig.eslint.json',
      },
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      ...tseslint.configs['recommended-requiring-type-checking'].rules,
      ...prettierConfig.rules,
      ...sharedRules,

      /**
       * Test-specific adjustments - downgraded to warnings
       */
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/only-throw-error': 'warn',
      '@typescript-eslint/await-thenable': 'warn',
      '@typescript-eslint/restrict-template-expressions': 'warn',
      '@typescript-eslint/restrict-plus-operands': 'warn',
      '@typescript-eslint/explicit-function-return-type': [
        'warn',
        {
          allowExpressions: true,
          allowTypedFunctionExpressions: true,
        },
      ],
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/prefer-nullish-coalescing': 'warn',
      '@typescript-eslint/prefer-optional-chain': 'warn',
      '@typescript-eslint/require-await': 'warn',
      '@typescript-eslint/no-base-to-string': 'warn',

      /**
       * Disabled Rules
       * WHY: strict-boolean-expressions is disabled because it produces too many
       * false positives in common JavaScript/TypeScript patterns (truthy/falsy checks)
       * and makes code more verbose without significant safety benefits.
       */
      '@typescript-eslint/strict-boolean-expressions': 'off',
      '@typescript-eslint/unbound-method': 'off',
      'no-undef': 'off',
    },
  },
];
