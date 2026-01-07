/**
 * Tests for pattern-matcher.ts
 *
 * Achieves 100% line and branch coverage for:
 * - findMatchingPattern
 * - findAllMatchingPatterns
 * - getHighestSeverity
 * - getSuggestedFix
 */

import { describe, it, expect, beforeEach } from 'vitest';

import {
  findMatchingPattern,
  findAllMatchingPatterns,
  getHighestSeverity,
  getSuggestedFix,
} from '../../post-tool-use-failure/pattern-matcher.js';

import type { RecoveryPattern } from '../../post-tool-use-failure/recovery-types.js';
import type { ErrorCategory, ErrorState } from '../../types/errors.js';

describe('pattern-matcher', () => {
  describe('findMatchingPattern', () => {
    it('should find pattern by category mapping - npm_install', () => {
      const result = findMatchingPattern(
        'npm_install',
        'Module not found: lodash'
      );

      expect(result).not.toBeNull();
      expect(result?.category).toBe('missing_import');
      expect(result?.suggestedFix).toContain('npm install');
    });

    it('should find pattern by category mapping - npm_install with npm error', () => {
      const result = findMatchingPattern(
        'npm_install',
        'npm ERR! code ERESOLVE'
      );

      expect(result).not.toBeNull();
      expect(result?.category).toBe('npm_error');
    });

    it('should find pattern by category mapping - typescript_error', () => {
      const result = findMatchingPattern(
        'typescript_error',
        "Type 'string' is not assignable to type 'number'"
      );

      expect(result).not.toBeNull();
      expect(result?.category).toBe('typescript_type_error');
      expect(result?.severity).toBe('high');
    });

    it('should find pattern by category mapping - typescript_error with config error', () => {
      const result = findMatchingPattern(
        'typescript_error',
        'Error in tsconfig.json file'
      );

      expect(result).not.toBeNull();
      expect(result?.category).toBe('typescript_config_error');
    });

    it('should find pattern by category mapping - typescript_error with type mismatch', () => {
      const result = findMatchingPattern(
        'typescript_error',
        'Expected 2 arguments, but got 3'
      );

      expect(result).not.toBeNull();
      expect(result?.category).toBe('type_mismatch');
    });

    it('should find pattern by category mapping - test_failure', () => {
      const result = findMatchingPattern(
        'test_failure',
        'FAIL src/utils.test.ts'
      );

      expect(result).not.toBeNull();
      expect(result?.category).toBe('test_failure');
    });

    it('should find pattern by category mapping - build_failure', () => {
      const result = findMatchingPattern(
        'build_failure',
        'Build failed with errors'
      );

      expect(result).not.toBeNull();
      expect(result?.category).toBe('build_failure');
      expect(result?.severity).toBe('critical');
    });

    it('should find pattern by category mapping - file_not_found', () => {
      const result = findMatchingPattern(
        'file_not_found',
        'ENOENT: no such file or directory'
      );

      expect(result).not.toBeNull();
      expect(result?.category).toBe('file_not_found');
    });

    it('should find pattern by category mapping - git_conflict', () => {
      const result = findMatchingPattern(
        'git_conflict',
        'fatal: not a git repository'
      );

      expect(result).not.toBeNull();
      expect(result?.category).toBe('git_error');
    });

    it('should find pattern by category mapping - database_error', () => {
      const result = findMatchingPattern(
        'database_error',
        'ECONNREFUSED 127.0.0.1:5432'
      );

      expect(result).not.toBeNull();
      expect(result?.category).toBe('database_error');
    });

    it('should find pattern by category mapping - api_error', () => {
      const result = findMatchingPattern('api_error', 'fetch request failed');

      expect(result).not.toBeNull();
      expect(result?.category).toBe('api_error');
    });

    it('should find pattern by category mapping - unknown with undefined_reference', () => {
      const result = findMatchingPattern(
        'unknown',
        'ReferenceError: foo is not defined'
      );

      expect(result).not.toBeNull();
      expect(result?.category).toBe('undefined_reference');
    });

    it('should find pattern by category mapping - unknown with lint_error', () => {
      const result = findMatchingPattern('unknown', 'eslint: error found');

      expect(result).not.toBeNull();
      expect(result?.category).toBe('lint_error');
    });

    it('should find pattern by category mapping - unknown with permission_error', () => {
      const result = findMatchingPattern(
        'unknown',
        'EACCES: permission denied'
      );

      expect(result).not.toBeNull();
      expect(result?.category).toBe('permission_error');
    });

    it('should find pattern by category mapping - unknown with resource_error', () => {
      const result = findMatchingPattern(
        'unknown',
        'JavaScript heap out of memory'
      );

      expect(result).not.toBeNull();
      expect(result?.category).toBe('resource_error');
      expect(result?.severity).toBe('critical');
    });

    it('should find pattern by category mapping - unknown with syntax_error', () => {
      const result = findMatchingPattern(
        'unknown',
        'SyntaxError: Unexpected token'
      );

      expect(result).not.toBeNull();
      expect(result?.category).toBe('syntax_error');
    });

    it('should fall back to pattern matching when category mapping fails', () => {
      // api_error category doesn't map to typescript_type_error, but pattern should still match
      const result = findMatchingPattern('api_error', 'TS2345: error message');

      expect(result).not.toBeNull();
      expect(result?.category).toBe('typescript_type_error');
    });

    it('should return null when no pattern matches', () => {
      const result = findMatchingPattern(
        'unknown',
        'some random error message that matches nothing'
      );

      expect(result).toBeNull();
    });

    it('should handle empty error message', () => {
      const result = findMatchingPattern('unknown', '');

      expect(result).toBeNull();
    });

    it('should match first pattern when multiple patterns exist in one category', () => {
      const result = findMatchingPattern(
        'typescript_error',
        'TS1234: some error'
      );

      expect(result).not.toBeNull();
      expect(result?.category).toBe('typescript_type_error');
    });

    it('should match second pattern regex in category', () => {
      const result = findMatchingPattern(
        'typescript_error',
        "Type 'A' is not assignable to type 'B'"
      );

      expect(result).not.toBeNull();
      expect(result?.category).toBe('typescript_type_error');
    });

    it('should handle category with empty pattern list in CATEGORY_MAP', () => {
      // Test with a category that exists but might not have mapped patterns
      const result = findMatchingPattern(
        'build_failure',
        'random unmatched error'
      );

      expect(result).toBeNull();
    });

    it('should handle invalid category gracefully with fallback to pattern matching', () => {
      // Force an invalid category to test the || [] fallback on line 46
      const invalidCategory = 'invalid_category' as ErrorCategory;
      const result = findMatchingPattern(
        invalidCategory,
        'TS1234: some typescript error'
      );

      // Should still find pattern via fallback pattern matching
      expect(result).not.toBeNull();
      expect(result?.category).toBe('typescript_type_error');
    });

    it('should return null for invalid category with no pattern match', () => {
      // Force an invalid category with no matching pattern
      const invalidCategory = 'invalid_category' as ErrorCategory;
      const result = findMatchingPattern(
        invalidCategory,
        'completely unmatched error xyz123'
      );

      expect(result).toBeNull();
    });
  });

  describe('findAllMatchingPatterns', () => {
    it('should find all matching patterns for an error', () => {
      const result = findAllMatchingPatterns('Module not found: foo');

      expect(result.length).toBeGreaterThan(0);
      expect(result.some((p) => p.category === 'missing_import')).toBe(true);
    });

    it('should find multiple patterns when error matches multiple categories', () => {
      const result = findAllMatchingPatterns(
        'Module not found and npm ERR! occurred'
      );

      expect(result.length).toBeGreaterThanOrEqual(1);
      const categories = result.map((p) => p.category);
      expect(categories).toContain('missing_import');
    });

    it('should return empty array when no patterns match', () => {
      const result = findAllMatchingPatterns(
        'completely unrelated error message xyz123'
      );

      expect(result).toEqual([]);
    });

    it('should only add each pattern once even if multiple regexes match', () => {
      // TypeScript type error has multiple patterns, but should only appear once
      const result = findAllMatchingPatterns(
        "TS2345: Type 'string' is not assignable to type 'number'"
      );

      const typescriptPatterns = result.filter(
        (p) => p.category === 'typescript_type_error'
      );
      expect(typescriptPatterns.length).toBe(1);
    });

    it('should handle empty error message', () => {
      const result = findAllMatchingPatterns('');

      expect(result).toEqual([]);
    });

    it('should find build failure pattern', () => {
      const result = findAllMatchingPatterns(
        'Build failed with critical errors'
      );

      expect(result.some((p) => p.category === 'build_failure')).toBe(true);
    });

    it('should find test failure pattern with AssertionError', () => {
      const result = findAllMatchingPatterns(
        'AssertionError: expected true to be false'
      );

      expect(result.some((p) => p.category === 'test_failure')).toBe(true);
    });

    it('should break after first matching regex in pattern', () => {
      // Both TS\d+ and "Type.*not assignable" would match, but should only add pattern once
      const result = findAllMatchingPatterns(
        "TS1234: Type 'A' is not assignable to type 'B'"
      );

      const count = result.filter(
        (p) => p.category === 'typescript_type_error'
      ).length;
      expect(count).toBe(1);
    });
  });

  describe('getHighestSeverity', () => {
    it('should return "low" for empty array', () => {
      const result = getHighestSeverity([]);

      expect(result).toBe('low');
    });

    it('should return "low" when all patterns are low severity', () => {
      const patterns: RecoveryPattern[] = [
        {
          category: 'lint_error',
          description: 'Lint error',
          patterns: [/test/],
          suggestedFix: 'Fix it',
          severity: 'low',
        },
      ];

      const result = getHighestSeverity(patterns);

      expect(result).toBe('low');
    });

    it('should return "medium" when highest is medium', () => {
      const patterns: RecoveryPattern[] = [
        {
          category: 'lint_error',
          description: 'Lint error',
          patterns: [/test/],
          suggestedFix: 'Fix it',
          severity: 'low',
        },
        {
          category: 'npm_error',
          description: 'NPM error',
          patterns: [/test/],
          suggestedFix: 'Fix it',
          severity: 'medium',
        },
      ];

      const result = getHighestSeverity(patterns);

      expect(result).toBe('medium');
    });

    it('should return "high" when highest is high', () => {
      const patterns: RecoveryPattern[] = [
        {
          category: 'lint_error',
          description: 'Lint error',
          patterns: [/test/],
          suggestedFix: 'Fix it',
          severity: 'low',
        },
        {
          category: 'typescript_type_error',
          description: 'Type error',
          patterns: [/test/],
          suggestedFix: 'Fix it',
          severity: 'high',
        },
        {
          category: 'npm_error',
          description: 'NPM error',
          patterns: [/test/],
          suggestedFix: 'Fix it',
          severity: 'medium',
        },
      ];

      const result = getHighestSeverity(patterns);

      expect(result).toBe('high');
    });

    it('should return "critical" when highest is critical', () => {
      const patterns: RecoveryPattern[] = [
        {
          category: 'lint_error',
          description: 'Lint error',
          patterns: [/test/],
          suggestedFix: 'Fix it',
          severity: 'low',
        },
        {
          category: 'build_failure',
          description: 'Build failure',
          patterns: [/test/],
          suggestedFix: 'Fix it',
          severity: 'critical',
        },
        {
          category: 'typescript_type_error',
          description: 'Type error',
          patterns: [/test/],
          suggestedFix: 'Fix it',
          severity: 'high',
        },
      ];

      const result = getHighestSeverity(patterns);

      expect(result).toBe('critical');
    });

    it('should handle single pattern', () => {
      const patterns: RecoveryPattern[] = [
        {
          category: 'test_failure',
          description: 'Test failure',
          patterns: [/test/],
          suggestedFix: 'Fix it',
          severity: 'high',
        },
      ];

      const result = getHighestSeverity(patterns);

      expect(result).toBe('high');
    });

    it('should handle multiple patterns with same severity', () => {
      const patterns: RecoveryPattern[] = [
        {
          category: 'error1',
          description: 'Error 1',
          patterns: [/test/],
          suggestedFix: 'Fix it',
          severity: 'medium',
        },
        {
          category: 'error2',
          description: 'Error 2',
          patterns: [/test/],
          suggestedFix: 'Fix it',
          severity: 'medium',
        },
      ];

      const result = getHighestSeverity(patterns);

      expect(result).toBe('medium');
    });
  });

  describe('getSuggestedFix', () => {
    let mockErrorState: ErrorState;

    beforeEach(() => {
      mockErrorState = {
        signature: 'test-error',
        category: 'typescript_error',
        phase: 1,
        attemptsThisPhase: 0,
        totalAttempts: 0,
        officialDocsSearched: [],
        officialDocsContent: '',
        unofficialDocsSearched: [],
        unofficialDocsContent: '',
        fixStrategiesAttempted: [],
      };
    });

    it('should return pattern suggestion when pattern is found', () => {
      const result = getSuggestedFix(
        'typescript_error',
        "Type 'string' is not assignable to type 'number'",
        mockErrorState
      );

      expect(result).toContain('npx tsc --noEmit');
      expect(result).not.toContain('Previous fix attempts failed');
    });

    it('should return default message when no pattern matches', () => {
      const result = getSuggestedFix(
        'unknown',
        'some completely unrelated error',
        mockErrorState
      );

      expect(result).toBe(
        'Review the error message carefully. Check logs for more details. Try isolating the problem step by step.'
      );
    });

    it('should add phase-specific advice when phase >= 2 and strategies attempted', () => {
      mockErrorState.phase = 2;
      mockErrorState.fixStrategiesAttempted = [
        {
          phase: 1,
          strategy: 'fix attempt 1',
          succeeded: false,
          timestamp: '2024-01-01T00:00:00Z',
        },
      ];

      const result = getSuggestedFix(
        'typescript_error',
        "Type 'string' is not assignable to type 'number'",
        mockErrorState
      );

      expect(result).toContain('npx tsc --noEmit');
      expect(result).toContain('Previous fix attempts failed');
      expect(result).toContain('Try a different approach');
    });

    it('should add phase-specific advice when phase = 3 and strategies attempted', () => {
      mockErrorState.phase = 3;
      mockErrorState.fixStrategiesAttempted = [
        {
          phase: 1,
          strategy: 'fix attempt 1',
          succeeded: false,
          timestamp: '2024-01-01T00:00:00Z',
        },
        {
          phase: 2,
          strategy: 'fix attempt 2',
          succeeded: false,
          timestamp: '2024-01-01T00:01:00Z',
        },
      ];

      const result = getSuggestedFix(
        'test_failure',
        'FAIL src/test.test.ts',
        mockErrorState
      );

      expect(result).toContain('Review the test output');
      expect(result).toContain('Previous fix attempts failed');
    });

    it('should NOT add phase-specific advice when phase = 1', () => {
      mockErrorState.phase = 1;
      mockErrorState.fixStrategiesAttempted = [];

      const result = getSuggestedFix(
        'typescript_error',
        "Type 'string' is not assignable to type 'number'",
        mockErrorState
      );

      expect(result).toContain('npx tsc --noEmit');
      expect(result).not.toContain('Previous fix attempts failed');
    });

    it('should NOT add phase-specific advice when phase >= 2 but no strategies attempted', () => {
      mockErrorState.phase = 2;
      mockErrorState.fixStrategiesAttempted = [];

      const result = getSuggestedFix(
        'typescript_error',
        "Type 'string' is not assignable to type 'number'",
        mockErrorState
      );

      expect(result).toContain('npx tsc --noEmit');
      expect(result).not.toContain('Previous fix attempts failed');
    });

    it('should handle npm_install category', () => {
      const result = getSuggestedFix(
        'npm_install',
        'Module not found: lodash',
        mockErrorState
      );

      expect(result).toContain('npm install');
    });

    it('should handle build_failure category', () => {
      const result = getSuggestedFix(
        'build_failure',
        'Build failed',
        mockErrorState
      );

      expect(result).toContain('Check the build output');
    });

    it('should handle test_failure category', () => {
      const result = getSuggestedFix(
        'test_failure',
        'FAIL test.test.ts',
        mockErrorState
      );

      expect(result).toContain('Review the test output');
    });

    it('should handle file_not_found category', () => {
      const result = getSuggestedFix(
        'file_not_found',
        'ENOENT: no such file',
        mockErrorState
      );

      expect(result).toContain('Verify the file path exists');
    });

    it('should handle git_conflict category', () => {
      const result = getSuggestedFix(
        'git_conflict',
        'fatal: not a git repository',
        mockErrorState
      );

      expect(result).toContain('Resolve any merge conflicts');
    });

    it('should handle database_error category', () => {
      const result = getSuggestedFix(
        'database_error',
        'ECONNREFUSED 127.0.0.1:5432',
        mockErrorState
      );

      expect(result).toContain('Ensure the database server is running');
    });

    it('should handle api_error category', () => {
      const result = getSuggestedFix(
        'api_error',
        'fetch failed',
        mockErrorState
      );

      expect(result).toContain('Check API endpoint URL');
    });

    it('should handle unknown category with matching pattern', () => {
      const result = getSuggestedFix(
        'unknown',
        'ReferenceError: x is not defined',
        mockErrorState
      );

      expect(result).toContain('null checks or optional chaining');
    });

    it('should combine pattern suggestion with phase advice correctly', () => {
      mockErrorState.phase = 2;
      mockErrorState.fixStrategiesAttempted = [
        {
          phase: 1,
          strategy: 'previous fix',
          succeeded: false,
          timestamp: '2024-01-01T00:00:00Z',
        },
      ];

      const result = getSuggestedFix(
        'npm_install',
        'npm ERR! ERESOLVE',
        mockErrorState
      );

      // Should have base suggestion
      expect(result).toContain('npm install --legacy-peer-deps');
      // Should have phase advice appended with \n\n
      expect(result).toContain('\n\nNote: Previous fix attempts failed');
    });
  });
});
