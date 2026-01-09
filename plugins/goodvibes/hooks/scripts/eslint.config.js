import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import-x';
import globals from 'globals';

/**
 * Shared plugins used across all configurations
 * WHY: Extracting plugins reduces duplication and ensures consistency
 */
const sharedPlugins = {
  '@typescript-eslint': tseslint.plugin,
  'import-x': importPlugin,
};

/**
 * Shared language options for TypeScript parsing
 * WHY: Consistent parser configuration across all TypeScript files
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
 * Rules disabled across all configurations
 * WHY: These rules are disabled for the following reasons:
 * - strict-boolean-expressions: Produces too many false positives in common
 *   JavaScript/TypeScript patterns (truthy/falsy checks) and makes code more
 *   verbose without significant safety benefits
 * - no-undef: TypeScript's compiler already checks for undefined variables,
 *   making this rule redundant and sometimes incorrect in TypeScript contexts
 */
const disabledRules = {
  '@typescript-eslint/strict-boolean-expressions': 'off',
  'no-undef': 'off',
};

/**
 * Rules disabled only in test configurations
 * WHY: unbound-method is disabled because test frameworks like Vitest use
 * method extraction patterns (e.g., expect.any(), vi.fn()) that intentionally
 * use unbound methods. This is safe in test contexts and required for the API.
 */
const testOnlyDisabledRules = {
  '@typescript-eslint/unbound-method': 'off',
};

/**
 * Shared rules that apply to all TypeScript configurations
 * WHY: Extracting these rules reduces duplication and ensures consistency
 * across source, test, and config files while making maintenance easier.
 */
const sharedRules = {
  'no-unused-vars': 'error',
  '@typescript-eslint/no-unused-vars': [
    'error',
    {
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
    },
  ],

  '@typescript-eslint/no-explicit-any': 'error',
  '@typescript-eslint/no-unused-expressions': 'error',
  '@typescript-eslint/consistent-type-imports': [
    'error',
    {
      prefer: 'type-imports',
      fixStyle: 'separate-type-imports',
    },
  ],

  'no-console': ['warn', { allow: ['warn', 'error'] }],
  'prefer-const': 'error',
  'no-var': 'error',
  eqeqeq: ['error', 'always'],
  curly: ['error', 'all'],
  complexity: ['warn', 10],
  'max-depth': ['warn', 4],
  'import-x/order': [
    'error',
    {
      groups: [
        'builtin',
        'external',
        'internal',
        'parent',
        'sibling',
        'index',
        'type',
      ],
      'newlines-between': 'always',
      alphabetize: { order: 'asc', caseInsensitive: true },
    },
  ],
};

/**
 * Type-aware rules that require type-checking
 * WHY: These rules are extracted to be shared between source and test configs,
 * reducing duplication while maintaining the same type-safety standards.
 */
const typeAwareRules = {
  '@typescript-eslint/no-floating-promises': 'error',
  '@typescript-eslint/no-misused-promises': 'error',
  '@typescript-eslint/await-thenable': 'warn',
  '@typescript-eslint/no-unnecessary-type-assertion': 'error',
  '@typescript-eslint/restrict-template-expressions': 'warn',
  '@typescript-eslint/restrict-plus-operands': 'warn',
  '@typescript-eslint/explicit-function-return-type': [
    'warn',
    {
      allowExpressions: true,
      allowTypedFunctionExpressions: true,
    },
  ],
  '@typescript-eslint/prefer-nullish-coalescing': 'warn',
  '@typescript-eslint/prefer-optional-chain': 'warn',
  '@typescript-eslint/require-await': 'warn',
  '@typescript-eslint/no-base-to-string': 'warn',
  '@typescript-eslint/no-unsafe-assignment': 'warn',
  '@typescript-eslint/no-unsafe-member-access': 'warn',
  '@typescript-eslint/no-unsafe-argument': 'warn',
  '@typescript-eslint/no-unsafe-return': 'warn',
  '@typescript-eslint/no-unsafe-call': 'warn',
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
      'temp_check/**',
      '*.js',
      '*.mjs',
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
      ...sharedLanguageOptions,
      parserOptions: {
        ...sharedLanguageOptions.parserOptions,
        project: './tsconfig.eslint.json',
      },
    },
    plugins: sharedPlugins,
    rules: {
      ...tseslint.configs.recommended.rules,
      ...tseslint.configs.recommendedTypeChecked.rules,
      ...prettierConfig.rules,
      ...sharedRules,
      ...typeAwareRules,
      ...disabledRules,
    },
  },

  /**
   * TypeScript configuration for ROOT CONFIG files
   * WHY: Config files like vitest.config.ts need basic linting without
   * the full type-checking overhead required for source files.
   */
  {
    files: ['vitest.config.ts'],
    languageOptions: sharedLanguageOptions,
    plugins: sharedPlugins,
    rules: {
      ...tseslint.configs.recommended.rules,
      ...prettierConfig.rules,
      ...sharedRules,
      ...disabledRules,
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
      ...sharedLanguageOptions,
      parserOptions: {
        ...sharedLanguageOptions.parserOptions,
        project: './tsconfig.eslint.json',
      },
    },
    plugins: sharedPlugins,
    rules: {
      ...tseslint.configs.recommended.rules,
      ...tseslint.configs.recommendedTypeChecked.rules,
      ...prettierConfig.rules,
      ...sharedRules,
      ...typeAwareRules,
      ...disabledRules,

      /**
       * Test-specific adjustments
       */
      '@typescript-eslint/only-throw-error': 'warn',
      '@typescript-eslint/require-await': 'off',
      ...testOnlyDisabledRules,
    },
  },
];
