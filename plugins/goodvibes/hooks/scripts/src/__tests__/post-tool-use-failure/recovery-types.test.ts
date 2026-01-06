/**
 * Tests for post-tool-use-failure/recovery-types.ts
 *
 * This file contains only TypeScript type and interface definitions.
 * These tests verify that all types are properly exported
 * and can be used for type checking.
 */

import { describe, it, expect } from 'vitest';
import type {
  ErrorSeverity,
  RecoveryPattern,
} from '../../post-tool-use-failure/recovery-types.js';

describe('post-tool-use-failure/recovery-types', () => {
  describe('ErrorSeverity type', () => {
    it('should accept "low" severity', () => {
      const severity: ErrorSeverity = 'low';
      expect(severity).toBe('low');
    });

    it('should accept "medium" severity', () => {
      const severity: ErrorSeverity = 'medium';
      expect(severity).toBe('medium');
    });

    it('should accept "high" severity', () => {
      const severity: ErrorSeverity = 'high';
      expect(severity).toBe('high');
    });

    it('should accept "critical" severity', () => {
      const severity: ErrorSeverity = 'critical';
      expect(severity).toBe('critical');
    });

    it('should allow comparison of severity levels', () => {
      const severityLevels: ErrorSeverity[] = ['low', 'medium', 'high', 'critical'];

      expect(severityLevels).toHaveLength(4);
      expect(severityLevels[0]).toBe('low');
      expect(severityLevels[3]).toBe('critical');
    });

    it('should work with severity mapping', () => {
      const severityPriority: Record<ErrorSeverity, number> = {
        low: 1,
        medium: 2,
        high: 3,
        critical: 4,
      };

      expect(severityPriority.low).toBe(1);
      expect(severityPriority.critical).toBe(4);
    });
  });

  describe('RecoveryPattern interface', () => {
    it('should accept valid RecoveryPattern with low severity', () => {
      const pattern: RecoveryPattern = {
        category: 'lint_warning',
        description: 'ESLint style warning',
        patterns: [/eslint.*warning/i, /prefer-const/i],
        suggestedFix: 'Run eslint --fix to auto-fix style issues',
        severity: 'low',
      };

      expect(pattern.category).toBe('lint_warning');
      expect(pattern.description).toBe('ESLint style warning');
      expect(pattern.patterns).toHaveLength(2);
      expect(pattern.suggestedFix).toBe('Run eslint --fix to auto-fix style issues');
      expect(pattern.severity).toBe('low');
    });

    it('should accept RecoveryPattern with medium severity', () => {
      const pattern: RecoveryPattern = {
        category: 'type_error',
        description: 'TypeScript type mismatch',
        patterns: [/Type '.*' is not assignable to type '.*'/],
        suggestedFix: 'Check the type definitions and ensure compatibility',
        severity: 'medium',
      };

      expect(pattern.severity).toBe('medium');
      expect(pattern.patterns[0].test("Type 'string' is not assignable to type 'number'")).toBe(true);
    });

    it('should accept RecoveryPattern with high severity', () => {
      const pattern: RecoveryPattern = {
        category: 'build_failure',
        description: 'Build process failed',
        patterns: [/Build failed/i, /Compilation error/i, /Fatal error/i],
        suggestedFix: 'Check build output for specific errors and fix them',
        severity: 'high',
      };

      expect(pattern.severity).toBe('high');
      expect(pattern.patterns).toHaveLength(3);
    });

    it('should accept RecoveryPattern with critical severity', () => {
      const pattern: RecoveryPattern = {
        category: 'data_corruption',
        description: 'Potential data corruption detected',
        patterns: [/data.*corrupt/i, /database.*inconsistent/i],
        suggestedFix: 'Stop all operations immediately and restore from backup',
        severity: 'critical',
      };

      expect(pattern.severity).toBe('critical');
    });

    it('should accept RecoveryPattern with single regex pattern', () => {
      const pattern: RecoveryPattern = {
        category: 'module_not_found',
        description: 'Module or package not found',
        patterns: [/Cannot find module '.*'/],
        suggestedFix: 'Run npm install to install missing dependencies',
        severity: 'medium',
      };

      expect(pattern.patterns).toHaveLength(1);
      expect(pattern.patterns[0].test("Cannot find module 'lodash'")).toBe(true);
    });

    it('should accept RecoveryPattern with multiple regex patterns', () => {
      const pattern: RecoveryPattern = {
        category: 'network_error',
        description: 'Network connectivity issue',
        patterns: [
          /ECONNREFUSED/,
          /ETIMEDOUT/,
          /ENOTFOUND/,
          /network.*unreachable/i,
          /connection.*refused/i,
        ],
        suggestedFix: 'Check network connectivity and retry the operation',
        severity: 'medium',
      };

      expect(pattern.patterns).toHaveLength(5);
      expect(pattern.patterns[0].test('ECONNREFUSED')).toBe(true);
      expect(pattern.patterns[1].test('ETIMEDOUT')).toBe(true);
    });

    it('should accept RecoveryPattern with complex regex patterns', () => {
      const pattern: RecoveryPattern = {
        category: 'typescript_error',
        description: 'TypeScript compilation error',
        patterns: [
          /TS\d{4}:/,  // Match TS error codes like TS2345:
          /error TS\d+/,  // Match "error TS2345"
          /\(\d+,\d+\): error/,  // Match "(10,5): error"
        ],
        suggestedFix: 'Fix the TypeScript errors shown in the output',
        severity: 'high',
      };

      expect(pattern.patterns[0].test('TS2345: Argument of type')).toBe(true);
      expect(pattern.patterns[1].test('error TS2345')).toBe(true);
      expect(pattern.patterns[2].test('(10,5): error TS2345')).toBe(true);
    });

    it('should work with arrays of RecoveryPattern', () => {
      const patterns: RecoveryPattern[] = [
        {
          category: 'npm_error',
          description: 'NPM installation error',
          patterns: [/npm ERR!/],
          suggestedFix: 'Clear npm cache and retry installation',
          severity: 'medium',
        },
        {
          category: 'permission_error',
          description: 'File permission denied',
          patterns: [/EACCES/i, /permission denied/i],
          suggestedFix: 'Check file permissions or run with elevated privileges',
          severity: 'high',
        },
        {
          category: 'out_of_memory',
          description: 'Process ran out of memory',
          patterns: [/JavaScript heap out of memory/i, /ENOMEM/],
          suggestedFix: 'Increase Node.js memory limit with --max-old-space-size',
          severity: 'critical',
        },
      ];

      expect(patterns).toHaveLength(3);
      expect(patterns[0].category).toBe('npm_error');
      expect(patterns[1].severity).toBe('high');
      expect(patterns[2].severity).toBe('critical');
    });

    it('should support pattern matching for error categorization', () => {
      const pattern: RecoveryPattern = {
        category: 'test_failure',
        description: 'Unit test assertion failed',
        patterns: [
          /AssertionError/,
          /expect\(.*\)\.to/,
          /FAIL.*\.test\./,
        ],
        suggestedFix: 'Review the failing test and fix the assertion or code',
        severity: 'medium',
      };

      const testErrors = [
        'AssertionError: expected 1 to equal 2',
        'expect(received).toBe(expected)',
        'FAIL src/utils.test.ts',
      ];

      testErrors.forEach((error, index) => {
        expect(pattern.patterns[index].test(error)).toBe(true);
      });
    });

    it('should support case-insensitive patterns', () => {
      const pattern: RecoveryPattern = {
        category: 'git_error',
        description: 'Git operation failed',
        patterns: [
          /fatal:/i,
          /error:/i,
          /merge conflict/i,
        ],
        suggestedFix: 'Review git status and resolve any conflicts',
        severity: 'medium',
      };

      expect(pattern.patterns[2].test('MERGE CONFLICT')).toBe(true);
      expect(pattern.patterns[2].test('Merge Conflict')).toBe(true);
      expect(pattern.patterns[2].test('merge conflict')).toBe(true);
    });

    it('should support patterns with capture groups', () => {
      const pattern: RecoveryPattern = {
        category: 'file_error',
        description: 'File operation failed',
        patterns: [
          /ENOENT.*'(.+)'/,  // Capture file path
          /Cannot find file: (.+)/,
        ],
        suggestedFix: 'Check if the file exists and has correct path',
        severity: 'medium',
      };

      const match = "ENOENT: no such file or directory, open '/path/to/file.ts'".match(
        pattern.patterns[0]
      );
      expect(match).not.toBeNull();
      expect(match![1]).toBe('/path/to/file.ts');
    });
  });
});
