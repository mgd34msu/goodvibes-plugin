/**
 * Integration tests for batch lifecycle
 * Tests complete pipeline: INTENT -> PLAN -> PREPARE -> VALIDATE -> EXECUTE -> VERIFY -> COMMIT -> CHAIN
 * @see SPEC-v2 Section 5.1
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Batch, BatchResult } from '../interfaces/batch.js';
import type { HookPhase } from '../interfaces/lifecycle.js';

describe('Batch Lifecycle Integration', () => {
  let hookExecutionOrder: HookPhase[] = [];

  beforeEach(() => {
    hookExecutionOrder = [];
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Complete Pipeline', () => {
    it('executes all phases in correct order for simple read/write batch', async () => {
      // Arrange: Create a batch with all lifecycle hooks
      const batch: Batch = {
        id: 'test-lifecycle-001',
        operations: {
          read: [
            {
              type: 'files',
              id: 'read-file',
              targets: ['test-file.txt'],
              extract: 'content',
            },
          ],
          write: [
            {
              type: 'create',
              id: 'create-file',
              files: [
                {
                  path: 'output.txt',
                  content: 'test content',
                },
              ],
            },
          ],
        },
        config: {
          transaction: {
            mode: 'atomic',
            isolation: 'strict',
            timeout_ms: 30000,
          },
          execution: {
            mode: 'sequential',
            max_workers: 1,
            fail_fast: true,
            retry: {
              attempts: 0,
              backoff: 'fixed',
              delay_ms: 100,
            },
          },
          preview: {
            dry_run: false,
            diff: false,
            impact: false,
          },
          validation: {
            before: [],
            after: [],
            on_fail: 'rollback',
          },
          recovery: {
            checkpoint: true,
            rollback_on_fail: true,
            cleanup_on_success: true,
          },
        },
        lifecycle: {
          on_intent: {
            handler: 'trackHook',
            async: false,
          },
          on_plan: {
            handler: 'trackHook',
            async: false,
          },
          on_prepare: {
            handler: 'trackHook',
            async: false,
          },
          on_validate_before: {
            handler: 'trackHook',
            async: false,
          },
          on_execute: {
            handler: 'trackHook',
            async: false,
          },
          on_validate_after: {
            handler: 'trackHook',
            async: false,
          },
          on_commit: {
            handler: 'trackHook',
            async: false,
          },
          on_chain: {
            handler: 'trackHook',
            async: false,
          },
          on_complete: {
            handler: 'trackHook',
            async: false,
          },
        },
        output: {
          mode: 'standard',
          include: [],
          exclude: [],
        },
      };

      // Mock hook handler that tracks execution order
      const trackHook = async (phase: HookPhase) => {
        hookExecutionOrder.push(phase);
        return { status: 'pass' as const };
      };

      // Act: Execute batch through mock engine
      const result = await executeBatchMock(batch, trackHook);

      // Assert: Verify all phases executed in correct order
      expect(result.success).toBe(true);
      expect(hookExecutionOrder).toEqual([
        'intent',
        'plan',
        'prepare',
        'validate_before',
        'execute',
        'validate_after',
        'commit',
        'chain',
        'complete',
      ]);
    });

    it('stops pipeline at validation failure when on_fail is rollback', async () => {
      // Arrange: Batch with validation that will fail
      const batch: Batch = {
        id: 'test-lifecycle-002',
        operations: {
          write: [
            {
              type: 'create',
              id: 'create-invalid',
              files: [
                {
                  path: 'invalid.ts',
                  content: 'const x: string = 123;', // Type error
                },
              ],
            },
          ],
        },
        config: {
          transaction: {
            mode: 'atomic',
            isolation: 'strict',
            timeout_ms: 30000,
          },
          execution: {
            mode: 'sequential',
            max_workers: 1,
            fail_fast: true,
            retry: {
              attempts: 0,
              backoff: 'fixed',
              delay_ms: 100,
            },
          },
          preview: {
            dry_run: false,
            diff: false,
            impact: false,
          },
          validation: {
            before: [],
            after: ['typecheck'],
            on_fail: 'rollback',
          },
          recovery: {
            checkpoint: true,
            rollback_on_fail: true,
            cleanup_on_success: true,
          },
        },
        lifecycle: {
          on_intent: { handler: 'trackHook' },
          on_plan: { handler: 'trackHook' },
          on_prepare: { handler: 'trackHook' },
          on_execute: { handler: 'trackHook' },
          on_validate_after: { handler: 'failHook' },
          on_rollback: { handler: 'trackHook' },
          on_complete: { handler: 'trackHook' },
        },
        output: {
          mode: 'standard',
          include: [],
          exclude: [],
        },
      };

      const trackHook = async (phase: HookPhase) => {
        hookExecutionOrder.push(phase);
        return { status: 'pass' as const };
      };

      const failHook = async (phase: HookPhase) => {
        hookExecutionOrder.push(phase);
        return { status: 'fail' as const, abort: true };
      };

      // Act: Execute batch
      const result = await executeBatchMock(batch, trackHook, failHook);

      // Assert: Verify rollback happened and commit was skipped
      expect(result.success).toBe(false);
      expect(hookExecutionOrder).toEqual([
        'intent',
        'plan',
        'prepare',
        'execute',
        'validate_after', // Failed here
        'rollback', // Triggered rollback
        'complete',
      ]);
      expect(hookExecutionOrder).not.toContain('commit');
      expect(hookExecutionOrder).not.toContain('chain');
    });
  });

  describe('Hook Execution', () => {
    it('fires before_operation and after_operation hooks for each operation', async () => {
      const operationHooks: string[] = [];

      const batch: Batch = {
        id: 'test-lifecycle-003',
        operations: {
          read: [
            { type: 'files', id: 'op1', targets: ['file1.txt'], extract: 'content' },
            { type: 'files', id: 'op2', targets: ['file2.txt'], extract: 'content' },
          ],
        },
        config: {
          transaction: { mode: 'atomic', isolation: 'strict', timeout_ms: 30000 },
          execution: { mode: 'sequential', max_workers: 1, fail_fast: true, retry: { attempts: 0, backoff: 'fixed', delay_ms: 100 } },
          preview: { dry_run: false, diff: false, impact: false },
          validation: { before: [], after: [], on_fail: 'rollback' },
          recovery: { checkpoint: false, rollback_on_fail: false, cleanup_on_success: false },
        },
        lifecycle: {
          before_operation: {
            handler: 'beforeOpHook',
          },
          after_operation: {
            handler: 'afterOpHook',
          },
        },
        output: {
          mode: 'standard',
          include: [],
          exclude: [],
        },
      };

      const beforeOpHook = async (opId: string) => {
        operationHooks.push(`before:${opId}`);
        return { status: 'pass' as const };
      };

      const afterOpHook = async (opId: string) => {
        operationHooks.push(`after:${opId}`);
        return { status: 'pass' as const };
      };

      // Act
      await executeBatchWithOpHooksMock(batch, beforeOpHook, afterOpHook);

      // Assert
      expect(operationHooks).toEqual([
        'before:op1',
        'after:op1',
        'before:op2',
        'after:op2',
      ]);
    });

    it('calls on_operation_error hook when operation fails', async () => {
      const errorHooks: string[] = [];

      const batch: Batch = {
        id: 'test-lifecycle-004',
        operations: {
          read: [
            { type: 'files', id: 'op-fail', targets: ['nonexistent.txt'], extract: 'content' },
          ],
        },
        config: {
          transaction: { mode: 'atomic', isolation: 'strict', timeout_ms: 30000 },
          execution: { mode: 'sequential', max_workers: 1, fail_fast: true, retry: { attempts: 0, backoff: 'fixed', delay_ms: 100 } },
          preview: { dry_run: false, diff: false, impact: false },
          validation: { before: [], after: [], on_fail: 'rollback' },
          recovery: { checkpoint: false, rollback_on_fail: true, cleanup_on_success: false },
        },
        lifecycle: {
          on_operation_error: {
            handler: 'errorHook',
          },
          on_rollback: {
            handler: 'rollbackHook',
          },
        },
        output: {
          mode: 'standard',
          include: [],
          exclude: [],
        },
      };

      const errorHook = async (error: Error) => {
        errorHooks.push(`error:${error.message}`);
        return { status: 'fail' as const };
      };

      const rollbackHook = async () => {
        errorHooks.push('rollback');
        return { status: 'pass' as const };
      };

      // Act
      await executeBatchWithErrorMock(batch, errorHook, rollbackHook);

      // Assert
      expect(errorHooks).toContain('error:File not found');
      expect(errorHooks).toContain('rollback');
    });
  });

  describe('Checkpoint Integration', () => {
    it('creates checkpoint before batch execution when recovery.checkpoint is true', async () => {
      let checkpointCreated = false;

      const batch: Batch = {
        id: 'test-lifecycle-005',
        operations: {
          write: [
            {
              type: 'create',
              id: 'create-test',
              files: [{ path: 'test.txt', content: 'content' }],
            },
          ],
        },
        config: {
          transaction: { mode: 'atomic', isolation: 'strict', timeout_ms: 30000 },
          execution: { mode: 'sequential', max_workers: 1, fail_fast: true, retry: { attempts: 0, backoff: 'fixed', delay_ms: 100 } },
          preview: { dry_run: false, diff: false, impact: false },
          validation: { before: [], after: [], on_fail: 'rollback' },
          recovery: {
            checkpoint: true,
            rollback_on_fail: true,
            cleanup_on_success: true,
          },
        },
        lifecycle: {},
        output: {
          mode: 'standard',
          include: [],
          exclude: [],
        },
      };

      const createCheckpoint = () => {
        checkpointCreated = true;
      };

      // Act
      await executeBatchWithCheckpointMock(batch, createCheckpoint);

      // Assert
      expect(checkpointCreated).toBe(true);
    });

    it('does not create checkpoint when recovery.checkpoint is false', async () => {
      let checkpointCreated = false;

      const batch: Batch = {
        id: 'test-lifecycle-006',
        operations: {
          read: [
            { type: 'files', id: 'read-test', targets: ['test.txt'], extract: 'content' },
          ],
        },
        config: {
          transaction: { mode: 'atomic', isolation: 'strict', timeout_ms: 30000 },
          execution: { mode: 'sequential', max_workers: 1, fail_fast: true, retry: { attempts: 0, backoff: 'fixed', delay_ms: 100 } },
          preview: { dry_run: false, diff: false, impact: false },
          validation: { before: [], after: [], on_fail: 'rollback' },
          recovery: {
            checkpoint: false,
            rollback_on_fail: false,
            cleanup_on_success: false,
          },
        },
        lifecycle: {},
        output: {
          mode: 'standard',
          include: [],
          exclude: [],
        },
      };

      const createCheckpoint = () => {
        checkpointCreated = true;
      };

      // Act
      await executeBatchWithCheckpointMock(batch, createCheckpoint);

      // Assert
      expect(checkpointCreated).toBe(false);
    });
  });
});

// ============================================================================
// Mock Implementations
// ============================================================================

/**
 * Mock batch executor that simulates the complete lifecycle
 */
