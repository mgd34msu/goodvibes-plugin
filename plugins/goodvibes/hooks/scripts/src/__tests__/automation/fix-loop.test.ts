/**
 * Tests for automation/fix-loop.ts
 *
 * Tests all functions:
 * - categorizeError: Categorize errors into known categories
 * - createErrorState: Create new error state for fix tracking
 * - buildFixContext: Build context string with error details and history
 *
 * Also verifies re-exports from error-handling-core.ts:
 * - generateErrorSignature
 * - shouldEscalatePhase
 * - escalatePhase
 * - hasExhaustedRetries
 */

import { describe, it, expect } from 'vitest';
import type { ErrorState } from '../../types/errors.js';
import {
  categorizeError,
  createErrorState,
  buildFixContext,
  generateErrorSignature,
  shouldEscalatePhase,
  escalatePhase,
  hasExhaustedRetries,
} from '../../automation/fix-loop.js';

// =============================================================================
// categorizeError tests
// =============================================================================
describe('categorizeError', () => {
  describe('npm_install category', () => {
    it('should categorize ERESOLVE errors as npm_install', () => {
      expect(
        categorizeError('ERESOLVE unable to resolve dependency tree')
      ).toBe('npm_install');
    });

    it('should categorize npm errors as npm_install', () => {
      expect(categorizeError('npm ERR! code E404')).toBe('npm_install');
    });

    it('should categorize peer dep errors as npm_install', () => {
      expect(categorizeError('peer dep missing: react@18.0.0')).toBe(
        'npm_install'
      );
    });

    it('should be case insensitive for npm errors', () => {
      expect(categorizeError('NPM ERROR: package not found')).toBe(
        'npm_install'
      );
      expect(categorizeError('PEER DEP conflict')).toBe('npm_install');
    });
  });

  describe('typescript_error category', () => {
    it('should categorize ts with error keyword as typescript_error', () => {
      expect(categorizeError('error TS2304: Cannot find name')).toBe(
        'typescript_error'
      );
      expect(categorizeError('tsc error: Property does not exist')).toBe(
        'typescript_error'
      );
    });

    it('should categorize ts with type keyword as typescript_error', () => {
      expect(categorizeError('tsc: Type mismatch')).toBe('typescript_error');
      expect(categorizeError('ts type check failed')).toBe('typescript_error');
    });

    it('should not categorize ts alone without error or type', () => {
      expect(categorizeError('ts module loaded')).toBe('unknown');
    });

    it('should be case insensitive for typescript errors', () => {
      expect(categorizeError('TS ERROR in module')).toBe('typescript_error');
      expect(categorizeError('TS TYPE error')).toBe('typescript_error');
    });
  });

  describe('test_failure category', () => {
    it('should categorize test failures correctly', () => {
      expect(categorizeError('Test failed: expected true')).toBe(
        'test_failure'
      );
      expect(categorizeError('FAIL tests/unit.test.ts')).toBe('test_failure');
    });

    it('should require both test and fail keywords', () => {
      expect(categorizeError('test passed successfully')).toBe('unknown');
      expect(categorizeError('failed to connect')).toBe('unknown');
    });

    it('should be case insensitive for test failures', () => {
      expect(categorizeError('TEST FAILED with assertion error')).toBe(
        'test_failure'
      );
    });
  });

  describe('build_failure category', () => {
    it('should categorize build failures correctly', () => {
      expect(categorizeError('Build failed with errors')).toBe('build_failure');
    });

    it('should categorize compile errors as build_failure', () => {
      expect(categorizeError('Compile error in module')).toBe('build_failure');
    });

    it('should be case insensitive for build failures', () => {
      expect(categorizeError('BUILD ERROR')).toBe('build_failure');
      expect(categorizeError('COMPILE failed')).toBe('build_failure');
    });
  });

  describe('file_not_found category', () => {
    it('should categorize ENOENT errors as file_not_found', () => {
      expect(categorizeError('ENOENT: no such file or directory')).toBe(
        'file_not_found'
      );
    });

    it('should categorize "not found" errors as file_not_found', () => {
      expect(categorizeError('File not found: config.ts')).toBe(
        'file_not_found'
      );
      expect(categorizeError('Module not found: ./missing')).toBe(
        'file_not_found'
      );
    });

    it('should be case insensitive for file not found', () => {
      expect(categorizeError('NOT FOUND: module')).toBe('file_not_found');
    });
  });

  describe('git_conflict category', () => {
    it('should categorize conflict errors as git_conflict', () => {
      expect(categorizeError('CONFLICT (content): Merge conflict')).toBe(
        'git_conflict'
      );
    });

    it('should categorize merge errors as git_conflict', () => {
      expect(categorizeError('Merge conflict in file.ts')).toBe('git_conflict');
    });

    it('should be case insensitive for git conflicts', () => {
      expect(categorizeError('MERGE CONFLICT detected')).toBe('git_conflict');
    });
  });

  describe('database_error category', () => {
    it('should categorize database errors correctly', () => {
      expect(categorizeError('Database connection failed')).toBe(
        'database_error'
      );
    });

    it('should categorize prisma errors as database_error', () => {
      expect(categorizeError('Prisma client error')).toBe('database_error');
    });

    it('should categorize SQL errors as database_error', () => {
      expect(categorizeError('SQL syntax error near SELECT')).toBe(
        'database_error'
      );
    });

    it('should be case insensitive for database errors', () => {
      expect(categorizeError('DATABASE ERROR')).toBe('database_error');
      expect(categorizeError('PRISMA query failed')).toBe('database_error');
      expect(categorizeError('SQL ERROR')).toBe('database_error');
    });
  });

  describe('api_error category', () => {
    it('should categorize api errors correctly', () => {
      expect(categorizeError('API request failed with 500')).toBe('api_error');
    });

    it('should categorize fetch errors as api_error', () => {
      expect(categorizeError('fetch error: network timeout')).toBe('api_error');
    });

    it('should categorize request errors as api_error', () => {
      expect(categorizeError('Request failed: connection refused')).toBe(
        'api_error'
      );
    });

    it('should be case insensitive for api errors', () => {
      expect(categorizeError('API ERROR')).toBe('api_error');
      expect(categorizeError('FETCH failed')).toBe('api_error');
      expect(categorizeError('REQUEST timeout')).toBe('api_error');
    });
  });

  describe('unknown category', () => {
    it('should return unknown for unrecognized errors', () => {
      expect(categorizeError('Something went wrong')).toBe('unknown');
      expect(categorizeError('Unexpected token')).toBe('unknown');
      expect(categorizeError('Memory allocation failed')).toBe('unknown');
    });

    it('should return unknown for empty string', () => {
      expect(categorizeError('')).toBe('unknown');
    });
  });
});

