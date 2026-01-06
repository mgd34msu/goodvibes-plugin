/**
 * Tests for post-tool-use-failure/index.ts
 *
 * Validates that all exports are properly re-exported from the barrel file.
 * This file contains only re-exports, no executable code.
 */

import { describe, it, expect } from 'vitest';
import {
  // recovery-types exports (types)
  type ErrorSeverity,
  type RecoveryPattern,
  // recovery-patterns exports
  RECOVERY_PATTERNS,
  // pattern-matcher exports
  findMatchingPattern,
  findAllMatchingPatterns,
  getHighestSeverity,
  getSuggestedFix,
  // research-hints exports
  getResearchHints,
  // retry-tracker exports
  loadRetries,
  saveRetry,
  getRetryCount,
  getCurrentPhase,
  shouldEscalatePhase,
  escalatePhase,
  hasExhaustedRetries,
  getPhaseDescription,
  getRemainingAttempts,
  generateErrorSignature,
  clearRetry,
  pruneOldRetries,
  getRetryStats,
  type RetryEntry,
  type RetryData,
} from '../../post-tool-use-failure/index.js';

describe('post-tool-use-failure/index', () => {
  describe('re-exports from recovery-types.ts (types)', () => {
    it('should export ErrorSeverity type (via value)', () => {
      const severity: ErrorSeverity = 'high';
      expect(['low', 'medium', 'high', 'critical']).toContain(severity);
    });

    it('should export RecoveryPattern type (via object)', () => {
      const pattern: RecoveryPattern = {
        id: 'test',
        name: 'Test Pattern',
        description: 'A test pattern',
        patterns: [/test/],
        severity: 'low',
        category: 'syntax',
        suggestedFix: 'Fix it',
        researchHints: [],
      };
      expect(pattern.id).toBe('test');
    });
  });

  describe('re-exports from recovery-patterns.ts', () => {
    it('should export RECOVERY_PATTERNS', () => {
      expect(RECOVERY_PATTERNS).toBeDefined();
      expect(Array.isArray(RECOVERY_PATTERNS)).toBe(true);
      expect(RECOVERY_PATTERNS.length).toBeGreaterThan(0);
    });
  });

  describe('re-exports from pattern-matcher.ts', () => {
    it('should export findMatchingPattern', () => {
      expect(findMatchingPattern).toBeDefined();
      expect(typeof findMatchingPattern).toBe('function');
    });

    it('should export findAllMatchingPatterns', () => {
      expect(findAllMatchingPatterns).toBeDefined();
      expect(typeof findAllMatchingPatterns).toBe('function');
    });

    it('should export getHighestSeverity', () => {
      expect(getHighestSeverity).toBeDefined();
      expect(typeof getHighestSeverity).toBe('function');
    });

    it('should export getSuggestedFix', () => {
      expect(getSuggestedFix).toBeDefined();
      expect(typeof getSuggestedFix).toBe('function');
    });
  });

  describe('re-exports from research-hints.ts', () => {
    it('should export getResearchHints', () => {
      expect(getResearchHints).toBeDefined();
      expect(typeof getResearchHints).toBe('function');
    });
  });

  describe('re-exports from retry-tracker.ts', () => {
    it('should export loadRetries', () => {
      expect(loadRetries).toBeDefined();
      expect(typeof loadRetries).toBe('function');
    });

    it('should export saveRetry', () => {
      expect(saveRetry).toBeDefined();
      expect(typeof saveRetry).toBe('function');
    });

    it('should export getRetryCount', () => {
      expect(getRetryCount).toBeDefined();
      expect(typeof getRetryCount).toBe('function');
    });

    it('should export getCurrentPhase', () => {
      expect(getCurrentPhase).toBeDefined();
      expect(typeof getCurrentPhase).toBe('function');
    });

    it('should export shouldEscalatePhase', () => {
      expect(shouldEscalatePhase).toBeDefined();
      expect(typeof shouldEscalatePhase).toBe('function');
    });

    it('should export escalatePhase', () => {
      expect(escalatePhase).toBeDefined();
      expect(typeof escalatePhase).toBe('function');
    });

    it('should export hasExhaustedRetries', () => {
      expect(hasExhaustedRetries).toBeDefined();
      expect(typeof hasExhaustedRetries).toBe('function');
    });

    it('should export getPhaseDescription', () => {
      expect(getPhaseDescription).toBeDefined();
      expect(typeof getPhaseDescription).toBe('function');
    });

    it('should export getRemainingAttempts', () => {
      expect(getRemainingAttempts).toBeDefined();
      expect(typeof getRemainingAttempts).toBe('function');
    });

    it('should export generateErrorSignature', () => {
      expect(generateErrorSignature).toBeDefined();
      expect(typeof generateErrorSignature).toBe('function');
    });

    it('should export clearRetry', () => {
      expect(clearRetry).toBeDefined();
      expect(typeof clearRetry).toBe('function');
    });

    it('should export pruneOldRetries', () => {
      expect(pruneOldRetries).toBeDefined();
      expect(typeof pruneOldRetries).toBe('function');
    });

    it('should export getRetryStats', () => {
      expect(getRetryStats).toBeDefined();
      expect(typeof getRetryStats).toBe('function');
    });

    it('should export RetryEntry type (via object)', () => {
      const entry: RetryEntry = {
        signature: 'test-sig',
        attempts: 1,
        lastAttempt: new Date().toISOString(),
        phase: 1,
      };
      expect(entry.signature).toBe('test-sig');
    });

    it('should export RetryData type (via object)', () => {
      const data: RetryData = {
        'test-sig': {
          signature: 'test-sig',
          attempts: 1,
          lastAttempt: new Date().toISOString(),
          phase: 1,
        },
      };
      expect(data['test-sig'].attempts).toBe(1);
    });
  });
});