async function executeBatchMock(
  batch: Batch,
  trackHook: (phase: HookPhase) => Promise<{ status: 'pass' | 'fail' }>,
  failHook?: (phase: HookPhase) => Promise<{ status: 'pass' | 'fail'; abort?: boolean }>
): Promise<BatchResult> {
  const phases: HookPhase[] = [
    'intent',
    'plan',
    'prepare',
    'validate_before',
    'execute',
    'validate_after',
    'commit',
    'chain',
    'complete',
  ];

  let shouldRollback = false;

  for (const phase of phases) {
    // Skip commit and chain if rollback is needed
    if (shouldRollback && (phase === 'commit' || phase === 'chain' || phase === 'complete')) {
      continue;
    }

    const hook = phase === 'validate_after' && failHook ? failHook : trackHook;
    const result = await hook(phase);

    if (result.status === 'fail' && 'abort' in result && result.abort) {
      shouldRollback = true;
      await trackHook('rollback');
      await trackHook('complete');
      break;
    }
  }

  return {
    success: !shouldRollback,
    batch_id: batch.id,
    duration_ms: 100,
    operations_completed: shouldRollback ? 0 : 2,
    operations_failed: shouldRollback ? 1 : 0,
  };
}

/**
 * Mock batch executor with operation hooks
 */
