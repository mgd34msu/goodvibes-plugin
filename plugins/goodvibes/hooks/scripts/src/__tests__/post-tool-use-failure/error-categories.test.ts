/**
 * Unit tests for error-categories module
 *
 * Tests cover:
 * - ERROR_CATEGORY_MAP constant
 * - CATEGORY_TO_PATTERN_MAP constant
 * - findMatchingPattern function (all branches)
 * - findAllMatchingPatterns function (all branches)
 * - getHighestSeverity function (all branches)
 * - Edge cases and error paths
 *
 * Target: 100% line and branch coverage
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import type {
  RecoveryPattern,
  ErrorSeverity,
} from '../../post-tool-use-failure/error-patterns.js';
import type { ErrorCategory } from '../../types/errors.js';

// Mock the error-patterns module
const mockRecoveryPatterns: RecoveryPattern[] = [
  {
    category: 'npm_error',
    description: 'NPM error',
    patterns: [/npm ERR!/, /ERESOLVE/],
    suggestedFix: 'Run npm install',
    severity: 'medium',
  },
  {
    category: 'missing_import',
    description: 'Missing import',
    patterns: [/Cannot find module/, /Module not found/],
    suggestedFix: 'Check imports',
    severity: 'high',
  },
  {
    category: 'typescript_type_error',
    description: 'TypeScript type error',
    patterns: [/TS\d+:/, /Type '.*' is not assignable/],
    suggestedFix: 'Fix type errors',
    severity: 'high',
  },
  {
    category: 'typescript_config_error',
    description: 'TypeScript config error',
    patterns: [
      /Cannot find module '.*' or its corresponding type declarations/,
      /Could not find a declaration file for module/,
      /error TS6059:/,
      /tsconfig\.json/,
    ],
    suggestedFix: 'Fix config',
    severity: 'medium',
  },
  {
    category: 'type_mismatch',
    description: 'Type mismatch',
    patterns: [/Expected \d+ arguments?, but got \d+/],
    suggestedFix: 'Fix arguments',
    severity: 'medium',
  },
  {
    category: 'test_failure',
    description: 'Test failure',
    patterns: [/FAIL\s+.*\.test\./, /Test Suites:.*failed/],
    suggestedFix: 'Fix tests',
    severity: 'high',
  },
  {
    category: 'build_failure',
    description: 'Build failure',
    patterns: [/Build failed/i, /Compilation failed/],
    suggestedFix: 'Fix build',
    severity: 'critical',
  },
  {
    category: 'file_not_found',
    description: 'File not found',
    patterns: [/ENOENT/, /no such file or directory/i],
    suggestedFix: 'Check file path',
    severity: 'medium',
  },
  {
    category: 'git_error',
    description: 'Git error',
    patterns: [/fatal: not a git repository/, /CONFLICT.*Merge conflict/],
    suggestedFix: 'Resolve git issues',
    severity: 'medium',
  },
  {
    category: 'database_error',
    description: 'Database error',
    patterns: [/ECONNREFUSED.*:\d+/, /prisma.*error/i],
    suggestedFix: 'Check database',
    severity: 'high',
  },
  {
    category: 'api_error',
    description: 'API error',
    patterns: [/fetch.*failed/i, /HTTP \d{3}/],
    suggestedFix: 'Check API',
    severity: 'medium',
  },
  {
    category: 'undefined_reference',
    description: 'Undefined reference',
    patterns: [
      /ReferenceError: (.*) is not defined/,
      /TypeError: Cannot read propert(y|ies) of undefined/,
    ],
    suggestedFix: 'Add null checks',
    severity: 'high',
  },
  {
    category: 'lint_error',
    description: 'Lint error',
    patterns: [/eslint:/, /prettier.*check.*failed/i],
    suggestedFix: 'Run linter',
    severity: 'low',
  },
  {
    category: 'permission_error',
    description: 'Permission error',
    patterns: [/EACCES/, /Permission denied/i],
    suggestedFix: 'Fix permissions',
    severity: 'high',
  },
  {
    category: 'resource_error',
    description: 'Resource error',
    patterns: [/JavaScript heap out of memory/, /ENOMEM/],
    suggestedFix: 'Increase memory',
    severity: 'critical',
  },
  {
    category: 'syntax_error',
    description: 'Syntax error',
    patterns: [/SyntaxError:/, /Unexpected token/],
    suggestedFix: 'Fix syntax',
    severity: 'high',
  },
  {
    category: 'unmatched_category',
    description: 'Unmatched category',
    patterns: [/some unique pattern/],
    suggestedFix: 'Handle unmatched',
    severity: 'low',
  },
];

vi.mock('../../post-tool-use-failure/error-patterns.js', () => ({
  RECOVERY_PATTERNS: mockRecoveryPatterns,
}));

describe('error-categories', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('ERROR_CATEGORY_MAP', () => {
    it('should export ERROR_CATEGORY_MAP with all error categories', async () => {
      const { ERROR_CATEGORY_MAP } =
        await import('../../post-tool-use-failure/error-categories.js');

      expect(ERROR_CATEGORY_MAP).toBeDefined();
      expect(ERROR_CATEGORY_MAP.npm_install).toEqual([
        'missing_import',
        'npm_error',
      ]);
      expect(ERROR_CATEGORY_MAP.typescript_error).toEqual([
        'typescript_type_error',
        'typescript_config_error',
        'type_mismatch',
      ]);
      expect(ERROR_CATEGORY_MAP.test_failure).toEqual(['test_failure']);
      expect(ERROR_CATEGORY_MAP.build_failure).toEqual(['build_failure']);
      expect(ERROR_CATEGORY_MAP.file_not_found).toEqual(['file_not_found']);
      expect(ERROR_CATEGORY_MAP.git_conflict).toEqual(['git_error']);
      expect(ERROR_CATEGORY_MAP.database_error).toEqual(['database_error']);
      expect(ERROR_CATEGORY_MAP.api_error).toEqual(['api_error']);
      expect(ERROR_CATEGORY_MAP.unknown).toEqual([
        'undefined_reference',
        'lint_error',
        'permission_error',
        'resource_error',
        'syntax_error',
      ]);
    });
  });

  describe('CATEGORY_TO_PATTERN_MAP', () => {
    it('should export CATEGORY_TO_PATTERN_MAP with all error categories', async () => {
      const { CATEGORY_TO_PATTERN_MAP } =
        await import('../../post-tool-use-failure/error-categories.js');

      expect(CATEGORY_TO_PATTERN_MAP).toBeDefined();
      expect(CATEGORY_TO_PATTERN_MAP.npm_install).toBe('npm_error');
      expect(CATEGORY_TO_PATTERN_MAP.typescript_error).toBe(
        'typescript_type_error'
      );
      expect(CATEGORY_TO_PATTERN_MAP.test_failure).toBe('test_failure');
      expect(CATEGORY_TO_PATTERN_MAP.build_failure).toBe('build_failure');
      expect(CATEGORY_TO_PATTERN_MAP.file_not_found).toBe('file_not_found');
      expect(CATEGORY_TO_PATTERN_MAP.git_conflict).toBe('git_error');
      expect(CATEGORY_TO_PATTERN_MAP.database_error).toBe('database_error');
      expect(CATEGORY_TO_PATTERN_MAP.api_error).toBe('api_error');
      expect(CATEGORY_TO_PATTERN_MAP.unknown).toBe('undefined_reference');
    });
  });

  describe('findMatchingPattern', () => {
    it('should find pattern by category mapping - npm_install with npm_error pattern', async () => {
      const { findMatchingPattern } =
        await import('../../post-tool-use-failure/error-categories.js');

      const result = findMatchingPattern(
        'npm_install',
        'npm ERR! code ERESOLVE'
      );

      expect(result).not.toBeNull();
      expect(result?.category).toBe('npm_error');
      expect(result?.suggestedFix).toBe('Run npm install');
    });

    it('should find pattern by category mapping - npm_install with missing_import pattern', async () => {
      const { findMatchingPattern } =
        await import('../../post-tool-use-failure/error-categories.js');

      const result = findMatchingPattern(
        'npm_install',
        'Cannot find module "express"'
      );

      expect(result).not.toBeNull();
      expect(result?.category).toBe('missing_import');
      expect(result?.suggestedFix).toBe('Check imports');
    });

    it('should find pattern by category mapping - typescript_error with typescript_type_error', async () => {
      const { findMatchingPattern } =
        await import('../../post-tool-use-failure/error-categories.js');

      const result = findMatchingPattern(
        'typescript_error',
        'TS2322: Type string is not assignable to number'
      );

      expect(result).not.toBeNull();
      expect(result?.category).toBe('typescript_type_error');
    });

    it('should find pattern by category mapping - typescript_error with typescript_config_error', async () => {
      const { findMatchingPattern } =
        await import('../../post-tool-use-failure/error-categories.js');

      const result = findMatchingPattern(
        'typescript_error',
        'Could not find a declaration file for module react'
      );

      expect(result).not.toBeNull();
      expect(result?.category).toBe('typescript_config_error');
    });

    it('should find pattern by category mapping - typescript_error with type_mismatch', async () => {
      const { findMatchingPattern } =
        await import('../../post-tool-use-failure/error-categories.js');

      const result = findMatchingPattern(
        'typescript_error',
        'Expected 2 arguments, but got 3'
      );

      expect(result).not.toBeNull();
      expect(result?.category).toBe('type_mismatch');
    });

    it('should find pattern by category mapping - test_failure', async () => {
      const { findMatchingPattern } =
        await import('../../post-tool-use-failure/error-categories.js');

      const result = findMatchingPattern(
        'test_failure',
        'FAIL  src/test.test.ts'
      );

      expect(result).not.toBeNull();
      expect(result?.category).toBe('test_failure');
    });

    it('should find pattern by category mapping - build_failure', async () => {
      const { findMatchingPattern } =
        await import('../../post-tool-use-failure/error-categories.js');

      const result = findMatchingPattern(
        'build_failure',
        'Build failed with errors'
      );

      expect(result).not.toBeNull();
      expect(result?.category).toBe('build_failure');
    });

    it('should find pattern by category mapping - file_not_found', async () => {
      const { findMatchingPattern } =
        await import('../../post-tool-use-failure/error-categories.js');

      const result = findMatchingPattern(
        'file_not_found',
        'ENOENT: no such file'
      );

      expect(result).not.toBeNull();
      expect(result?.category).toBe('file_not_found');
    });

    it('should find pattern by category mapping - git_conflict', async () => {
      const { findMatchingPattern } =
        await import('../../post-tool-use-failure/error-categories.js');

      const result = findMatchingPattern(
        'git_conflict',
        'fatal: not a git repository'
      );

      expect(result).not.toBeNull();
      expect(result?.category).toBe('git_error');
    });

    it('should find pattern by category mapping - database_error', async () => {
      const { findMatchingPattern } =
        await import('../../post-tool-use-failure/error-categories.js');

      const result = findMatchingPattern(
        'database_error',
        'ECONNREFUSED 127.0.0.1:5432'
      );

      expect(result).not.toBeNull();
      expect(result?.category).toBe('database_error');
    });

    it('should find pattern by category mapping - api_error', async () => {
      const { findMatchingPattern } =
        await import('../../post-tool-use-failure/error-categories.js');

      const result = findMatchingPattern(
        'api_error',
        'fetch failed with timeout'
      );

      expect(result).not.toBeNull();
      expect(result?.category).toBe('api_error');
    });

    it('should find pattern by category mapping - unknown with undefined_reference', async () => {
      const { findMatchingPattern } =
        await import('../../post-tool-use-failure/error-categories.js');

      const result = findMatchingPattern(
        'unknown',
        'ReferenceError: foo is not defined'
      );

      expect(result).not.toBeNull();
      expect(result?.category).toBe('undefined_reference');
    });

    it('should find pattern by category mapping - unknown with lint_error', async () => {
      const { findMatchingPattern } =
        await import('../../post-tool-use-failure/error-categories.js');

      const result = findMatchingPattern('unknown', 'eslint: error detected');

      expect(result).not.toBeNull();
      expect(result?.category).toBe('lint_error');
    });

    it('should find pattern by category mapping - unknown with permission_error', async () => {
      const { findMatchingPattern } =
        await import('../../post-tool-use-failure/error-categories.js');

      const result = findMatchingPattern('unknown', 'EACCES permission denied');

      expect(result).not.toBeNull();
      expect(result?.category).toBe('permission_error');
    });

    it('should find pattern by category mapping - unknown with resource_error', async () => {
      const { findMatchingPattern } =
        await import('../../post-tool-use-failure/error-categories.js');

      const result = findMatchingPattern(
        'unknown',
        'JavaScript heap out of memory'
      );

      expect(result).not.toBeNull();
      expect(result?.category).toBe('resource_error');
    });

    it('should find pattern by category mapping - unknown with syntax_error', async () => {
      const { findMatchingPattern } =
        await import('../../post-tool-use-failure/error-categories.js');

      const result = findMatchingPattern(
        'unknown',
        'SyntaxError: Unexpected token'
      );

      expect(result).not.toBeNull();
      expect(result?.category).toBe('syntax_error');
    });

    it('should fall back to pattern matching when category mapping does not match', async () => {
      const { findMatchingPattern } =
        await import('../../post-tool-use-failure/error-categories.js');

      // 'unknown' category doesn't include 'npm_error' in its mapping,
      // but should still match by pattern fallback
      const result = findMatchingPattern(
        'unknown',
        'npm ERR! something went wrong'
      );

      expect(result).not.toBeNull();
      expect(result?.category).toBe('npm_error');
    });

    it('should return null when no pattern matches', async () => {
      const { findMatchingPattern } =
        await import('../../post-tool-use-failure/error-categories.js');

      const result = findMatchingPattern(
        'npm_install',
        'completely unrelated error message'
      );

      expect(result).toBeNull();
    });

    it('should return null for empty error message', async () => {
      const { findMatchingPattern } =
        await import('../../post-tool-use-failure/error-categories.js');

      const result = findMatchingPattern('npm_install', '');

      expect(result).toBeNull();
    });

    it('should handle category with empty pattern list', async () => {
      const { findMatchingPattern } =
        await import('../../post-tool-use-failure/error-categories.js');

      // This tests the edge case where patternCategories is empty array
      // by using a category that doesn't exist in the map (will be undefined, default to [])
      const result = findMatchingPattern(
        'invalid_category' as ErrorCategory,
        'npm ERR! test'
      );

      // Should still find via fallback pattern matching
      expect(result).not.toBeNull();
      expect(result?.category).toBe('npm_error');
    });

    it('should match first pattern in category mapping', async () => {
      const { findMatchingPattern } =
        await import('../../post-tool-use-failure/error-categories.js');

      // npm_install maps to ['missing_import', 'npm_error']
      // This should match missing_import first
      const result = findMatchingPattern(
        'npm_install',
        'Module not found: express'
      );

      expect(result).not.toBeNull();
      expect(result?.category).toBe('missing_import');
    });

    it('should iterate through all patterns in a recovery pattern', async () => {
      const { findMatchingPattern } =
        await import('../../post-tool-use-failure/error-categories.js');

      // Test with second pattern in npm_error's patterns array
      const result = findMatchingPattern(
        'npm_install',
        'ERESOLVE unable to resolve dependency'
      );

      expect(result).not.toBeNull();
      expect(result?.category).toBe('npm_error');
    });
  });

  describe('findAllMatchingPatterns', () => {
    it('should find all matching patterns for an error', async () => {
      const { findAllMatchingPatterns } =
        await import('../../post-tool-use-failure/error-categories.js');

      const result = findAllMatchingPatterns('npm ERR! something');

      expect(result.length).toBeGreaterThan(0);
      expect(result.some((p) => p.category === 'npm_error')).toBe(true);
    });

    it('should return empty array when no patterns match', async () => {
      const { findAllMatchingPatterns } =
        await import('../../post-tool-use-failure/error-categories.js');

      const result = findAllMatchingPatterns(
        'completely unique unmatched error'
      );

      expect(result).toEqual([]);
    });

    it('should only add each pattern once even if multiple regexes match', async () => {
      const { findAllMatchingPatterns } =
        await import('../../post-tool-use-failure/error-categories.js');

      // npm_error has patterns [/npm ERR!/, /ERESOLVE/]
      // Both should match but pattern should only be added once
      const result = findAllMatchingPatterns('npm ERR! ERESOLVE conflict');

      const npmErrorCount = result.filter(
        (p) => p.category === 'npm_error'
      ).length;
      expect(npmErrorCount).toBe(1);
    });

    it('should return multiple patterns if error matches multiple categories', async () => {
      const { findAllMatchingPatterns } =
        await import('../../post-tool-use-failure/error-categories.js');

      // Create an error that might match multiple patterns
      const result = findAllMatchingPatterns('Build failed: TS2322 type error');

      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle empty error string', async () => {
      const { findAllMatchingPatterns } =
        await import('../../post-tool-use-failure/error-categories.js');

      const result = findAllMatchingPatterns('');

      expect(result).toEqual([]);
    });

    it('should iterate through all patterns in RECOVERY_PATTERNS', async () => {
      const { findAllMatchingPatterns } =
        await import('../../post-tool-use-failure/error-categories.js');

      // Test various patterns
      const errors = [
        'npm ERR!',
        'Cannot find module',
        'TS2322:',
        'FAIL  test.test.ts',
        'Build failed',
        'ENOENT',
        'fatal: not a git repository',
        'ECONNREFUSED 127.0.0.1:5432',
        'fetch failed',
        'ReferenceError: x is not defined',
        'eslint:',
        'EACCES',
        'JavaScript heap out of memory',
        'SyntaxError:',
      ];

      for (const error of errors) {
        const result = findAllMatchingPatterns(error);
        expect(result.length).toBeGreaterThan(0);
      }
    });

    it('should break after first matching regex for each pattern', async () => {
      const { findAllMatchingPatterns } =
        await import('../../post-tool-use-failure/error-categories.js');

      // Verify that the break statement works - each pattern should only be added once
      const result = findAllMatchingPatterns(
        'Build failed with Compilation failed'
      );

      const buildFailureMatches = result.filter(
        (p) => p.category === 'build_failure'
      );
      expect(buildFailureMatches.length).toBe(1);
    });
  });

  describe('getHighestSeverity', () => {
    it('should return "low" for empty array', async () => {
      const { getHighestSeverity } =
        await import('../../post-tool-use-failure/error-categories.js');

      const result = getHighestSeverity([]);

      expect(result).toBe('low');
    });

    it('should return "low" when all patterns have low severity', async () => {
      const { getHighestSeverity } =
        await import('../../post-tool-use-failure/error-categories.js');

      const patterns: RecoveryPattern[] = [
        {
          category: 'test1',
          description: 'Test',
          patterns: [/test/],
          suggestedFix: 'Fix',
          severity: 'low',
        },
        {
          category: 'test2',
          description: 'Test',
          patterns: [/test/],
          suggestedFix: 'Fix',
          severity: 'low',
        },
      ];

      const result = getHighestSeverity(patterns);

      expect(result).toBe('low');
    });

    it('should return "medium" when highest is medium', async () => {
      const { getHighestSeverity } =
        await import('../../post-tool-use-failure/error-categories.js');

      const patterns: RecoveryPattern[] = [
        {
          category: 'test1',
          description: 'Test',
          patterns: [/test/],
          suggestedFix: 'Fix',
          severity: 'low',
        },
        {
          category: 'test2',
          description: 'Test',
          patterns: [/test/],
          suggestedFix: 'Fix',
          severity: 'medium',
        },
      ];

      const result = getHighestSeverity(patterns);

      expect(result).toBe('medium');
    });

    it('should return "high" when highest is high', async () => {
      const { getHighestSeverity } =
        await import('../../post-tool-use-failure/error-categories.js');

      const patterns: RecoveryPattern[] = [
        {
          category: 'test1',
          description: 'Test',
          patterns: [/test/],
          suggestedFix: 'Fix',
          severity: 'low',
        },
        {
          category: 'test2',
          description: 'Test',
          patterns: [/test/],
          suggestedFix: 'Fix',
          severity: 'medium',
        },
        {
          category: 'test3',
          description: 'Test',
          patterns: [/test/],
          suggestedFix: 'Fix',
          severity: 'high',
        },
      ];

      const result = getHighestSeverity(patterns);

      expect(result).toBe('high');
    });

    it('should return "critical" when highest is critical', async () => {
      const { getHighestSeverity } =
        await import('../../post-tool-use-failure/error-categories.js');

      const patterns: RecoveryPattern[] = [
        {
          category: 'test1',
          description: 'Test',
          patterns: [/test/],
          suggestedFix: 'Fix',
          severity: 'low',
        },
        {
          category: 'test2',
          description: 'Test',
          patterns: [/test/],
          suggestedFix: 'Fix',
          severity: 'medium',
        },
        {
          category: 'test3',
          description: 'Test',
          patterns: [/test/],
          suggestedFix: 'Fix',
          severity: 'high',
        },
        {
          category: 'test4',
          description: 'Test',
          patterns: [/test/],
          suggestedFix: 'Fix',
          severity: 'critical',
        },
      ];

      const result = getHighestSeverity(patterns);

      expect(result).toBe('critical');
    });

    it('should handle single pattern', async () => {
      const { getHighestSeverity } =
        await import('../../post-tool-use-failure/error-categories.js');

      const patterns: RecoveryPattern[] = [
        {
          category: 'test',
          description: 'Test',
          patterns: [/test/],
          suggestedFix: 'Fix',
          severity: 'high',
        },
      ];

      const result = getHighestSeverity(patterns);

      expect(result).toBe('high');
    });

    it('should correctly compare severity levels in order', async () => {
      const { getHighestSeverity } =
        await import('../../post-tool-use-failure/error-categories.js');

      // Test all combinations to ensure comparison works
      const testCases: Array<{
        severities: ErrorSeverity[];
        expected: ErrorSeverity;
      }> = [
        { severities: ['low', 'low'], expected: 'low' },
        { severities: ['low', 'medium'], expected: 'medium' },
        { severities: ['medium', 'low'], expected: 'medium' },
        { severities: ['medium', 'high'], expected: 'high' },
        { severities: ['high', 'medium'], expected: 'high' },
        { severities: ['high', 'critical'], expected: 'critical' },
        { severities: ['critical', 'high'], expected: 'critical' },
        { severities: ['low', 'critical'], expected: 'critical' },
      ];

      for (const testCase of testCases) {
        const patterns: RecoveryPattern[] = testCase.severities.map(
          (severity, i) => ({
            category: `test${i}`,
            description: 'Test',
            patterns: [/test/],
            suggestedFix: 'Fix',
            severity,
          })
        );

        const result = getHighestSeverity(patterns);
        expect(result).toBe(testCase.expected);
      }
    });

    it('should iterate through all patterns in array', async () => {
      const { getHighestSeverity } =
        await import('../../post-tool-use-failure/error-categories.js');

      // Ensure all patterns are checked, not just first few
      const patterns: RecoveryPattern[] = [
        {
          category: 'test1',
          description: 'Test',
          patterns: [/test/],
          suggestedFix: 'Fix',
          severity: 'low',
        },
        {
          category: 'test2',
          description: 'Test',
          patterns: [/test/],
          suggestedFix: 'Fix',
          severity: 'low',
        },
        {
          category: 'test3',
          description: 'Test',
          patterns: [/test/],
          suggestedFix: 'Fix',
          severity: 'low',
        },
        {
          category: 'test4',
          description: 'Test',
          patterns: [/test/],
          suggestedFix: 'Fix',
          severity: 'critical', // Last item is highest
        },
      ];

      const result = getHighestSeverity(patterns);

      expect(result).toBe('critical');
    });
  });
});