// =============================================================================
// createErrorState tests
// =============================================================================
describe('createErrorState', () => {
  it('should create error state with correct signature and category', () => {
    const state = createErrorState('sig123', 'npm_install');

    expect(state.signature).toBe('sig123');
    expect(state.category).toBe('npm_install');
  });

  it('should initialize phase to 1', () => {
    const state = createErrorState('sig', 'typescript_error');

    expect(state.phase).toBe(1);
  });

  it('should initialize attempts counters to 0', () => {
    const state = createErrorState('sig', 'test_failure');

    expect(state.attemptsThisPhase).toBe(0);
    expect(state.totalAttempts).toBe(0);
  });

  it('should initialize docs arrays as empty', () => {
    const state = createErrorState('sig', 'build_failure');

    expect(state.officialDocsSearched).toEqual([]);
    expect(state.unofficialDocsSearched).toEqual([]);
  });

  it('should initialize docs content as empty strings', () => {
    const state = createErrorState('sig', 'file_not_found');

    expect(state.officialDocsContent).toBe('');
    expect(state.unofficialDocsContent).toBe('');
  });

  it('should initialize fix strategies as empty array', () => {
    const state = createErrorState('sig', 'git_conflict');

    expect(state.fixStrategiesAttempted).toEqual([]);
  });

  it('should work with all error categories', () => {
    const categories = [
      'npm_install',
      'typescript_error',
      'test_failure',
      'build_failure',
      'file_not_found',
      'git_conflict',
      'database_error',
      'api_error',
      'unknown',
    ] as const;

    for (const category of categories) {
      const state = createErrorState(`sig_${category}`, category);
      expect(state.category).toBe(category);
      expect(state.signature).toBe(`sig_${category}`);
    }
  });
});

