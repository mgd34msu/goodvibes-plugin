/**
 * Tests for recovery-patterns.ts
 *
 * This file exports the RECOVERY_PATTERNS constant with comprehensive error patterns.
 * Tests verify the exports are properly defined and the patterns work correctly.
 */

import { describe, it, expect } from 'vitest';

import { RECOVERY_PATTERNS } from '../../post-tool-use-failure/recovery-patterns.js';

import type { RecoveryPattern } from '../../post-tool-use-failure/recovery-types.js';

describe('recovery-patterns', () => {
  describe('RECOVERY_PATTERNS export', () => {
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

    it('should have 16 distinct pattern categories', () => {
      const categories = RECOVERY_PATTERNS.map((p) => p.category);
      expect(categories).toContain('typescript_type_error');
      expect(categories).toContain('typescript_config_error');
      expect(categories).toContain('missing_import');
      expect(categories).toContain('type_mismatch');
      expect(categories).toContain('undefined_reference');
      expect(categories).toContain('lint_error');
      expect(categories).toContain('test_failure');
      expect(categories).toContain('build_failure');
      expect(categories).toContain('npm_error');
      expect(categories).toContain('file_not_found');
      expect(categories).toContain('permission_error');
      expect(categories).toContain('git_error');
      expect(categories).toContain('database_error');
      expect(categories).toContain('api_error');
      expect(categories).toContain('resource_error');
      expect(categories).toContain('syntax_error');
    });
  });

  describe('TypeScript error patterns', () => {
    it('should include typescript_type_error with correct severity', () => {
      const pattern = RECOVERY_PATTERNS.find(
        (p) => p.category === 'typescript_type_error'
      );
      expect(pattern).toBeDefined();
      expect(pattern?.severity).toBe('high');
      expect(pattern?.suggestedFix).toContain('npx tsc --noEmit');
    });

    it('should include typescript_config_error with correct severity', () => {
      const pattern = RECOVERY_PATTERNS.find(
        (p) => p.category === 'typescript_config_error'
      );
      expect(pattern).toBeDefined();
      expect(pattern?.severity).toBe('medium');
      expect(pattern?.suggestedFix).toContain('tsconfig.json');
    });

    it('should match TS error codes', () => {
      const pattern = RECOVERY_PATTERNS.find(
        (p) => p.category === 'typescript_type_error'
      );
      expect(pattern?.patterns.some((p) => p.test('TS2345:'))).toBe(true);
      expect(pattern?.patterns.some((p) => p.test('TS1234:'))).toBe(true);
    });

    it('should match type assignment errors', () => {
      const pattern = RECOVERY_PATTERNS.find(
        (p) => p.category === 'typescript_type_error'
      );
      expect(
        pattern?.patterns.some((p) =>
          p.test("Type 'string' is not assignable to type 'number'")
        )
      ).toBe(true);
    });

    it('should match property not exist errors', () => {
      const pattern = RECOVERY_PATTERNS.find(
        (p) => p.category === 'typescript_type_error'
      );
      expect(
        pattern?.patterns.some((p) =>
          p.test("Property 'foo' does not exist on type 'Bar'")
        )
      ).toBe(true);
    });

    it('should match cannot find name errors', () => {
      const pattern = RECOVERY_PATTERNS.find(
        (p) => p.category === 'typescript_type_error'
      );
      expect(
        pattern?.patterns.some((p) => p.test("Cannot find name 'myVariable'"))
      ).toBe(true);
    });

    it('should match argument not assignable errors', () => {
      const pattern = RECOVERY_PATTERNS.find(
        (p) => p.category === 'typescript_type_error'
      );
      expect(
        pattern?.patterns.some((p) =>
          p.test("Argument of type 'string' is not assignable")
        )
      ).toBe(true);
    });

    it('should match possibly undefined errors', () => {
      const pattern = RECOVERY_PATTERNS.find(
        (p) => p.category === 'typescript_type_error'
      );
      expect(
        pattern?.patterns.some((p) => p.test("Object is possibly 'undefined'"))
      ).toBe(true);
    });

    it('should match possibly null errors', () => {
      const pattern = RECOVERY_PATTERNS.find(
        (p) => p.category === 'typescript_type_error'
      );
      expect(
        pattern?.patterns.some((p) => p.test("Object is possibly 'null'"))
      ).toBe(true);
    });
  });

  describe('Import/Module error patterns', () => {
    it('should include missing_import with correct severity', () => {
      const pattern = RECOVERY_PATTERNS.find(
        (p) => p.category === 'missing_import'
      );
      expect(pattern).toBeDefined();
      expect(pattern?.severity).toBe('high');
      expect(pattern?.suggestedFix).toContain('npm install');
    });

    it('should match cannot find module errors', () => {
      const pattern = RECOVERY_PATTERNS.find(
        (p) => p.category === 'missing_import'
      );
      expect(
        pattern?.patterns.some((p) => p.test("Cannot find module 'lodash'"))
      ).toBe(true);
    });

    it('should match module not found errors', () => {
      const pattern = RECOVERY_PATTERNS.find(
        (p) => p.category === 'missing_import'
      );
      expect(
        pattern?.patterns.some((p) => p.test('Module not found: react'))
      ).toBe(true);
    });

    it('should match unable to resolve path errors', () => {
      const pattern = RECOVERY_PATTERNS.find(
        (p) => p.category === 'missing_import'
      );
      expect(
        pattern?.patterns.some((p) =>
          p.test('Unable to resolve path to module')
        )
      ).toBe(true);
    });
  });

  describe('Type mismatch patterns', () => {
    it('should include type_mismatch with correct severity', () => {
      const pattern = RECOVERY_PATTERNS.find(
        (p) => p.category === 'type_mismatch'
      );
      expect(pattern).toBeDefined();
      expect(pattern?.severity).toBe('medium');
    });

    it('should match expected arguments errors', () => {
      const pattern = RECOVERY_PATTERNS.find(
        (p) => p.category === 'type_mismatch'
      );
      expect(
        pattern?.patterns.some((p) => p.test('Expected 2 arguments, but got 3'))
      ).toBe(true);
    });
  });

  describe('Runtime reference error patterns', () => {
    it('should include undefined_reference with correct severity', () => {
      const pattern = RECOVERY_PATTERNS.find(
        (p) => p.category === 'undefined_reference'
      );
      expect(pattern).toBeDefined();
      expect(pattern?.severity).toBe('high');
      expect(pattern?.suggestedFix).toContain('null checks');
    });

    it('should match ReferenceError patterns', () => {
      const pattern = RECOVERY_PATTERNS.find(
        (p) => p.category === 'undefined_reference'
      );
      expect(
        pattern?.patterns.some((p) =>
          p.test('ReferenceError: foo is not defined')
        )
      ).toBe(true);
    });

    it('should match TypeError cannot read property patterns', () => {
      const pattern = RECOVERY_PATTERNS.find(
        (p) => p.category === 'undefined_reference'
      );
      expect(
        pattern?.patterns.some((p) =>
          p.test('TypeError: Cannot read property of undefined')
        )
      ).toBe(true);
      expect(
        pattern?.patterns.some((p) =>
          p.test('TypeError: Cannot read properties of null')
        )
      ).toBe(true);
    });

    it('should match is not a function errors', () => {
      const pattern = RECOVERY_PATTERNS.find(
        (p) => p.category === 'undefined_reference'
      );
      expect(
        pattern?.patterns.some((p) =>
          p.test('TypeError: foo is not a function')
        )
      ).toBe(true);
    });
  });

  describe('Linting error patterns', () => {
    it('should include lint_error with low severity', () => {
      const pattern = RECOVERY_PATTERNS.find(
        (p) => p.category === 'lint_error'
      );
      expect(pattern).toBeDefined();
      expect(pattern?.severity).toBe('low');
      expect(pattern?.suggestedFix).toContain('eslint');
    });

    it('should match eslint errors', () => {
      const pattern = RECOVERY_PATTERNS.find(
        (p) => p.category === 'lint_error'
      );
      expect(pattern?.patterns.some((p) => p.test('eslint: error'))).toBe(true);
    });

    it('should match error count patterns', () => {
      const pattern = RECOVERY_PATTERNS.find(
        (p) => p.category === 'lint_error'
      );
      expect(
        pattern?.patterns.some((p) => p.test('5 errors and 3 warnings'))
      ).toBe(true);
    });
  });

  describe('Test failure patterns', () => {
    it('should include test_failure with high severity', () => {
      const pattern = RECOVERY_PATTERNS.find(
        (p) => p.category === 'test_failure'
      );
      expect(pattern).toBeDefined();
      expect(pattern?.severity).toBe('high');
    });

    it('should match FAIL patterns', () => {
      const pattern = RECOVERY_PATTERNS.find(
        (p) => p.category === 'test_failure'
      );
      expect(
        pattern?.patterns.some((p) => p.test('FAIL src/utils.test.ts'))
      ).toBe(true);
    });

    it('should match AssertionError', () => {
      const pattern = RECOVERY_PATTERNS.find(
        (p) => p.category === 'test_failure'
      );
      expect(
        pattern?.patterns.some((p) => p.test('AssertionError: expected true'))
      ).toBe(true);
    });

    it('should match vitest/jest/mocha', () => {
      const pattern = RECOVERY_PATTERNS.find(
        (p) => p.category === 'test_failure'
      );
      expect(pattern?.patterns.some((p) => p.test('vitest failed'))).toBe(true);
      expect(pattern?.patterns.some((p) => p.test('jest test failure'))).toBe(
        true
      );
    });
  });

  describe('Build failure patterns', () => {
    it('should include build_failure with critical severity', () => {
      const pattern = RECOVERY_PATTERNS.find(
        (p) => p.category === 'build_failure'
      );
      expect(pattern).toBeDefined();
      expect(pattern?.severity).toBe('critical');
    });

    it('should match build failed patterns', () => {
      const pattern = RECOVERY_PATTERNS.find(
        (p) => p.category === 'build_failure'
      );
      expect(pattern?.patterns.some((p) => p.test('Build failed'))).toBe(true);
      expect(pattern?.patterns.some((p) => p.test('Compilation failed'))).toBe(
        true
      );
    });

    it('should match build tool errors', () => {
      const pattern = RECOVERY_PATTERNS.find(
        (p) => p.category === 'build_failure'
      );
      expect(pattern?.patterns.some((p) => p.test('vite error'))).toBe(true);
      expect(pattern?.patterns.some((p) => p.test('webpack error'))).toBe(true);
      expect(pattern?.patterns.some((p) => p.test('rollup error'))).toBe(true);
      expect(pattern?.patterns.some((p) => p.test('esbuild error'))).toBe(true);
    });
  });

  describe('NPM error patterns', () => {
    it('should include npm_error with medium severity', () => {
      const pattern = RECOVERY_PATTERNS.find((p) => p.category === 'npm_error');
      expect(pattern).toBeDefined();
      expect(pattern?.severity).toBe('medium');
      expect(pattern?.suggestedFix).toContain('--legacy-peer-deps');
    });

    it('should match npm ERR! patterns', () => {
      const pattern = RECOVERY_PATTERNS.find((p) => p.category === 'npm_error');
      expect(
        pattern?.patterns.some((p) => p.test('npm ERR! code ERESOLVE'))
      ).toBe(true);
    });

    it('should match ERESOLVE patterns', () => {
      const pattern = RECOVERY_PATTERNS.find((p) => p.category === 'npm_error');
      expect(
        pattern?.patterns.some((p) => p.test('ERESOLVE unable to resolve'))
      ).toBe(true);
    });
  });

  describe('File system error patterns', () => {
    it('should include file_not_found with medium severity', () => {
      const pattern = RECOVERY_PATTERNS.find(
        (p) => p.category === 'file_not_found'
      );
      expect(pattern).toBeDefined();
      expect(pattern?.severity).toBe('medium');
    });

    it('should match ENOENT patterns', () => {
      const pattern = RECOVERY_PATTERNS.find(
        (p) => p.category === 'file_not_found'
      );
      expect(
        pattern?.patterns.some((p) => p.test('ENOENT: no such file'))
      ).toBe(true);
    });

    it('should include permission_error with high severity', () => {
      const pattern = RECOVERY_PATTERNS.find(
        (p) => p.category === 'permission_error'
      );
      expect(pattern).toBeDefined();
      expect(pattern?.severity).toBe('high');
    });

    it('should match EACCES patterns', () => {
      const pattern = RECOVERY_PATTERNS.find(
        (p) => p.category === 'permission_error'
      );
      expect(
        pattern?.patterns.some((p) => p.test('EACCES: permission denied'))
      ).toBe(true);
    });
  });

  describe('Git error patterns', () => {
    it('should include git_error with medium severity', () => {
      const pattern = RECOVERY_PATTERNS.find((p) => p.category === 'git_error');
      expect(pattern).toBeDefined();
      expect(pattern?.severity).toBe('medium');
      expect(pattern?.suggestedFix).toContain('merge conflicts');
    });

    it('should match fatal: not a git repository', () => {
      const pattern = RECOVERY_PATTERNS.find((p) => p.category === 'git_error');
      expect(
        pattern?.patterns.some((p) => p.test('fatal: not a git repository'))
      ).toBe(true);
    });

    it('should match failed to push', () => {
      const pattern = RECOVERY_PATTERNS.find((p) => p.category === 'git_error');
      expect(
        pattern?.patterns.some((p) => p.test('error: failed to push some refs'))
      ).toBe(true);
    });

    it('should match merge conflicts', () => {
      const pattern = RECOVERY_PATTERNS.find((p) => p.category === 'git_error');
      expect(
        pattern?.patterns.some((p) =>
          p.test('CONFLICT (content): Merge conflict in file.txt')
        )
      ).toBe(true);
    });
  });

  describe('Database error patterns', () => {
    it('should include database_error with high severity', () => {
      const pattern = RECOVERY_PATTERNS.find(
        (p) => p.category === 'database_error'
      );
      expect(pattern).toBeDefined();
      expect(pattern?.severity).toBe('high');
      expect(pattern?.suggestedFix).toContain('database server');
    });

    it('should match ECONNREFUSED patterns', () => {
      const pattern = RECOVERY_PATTERNS.find(
        (p) => p.category === 'database_error'
      );
      expect(
        pattern?.patterns.some((p) => p.test('ECONNREFUSED 127.0.0.1:5432'))
      ).toBe(true);
    });

    it('should match Prisma error codes', () => {
      const pattern = RECOVERY_PATTERNS.find(
        (p) => p.category === 'database_error'
      );
      expect(
        pattern?.patterns.some((p) => p.test('P2002: Unique constraint'))
      ).toBe(true);
    });
  });

  describe('API/Network error patterns', () => {
    it('should include api_error with medium severity', () => {
      const pattern = RECOVERY_PATTERNS.find((p) => p.category === 'api_error');
      expect(pattern).toBeDefined();
      expect(pattern?.severity).toBe('medium');
      expect(pattern?.suggestedFix).toContain('API endpoint');
    });

    it('should match fetch failed patterns', () => {
      const pattern = RECOVERY_PATTERNS.find((p) => p.category === 'api_error');
      expect(pattern?.patterns.some((p) => p.test('fetch failed'))).toBe(true);
    });

    it('should match HTTP status codes', () => {
      const pattern = RECOVERY_PATTERNS.find((p) => p.category === 'api_error');
      expect(pattern?.patterns.some((p) => p.test('HTTP 500'))).toBe(true);
      expect(pattern?.patterns.some((p) => p.test('status code 404'))).toBe(
        true
      );
    });
  });

  describe('Resource error patterns', () => {
    it('should include resource_error with critical severity', () => {
      const pattern = RECOVERY_PATTERNS.find(
        (p) => p.category === 'resource_error'
      );
      expect(pattern).toBeDefined();
      expect(pattern?.severity).toBe('critical');
      expect(pattern?.suggestedFix).toContain('max-old-space-size');
    });

    it('should match heap out of memory', () => {
      const pattern = RECOVERY_PATTERNS.find(
        (p) => p.category === 'resource_error'
      );
      expect(
        pattern?.patterns.some((p) => p.test('JavaScript heap out of memory'))
      ).toBe(true);
    });

    it('should match maximum call stack', () => {
      const pattern = RECOVERY_PATTERNS.find(
        (p) => p.category === 'resource_error'
      );
      expect(
        pattern?.patterns.some((p) =>
          p.test('Maximum call stack size exceeded')
        )
      ).toBe(true);
    });
  });

  describe('Syntax error patterns', () => {
    it('should include syntax_error with high severity', () => {
      const pattern = RECOVERY_PATTERNS.find(
        (p) => p.category === 'syntax_error'
      );
      expect(pattern).toBeDefined();
      expect(pattern?.severity).toBe('high');
    });

    it('should match SyntaxError patterns', () => {
      const pattern = RECOVERY_PATTERNS.find(
        (p) => p.category === 'syntax_error'
      );
      expect(
        pattern?.patterns.some((p) => p.test('SyntaxError: Unexpected token'))
      ).toBe(true);
    });

    it('should match unexpected token patterns', () => {
      const pattern = RECOVERY_PATTERNS.find(
        (p) => p.category === 'syntax_error'
      );
      expect(pattern?.patterns.some((p) => p.test('Unexpected token }'))).toBe(
        true
      );
    });
  });

  describe('type compatibility', () => {
    it('should match RecoveryPattern type from recovery-types', () => {
      const pattern: RecoveryPattern = RECOVERY_PATTERNS[0];
      expect(pattern.category).toBeDefined();
      expect(pattern.description).toBeDefined();
      expect(pattern.patterns).toBeDefined();
      expect(pattern.suggestedFix).toBeDefined();
      expect(pattern.severity).toBeDefined();
    });
  });
});
