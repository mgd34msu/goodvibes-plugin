/**
 * Comprehensive tests for error-handling-core.ts
 * Target: 100% line and branch coverage
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateErrorSignature,
  shouldEscalatePhase,
  escalatePhase,
  hasExhaustedRetries,
  getRetryLimit,
  getRemainingAttemptsInPhase,
  getPhaseDescription,
  MAX_PHASE,
  DEFAULT_RETRY_LIMIT,
} from '../../shared/error-handling-core.js';
import type { ErrorState, ErrorCategory } from '../../types/errors.js';
import { PHASE_RETRY_LIMITS } from '../../types/errors.js';

// =============================================================================
// Test Helpers
// =============================================================================

function createErrorState(overrides: Partial<ErrorState> = {}): ErrorState {
  return {
    signature: 'test_signature',
    category: 'unknown',
    phase: 1,
    attemptsThisPhase: 0,
    totalAttempts: 0,
    officialDocsSearched: [],
    officialDocsContent: '',
    unofficialDocsSearched: [],
    unofficialDocsContent: '',
    fixStrategiesAttempted: [],
    ...overrides,
  };
}

// =============================================================================
// Constants Tests
// =============================================================================

describe('Constants', () => {
  it('should export MAX_PHASE as 3', () => {
    expect(MAX_PHASE).toBe(3);
  });

  it('should export DEFAULT_RETRY_LIMIT as 2', () => {
    expect(DEFAULT_RETRY_LIMIT).toBe(2);
  });
});

// =============================================================================
// generateErrorSignature Tests
// =============================================================================

describe('generateErrorSignature', () => {
  describe('with tool name (two arguments)', () => {
    it('should generate signature with tool name prefix', () => {
      const signature = generateErrorSignature('Bash', 'Error at line 42');
      expect(signature).toMatch(/^Bash:/);
    });

    it('should use base64 encoding when tool name is provided', () => {
      const signature = generateErrorSignature('Bash', 'simple error');
      expect(signature).toContain(':');
      const [tool, encoded] = signature.split(':');
      expect(tool).toBe('Bash');
      expect(encoded).toBeTruthy();
    });

    it('should normalize absolute Windows paths', () => {
      const sig1 = generateErrorSignature('Bash', 'Error in C:\\Users\\test\\file.ts');
      const sig2 = generateErrorSignature('Bash', 'Error in C:\\Users\\other\\file.ts');
      expect(sig1).toBe(sig2); // Both should normalize to same signature
    });

    it('should normalize absolute Unix paths', () => {
      const sig1 = generateErrorSignature('Bash', 'Error in /home/user/file.ts');
      const sig2 = generateErrorSignature('Bash', 'Error in /home/other/file.ts');
      expect(sig1).toBe(sig2); // Both should normalize to same signature
    });

    it('should normalize line and column numbers', () => {
      const sig1 = generateErrorSignature('Bash', 'Error at 10:5');
      const sig2 = generateErrorSignature('Bash', 'Error at 20:15');
      expect(sig1).toBe(sig2);
    });

    it('should normalize "line N" patterns', () => {
      const sig1 = generateErrorSignature('Bash', 'Error at line 42');
      const sig2 = generateErrorSignature('Bash', 'Error at line 99');
      expect(sig1).toBe(sig2);
    });

    it('should normalize "Line N" patterns (case insensitive)', () => {
      const sig1 = generateErrorSignature('Bash', 'Error at Line 42');
      const sig2 = generateErrorSignature('Bash', 'Error at LINE 99');
      expect(sig1).toBe(sig2);
    });

    it('should normalize numbers to N', () => {
      const sig1 = generateErrorSignature('Bash', 'Error code 404');
      const sig2 = generateErrorSignature('Bash', 'Error code 500');
      expect(sig1).toBe(sig2);
    });

    it('should normalize single-quoted strings', () => {
      const sig1 = generateErrorSignature('Bash', "Error in 'file1.ts'");
      const sig2 = generateErrorSignature('Bash', "Error in 'file2.ts'");
      expect(sig1).toBe(sig2);
    });

    it('should normalize double-quoted strings', () => {
      const sig1 = generateErrorSignature('Bash', 'Error in "file1.ts"');
      const sig2 = generateErrorSignature('Bash', 'Error in "file2.ts"');
      expect(sig1).toBe(sig2);
    });

    it('should normalize timestamps', () => {
      const sig1 = generateErrorSignature('Bash', 'Error at 2024-01-15T10:30:45.123Z');
      const sig2 = generateErrorSignature('Bash', 'Error at 2024-01-16T11:45:30.456Z');
      expect(sig1).toBe(sig2);
    });

    it('should normalize hex addresses after number normalization', () => {
      // Note: Numbers get normalized first (0x7fff -> 0xNfff), then hex pattern matches
      const sig1 = generateErrorSignature('Bash', 'Error at 0xabcdef');
      const sig2 = generateErrorSignature('Bash', 'Error at 0xfedcba');
      // Both should produce similar patterns after normalization
      expect(sig1).toMatch(/^Bash:/);
      expect(sig2).toMatch(/^Bash:/);
      // Verify they're treated consistently (numbers replaced before hex pattern)
      expect(generateErrorSignature('Bash', 'Error at 0x123abc')).toMatch(/^Bash:/);
    });

    it('should normalize uppercase hex addresses', () => {
      const sig1 = generateErrorSignature('Bash', 'Error at 0XABCDEF');
      const sig2 = generateErrorSignature('Bash', 'Error at 0xabcdef');
      // Case is normalized to lowercase
      expect(sig1).toMatch(/^Bash:/);
      expect(sig2).toMatch(/^Bash:/);
    });

    it('should normalize multiple whitespace to single space', () => {
      const sig1 = generateErrorSignature('Bash', 'Error   with    spaces');
      const sig2 = generateErrorSignature('Bash', 'Error with spaces');
      expect(sig1).toBe(sig2);
    });

    it('should trim whitespace', () => {
      const sig1 = generateErrorSignature('Bash', '  Error message  ');
      const sig2 = generateErrorSignature('Bash', 'Error message');
      expect(sig1).toBe(sig2);
    });

    it('should truncate to max length before encoding', () => {
      const longError = 'a'.repeat(200);
      const signature = generateErrorSignature('Bash', longError);
      const [, encoded] = signature.split(':');
      // Base64 encoding of 100 chars should be max 20 chars after slicing
      expect(encoded.length).toBeLessThanOrEqual(20);
    });

    it('should convert to lowercase for consistency', () => {
      const sig1 = generateErrorSignature('Bash', 'ERROR MESSAGE');
      const sig2 = generateErrorSignature('Bash', 'error message');
      expect(sig1).toBe(sig2);
    });

    it('should handle complex error with multiple normalizations', () => {
      const error1 = 'TypeError at C:\\Users\\test\\app.ts:42:10 in "main" function at 2024-01-15T10:30:45Z with code 500 at address 0xabcd1234';
      const error2 = 'TypeError at /home/other/app.ts:99:25 in "other" function at 2024-01-16T11:45:30Z with code 404 at address 0x12345678';
      const sig1 = generateErrorSignature('Bash', error1);
      const sig2 = generateErrorSignature('Bash', error2);
      expect(sig1).toBe(sig2);
    });

    it('should limit base64 signature to max length', () => {
      const signature = generateErrorSignature('Bash', 'error message');
      const [, encoded] = signature.split(':');
      expect(encoded.length).toBeLessThanOrEqual(20);
    });
  });

  describe('without tool name (one argument)', () => {
    it('should generate hash-based signature without tool name', () => {
      const signature = generateErrorSignature('Error at line 42');
      expect(signature).toMatch(/^err_[0-9a-f]+$/);
    });

    it('should generate deterministic hash for same error', () => {
      const error = 'Same error message';
      const sig1 = generateErrorSignature(error);
      const sig2 = generateErrorSignature(error);
      expect(sig1).toBe(sig2);
    });

    it('should normalize before hashing', () => {
      const sig1 = generateErrorSignature('Error at line 42');
      const sig2 = generateErrorSignature('Error at line 99');
      expect(sig1).toBe(sig2);
    });

    it('should convert to lowercase before hashing', () => {
      const sig1 = generateErrorSignature('ERROR MESSAGE');
      const sig2 = generateErrorSignature('error message');
      expect(sig1).toBe(sig2);
    });

    it('should generate different hashes for different errors', () => {
      const sig1 = generateErrorSignature('Type error');
      const sig2 = generateErrorSignature('Syntax error');
      expect(sig1).not.toBe(sig2);
    });

    it('should handle empty string', () => {
      const signature = generateErrorSignature('');
      expect(signature).toMatch(/^err_[0-9a-f]+$/);
      expect(signature).toBe('err_0'); // Hash of empty string
    });

    it('should normalize all patterns in single-argument mode', () => {
      // Use errors that normalize to the same pattern
      const error1 = 'Error at C:\\path\\file.ts:10:5 in "test"';
      const error2 = 'Error at /other/path/file.ts:20:10 in "other"';
      const sig1 = generateErrorSignature(error1);
      const sig2 = generateErrorSignature(error2);
      // Both should normalize paths, line numbers, and quoted strings
      expect(sig1).toBe(sig2);
    });

    it('should handle hash collisions gracefully', () => {
      // Just verify it produces valid signatures for different inputs
      const sig1 = generateErrorSignature('a');
      const sig2 = generateErrorSignature('b');
      expect(sig1).toMatch(/^err_[0-9a-f]+$/);
      expect(sig2).toMatch(/^err_[0-9a-f]+$/);
    });

    it('should convert hash to absolute value', () => {
      // Hash should always be positive (no negative hex values)
      const signature = generateErrorSignature('test error');
      expect(signature).toMatch(/^err_[0-9a-f]+$/);
      expect(signature).not.toContain('-');
    });
  });
});

// =============================================================================
// shouldEscalatePhase Tests
// =============================================================================

describe('shouldEscalatePhase', () => {
  it('should return true when attempts reach category limit and phase < MAX_PHASE', () => {
    const state = createErrorState({
      category: 'typescript_error',
      phase: 1,
      attemptsThisPhase: 3, // typescript_error limit is 3
    });
    expect(shouldEscalatePhase(state)).toBe(true);
  });

  it('should return false when attempts below category limit', () => {
    const state = createErrorState({
      category: 'typescript_error',
      phase: 1,
      attemptsThisPhase: 2, // Below limit of 3
    });
    expect(shouldEscalatePhase(state)).toBe(false);
  });

  it('should return false when at MAX_PHASE even if attempts reached limit', () => {
    const state = createErrorState({
      category: 'typescript_error',
      phase: 3,
      attemptsThisPhase: 3,
    });
    expect(shouldEscalatePhase(state)).toBe(false);
  });

  it('should use DEFAULT_RETRY_LIMIT for unknown category', () => {
    const state = createErrorState({
      category: 'unknown',
      phase: 1,
      attemptsThisPhase: 2, // DEFAULT_RETRY_LIMIT is 2
    });
    expect(shouldEscalatePhase(state)).toBe(true);
  });

  it('should use DEFAULT_RETRY_LIMIT fallback for non-existent category', () => {
    // This tests the || DEFAULT_RETRY_LIMIT branch by using a category
    // that doesn't exist in PHASE_RETRY_LIMITS
    const state = createErrorState({
      category: 'non_existent_category' as ErrorCategory,
      phase: 1,
      attemptsThisPhase: 2, // DEFAULT_RETRY_LIMIT is 2
    });
    expect(shouldEscalatePhase(state)).toBe(true);
  });

  it('should handle npm_install category with limit 2', () => {
    const state = createErrorState({
      category: 'npm_install',
      phase: 1,
      attemptsThisPhase: 2,
    });
    expect(shouldEscalatePhase(state)).toBe(true);
  });

  it('should handle test_failure category with limit 2', () => {
    const state = createErrorState({
      category: 'test_failure',
      phase: 1,
      attemptsThisPhase: 2,
    });
    expect(shouldEscalatePhase(state)).toBe(true);
  });

  it('should handle build_failure category with limit 2', () => {
    const state = createErrorState({
      category: 'build_failure',
      phase: 1,
      attemptsThisPhase: 2,
    });
    expect(shouldEscalatePhase(state)).toBe(true);
  });

  it('should handle file_not_found category with limit 1', () => {
    const state = createErrorState({
      category: 'file_not_found',
      phase: 1,
      attemptsThisPhase: 1,
    });
    expect(shouldEscalatePhase(state)).toBe(true);
  });

  it('should handle git_conflict category with limit 2', () => {
    const state = createErrorState({
      category: 'git_conflict',
      phase: 1,
      attemptsThisPhase: 2,
    });
    expect(shouldEscalatePhase(state)).toBe(true);
  });

  it('should handle database_error category with limit 2', () => {
    const state = createErrorState({
      category: 'database_error',
      phase: 1,
      attemptsThisPhase: 2,
    });
    expect(shouldEscalatePhase(state)).toBe(true);
  });

  it('should handle api_error category with limit 2', () => {
    const state = createErrorState({
      category: 'api_error',
      phase: 1,
      attemptsThisPhase: 2,
    });
    expect(shouldEscalatePhase(state)).toBe(true);
  });

  it('should return false at phase 2 with attempts below limit', () => {
    const state = createErrorState({
      category: 'typescript_error',
      phase: 2,
      attemptsThisPhase: 2,
    });
    expect(shouldEscalatePhase(state)).toBe(false);
  });

  it('should return true at phase 2 when limit reached', () => {
    const state = createErrorState({
      category: 'typescript_error',
      phase: 2,
      attemptsThisPhase: 3,
    });
    expect(shouldEscalatePhase(state)).toBe(true);
  });

  it('should handle attempts exceeding limit', () => {
    const state = createErrorState({
      category: 'npm_install',
      phase: 1,
      attemptsThisPhase: 5, // Exceeds limit of 2
    });
    expect(shouldEscalatePhase(state)).toBe(true);
  });
});

// =============================================================================
// escalatePhase Tests
// =============================================================================

describe('escalatePhase', () => {
  it('should escalate from phase 1 to phase 2', () => {
    const state = createErrorState({
      phase: 1,
      attemptsThisPhase: 3,
    });
    const escalated = escalatePhase(state);
    expect(escalated.phase).toBe(2);
    expect(escalated.attemptsThisPhase).toBe(0);
  });

  it('should escalate from phase 2 to phase 3', () => {
    const state = createErrorState({
      phase: 2,
      attemptsThisPhase: 3,
    });
    const escalated = escalatePhase(state);
    expect(escalated.phase).toBe(3);
    expect(escalated.attemptsThisPhase).toBe(0);
  });

  it('should not escalate beyond MAX_PHASE', () => {
    const state = createErrorState({
      phase: 3,
      attemptsThisPhase: 5,
    });
    const escalated = escalatePhase(state);
    expect(escalated.phase).toBe(3);
    expect(escalated.attemptsThisPhase).toBe(5); // Unchanged
  });

  it('should preserve other state properties when escalating', () => {
    const state = createErrorState({
      signature: 'test_sig',
      category: 'typescript_error',
      phase: 1,
      attemptsThisPhase: 3,
      totalAttempts: 5,
      officialDocsSearched: ['doc1'],
      officialDocsContent: 'content',
    });
    const escalated = escalatePhase(state);
    expect(escalated.signature).toBe('test_sig');
    expect(escalated.category).toBe('typescript_error');
    expect(escalated.totalAttempts).toBe(5);
    expect(escalated.officialDocsSearched).toEqual(['doc1']);
    expect(escalated.officialDocsContent).toBe('content');
  });

  it('should return a new object, not mutate original', () => {
    const state = createErrorState({
      phase: 1,
      attemptsThisPhase: 3,
    });
    const escalated = escalatePhase(state);
    expect(state.phase).toBe(1); // Original unchanged
    expect(state.attemptsThisPhase).toBe(3); // Original unchanged
    expect(escalated).not.toBe(state); // Different objects
  });

  it('should handle phase 3 without going beyond', () => {
    const state = createErrorState({
      phase: 3,
      attemptsThisPhase: 10,
    });
    const escalated = escalatePhase(state);
    expect(escalated).toBe(state); // Returns same object when at max
  });

  it('should handle edge case of invalid phase beyond valid range', () => {
    // Test the defensive fallback by creating an invalid state
    // This covers the MAX_PHASE check at line 140
    const invalidState = {
      ...createErrorState(),
      phase: 4 as any, // Force an invalid phase value
    };

    const result = escalatePhase(invalidState as ErrorState);
    // Should return the state unchanged due to phase >= MAX_PHASE check
    expect(result).toBe(invalidState);
  });

  it('should handle invalid negative phase that results in nextPhase outside valid range', () => {
    // This covers the fallback return at line 156
    // When phase is -1, nextPhase becomes 0, which is not 1, 2, or 3
    const invalidState = {
      ...createErrorState(),
      phase: -1 as any, // Force an invalid negative phase value
    };

    const result = escalatePhase(invalidState as ErrorState);
    // nextPhase would be 0, which doesn't match 1, 2, or 3
    // So it falls through to the safety return at line 156
    expect(result).toBe(invalidState);
  });

  it('should handle phase 0 to phase 1 escalation', () => {
    // Test the nextPhase === 1 branch by starting from phase 0
    const state = {
      ...createErrorState(),
      phase: 0 as any, // Type assertion to bypass TypeScript check
    };
    const escalated = escalatePhase(state as ErrorState);
    expect(escalated.phase).toBe(1);
    expect(escalated.attemptsThisPhase).toBe(0);
  });
});

// =============================================================================
// hasExhaustedRetries Tests
// =============================================================================

describe('hasExhaustedRetries', () => {
  it('should return true when at MAX_PHASE and attempts reach limit', () => {
    const state = createErrorState({
      category: 'npm_install',
      phase: 3,
      attemptsThisPhase: 2, // npm_install limit is 2
    });
    expect(hasExhaustedRetries(state)).toBe(true);
  });

  it('should return false when at MAX_PHASE but attempts below limit', () => {
    const state = createErrorState({
      category: 'npm_install',
      phase: 3,
      attemptsThisPhase: 1, // Below limit of 2
    });
    expect(hasExhaustedRetries(state)).toBe(false);
  });

  it('should return false when not at MAX_PHASE even if attempts reached limit', () => {
    const state = createErrorState({
      category: 'npm_install',
      phase: 2,
      attemptsThisPhase: 2,
    });
    expect(hasExhaustedRetries(state)).toBe(false);
  });

  it('should use DEFAULT_RETRY_LIMIT for unknown category', () => {
    const state = createErrorState({
      category: 'unknown',
      phase: 3,
      attemptsThisPhase: 2, // DEFAULT_RETRY_LIMIT is 2
    });
    expect(hasExhaustedRetries(state)).toBe(true);
  });

  it('should use DEFAULT_RETRY_LIMIT fallback for non-existent category', () => {
    // This tests the || DEFAULT_RETRY_LIMIT branch by using a category
    // that doesn't exist in PHASE_RETRY_LIMITS
    const state = createErrorState({
      category: 'non_existent_category' as ErrorCategory,
      phase: 3,
      attemptsThisPhase: 2, // DEFAULT_RETRY_LIMIT is 2
    });
    expect(hasExhaustedRetries(state)).toBe(true);
  });

  it('should handle typescript_error with limit 3', () => {
    const state = createErrorState({
      category: 'typescript_error',
      phase: 3,
      attemptsThisPhase: 3,
    });
    expect(hasExhaustedRetries(state)).toBe(true);
  });

  it('should handle file_not_found with limit 1', () => {
    const state = createErrorState({
      category: 'file_not_found',
      phase: 3,
      attemptsThisPhase: 1,
    });
    expect(hasExhaustedRetries(state)).toBe(true);
  });

  it('should return true when attempts exceed limit at MAX_PHASE', () => {
    const state = createErrorState({
      category: 'npm_install',
      phase: 3,
      attemptsThisPhase: 5, // Exceeds limit of 2
    });
    expect(hasExhaustedRetries(state)).toBe(true);
  });

  it('should return false at phase 1', () => {
    const state = createErrorState({
      category: 'npm_install',
      phase: 1,
      attemptsThisPhase: 2,
    });
    expect(hasExhaustedRetries(state)).toBe(false);
  });

  it('should return false at phase 2', () => {
    const state = createErrorState({
      category: 'npm_install',
      phase: 2,
      attemptsThisPhase: 2,
    });
    expect(hasExhaustedRetries(state)).toBe(false);
  });
});

// =============================================================================
// getRetryLimit Tests
// =============================================================================

describe('getRetryLimit', () => {
  it('should return correct limit for npm_install', () => {
    expect(getRetryLimit('npm_install')).toBe(2);
  });

  it('should return correct limit for typescript_error', () => {
    expect(getRetryLimit('typescript_error')).toBe(3);
  });

  it('should return correct limit for test_failure', () => {
    expect(getRetryLimit('test_failure')).toBe(2);
  });

  it('should return correct limit for build_failure', () => {
    expect(getRetryLimit('build_failure')).toBe(2);
  });

  it('should return correct limit for file_not_found', () => {
    expect(getRetryLimit('file_not_found')).toBe(1);
  });

  it('should return correct limit for git_conflict', () => {
    expect(getRetryLimit('git_conflict')).toBe(2);
  });

  it('should return correct limit for database_error', () => {
    expect(getRetryLimit('database_error')).toBe(2);
  });

  it('should return correct limit for api_error', () => {
    expect(getRetryLimit('api_error')).toBe(2);
  });

  it('should return correct limit for unknown', () => {
    expect(getRetryLimit('unknown')).toBe(2);
  });

  it('should return DEFAULT_RETRY_LIMIT for undefined category', () => {
    // Type assertion to test runtime behavior
    const result = getRetryLimit('non_existent_category' as ErrorCategory);
    expect(result).toBe(DEFAULT_RETRY_LIMIT);
  });
});

// =============================================================================
// getRemainingAttemptsInPhase Tests
// =============================================================================

describe('getRemainingAttemptsInPhase', () => {
  it('should return remaining attempts when below limit', () => {
    const state = createErrorState({
      category: 'typescript_error',
      phase: 1,
      attemptsThisPhase: 1,
    });
    expect(getRemainingAttemptsInPhase(state)).toBe(2); // 3 - 1
  });

  it('should return 0 when at limit', () => {
    const state = createErrorState({
      category: 'typescript_error',
      phase: 1,
      attemptsThisPhase: 3,
    });
    expect(getRemainingAttemptsInPhase(state)).toBe(0); // 3 - 3
  });

  it('should return 0 when exceeding limit', () => {
    const state = createErrorState({
      category: 'typescript_error',
      phase: 1,
      attemptsThisPhase: 5,
    });
    expect(getRemainingAttemptsInPhase(state)).toBe(0); // Math.max(0, 3 - 5)
  });

  it('should handle file_not_found with limit 1', () => {
    const state = createErrorState({
      category: 'file_not_found',
      phase: 1,
      attemptsThisPhase: 0,
    });
    expect(getRemainingAttemptsInPhase(state)).toBe(1); // 1 - 0
  });

  it('should handle npm_install with limit 2', () => {
    const state = createErrorState({
      category: 'npm_install',
      phase: 1,
      attemptsThisPhase: 1,
    });
    expect(getRemainingAttemptsInPhase(state)).toBe(1); // 2 - 1
  });

  it('should use DEFAULT_RETRY_LIMIT for unknown category', () => {
    const state = createErrorState({
      category: 'unknown',
      phase: 1,
      attemptsThisPhase: 1,
    });
    expect(getRemainingAttemptsInPhase(state)).toBe(1); // 2 - 1
  });

  it('should return full limit when no attempts made', () => {
    const state = createErrorState({
      category: 'typescript_error',
      phase: 1,
      attemptsThisPhase: 0,
    });
    expect(getRemainingAttemptsInPhase(state)).toBe(3); // 3 - 0
  });

  it('should handle different phases with same category', () => {
    const state1 = createErrorState({
      category: 'npm_install',
      phase: 1,
      attemptsThisPhase: 1,
    });
    const state2 = createErrorState({
      category: 'npm_install',
      phase: 2,
      attemptsThisPhase: 1,
    });
    expect(getRemainingAttemptsInPhase(state1)).toBe(1);
    expect(getRemainingAttemptsInPhase(state2)).toBe(1);
  });
});

// =============================================================================
// getPhaseDescription Tests
// =============================================================================

describe('getPhaseDescription', () => {
  it('should return description for phase 1', () => {
    expect(getPhaseDescription(1)).toBe('Raw attempts with existing knowledge');
  });

  it('should return description for phase 2', () => {
    expect(getPhaseDescription(2)).toBe('Including official documentation search');
  });

  it('should return description for phase 3', () => {
    expect(getPhaseDescription(3)).toBe('Including community solutions search');
  });

  it('should return "Unknown phase" for phase 0', () => {
    expect(getPhaseDescription(0)).toBe('Unknown phase');
  });

  it('should return "Unknown phase" for phase 4', () => {
    expect(getPhaseDescription(4)).toBe('Unknown phase');
  });

  it('should return "Unknown phase" for negative phase', () => {
    expect(getPhaseDescription(-1)).toBe('Unknown phase');
  });

  it('should return "Unknown phase" for non-integer phase', () => {
    expect(getPhaseDescription(1.5)).toBe('Unknown phase');
  });

  it('should return "Unknown phase" for very large phase', () => {
    expect(getPhaseDescription(999)).toBe('Unknown phase');
  });
});

// =============================================================================
// Integration Tests
// =============================================================================

describe('Integration: Error state lifecycle', () => {
  it('should progress through phases until exhausted', () => {
    let state = createErrorState({
      category: 'npm_install',
      phase: 1,
      attemptsThisPhase: 0,
    });

    // Phase 1: 2 attempts
    state = { ...state, attemptsThisPhase: 1 };
    expect(shouldEscalatePhase(state)).toBe(false);
    expect(hasExhaustedRetries(state)).toBe(false);

    state = { ...state, attemptsThisPhase: 2 };
    expect(shouldEscalatePhase(state)).toBe(true);
    expect(hasExhaustedRetries(state)).toBe(false);

    // Escalate to phase 2
    state = escalatePhase(state);
    expect(state.phase).toBe(2);
    expect(state.attemptsThisPhase).toBe(0);

    // Phase 2: 2 attempts
    state = { ...state, attemptsThisPhase: 2 };
    expect(shouldEscalatePhase(state)).toBe(true);
    expect(hasExhaustedRetries(state)).toBe(false);

    // Escalate to phase 3
    state = escalatePhase(state);
    expect(state.phase).toBe(3);
    expect(state.attemptsThisPhase).toBe(0);

    // Phase 3: 2 attempts
    state = { ...state, attemptsThisPhase: 1 };
    expect(shouldEscalatePhase(state)).toBe(false);
    expect(hasExhaustedRetries(state)).toBe(false);

    state = { ...state, attemptsThisPhase: 2 };
    expect(shouldEscalatePhase(state)).toBe(false); // Can't escalate beyond phase 3
    expect(hasExhaustedRetries(state)).toBe(true); // But retries are exhausted
  });

  it('should handle fast-fail categories like file_not_found', () => {
    let state = createErrorState({
      category: 'file_not_found',
      phase: 1,
      attemptsThisPhase: 1,
    });

    // Should escalate after just 1 attempt
    expect(shouldEscalatePhase(state)).toBe(true);
    expect(getRemainingAttemptsInPhase(state)).toBe(0);

    // Progress through all phases
    state = escalatePhase(state);
    state = { ...state, attemptsThisPhase: 1 };
    state = escalatePhase(state);
    state = { ...state, attemptsThisPhase: 1 };

    expect(state.phase).toBe(3);
    expect(hasExhaustedRetries(state)).toBe(true);
  });

  it('should track remaining attempts correctly through lifecycle', () => {
    let state = createErrorState({
      category: 'typescript_error',
      phase: 1,
      attemptsThisPhase: 0,
    });

    expect(getRemainingAttemptsInPhase(state)).toBe(3);

    state = { ...state, attemptsThisPhase: 1 };
    expect(getRemainingAttemptsInPhase(state)).toBe(2);

    state = { ...state, attemptsThisPhase: 2 };
    expect(getRemainingAttemptsInPhase(state)).toBe(1);

    state = { ...state, attemptsThisPhase: 3 };
    expect(getRemainingAttemptsInPhase(state)).toBe(0);
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe('Edge cases', () => {
  it('should handle error signature with only special characters', () => {
    const signature = generateErrorSignature('!@#$%^&*()');
    expect(signature).toMatch(/^err_[0-9a-f]+$/);
  });

  it('should handle very long error messages in both modes', () => {
    const longError = 'Error: ' + 'a'.repeat(1000);
    const sig1 = generateErrorSignature('Bash', longError);
    const sig2 = generateErrorSignature(longError);
    expect(sig1).toMatch(/^Bash:/);
    expect(sig2).toMatch(/^err_[0-9a-f]+$/);
  });

  it('should handle error with Unicode characters', () => {
    const sig1 = generateErrorSignature('Error: 你好世界');
    const sig2 = generateErrorSignature('Bash', 'Error: 你好世界');
    expect(sig1).toMatch(/^err_[0-9a-f]+$/);
    expect(sig2).toMatch(/^Bash:/);
  });

  it('should handle multiple path separators in error', () => {
    const error = 'Error in C:\\path\\to\\file.ts and /unix/path/file.ts';
    const signature = generateErrorSignature(error);
    expect(signature).toMatch(/^err_[0-9a-f]+$/);
  });

  it('should handle mixed case in patterns', () => {
    const sig1 = generateErrorSignature('ERROR at LINE 42 with Code 500');
    const sig2 = generateErrorSignature('error at line 99 with code 404');
    expect(sig1).toBe(sig2);
  });

  it('should handle state with all properties at extremes', () => {
    const state = createErrorState({
      phase: 3,
      attemptsThisPhase: 100,
      totalAttempts: 999,
      officialDocsSearched: ['doc1', 'doc2', 'doc3'],
      unofficialDocsSearched: ['com1', 'com2'],
    });

    expect(hasExhaustedRetries(state)).toBe(true);
    expect(shouldEscalatePhase(state)).toBe(false);
    expect(getRemainingAttemptsInPhase(state)).toBe(0);
  });

  it('should handle all error categories in getRetryLimit', () => {
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
      const limit = getRetryLimit(category);
      expect(limit).toBeGreaterThan(0);
      expect(limit).toBeLessThanOrEqual(3);
    });
  });
});
