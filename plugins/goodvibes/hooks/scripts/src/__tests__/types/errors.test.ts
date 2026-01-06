/**
 * Tests for types/errors.ts
 *
 * Tests cover:
 * - ErrorCategory type values
 * - ErrorState interface structure
 * - PHASE_RETRY_LIMITS constant
 */

import { describe, it, expect } from 'vitest';
import {
  PHASE_RETRY_LIMITS,
  type ErrorCategory,
  type ErrorState,
} from '../../types/errors.js';

describe('types/errors', () => {
  describe('PHASE_RETRY_LIMITS', () => {
    it('should define retry limits for all error categories', () => {
      expect(PHASE_RETRY_LIMITS).toBeDefined();
      expect(typeof PHASE_RETRY_LIMITS).toBe('object');
    });

    it('should have retry limit for npm_install', () => {
      expect(PHASE_RETRY_LIMITS.npm_install).toBe(2);
    });

    it('should have retry limit for typescript_error', () => {
      expect(PHASE_RETRY_LIMITS.typescript_error).toBe(3);
    });

    it('should have retry limit for test_failure', () => {
      expect(PHASE_RETRY_LIMITS.test_failure).toBe(2);
    });

    it('should have retry limit for build_failure', () => {
      expect(PHASE_RETRY_LIMITS.build_failure).toBe(2);
    });

    it('should have retry limit for file_not_found', () => {
      expect(PHASE_RETRY_LIMITS.file_not_found).toBe(1);
    });

    it('should have retry limit for git_conflict', () => {
      expect(PHASE_RETRY_LIMITS.git_conflict).toBe(2);
    });

    it('should have retry limit for database_error', () => {
      expect(PHASE_RETRY_LIMITS.database_error).toBe(2);
    });

    it('should have retry limit for api_error', () => {
      expect(PHASE_RETRY_LIMITS.api_error).toBe(2);
    });

    it('should have retry limit for unknown', () => {
      expect(PHASE_RETRY_LIMITS.unknown).toBe(2);
    });

    it('should have exactly 9 error categories', () => {
      const categories = Object.keys(PHASE_RETRY_LIMITS);
      expect(categories).toHaveLength(9);
    });

    it('should have all values as positive numbers', () => {
      for (const [category, limit] of Object.entries(PHASE_RETRY_LIMITS)) {
        expect(typeof limit).toBe('number');
        expect(limit).toBeGreaterThan(0);
      }
    });

    it('should have file_not_found with lowest retry limit', () => {
      const limits = Object.values(PHASE_RETRY_LIMITS);
      const minLimit = Math.min(...limits);

      expect(PHASE_RETRY_LIMITS.file_not_found).toBe(minLimit);
    });

    it('should have typescript_error with highest retry limit', () => {
      const limits = Object.values(PHASE_RETRY_LIMITS);
      const maxLimit = Math.max(...limits);

      expect(PHASE_RETRY_LIMITS.typescript_error).toBe(maxLimit);
    });
  });

  describe('ErrorCategory type', () => {
    it('should accept valid error category values', () => {
      // These assignments should compile without error
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

      expect(categories).toHaveLength(9);
      categories.forEach((cat) => {
        expect(PHASE_RETRY_LIMITS[cat]).toBeDefined();
      });
    });
  });

  describe('ErrorState interface', () => {
    it('should accept a valid ErrorState object', () => {
      const errorState: ErrorState = {
        signature: 'test-signature-123',
        category: 'typescript_error',
        phase: 1,
        attemptsThisPhase: 1,
        totalAttempts: 1,
        officialDocsSearched: [],
        officialDocsContent: '',
        unofficialDocsSearched: [],
        unofficialDocsContent: '',
        fixStrategiesAttempted: [],
      };

      expect(errorState.signature).toBe('test-signature-123');
      expect(errorState.category).toBe('typescript_error');
      expect(errorState.phase).toBe(1);
    });

    it('should accept ErrorState with phase 2', () => {
      const errorState: ErrorState = {
        signature: 'phase-2-error',
        category: 'build_failure',
        phase: 2,
        attemptsThisPhase: 2,
        totalAttempts: 5,
        officialDocsSearched: ['https://docs.example.com'],
        officialDocsContent: 'Some documentation content',
        unofficialDocsSearched: [],
        unofficialDocsContent: '',
        fixStrategiesAttempted: [
          {
            phase: 1,
            strategy: 'retry',
            succeeded: false,
            timestamp: '2025-01-01T00:00:00Z',
          },
        ],
      };

      expect(errorState.phase).toBe(2);
      expect(errorState.officialDocsSearched).toHaveLength(1);
      expect(errorState.fixStrategiesAttempted).toHaveLength(1);
    });

    it('should accept ErrorState with phase 3', () => {
      const errorState: ErrorState = {
        signature: 'phase-3-error',
        category: 'api_error',
        phase: 3,
        attemptsThisPhase: 1,
        totalAttempts: 8,
        officialDocsSearched: ['https://docs.example.com'],
        officialDocsContent: 'Official docs',
        unofficialDocsSearched: ['https://stackoverflow.com/q/123'],
        unofficialDocsContent: 'Community solution',
        fixStrategiesAttempted: [
          {
            phase: 1,
            strategy: 'retry',
            succeeded: false,
            timestamp: '2025-01-01T00:00:00Z',
          },
          {
            phase: 2,
            strategy: 'apply-docs-fix',
            succeeded: false,
            timestamp: '2025-01-01T01:00:00Z',
          },
        ],
      };

      expect(errorState.phase).toBe(3);
      expect(errorState.unofficialDocsSearched).toHaveLength(1);
      expect(errorState.fixStrategiesAttempted).toHaveLength(2);
    });

    it('should track fix strategies with success status', () => {
      const errorState: ErrorState = {
        signature: 'success-tracking',
        category: 'test_failure',
        phase: 1,
        attemptsThisPhase: 0,
        totalAttempts: 2,
        officialDocsSearched: [],
        officialDocsContent: '',
        unofficialDocsSearched: [],
        unofficialDocsContent: '',
        fixStrategiesAttempted: [
          {
            phase: 1,
            strategy: 'initial-fix',
            succeeded: false,
            timestamp: '2025-01-01T00:00:00Z',
          },
          {
            phase: 1,
            strategy: 'second-attempt',
            succeeded: true,
            timestamp: '2025-01-01T00:05:00Z',
          },
        ],
      };

      const successfulFix = errorState.fixStrategiesAttempted.find(
        (f) => f.succeeded
      );
      expect(successfulFix).toBeDefined();
      expect(successfulFix?.strategy).toBe('second-attempt');
    });
  });
});
