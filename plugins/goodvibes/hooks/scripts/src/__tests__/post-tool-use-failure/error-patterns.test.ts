/**
 * Tests for error-patterns.ts
 *
 * This file exports type definitions and the RECOVERY_PATTERNS constant.
 * Tests verify the exports are properly defined and the patterns work correctly.
 */

import { describe, it, expect } from 'vitest';
import {
  RECOVERY_PATTERNS,
  type ErrorSeverity,
  type RecoveryPattern,
} from '../../post-tool-use-failure/error-patterns.js';

describe('error-patterns', () => {
  describe('RECOVERY_PATTERNS', () => {
    it('should export a non-empty array of patterns', () => {
      expect(Array.isArray(RECOVERY_PATTERNS)).toBe(true);
      expect(RECOVERY_PATTERNS.length).toBeGreaterThan(0);
    });

    it('should have valid structure for each pattern', () => {
      for (const pattern of RECOVERY_PATTERNS) {
        expect(pattern).toHaveProperty('category');
        expect(pattern).toHaveProperty('description');
        expect(pattern).toHaveProperty('patterns');
        expect(pattern).toHaveProperty('suggestedFix');
        expect(pattern).toHaveProperty('severity');

        expect(typeof pattern.category).toBe('string');
        expect(typeof pattern.description).toBe('string');
        expect(Array.isArray(pattern.patterns)).toBe(true);
        expect(typeof pattern.suggestedFix).toBe('string');
        expect(['low', 'medium', 'high', 'critical']).toContain(
          pattern.severity
        );
      }
    });

    it('should have regex patterns for each category', () => {
      for (const pattern of RECOVERY_PATTERNS) {
        expect(pattern.patterns.length).toBeGreaterThan(0);
        for (const regex of pattern.patterns) {
          expect(regex).toBeInstanceOf(RegExp);
        }
      }
    });

    it('should include typescript_type_error category', () => {
      const tsPattern = RECOVERY_PATTERNS.find(
        (p) => p.category === 'typescript_type_error'
      );
      expect(tsPattern).toBeDefined();
      expect(tsPattern?.severity).toBe('high');
    });

    it('should include typescript_config_error category', () => {
      const tsConfigPattern = RECOVERY_PATTERNS.find(
        (p) => p.category === 'typescript_config_error'
      );
      expect(tsConfigPattern).toBeDefined();
      expect(tsConfigPattern?.severity).toBe('medium');
    });

    it('should include missing_import category', () => {
      const importPattern = RECOVERY_PATTERNS.find(
        (p) => p.category === 'missing_import'
      );
      expect(importPattern).toBeDefined();
      expect(importPattern?.severity).toBe('high');
    });

    it('should include type_mismatch category', () => {
      const mismatchPattern = RECOVERY_PATTERNS.find(
        (p) => p.category === 'type_mismatch'
      );
      expect(mismatchPattern).toBeDefined();
      expect(mismatchPattern?.severity).toBe('medium');
    });

    it('should include undefined_reference category', () => {
      const refPattern = RECOVERY_PATTERNS.find(
        (p) => p.category === 'undefined_reference'
      );
      expect(refPattern).toBeDefined();
      expect(refPattern?.severity).toBe('high');
    });

    it('should include lint_error category', () => {
      const lintPattern = RECOVERY_PATTERNS.find(
        (p) => p.category === 'lint_error'
      );
      expect(lintPattern).toBeDefined();
      expect(lintPattern?.severity).toBe('low');
    });

    it('should include test_failure category', () => {
      const testPattern = RECOVERY_PATTERNS.find(
        (p) => p.category === 'test_failure'
      );
      expect(testPattern).toBeDefined();
      expect(testPattern?.severity).toBe('high');
    });

    it('should include build_failure category', () => {
      const buildPattern = RECOVERY_PATTERNS.find(
        (p) => p.category === 'build_failure'
      );
      expect(buildPattern).toBeDefined();
      expect(buildPattern?.severity).toBe('critical');
    });

    it('should include npm_error category', () => {
      const npmPattern = RECOVERY_PATTERNS.find(
        (p) => p.category === 'npm_error'
      );
      expect(npmPattern).toBeDefined();
      expect(npmPattern?.severity).toBe('medium');
    });

    it('should include file_not_found category', () => {
      const filePattern = RECOVERY_PATTERNS.find(
        (p) => p.category === 'file_not_found'
      );
      expect(filePattern).toBeDefined();
      expect(filePattern?.severity).toBe('medium');
    });

    it('should include permission_error category', () => {
      const permPattern = RECOVERY_PATTERNS.find(
        (p) => p.category === 'permission_error'
      );
      expect(permPattern).toBeDefined();
      expect(permPattern?.severity).toBe('high');
    });

    it('should include git_error category', () => {
      const gitPattern = RECOVERY_PATTERNS.find(
        (p) => p.category === 'git_error'
      );
      expect(gitPattern).toBeDefined();
      expect(gitPattern?.severity).toBe('medium');
    });

    it('should include database_error category', () => {
      const dbPattern = RECOVERY_PATTERNS.find(
        (p) => p.category === 'database_error'
      );
      expect(dbPattern).toBeDefined();
      expect(dbPattern?.severity).toBe('high');
    });

    it('should include api_error category', () => {
      const apiPattern = RECOVERY_PATTERNS.find(
        (p) => p.category === 'api_error'
      );
      expect(apiPattern).toBeDefined();
      expect(apiPattern?.severity).toBe('medium');
    });

    it('should include resource_error category', () => {
      const resourcePattern = RECOVERY_PATTERNS.find(
        (p) => p.category === 'resource_error'
      );
      expect(resourcePattern).toBeDefined();
      expect(resourcePattern?.severity).toBe('critical');
    });

    it('should include syntax_error category', () => {
      const syntaxPattern = RECOVERY_PATTERNS.find(
        (p) => p.category === 'syntax_error'
      );
      expect(syntaxPattern).toBeDefined();
      expect(syntaxPattern?.severity).toBe('high');
    });
  });

  describe('pattern matching', () => {
    it('should match TypeScript error codes', () => {
      const tsPattern = RECOVERY_PATTERNS.find(
        (p) => p.category === 'typescript_type_error'
      );
      expect(
        tsPattern?.patterns.some((p) => p.test('TS2345: Error message'))
      ).toBe(true);
    });

    it('should match type assignment errors', () => {
      const tsPattern = RECOVERY_PATTERNS.find(
        (p) => p.category === 'typescript_type_error'
      );
      expect(
        tsPattern?.patterns.some((p) =>
          p.test("Type 'string' is not assignable to type 'number'")
        )
      ).toBe(true);
    });

    it('should match property not exist errors', () => {
      const tsPattern = RECOVERY_PATTERNS.find(
        (p) => p.category === 'typescript_type_error'
      );
      expect(
        tsPattern?.patterns.some((p) =>
          p.test("Property 'foo' does not exist on type 'Bar'")
        )
      ).toBe(true);
    });

    it('should match module not found errors', () => {
      const importPattern = RECOVERY_PATTERNS.find(
        (p) => p.category === 'missing_import'
      );
      expect(
        importPattern?.patterns.some((p) =>
          p.test("Cannot find module 'lodash'")
        )
      ).toBe(true);
    });

    it('should match npm errors', () => {
      const npmPattern = RECOVERY_PATTERNS.find(
        (p) => p.category === 'npm_error'
      );
      expect(
        npmPattern?.patterns.some((p) => p.test('npm ERR! code ERESOLVE'))
      ).toBe(true);
    });

    it('should match build failure errors', () => {
      const buildPattern = RECOVERY_PATTERNS.find(
        (p) => p.category === 'build_failure'
      );
      expect(buildPattern?.patterns.some((p) => p.test('Build failed'))).toBe(
        true
      );
    });

    it('should match test failure errors', () => {
      const testPattern = RECOVERY_PATTERNS.find(
        (p) => p.category === 'test_failure'
      );
      expect(
        testPattern?.patterns.some((p) => p.test('FAIL src/utils.test.ts'))
      ).toBe(true);
    });

    it('should match git errors', () => {
      const gitPattern = RECOVERY_PATTERNS.find(
        (p) => p.category === 'git_error'
      );
      expect(
        gitPattern?.patterns.some((p) => p.test('fatal: not a git repository'))
      ).toBe(true);
    });

    it('should match database connection errors', () => {
      const dbPattern = RECOVERY_PATTERNS.find(
        (p) => p.category === 'database_error'
      );
      expect(
        dbPattern?.patterns.some((p) => p.test('ECONNREFUSED 127.0.0.1:5432'))
      ).toBe(true);
    });

    it('should match heap out of memory errors', () => {
      const resourcePattern = RECOVERY_PATTERNS.find(
        (p) => p.category === 'resource_error'
      );
      expect(
        resourcePattern?.patterns.some((p) =>
          p.test('JavaScript heap out of memory')
        )
      ).toBe(true);
    });

    it('should match syntax errors', () => {
      const syntaxPattern = RECOVERY_PATTERNS.find(
        (p) => p.category === 'syntax_error'
      );
      expect(
        syntaxPattern?.patterns.some((p) =>
          p.test('SyntaxError: Unexpected token')
        )
      ).toBe(true);
    });
  });

  describe('type exports', () => {
    it('should export ErrorSeverity type that accepts valid values', () => {
      const severities: ErrorSeverity[] = ['low', 'medium', 'high', 'critical'];
      expect(severities).toHaveLength(4);
    });

    it('should export RecoveryPattern type with correct shape', () => {
      const pattern: RecoveryPattern = {
        category: 'test',
        description: 'Test pattern',
        patterns: [/test/],
        suggestedFix: 'Fix it',
        severity: 'low',
      };
      expect(pattern.category).toBe('test');
    });
  });
});
