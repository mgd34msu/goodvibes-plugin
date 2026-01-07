/**
 * Tests for research hints module
 *
 * Comprehensive coverage for all exported functions, error paths, and edge cases.
 */

import { describe, it, expect } from 'vitest';
import { getResearchHints } from '../../post-tool-use-failure/research-hints.js';
import type { ErrorCategory } from '../../types/errors.js';

describe('getResearchHints', () => {
  describe('phase 1 - no hints', () => {
    it('should return empty hints for npm_install in phase 1', () => {
      const result = getResearchHints('npm_install', 'npm install failed', 1);
      expect(result.official).toEqual([]);
      expect(result.community).toEqual([]);
    });

    it('should return empty hints for typescript_error in phase 1', () => {
      const result = getResearchHints('typescript_error', 'Type error', 1);
      expect(result.official).toEqual([]);
      expect(result.community).toEqual([]);
    });

    it('should return empty hints for test_failure in phase 1', () => {
      const result = getResearchHints('test_failure', 'Test failed', 1);
      expect(result.official).toEqual([]);
      expect(result.community).toEqual([]);
    });

    it('should return empty hints for build_failure in phase 1', () => {
      const result = getResearchHints('build_failure', 'Build failed', 1);
      expect(result.official).toEqual([]);
      expect(result.community).toEqual([]);
    });

    it('should return empty hints for file_not_found in phase 1', () => {
      const result = getResearchHints('file_not_found', 'File not found', 1);
      expect(result.official).toEqual([]);
      expect(result.community).toEqual([]);
    });

    it('should return empty hints for git_conflict in phase 1', () => {
      const result = getResearchHints('git_conflict', 'Git conflict', 1);
      expect(result.official).toEqual([]);
      expect(result.community).toEqual([]);
    });

    it('should return empty hints for database_error in phase 1', () => {
      const result = getResearchHints('database_error', 'Database error', 1);
      expect(result.official).toEqual([]);
      expect(result.community).toEqual([]);
    });

    it('should return empty hints for api_error in phase 1', () => {
      const result = getResearchHints('api_error', 'API error', 1);
      expect(result.official).toEqual([]);
      expect(result.community).toEqual([]);
    });

    it('should return empty hints for unknown category in phase 1', () => {
      const result = getResearchHints('unknown', 'Unknown error', 1);
      expect(result.official).toEqual([]);
      expect(result.community).toEqual([]);
    });
  });

  describe('phase 2 - official documentation hints', () => {
    it('should return official hints for npm_install in phase 2', () => {
      const result = getResearchHints('npm_install', 'npm install failed', 2);
      expect(result.official).toEqual([
        'npmjs.com documentation',
        'package changelog',
      ]);
      expect(result.community).toEqual([]);
    });

    it('should return official hints for typescript_error in phase 2', () => {
      const result = getResearchHints('typescript_error', 'Type error', 2);
      expect(result.official).toEqual([
        'typescriptlang.org error reference',
        'typescript handbook',
      ]);
      expect(result.community).toEqual([]);
    });

    it('should return official hints for test_failure in phase 2', () => {
      const result = getResearchHints('test_failure', 'Test failed', 2);
      expect(result.official).toEqual([
        'vitest.dev/guide',
        'jestjs.io/docs',
        'testing-library.com',
      ]);
      expect(result.community).toEqual([]);
    });

    it('should return official hints for build_failure in phase 2', () => {
      const result = getResearchHints('build_failure', 'Build failed', 2);
      expect(result.official).toEqual([
        'vite.dev/guide',
        'webpack.js.org',
        'next.js docs',
      ]);
      expect(result.community).toEqual([]);
    });

    it('should return empty official hints for file_not_found in phase 2', () => {
      const result = getResearchHints('file_not_found', 'File not found', 2);
      expect(result.official).toEqual([]);
      expect(result.community).toEqual([]);
    });

    it('should return official hints for git_conflict in phase 2', () => {
      const result = getResearchHints('git_conflict', 'Git conflict', 2);
      expect(result.official).toEqual(['git-scm.com documentation']);
      expect(result.community).toEqual([]);
    });

    it('should return official hints for database_error in phase 2', () => {
      const result = getResearchHints('database_error', 'Database error', 2);
      expect(result.official).toEqual([
        'prisma.io/docs',
        'database provider docs',
      ]);
      expect(result.community).toEqual([]);
    });

    it('should return official hints for api_error in phase 2', () => {
      const result = getResearchHints('api_error', 'API error', 2);
      expect(result.official).toEqual([
        'API provider documentation',
        'MDN fetch API',
      ]);
      expect(result.community).toEqual([]);
    });

    it('should return official hints for unknown category in phase 2', () => {
      const result = getResearchHints('unknown', 'Unknown error', 2);
      expect(result.official).toEqual(['MDN JavaScript reference']);
      expect(result.community).toEqual([]);
    });
  });

  describe('phase 3 - official and community hints', () => {
    it('should return both official and community hints for npm_install in phase 3', () => {
      const result = getResearchHints('npm_install', 'npm install failed', 3);
      expect(result.official).toEqual([
        'npmjs.com documentation',
        'package changelog',
      ]);
      expect(result.community).toEqual([
        'stackoverflow npm',
        'github npm issues',
      ]);
    });

    it('should return both official and community hints for typescript_error in phase 3', () => {
      const result = getResearchHints('typescript_error', 'Type error', 3);
      expect(result.official).toEqual([
        'typescriptlang.org error reference',
        'typescript handbook',
      ]);
      expect(result.community).toEqual([
        'stackoverflow typescript',
        'github typescript discussions',
      ]);
    });

    it('should return both official and community hints for test_failure in phase 3', () => {
      const result = getResearchHints('test_failure', 'Test failed', 3);
      expect(result.official).toEqual([
        'vitest.dev/guide',
        'jestjs.io/docs',
        'testing-library.com',
      ]);
      expect(result.community).toEqual([
        'stackoverflow testing',
        'github testing framework issues',
      ]);
    });

    it('should return both official and community hints for build_failure in phase 3', () => {
      const result = getResearchHints('build_failure', 'Build failed', 3);
      expect(result.official).toEqual([
        'vite.dev/guide',
        'webpack.js.org',
        'next.js docs',
      ]);
      expect(result.community).toEqual([
        'stackoverflow build errors',
        'github build tool issues',
      ]);
    });

    it('should return empty hints for file_not_found in phase 3', () => {
      const result = getResearchHints('file_not_found', 'File not found', 3);
      expect(result.official).toEqual([]);
      expect(result.community).toEqual([]);
    });

    it('should return both official and community hints for git_conflict in phase 3', () => {
      const result = getResearchHints('git_conflict', 'Git conflict', 3);
      expect(result.official).toEqual(['git-scm.com documentation']);
      expect(result.community).toEqual(['stackoverflow git']);
    });

    it('should return both official and community hints for database_error in phase 3', () => {
      const result = getResearchHints('database_error', 'Database error', 3);
      expect(result.official).toEqual([
        'prisma.io/docs',
        'database provider docs',
      ]);
      expect(result.community).toEqual([
        'stackoverflow database errors',
        'github ORM issues',
      ]);
    });

    it('should return both official and community hints for api_error in phase 3', () => {
      const result = getResearchHints('api_error', 'API error', 3);
      expect(result.official).toEqual([
        'API provider documentation',
        'MDN fetch API',
      ]);
      expect(result.community).toEqual(['stackoverflow API errors']);
    });

    it('should return both official and community hints for unknown category in phase 3', () => {
      const result = getResearchHints('unknown', 'Unknown error', 3);
      expect(result.official).toEqual(['MDN JavaScript reference']);
      expect(result.community).toEqual(['stackoverflow null undefined']);
    });
  });

  describe('edge cases', () => {
    it('should handle empty error message', () => {
      const result = getResearchHints('typescript_error', '', 2);
      expect(result.official).toEqual([
        'typescriptlang.org error reference',
        'typescript handbook',
      ]);
      expect(result.community).toEqual([]);
    });

    it('should handle very long error message', () => {
      const longMessage = 'a'.repeat(10000);
      const result = getResearchHints('npm_install', longMessage, 3);
      expect(result.official).toEqual([
        'npmjs.com documentation',
        'package changelog',
      ]);
      expect(result.community).toEqual([
        'stackoverflow npm',
        'github npm issues',
      ]);
    });

    it('should return independent arrays for official and community hints', () => {
      const result = getResearchHints('test_failure', 'test error', 3);
      // Mutate one array
      result.official.push('modified');

      // Get fresh result
      const result2 = getResearchHints('test_failure', 'test error', 3);
      expect(result2.official).not.toContain('modified');
      expect(result2.official).toEqual([
        'vitest.dev/guide',
        'jestjs.io/docs',
        'testing-library.com',
      ]);
    });

    it('should return independent arrays even when called multiple times', () => {
      const result1 = getResearchHints('build_failure', 'error', 2);
      const result2 = getResearchHints('build_failure', 'error', 2);

      result1.official.push('test');
      expect(result2.official).not.toContain('test');
    });
  });

  describe('all error categories coverage', () => {
    const allCategories: ErrorCategory[] = [
      'npm_install',
      'typescript_error',
      'test_failure',
      'build_failure',
      'file_not_found',
      'git_conflict',
      'database_error',
      'api_error',
      'unknown',
    ];

    it.each(allCategories)(
      'should handle %s category in all phases',
      (category) => {
        const phase1 = getResearchHints(category, 'error', 1);
        const phase2 = getResearchHints(category, 'error', 2);
        const phase3 = getResearchHints(category, 'error', 3);

        expect(phase1).toHaveProperty('official');
        expect(phase1).toHaveProperty('community');
        expect(phase2).toHaveProperty('official');
        expect(phase2).toHaveProperty('community');
        expect(phase3).toHaveProperty('official');
        expect(phase3).toHaveProperty('community');

        expect(Array.isArray(phase1.official)).toBe(true);
        expect(Array.isArray(phase1.community)).toBe(true);
        expect(Array.isArray(phase2.official)).toBe(true);
        expect(Array.isArray(phase2.community)).toBe(true);
        expect(Array.isArray(phase3.official)).toBe(true);
        expect(Array.isArray(phase3.community)).toBe(true);
      }
    );
  });

  describe('phase progression', () => {
    it('should not include community hints before phase 3', () => {
      const categories: ErrorCategory[] = [
        'npm_install',
        'typescript_error',
        'test_failure',
        'build_failure',
        'git_conflict',
        'database_error',
        'api_error',
      ];

      categories.forEach((category) => {
        const phase1 = getResearchHints(category, 'error', 1);
        const phase2 = getResearchHints(category, 'error', 2);

        expect(phase1.community).toEqual([]);
        expect(phase2.community).toEqual([]);
      });
    });

    it('should progressively add hints from phase 1 to 2 to 3', () => {
      const category: ErrorCategory = 'typescript_error';
      const phase1 = getResearchHints(category, 'error', 1);
      const phase2 = getResearchHints(category, 'error', 2);
      const phase3 = getResearchHints(category, 'error', 3);

      // Phase 1: no hints
      expect(phase1.official.length).toBe(0);
      expect(phase1.community.length).toBe(0);

      // Phase 2: official hints added
      expect(phase2.official.length).toBeGreaterThan(0);
      expect(phase2.community.length).toBe(0);

      // Phase 3: community hints added
      expect(phase3.official.length).toBeGreaterThan(0);
      expect(phase3.community.length).toBeGreaterThan(0);
      expect(phase3.official).toEqual(phase2.official);
    });
  });

  describe('return value structure', () => {
    it('should always return object with official and community arrays', () => {
      const result = getResearchHints('npm_install', 'error', 1);

      expect(result).toBeTypeOf('object');
      expect(result).toHaveProperty('official');
      expect(result).toHaveProperty('community');
      expect(Array.isArray(result.official)).toBe(true);
      expect(Array.isArray(result.community)).toBe(true);
    });

    it('should return string arrays for both properties', () => {
      const result = getResearchHints('typescript_error', 'error', 3);

      result.official.forEach((hint) => {
        expect(typeof hint).toBe('string');
      });

      result.community.forEach((hint) => {
        expect(typeof hint).toBe('string');
      });
    });

    it('should never return null or undefined', () => {
      const categories: ErrorCategory[] = [
        'npm_install',
        'typescript_error',
        'test_failure',
        'build_failure',
        'file_not_found',
        'git_conflict',
        'database_error',
        'api_error',
        'unknown',
      ];

      categories.forEach((category) => {
        [1, 2, 3].forEach((phase) => {
          const result = getResearchHints(
            category,
            'error',
            phase as 1 | 2 | 3
          );
          expect(result).not.toBeNull();
          expect(result).not.toBeUndefined();
          expect(result.official).not.toBeNull();
          expect(result.official).not.toBeUndefined();
          expect(result.community).not.toBeNull();
          expect(result.community).not.toBeUndefined();
        });
      });
    });
  });

  describe('error message parameter', () => {
    it('should accept any string as error message without throwing', () => {
      const testMessages = [
        '',
        'simple error',
        'Error: Something went wrong',
        'Multi\nline\nerror',
        '特殊文字 🚀',
        'a'.repeat(1000),
        '\t\n\r',
        '{"json": "error"}',
        '<xml>error</xml>',
      ];

      testMessages.forEach((message) => {
        expect(() => {
          getResearchHints('npm_install', message, 2);
        }).not.toThrow();
      });
    });

    it('should produce same output regardless of error message content', () => {
      const messages = ['error1', 'error2', 'completely different error'];
      const results = messages.map((msg) =>
        getResearchHints('typescript_error', msg, 2)
      );

      // All results should be identical since error message is not used
      results.forEach((result) => {
        expect(result).toEqual(results[0]);
      });
    });
  });

  describe('fallback behavior - defensive coding', () => {
    it('should handle unmapped ErrorCategory gracefully (line 119 and 120 fallbacks)', () => {
      // Test BOTH fallbacks:
      // Line 119: category not in CATEGORY_TO_HINT_MAP -> defaults to 'unknown'
      // Line 120: 'unknown' not in RESEARCH_HINTS -> defaults to generic hints
      const invalidCategory = 'not_a_real_category' as unknown as ErrorCategory;
      const result = getResearchHints(invalidCategory, 'error', 2);

      // Should use the default hints from line 120 fallback
      expect(result.official).toEqual(['official documentation']);
      expect(result.community).toEqual([]);
    });

    it('should handle unmapped ErrorCategory in phase 3 (line 119 and 120 fallbacks)', () => {
      // Test BOTH fallbacks:
      // Line 119: category not in CATEGORY_TO_HINT_MAP -> defaults to 'unknown'
      // Line 120: 'unknown' not in RESEARCH_HINTS -> defaults to generic hints
      const invalidCategory = 'totally_invalid' as unknown as ErrorCategory;
      const result = getResearchHints(invalidCategory, 'error', 3);

      // Should use the default hints from line 120 fallback
      expect(result.official).toEqual(['official documentation']);
      expect(result.community).toEqual(['stackoverflow', 'github issues']);
    });

    it('should handle unmapped ErrorCategory in phase 1 (line 119 falsy branch)', () => {
      const invalidCategory = 'bad_category' as unknown as ErrorCategory;
      const result = getResearchHints(invalidCategory, 'error', 1);

      // Phase 1 should return empty arrays regardless
      expect(result.official).toEqual([]);
      expect(result.community).toEqual([]);
    });

    it('should handle null category gracefully', () => {
      // Test with null/undefined category
      const nullCategory = null as unknown as ErrorCategory;
      const result = getResearchHints(nullCategory, 'error', 2);

      // Should fall back to default hints
      expect(result).toBeDefined();
      expect(result.official).toBeDefined();
      expect(result.community).toBeDefined();
      expect(Array.isArray(result.official)).toBe(true);
      expect(Array.isArray(result.community)).toBe(true);
    });

    it('should handle undefined category gracefully', () => {
      const undefinedCategory = undefined as unknown as ErrorCategory;
      const result = getResearchHints(undefinedCategory, 'error', 3);

      // Should fall back to default hints
      expect(result).toBeDefined();
      expect(result.official).toBeDefined();
      expect(result.community).toBeDefined();
      expect(Array.isArray(result.official)).toBe(true);
      expect(Array.isArray(result.community)).toBe(true);
    });

    it('should handle empty string category gracefully', () => {
      const emptyCategory = '' as unknown as ErrorCategory;
      const result = getResearchHints(emptyCategory, 'error', 2);

      // Should fall back through both levels of defaults
      expect(result).toBeDefined();
      expect(result.official).toBeDefined();
      expect(result.community).toBeDefined();
      expect(Array.isArray(result.official)).toBe(true);
      expect(Array.isArray(result.community)).toBe(true);
    });
  });
});
