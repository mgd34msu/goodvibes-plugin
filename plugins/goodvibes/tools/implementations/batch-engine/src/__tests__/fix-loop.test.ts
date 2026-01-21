/**
 * Tests for Fix Loop implementation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  FixLoopImpl,
  createFixLoop,
  getFixLoop,
  resetGlobalFixLoop,
} from '../runtime/fix-loop.js';
import type {
  FixContext,
  FixableError,
  FixStrategy,
} from '../interfaces/fix-loop.js';
import type { Batch } from '../interfaces/batch.js';
import type { OperationResult } from '../interfaces/result.js';

describe('FixLoop', () => {
  beforeEach(() => {
    resetGlobalFixLoop();
  });

  describe('parseError', () => {
    it('should parse TypeScript errors', () => {
      const fixLoop = createFixLoop();
      const error = 'src/test.ts(10,5): error TS2322: Type string is not assignable to type number';
      const parsed = fixLoop.parseError(error);

      expect(parsed.type).toBe('typescript_error');
      expect(parsed.file).toBe('src/test.ts');
      expect(parsed.line).toBe(10);
      expect(parsed.column).toBe(5);
      expect(parsed.code).toBe('TS2322');
    });

    it('should parse ESLint errors', () => {
      const fixLoop = createFixLoop();
      const error = 'src/test.ts:10:5: Missing semicolon [semi]';
      const parsed = fixLoop.parseError(error);

      expect(parsed.type).toBe('lint_error');
      expect(parsed.file).toBe('src/test.ts');
      expect(parsed.line).toBe(10);
      expect(parsed.column).toBe(5);
      expect(parsed.code).toBe('semi');
    });

    it('should parse test failures', () => {
      const fixLoop = createFixLoop();
      const error = 'FAIL test/example.test.ts: Expected true but got false';
      const parsed = fixLoop.parseError(error);

      expect(parsed.type).toBe('test_failure');
      expect(parsed.message).toContain('FAIL');
    });

    it('should parse build errors', () => {
      const fixLoop = createFixLoop();
      const error = 'Build failed: Module not found';
      const parsed = fixLoop.parseError(error);

      expect(parsed.type).toBe('build_error');
      expect(parsed.message).toContain('Build failed');
    });

    it('should default to runtime_error for unknown formats', () => {
      const fixLoop = createFixLoop();
      const error = 'Something went wrong';
      const parsed = fixLoop.parseError(error);

      expect(parsed.type).toBe('runtime_error');
      expect(parsed.message).toBe('Something went wrong');
    });
  });

  describe('canFix', () => {
    it('should return true for fixable lint errors', () => {
      const fixLoop = createFixLoop();
      const error: FixableError = {
        type: 'lint_error',
        message: 'Missing semicolon',
        file: 'test.ts',
      };

      expect(fixLoop.canFix(error)).toBe(true);
    });

    it('should return true for fixable format errors', () => {
      const fixLoop = createFixLoop();
      const error: FixableError = {
        type: 'format_error',
        message: 'Formatting issue',
        file: 'test.ts',
      };

      expect(fixLoop.canFix(error)).toBe(true);
    });

    it('should return true for typescript errors (agent fix available)', () => {
      const fixLoop = createFixLoop();
      const error: FixableError = {
        type: 'typescript_error',
        message: 'Type error',
        file: 'test.ts',
      };

      expect(fixLoop.canFix(error)).toBe(true);
    });
  });

  describe('getStrategy', () => {
    it('should return strategies in order', () => {
      const fixLoop = createFixLoop();

      expect(fixLoop.getStrategy(1)).toBe('auto_fix');
      expect(fixLoop.getStrategy(2)).toBe('agent_fix');
      expect(fixLoop.getStrategy(3)).toBe('targeted_fix');
    });

    it('should use last strategy for attempts beyond config', () => {
      const fixLoop = createFixLoop();

      expect(fixLoop.getStrategy(4)).toBe('targeted_fix');
      expect(fixLoop.getStrategy(5)).toBe('targeted_fix');
    });

    it('should respect custom strategy order', () => {
      const fixLoop = createFixLoop({
        strategies: ['agent_fix', 'targeted_fix'],
        max_attempts: 2,
        timeout_ms: 30000,
        auto_fixers: {},
      });

      expect(fixLoop.getStrategy(1)).toBe('agent_fix');
      expect(fixLoop.getStrategy(2)).toBe('targeted_fix');
    });
  });

  describe('registerAutoFixer', () => {
    it('should register custom auto-fixer', () => {
      const fixLoop = createFixLoop();

      const customFixer = {
        name: 'custom-fixer',
        can_fix: (error: FixableError) => error.type === 'import_error',
        fix: async () => [],
      };

      fixLoop.registerAutoFixer('import_error', customFixer);

      expect(fixLoop.config.auto_fixers.import_error).toBe(customFixer);
    });
  });

  describe('singleton', () => {
    it('should return same instance from getFixLoop', () => {
      const instance1 = getFixLoop();
      const instance2 = getFixLoop();

      expect(instance1).toBe(instance2);
    });

    it('should reset singleton', () => {
      const instance1 = getFixLoop();
      resetGlobalFixLoop();
      const instance2 = getFixLoop();

      expect(instance1).not.toBe(instance2);
    });
  });

  describe('run', () => {
    it('should execute fix loop and track attempts', async () => {
      const fixLoop = createFixLoop();

      const mockBatch: Batch = {
        id: 'test-batch',
        operations: { read: [], write: [], exec: [], query: [], state: [] },
        config: {
          transaction: { mode: 'none' },
          execution: { mode: 'sequential', max_concurrency: 1 },
          validation: {
            before: { enabled: false, checks: [] },
            after: { enabled: false, checks: [] },
          },
          recovery: {
            mode: 'none',
            checkpoint_before_batch: false,
            checkpoint_before_risky: false,
            max_fix_attempts: 3,
            fix_timeout_ms: 60000,
            rollback_on_fix_failure: false,
            keep_history: false,
          },
        },
      };

      const mockOperation: OperationResult = {
        id: 'op1',
        type: 'exec',
        status: 'failed',
        data: {},
        duration_ms: 100,
        tokens_used: 0,
      };

      const error: FixableError = {
        type: 'lint_error',
        message: 'Missing semicolon',
        file: 'test.ts',
        line: 10,
      };

      const context: FixContext = {
        operation: mockOperation,
        batch: mockBatch,
        error,
        attempt: 1,
        max_attempts: 2, // Reduced to avoid long waits
        prior_attempts: [],
      };

      const result = await fixLoop.run(context);

      expect(result).toBeDefined();
      expect(result.attempts).toBeGreaterThan(0);
      expect(result.attempts).toBeLessThanOrEqual(2);
      expect(result.duration_ms).toBeGreaterThan(0);
    }, 10000); // 10 second timeout
  });
});