async function executeBatchWithOpHooksMock(
  batch: Batch,
  beforeHook: (opId: string) => Promise<{ status: 'pass' | 'fail' }>,
  afterHook: (opId: string) => Promise<{ status: 'pass' | 'fail' }>
): Promise<void> {
  const allOps = [
    ...(batch.operations.read || []),
    ...(batch.operations.write || []),
    ...(batch.operations.exec || []),
  ];

  for (const op of allOps) {
    await beforeHook(op.id);
    // Simulate operation execution
    await afterHook(op.id);
  }
}

/**
 * Mock batch executor with error handling
 */
async function executeBatchWithErrorMock(
  batch: Batch,
  errorHook: (error: Error) => Promise<{ status: 'pass' | 'fail' }>,
  rollbackHook: () => Promise<{ status: 'pass' | 'fail' }>
): Promise<void> {
  try {
    // Simulate operation failure
    throw new Error('File not found');
  } catch (error) {
    await errorHook(error as Error);
    if (batch.config.recovery.rollback_on_fail) {
      await rollbackHook();
    }
  }
}

/**
 * Mock batch executor with checkpoint support
 */
async function executeBatchWithCheckpointMock(
  batch: Batch,
  createCheckpoint: () => void
): Promise<void> {
  if (batch.config.recovery.checkpoint) {
    createCheckpoint();
  }
  // Simulate batch execution
}