// =============================================================================
// buildFixContext tests
// =============================================================================
describe('buildFixContext', () => {
  function createTestState(overrides: Partial<ErrorState> = {}): ErrorState {
    return {
      signature: 'test-sig',
      category: 'npm_install',
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

  describe('basic context output', () => {
    it('should include phase header', () => {
      const state = createTestState({ phase: 1 });
      const context = buildFixContext(state, 'test error');

      expect(context).toContain('[GoodVibes Fix Loop - Phase 1/3]');
    });

    it('should include error message', () => {
      const state = createTestState();
      const context = buildFixContext(state, 'npm ERR! ERESOLVE');

      expect(context).toContain('Error: npm ERR! ERESOLVE');
    });

    it('should include attempt count (next attempt)', () => {
      const state = createTestState({ attemptsThisPhase: 2 });
      const context = buildFixContext(state, 'error');

      // Shows attemptsThisPhase + 1 (the upcoming attempt)
      expect(context).toContain('Attempt: 3 this phase');
    });

    it('should include total attempts', () => {
      const state = createTestState({ totalAttempts: 5 });
      const context = buildFixContext(state, 'error');

      expect(context).toContain('Total attempts: 5');
    });

    it('should show phase 2 in header', () => {
      const state = createTestState({ phase: 2 });
      const context = buildFixContext(state, 'error');

      expect(context).toContain('[GoodVibes Fix Loop - Phase 2/3]');
    });

    it('should show phase 3 in header', () => {
      const state = createTestState({ phase: 3 });
      const context = buildFixContext(state, 'error');

      expect(context).toContain('[GoodVibes Fix Loop - Phase 3/3]');
    });
  });

  describe('error message truncation', () => {
    it('should truncate long error messages to 200 characters', () => {
      const state = createTestState();
      const longError = 'x'.repeat(500);
      const context = buildFixContext(state, longError);

      // Should contain exactly 200 x characters after "Error: "
      expect(context).toContain('Error: ' + 'x'.repeat(200));
      expect(context).not.toContain('x'.repeat(201));
    });

    it('should not truncate short error messages', () => {
      const state = createTestState();
      const shortError = 'Short error message';
      const context = buildFixContext(state, shortError);

      expect(context).toContain('Error: Short error message');
    });

    it('should handle exactly 200 character error', () => {
      const state = createTestState();
      const exactError = 'y'.repeat(200);
      const context = buildFixContext(state, exactError);

      expect(context).toContain('Error: ' + 'y'.repeat(200));
    });
  });

  describe('official documentation (phase >= 2)', () => {
    it('should include official docs in phase 2 when content exists', () => {
      const state = createTestState({
        phase: 2,
        officialDocsContent: 'Official documentation content here',
      });
      const context = buildFixContext(state, 'error');

      expect(context).toContain('--- Official Documentation ---');
      expect(context).toContain('Official documentation content here');
    });

    it('should include official docs in phase 3 when content exists', () => {
      const state = createTestState({
        phase: 3,
        officialDocsContent: 'Docs for phase 3',
      });
      const context = buildFixContext(state, 'error');

      expect(context).toContain('--- Official Documentation ---');
      expect(context).toContain('Docs for phase 3');
    });

    it('should NOT include official docs in phase 1', () => {
      const state = createTestState({
        phase: 1,
        officialDocsContent: 'Should not appear',
      });
      const context = buildFixContext(state, 'error');

      expect(context).not.toContain('--- Official Documentation ---');
      expect(context).not.toContain('Should not appear');
    });

    it('should NOT include official docs section when content is empty', () => {
      const state = createTestState({
        phase: 2,
        officialDocsContent: '',
      });
      const context = buildFixContext(state, 'error');

      expect(context).not.toContain('--- Official Documentation ---');
    });

    it('should truncate official docs to 2000 characters', () => {
      const state = createTestState({
        phase: 2,
        officialDocsContent: 'z'.repeat(3000),
      });
      const context = buildFixContext(state, 'error');

      expect(context).toContain('z'.repeat(2000));
      expect(context).not.toContain('z'.repeat(2001));
    });
  });

  describe('community solutions (phase >= MAX_PHASE which is 3)', () => {
    it('should include community solutions in phase 3 when content exists', () => {
      const state = createTestState({
        phase: 3,
        unofficialDocsContent: 'Stack Overflow solution here',
      });
      const context = buildFixContext(state, 'error');

      expect(context).toContain('--- Community Solutions ---');
      expect(context).toContain('Stack Overflow solution here');
    });

    it('should NOT include community solutions in phase 1', () => {
      const state = createTestState({
        phase: 1,
        unofficialDocsContent: 'Should not appear',
      });
      const context = buildFixContext(state, 'error');

      expect(context).not.toContain('--- Community Solutions ---');
    });

    it('should NOT include community solutions in phase 2', () => {
      const state = createTestState({
        phase: 2,
        unofficialDocsContent: 'Should not appear in phase 2',
      });
      const context = buildFixContext(state, 'error');

      expect(context).not.toContain('--- Community Solutions ---');
    });

    it('should NOT include community solutions section when content is empty', () => {
      const state = createTestState({
        phase: 3,
        unofficialDocsContent: '',
      });
      const context = buildFixContext(state, 'error');

      expect(context).not.toContain('--- Community Solutions ---');
    });

    it('should truncate community solutions to 2000 characters', () => {
      const state = createTestState({
        phase: 3,
        unofficialDocsContent: 'w'.repeat(3000),
      });
      const context = buildFixContext(state, 'error');

      expect(context).toContain('w'.repeat(2000));
      expect(context).not.toContain('w'.repeat(2001));
    });
  });

  describe('previously attempted strategies', () => {
    it('should include attempted strategies section when strategies exist', () => {
      const state = createTestState({
        fixStrategiesAttempted: [
          {
            phase: 1,
            strategy: 'Cleared node_modules',
            succeeded: false,
            timestamp: '2025-01-01T00:00:00Z',
          },
        ],
      });
      const context = buildFixContext(state, 'error');

      expect(context).toContain('--- Previously Attempted (failed) ---');
      expect(context).toContain('- Cleared node_modules');
      expect(context).toContain('Try a DIFFERENT approach.');
    });

    it('should NOT include strategies section when no strategies attempted', () => {
      const state = createTestState({
        fixStrategiesAttempted: [],
      });
      const context = buildFixContext(state, 'error');

      expect(context).not.toContain('--- Previously Attempted (failed) ---');
      expect(context).not.toContain('Try a DIFFERENT approach.');
    });

    it('should show only last 3 strategies', () => {
      const state = createTestState({
        fixStrategiesAttempted: [
          {
            phase: 1,
            strategy: 'Strategy 1',
            succeeded: false,
            timestamp: '2025-01-01',
          },
          {
            phase: 1,
            strategy: 'Strategy 2',
            succeeded: false,
            timestamp: '2025-01-01',
          },
          {
            phase: 1,
            strategy: 'Strategy 3',
            succeeded: false,
            timestamp: '2025-01-01',
          },
          {
            phase: 1,
            strategy: 'Strategy 4',
            succeeded: false,
            timestamp: '2025-01-01',
          },
          {
            phase: 1,
            strategy: 'Strategy 5',
            succeeded: false,
            timestamp: '2025-01-01',
          },
        ],
      });
      const context = buildFixContext(state, 'error');

      // Should NOT contain first two strategies
      expect(context).not.toContain('Strategy 1');
      expect(context).not.toContain('Strategy 2');
      // Should contain last 3 strategies
      expect(context).toContain('- Strategy 3');
      expect(context).toContain('- Strategy 4');
      expect(context).toContain('- Strategy 5');
    });

    it('should show all strategies when less than 3', () => {
      const state = createTestState({
        fixStrategiesAttempted: [
          {
            phase: 1,
            strategy: 'Only strategy',
            succeeded: false,
            timestamp: '2025-01-01',
          },
        ],
      });
      const context = buildFixContext(state, 'error');

      expect(context).toContain('- Only strategy');
    });

    it('should show exactly 3 strategies when exactly 3 exist', () => {
      const state = createTestState({
        fixStrategiesAttempted: [
          {
            phase: 1,
            strategy: 'First',
            succeeded: false,
            timestamp: '2025-01-01',
          },
          {
            phase: 1,
            strategy: 'Second',
            succeeded: false,
            timestamp: '2025-01-01',
          },
          {
            phase: 1,
            strategy: 'Third',
            succeeded: false,
            timestamp: '2025-01-01',
          },
        ],
      });
      const context = buildFixContext(state, 'error');

      expect(context).toContain('- First');
      expect(context).toContain('- Second');
      expect(context).toContain('- Third');
    });
  });

  describe('combined output format', () => {
    it('should include all sections in phase 3 with full state', () => {
      const state = createTestState({
        phase: 3,
        attemptsThisPhase: 1,
        totalAttempts: 5,
        officialDocsContent: 'Official docs',
        unofficialDocsContent: 'Community docs',
        fixStrategiesAttempted: [
          {
            phase: 1,
            strategy: 'Previous fix',
            succeeded: false,
            timestamp: '2025-01-01',
          },
        ],
      });
      const context = buildFixContext(state, 'Test error message');

      expect(context).toContain('[GoodVibes Fix Loop - Phase 3/3]');
      expect(context).toContain('Error: Test error message');
      expect(context).toContain('Attempt: 2 this phase');
      expect(context).toContain('Total attempts: 5');
      expect(context).toContain('--- Official Documentation ---');
      expect(context).toContain('Official docs');
      expect(context).toContain('--- Community Solutions ---');
      expect(context).toContain('Community docs');
      expect(context).toContain('--- Previously Attempted (failed) ---');
      expect(context).toContain('- Previous fix');
      expect(context).toContain('Try a DIFFERENT approach.');
    });

    it('should format output with newline separators', () => {
      const state = createTestState();
      const context = buildFixContext(state, 'error');

      // Check that output uses newlines to separate parts
      const lines = context.split('\n');
      expect(lines.length).toBeGreaterThan(1);
    });
  });
});

// =============================================================================
// Re-exported functions tests (verify they work when imported from fix-loop)
// =============================================================================
describe('re-exported functions from error-handling-core', () => {
  describe('generateErrorSignature', () => {
    it('should be exported and work with tool name and error', () => {
      const sig = generateErrorSignature('Bash', 'Error at line 42');

      expect(sig).toContain('Bash:');
      expect(typeof sig).toBe('string');
    });

    it('should create stable signatures', () => {
      const sig1 = generateErrorSignature('Bash', 'Error at line 42');
      const sig2 = generateErrorSignature('Bash', 'Error at line 42');

      expect(sig1).toBe(sig2);
    });

    it('should work with single argument (error only)', () => {
      const sig = generateErrorSignature('Error at line 42');

      expect(sig).toMatch(/^err_/);
    });
  });

  describe('shouldEscalatePhase', () => {
    it('should be exported and work correctly', () => {
      const state = createErrorState('sig', 'npm_install');
      state.attemptsThisPhase = 1;

      expect(shouldEscalatePhase(state)).toBe(false);

      state.attemptsThisPhase = 2; // npm_install limit is 2
      expect(shouldEscalatePhase(state)).toBe(true);
    });

    it('should return false at max phase', () => {
      const state = createErrorState('sig', 'npm_install');
      state.phase = 3;
      state.attemptsThisPhase = 10;

      expect(shouldEscalatePhase(state)).toBe(false);
    });
  });

  describe('escalatePhase', () => {
    it('should be exported and escalate phase correctly', () => {
      const state = createErrorState('sig', 'npm_install');
      state.phase = 1;
      state.attemptsThisPhase = 5;

      const escalated = escalatePhase(state);

      expect(escalated.phase).toBe(2);
      expect(escalated.attemptsThisPhase).toBe(0);
    });

    it('should not escalate beyond max phase', () => {
      const state = createErrorState('sig', 'npm_install');
      state.phase = 3;
      state.attemptsThisPhase = 5;

      const result = escalatePhase(state);

      expect(result.phase).toBe(3);
      expect(result).toBe(state); // Same object returned
    });
  });

  describe('hasExhaustedRetries', () => {
    it('should be exported and detect exhaustion correctly', () => {
      const state = createErrorState('sig', 'npm_install');
      state.phase = 3;
      state.attemptsThisPhase = 1;

      expect(hasExhaustedRetries(state)).toBe(false);

      state.attemptsThisPhase = 2; // npm_install limit is 2
      expect(hasExhaustedRetries(state)).toBe(true);
    });

    it('should return false when not at max phase', () => {
      const state = createErrorState('sig', 'npm_install');
      state.phase = 2;
      state.attemptsThisPhase = 10;

      expect(hasExhaustedRetries(state)).toBe(false);
    });
  });
});
