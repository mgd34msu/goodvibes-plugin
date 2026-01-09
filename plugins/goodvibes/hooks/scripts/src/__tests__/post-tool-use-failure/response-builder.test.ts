/**
 * Tests for response-builder.ts
 *
 * Achieves 100% line and branch coverage for:
 * - buildResearchHintsMessage
 * - buildFixLoopResponse
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  buildResearchHintsMessage,
  buildFixLoopResponse,
} from '../../post-tool-use-failure/response-builder.js';

import type { RecoveryPattern } from '../../post-tool-use-failure/recovery-types.js';
import type { ErrorCategory, ErrorState } from '../../types/errors.js';

// Mock retry-tracker module
vi.mock('../../post-tool-use-failure/retry-tracker.js', () => ({
  getPhaseDescription: vi.fn((phase: number) => {
    const descriptions: Record<number, string> = {
      1: 'Initial Fix',
      2: 'Research Official Docs',
      3: 'Community Research',
    };
    return descriptions[phase] ?? 'Unknown Phase';
  }),
  getRemainingAttempts: vi.fn().mockResolvedValue(2),
}));

describe('response-builder', () => {
  describe('buildResearchHintsMessage', () => {
    it('should return empty string for phase 1', () => {
      const hints = {
        official: ['Check TypeScript docs'],
        community: ['Check Stack Overflow'],
      };

      const result = buildResearchHintsMessage(hints, 1);

      expect(result).toBe('');
    });

    it('should include official hints for phase 2', () => {
      const hints = {
        official: ['Check TypeScript docs', 'Read migration guide'],
        community: ['Check Stack Overflow'],
      };

      const result = buildResearchHintsMessage(hints, 2);

      expect(result).toContain('[Phase 2] Search official documentation:');
      expect(result).toContain('  - Check TypeScript docs');
      expect(result).toContain('  - Read migration guide');
      expect(result).not.toContain('[Phase 3]');
      expect(result).not.toContain('Stack Overflow');
    });

    it('should include both official and community hints for phase 3', () => {
      const hints = {
        official: ['Check TypeScript docs'],
        community: ['Check Stack Overflow', 'Search GitHub issues'],
      };

      const result = buildResearchHintsMessage(hints, 3);

      expect(result).toContain('[Phase 2] Search official documentation:');
      expect(result).toContain('  - Check TypeScript docs');
      expect(result).toContain('[Phase 3] Search community solutions:');
      expect(result).toContain('  - Check Stack Overflow');
      expect(result).toContain('  - Search GitHub issues');
    });

    it('should handle empty official hints in phase 2', () => {
      const hints = {
        official: [],
        community: ['Check Stack Overflow'],
      };

      const result = buildResearchHintsMessage(hints, 2);

      expect(result).toBe('');
      expect(result).not.toContain('[Phase 2]');
    });

    it('should handle empty community hints in phase 3', () => {
      const hints = {
        official: ['Check TypeScript docs'],
        community: [],
      };

      const result = buildResearchHintsMessage(hints, 3);

      expect(result).toContain('[Phase 2] Search official documentation:');
      expect(result).toContain('  - Check TypeScript docs');
      expect(result).not.toContain('[Phase 3]');
    });

    it('should handle both empty hints in phase 3', () => {
      const hints = {
        official: [],
        community: [],
      };

      const result = buildResearchHintsMessage(hints, 3);

      expect(result).toBe('');
    });

    it('should handle multiple official hints correctly', () => {
      const hints = {
        official: ['Hint 1', 'Hint 2', 'Hint 3'],
        community: [],
      };

      const result = buildResearchHintsMessage(hints, 2);

      const lines = result.split('\n');
      expect(lines).toHaveLength(4);
      expect(lines[0]).toBe('[Phase 2] Search official documentation:');
      expect(lines[1]).toBe('  - Hint 1');
      expect(lines[2]).toBe('  - Hint 2');
      expect(lines[3]).toBe('  - Hint 3');
    });

    it('should handle multiple community hints correctly in phase 3', () => {
      const hints = {
        official: [],
        community: ['Community 1', 'Community 2'],
      };

      const result = buildResearchHintsMessage(hints, 3);

      const lines = result.split('\n');
      expect(lines).toHaveLength(3);
      expect(lines[0]).toBe('[Phase 3] Search community solutions:');
      expect(lines[1]).toBe('  - Community 1');
      expect(lines[2]).toBe('  - Community 2');
    });
  });

  describe('buildFixLoopResponse', () => {
    let mockErrorState: ErrorState;
    let mockPattern: RecoveryPattern;

    beforeEach(() => {
      mockErrorState = {
        signature: 'test-error-sig',
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

      mockPattern = {
        category: 'typescript_type_error',
        description: 'TypeScript type error',
        patterns: [/TS\d+/],
        suggestedFix: 'Run npx tsc --noEmit',
        severity: 'high',
      };
    });

    it('should build basic response with phase header', async () => {
      const result = await buildFixLoopResponse({
        errorState: mockErrorState,
        retryCount: 0,
        pattern: null,
        category: 'typescript_error',
        suggestedFix: 'Fix the TypeScript error',
        researchHints: '',
        exhausted: false,
      });

      expect(result).toContain('[GoodVibes Fix Loop - Phase 1/3: Initial Fix]');
      expect(result).toContain('Attempt 1 (2 remaining this phase)');
      expect(result).toContain('Category: typescript_error');
      expect(result).toContain('Suggested fix:');
      expect(result).toContain('Fix the TypeScript error');
    });

    it('should include pattern category when pattern is provided', async () => {
      const result = await buildFixLoopResponse({
        errorState: mockErrorState,
        retryCount: 1,
        pattern: mockPattern,
        category: 'typescript_error',
        suggestedFix: 'Fix the TypeScript error',
        researchHints: '',
        exhausted: false,
      });

      expect(result).toContain('Detected: typescript type error');
      expect(result).not.toContain('Category: typescript_error');
    });

    it('should replace underscores with spaces in pattern category', async () => {
      const patternWithUnderscores: RecoveryPattern = {
        ...mockPattern,
        category: 'missing_import_error',
      };

      const result = await buildFixLoopResponse({
        errorState: mockErrorState,
        retryCount: 0,
        pattern: patternWithUnderscores,
        category: 'npm_install',
        suggestedFix: 'Install the missing package',
        researchHints: '',
        exhausted: false,
      });

      expect(result).toContain('Detected: missing import error');
    });

    it('should include research hints when provided', async () => {
      mockErrorState.phase = 2;

      const result = await buildFixLoopResponse({
        errorState: mockErrorState,
        retryCount: 1,
        pattern: null,
        category: 'typescript_error',
        suggestedFix: 'Fix the TypeScript error',
        researchHints: '[Phase 2] Search official documentation:\n  - Check TypeScript docs',
        exhausted: false,
      });

      expect(result).toContain('[Phase 2] Search official documentation:');
      expect(result).toContain('  - Check TypeScript docs');
    });

    it('should not include research hints section when hints are empty', async () => {
      const result = await buildFixLoopResponse({
        errorState: mockErrorState,
        retryCount: 0,
        pattern: null,
        category: 'typescript_error',
        suggestedFix: 'Fix the error',
        researchHints: '',
        exhausted: false,
      });

      const lines = result.split('\n');
      // Should not have double empty lines from missing research hints
      expect(result).not.toContain('\n\n\n');
    });

    it('should include previous attempts when fixStrategiesAttempted is not empty', async () => {
      mockErrorState.fixStrategiesAttempted = [
        {
          phase: 1,
          strategy: 'Updated type annotation',
          succeeded: false,
          timestamp: '2024-01-01T00:00:00Z',
        },
        {
          phase: 1,
          strategy: 'Added type guard',
          succeeded: false,
          timestamp: '2024-01-01T00:01:00Z',
        },
      ];

      const result = await buildFixLoopResponse({
        errorState: mockErrorState,
        retryCount: 2,
        pattern: null,
        category: 'typescript_error',
        suggestedFix: 'Try a different approach',
        researchHints: '',
        exhausted: false,
      });

      expect(result).toContain('Previously attempted (failed):');
      expect(result).toContain('  - Updated type annotation');
      expect(result).toContain('  - Added type guard');
      expect(result).toContain('Try a DIFFERENT approach.');
    });

    it('should only show last 3 attempts when more than 3 strategies attempted', async () => {
      mockErrorState.fixStrategiesAttempted = [
        { phase: 1, strategy: 'Strategy 1', succeeded: false, timestamp: '2024-01-01T00:00:00Z' },
        { phase: 1, strategy: 'Strategy 2', succeeded: false, timestamp: '2024-01-01T00:01:00Z' },
        { phase: 1, strategy: 'Strategy 3', succeeded: false, timestamp: '2024-01-01T00:02:00Z' },
        { phase: 2, strategy: 'Strategy 4', succeeded: false, timestamp: '2024-01-01T00:03:00Z' },
        { phase: 2, strategy: 'Strategy 5', succeeded: false, timestamp: '2024-01-01T00:04:00Z' },
      ];

      const result = await buildFixLoopResponse({
        errorState: mockErrorState,
        retryCount: 5,
        pattern: null,
        category: 'typescript_error',
        suggestedFix: 'Try a different approach',
        researchHints: '',
        exhausted: false,
      });

      expect(result).toContain('Previously attempted (failed):');
      expect(result).not.toContain('  - Strategy 1');
      expect(result).not.toContain('  - Strategy 2');
      expect(result).toContain('  - Strategy 3');
      expect(result).toContain('  - Strategy 4');
      expect(result).toContain('  - Strategy 5');
    });

    it('should include exhaustion warning when exhausted is true', async () => {
      mockErrorState.phase = 3;

      const result = await buildFixLoopResponse({
        errorState: mockErrorState,
        retryCount: 10,
        pattern: null,
        category: 'typescript_error',
        suggestedFix: 'Final attempt',
        researchHints: '',
        exhausted: true,
      });

      expect(result).toContain('[WARNING] All fix phases exhausted. Consider:');
      expect(result).toContain('  - Manual debugging');
      expect(result).toContain('  - Asking the user for help');
      expect(result).toContain('  - Reverting recent changes');
    });

    it('should not include exhaustion warning when exhausted is false', async () => {
      const result = await buildFixLoopResponse({
        errorState: mockErrorState,
        retryCount: 1,
        pattern: null,
        category: 'typescript_error',
        suggestedFix: 'Fix the error',
        researchHints: '',
        exhausted: false,
      });

      expect(result).not.toContain('[WARNING] All fix phases exhausted');
    });

    it('should handle phase 2 correctly', async () => {
      mockErrorState.phase = 2;

      const result = await buildFixLoopResponse({
        errorState: mockErrorState,
        retryCount: 3,
        pattern: null,
        category: 'build_failure',
        suggestedFix: 'Check build configuration',
        researchHints: '',
        exhausted: false,
      });

      expect(result).toContain('[GoodVibes Fix Loop - Phase 2/3: Research Official Docs]');
      expect(result).toContain('Category: build_failure');
    });

    it('should handle phase 3 correctly', async () => {
      mockErrorState.phase = 3;

      const result = await buildFixLoopResponse({
        errorState: mockErrorState,
        retryCount: 6,
        pattern: null,
        category: 'api_error',
        suggestedFix: 'Check API endpoint',
        researchHints: '[Phase 3] Search community solutions:\n  - Check GitHub issues',
        exhausted: false,
      });

      expect(result).toContain('[GoodVibes Fix Loop - Phase 3/3: Community Research]');
      expect(result).toContain('[Phase 3] Search community solutions:');
    });

    it('should format complete response with all sections', async () => {
      mockErrorState.phase = 2;
      mockErrorState.fixStrategiesAttempted = [
        { phase: 1, strategy: 'Initial fix attempt', succeeded: false, timestamp: '2024-01-01T00:00:00Z' },
      ];

      const result = await buildFixLoopResponse({
        errorState: mockErrorState,
        retryCount: 2,
        pattern: mockPattern,
        category: 'typescript_error',
        suggestedFix: 'Run npx tsc --noEmit',
        researchHints: '[Phase 2] Search official documentation:\n  - TypeScript handbook',
        exhausted: false,
      });

      // Verify all sections are present and in order
      const phaseHeaderIndex = result.indexOf('[GoodVibes Fix Loop - Phase 2/3');
      const attemptIndex = result.indexOf('Attempt 3');
      const detectedIndex = result.indexOf('Detected: typescript type error');
      const suggestedIndex = result.indexOf('Suggested fix:');
      const researchIndex = result.indexOf('[Phase 2] Search official documentation');
      const previousIndex = result.indexOf('Previously attempted (failed):');

      expect(phaseHeaderIndex).toBeLessThan(attemptIndex);
      expect(attemptIndex).toBeLessThan(detectedIndex);
      expect(detectedIndex).toBeLessThan(suggestedIndex);
      expect(suggestedIndex).toBeLessThan(researchIndex);
      expect(researchIndex).toBeLessThan(previousIndex);
    });

    it('should handle empty fixStrategiesAttempted array', async () => {
      mockErrorState.fixStrategiesAttempted = [];

      const result = await buildFixLoopResponse({
        errorState: mockErrorState,
        retryCount: 0,
        pattern: null,
        category: 'npm_install',
        suggestedFix: 'Run npm install',
        researchHints: '',
        exhausted: false,
      });

      expect(result).not.toContain('Previously attempted');
      expect(result).not.toContain('Try a DIFFERENT approach');
    });

    it('should show exactly one previous attempt when only one exists', async () => {
      mockErrorState.fixStrategiesAttempted = [
        { phase: 1, strategy: 'Only one attempt', succeeded: false, timestamp: '2024-01-01T00:00:00Z' },
      ];

      const result = await buildFixLoopResponse({
        errorState: mockErrorState,
        retryCount: 1,
        pattern: null,
        category: 'test_failure',
        suggestedFix: 'Fix the test',
        researchHints: '',
        exhausted: false,
      });

      expect(result).toContain('Previously attempted (failed):');
      expect(result).toContain('  - Only one attempt');
      expect(result).toContain('Try a DIFFERENT approach.');
    });

    it('should handle different error categories', async () => {
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

      for (const category of categories) {
        const result = await buildFixLoopResponse({
          errorState: { ...mockErrorState, category },
          retryCount: 0,
          pattern: null,
          category,
          suggestedFix: 'Fix the error',
          researchHints: '',
          exhausted: false,
        });

        expect(result).toContain(`Category: ${category}`);
      }
    });

    it('should handle high retry count', async () => {
      const result = await buildFixLoopResponse({
        errorState: mockErrorState,
        retryCount: 99,
        pattern: null,
        category: 'unknown',
        suggestedFix: 'Keep trying',
        researchHints: '',
        exhausted: false,
      });

      expect(result).toContain('Attempt 100');
    });

    it('should combine exhausted warning with previous attempts', async () => {
      mockErrorState.phase = 3;
      mockErrorState.fixStrategiesAttempted = [
        { phase: 3, strategy: 'Last resort fix', succeeded: false, timestamp: '2024-01-01T00:00:00Z' },
      ];

      const result = await buildFixLoopResponse({
        errorState: mockErrorState,
        retryCount: 9,
        pattern: null,
        category: 'build_failure',
        suggestedFix: 'Final attempt',
        researchHints: '',
        exhausted: true,
      });

      expect(result).toContain('Previously attempted (failed):');
      expect(result).toContain('  - Last resort fix');
      expect(result).toContain('Try a DIFFERENT approach.');
      expect(result).toContain('[WARNING] All fix phases exhausted. Consider:');

      // Verify order: previous attempts come before exhaustion warning
      const previousIndex = result.indexOf('Previously attempted (failed):');
      const warningIndex = result.indexOf('[WARNING] All fix phases exhausted');
      expect(previousIndex).toBeLessThan(warningIndex);
    });

    it('should handle pattern with spaces in category already', async () => {
      const patternWithSpaces: RecoveryPattern = {
        category: 'no underscores here',
        description: 'Test pattern',
        patterns: [/test/],
        suggestedFix: 'Fix it',
        severity: 'low',
      };

      const result = await buildFixLoopResponse({
        errorState: mockErrorState,
        retryCount: 0,
        pattern: patternWithSpaces,
        category: 'unknown',
        suggestedFix: 'Fix it',
        researchHints: '',
        exhausted: false,
      });

      expect(result).toContain('Detected: no underscores here');
    });

    it('should include exactly 3 previous attempts when exactly 3 exist', async () => {
      mockErrorState.fixStrategiesAttempted = [
        { phase: 1, strategy: 'Strategy A', succeeded: false, timestamp: '2024-01-01T00:00:00Z' },
        { phase: 1, strategy: 'Strategy B', succeeded: false, timestamp: '2024-01-01T00:01:00Z' },
        { phase: 1, strategy: 'Strategy C', succeeded: false, timestamp: '2024-01-01T00:02:00Z' },
      ];

      const result = await buildFixLoopResponse({
        errorState: mockErrorState,
        retryCount: 3,
        pattern: null,
        category: 'typescript_error',
        suggestedFix: 'Try something new',
        researchHints: '',
        exhausted: false,
      });

      expect(result).toContain('  - Strategy A');
      expect(result).toContain('  - Strategy B');
      expect(result).toContain('  - Strategy C');
    });
  });
});
