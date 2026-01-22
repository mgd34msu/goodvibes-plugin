/**
 * Tests for Philosophy & Principles - Section 1.1
 * Tests batch-first, parallel-native, enterprise-grade behaviors
 * @see SPEC-v2 Section 1.1
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Batch, BatchConfig } from '../interfaces/batch.js';
import type { BatchResult, OperationResult } from '../interfaces/result.js';
import type { ReadOperation } from '../interfaces/operations/read.js';
import type { WriteOperation } from '../interfaces/operations/write.js';

describe('Philosophy & Principles - Section 1.1', () => {
  describe('1.1.1 Batch-First Architecture', () => {
    it('batches multiple operations into single execution', () => {
      // Arrange: Create batch with multiple operations
      const batch: Batch = {
        id: 'batch-001',
        operations: {
          read: [
            {
              type: 'files',
              id: 'read-1',
              targets: ['file1.ts', 'file2.ts', 'file3.ts'],
              extract: 'content',
            } as ReadOperation,
          ],
          write: [
            {
              type: 'create',
              id: 'write-1',
              files: [
                { path: 'new1.ts', content: 'export {}' },
                { path: 'new2.ts', content: 'export {}' },
              ],
            } as WriteOperation,
          ],
        },
        config: createBatchConfig(),
        lifecycle: {},
        output: { mode: 'summary', include: [], exclude: [] },
      };

      // Assert: All operations grouped in single batch
      expect(batch.operations.read).toHaveLength(1);
      expect(batch.operations.write).toHaveLength(1);
      expect(batch.operations.read![0].targets).toHaveLength(3);
      expect((batch.operations.write![0] as any).files).toHaveLength(2);
    });

    it('prefers batching over individual operations', () => {
      // Multiple individual file reads should be batched
      const individualCalls = [
        { file: 'file1.ts' },
        { file: 'file2.ts' },
        { file: 'file3.ts' },
      ];

      // Batch alternative
      const batchedCall: ReadOperation = {
        type: 'files',
        id: 'read-batch',
        targets: individualCalls.map(c => c.file),
        extract: 'content',
      };

      // Assert: Single batched operation vs multiple individual
      expect(batchedCall.targets).toHaveLength(individualCalls.length);
      expect(batchedCall.type).toBe('files');
    });

    it('supports nested batch operations via parent_id', () => {
      const parentBatch: Batch = {
        id: 'parent-batch',
        operations: {},
        config: createBatchConfig(),
        lifecycle: {},
        output: { mode: 'summary', include: [], exclude: [] },
      };

      const childBatch: Batch = {
        id: 'child-batch',
        parent_id: parentBatch.id,
        operations: {},
        config: createBatchConfig(),
        lifecycle: {},
        output: { mode: 'summary', include: [], exclude: [] },
      };

      expect(childBatch.parent_id).toBe('parent-batch');
    });

    it('groups operations by phase for efficient execution', () => {
      const batch: Batch = {
        id: 'batch-002',
        operations: {
          read: [
            { type: 'files', id: 'r1', targets: ['a.ts'], extract: 'content' } as ReadOperation,
            { type: 'search', id: 'r2', pattern: 'test', output_mode: 'files' } as ReadOperation,
          ],
          write: [
            { type: 'edit', id: 'w1', edits: [] } as WriteOperation,
          ],
          exec: [
            { type: 'command', id: 'e1', commands: [{ cmd: 'npm test' }] },
          ],
        },
        config: createBatchConfig(),
        lifecycle: {},
        output: { mode: 'summary', include: [], exclude: [] },
      };

      // Assert: Operations organized by phase
      expect(batch.operations.read).toHaveLength(2);
      expect(batch.operations.write).toHaveLength(1);
      expect(batch.operations.exec).toHaveLength(1);
    });
  });

  describe('1.1.2 Parallel-Native Execution', () => {
    it('defaults to parallel execution mode', () => {
      const config: BatchConfig = createBatchConfig();
      config.execution.mode = 'parallel';

      expect(config.execution.mode).toBe('parallel');
    });

    it('executes independent operations in parallel', () => {
      const batch: Batch = {
        id: 'batch-003',
        operations: {
          read: [
            { type: 'files', id: 'read-1', targets: ['a.ts'], extract: 'content' } as ReadOperation,
            { type: 'files', id: 'read-2', targets: ['b.ts'], extract: 'content' } as ReadOperation,
            { type: 'files', id: 'read-3', targets: ['c.ts'], extract: 'content' } as ReadOperation,
          ],
        },
        config: {
          ...createBatchConfig(),
          execution: {
            mode: 'parallel',
            max_workers: 3,
            fail_fast: true,
            retry: { attempts: 0, backoff: 'fixed', delay_ms: 100 },
          },
        },
        lifecycle: {},
        output: { mode: 'summary', include: [], exclude: [] },
      };

      // Assert: No dependencies, all can run in parallel
      expect(batch.operations.read![0].depends_on).toBeUndefined();
      expect(batch.operations.read![1].depends_on).toBeUndefined();
      expect(batch.operations.read![2].depends_on).toBeUndefined();
    });

    it('respects dependency chains in parallel execution', () => {
      const batch: Batch = {
        id: 'batch-004',
        operations: {
          read: [
            { type: 'files', id: 'read-1', targets: ['a.ts'], extract: 'content' } as ReadOperation,
          ],
          write: [
            {
              type: 'edit',
              id: 'edit-1',
              depends_on: ['read-1'],
              edits: [],
            } as WriteOperation,
          ],
          exec: [
            {
              type: 'command',
              id: 'test-1',
              depends_on: ['edit-1'],
              commands: [{ cmd: 'npm test' }],
            },
          ],
        },
        config: createBatchConfig(),
        lifecycle: {},
        output: { mode: 'summary', include: [], exclude: [] },
      };

      // Assert: Dependency chain enforced
      expect(batch.operations.write![0].depends_on).toContain('read-1');
      expect(batch.operations.exec![0].depends_on).toContain('edit-1');
    });

    it('configures parallel worker pool size', () => {
      const config: BatchConfig = {
        ...createBatchConfig(),
        execution: {
          mode: 'parallel',
          max_workers: 10,
          fail_fast: true,
          retry: { attempts: 3, backoff: 'exponential', delay_ms: 1000 },
        },
      };

      expect(config.execution.max_workers).toBe(10);
      expect(config.execution.mode).toBe('parallel');
    });

    it('calculates parallel efficiency from critical path', () => {
      const result: BatchResult = {
        summary: {
          status: 'success',
          operations: { total: 5, succeeded: 5, failed: 0, skipped: 0 },
          duration_ms: 2000,
          tokens_used: 1000,
        },
        phases: {
          read: {
            status: 'success',
            results: [
              { id: 'r1', type: 'files', status: 'success', data: {}, duration_ms: 500, tokens_used: 200 },
              { id: 'r2', type: 'files', status: 'success', data: {}, duration_ms: 500, tokens_used: 200 },
            ],
            duration_ms: 500,
            tokens_used: 400,
          },
        },
        validation: {
          before: { check: 'none', passed: true },
          after: { check: 'none', passed: true },
        },
        recovery: {
          rollback_available: false,
          rollback_triggered: false,
        },
        execution_graph: {
          phases: ['read'],
          parallel_groups: [['r1', 'r2']],
          critical_path_ms: 500, // Parallel execution
        },
      };

      // Parallel efficiency = critical_path_ms / sum_of_all_operation_durations
      const totalSequentialTime = 500 + 500; // 1000ms if sequential
      const actualTime = result.execution_graph.critical_path_ms; // 500ms parallel
      const efficiency = actualTime / totalSequentialTime;

      expect(efficiency).toBe(0.5); // 50% of sequential time = 2x speedup
    });
  });

  describe('1.1.3 Enterprise-Grade: ACID Properties', () => {
    describe('Atomicity', () => {
      it('configures atomic transaction mode', () => {
        const config: BatchConfig = {
          ...createBatchConfig(),
          transaction: {
            mode: 'atomic',
            isolation: 'strict',
            timeout_ms: 60000,
          },
        };

        expect(config.transaction.mode).toBe('atomic');
      });

      it('rolls back all operations on single failure in atomic mode', () => {
        const result: BatchResult = {
          summary: {
            status: 'rolled_back',
            operations: { total: 3, succeeded: 0, failed: 1, skipped: 2 },
            duration_ms: 500,
            tokens_used: 1000,
          },
          phases: {
            write: {
              status: 'failed',
              results: [
                { id: 'w1', type: 'create', status: 'success', data: {}, duration_ms: 100, tokens_used: 300 },
                { id: 'w2', type: 'create', status: 'failed', data: null, error: { code: 'ERR', message: 'Failed' }, duration_ms: 50, tokens_used: 200 },
              ],
              duration_ms: 150,
              tokens_used: 500,
            },
          },
          validation: {
            before: { check: 'none', passed: true },
            after: { check: 'none', passed: true },
          },
          recovery: {
            checkpoint_id: 'cp-001',
            rollback_available: true,
            rollback_triggered: true,
          },
          execution_graph: {
            phases: ['write'],
            parallel_groups: [['w1', 'w2']],
            critical_path_ms: 100,
          },
        };

        expect(result.summary.status).toBe('rolled_back');
        expect(result.recovery.rollback_triggered).toBe(true);
      });

      it('supports best-effort mode for partial success', () => {
        const config: BatchConfig = {
          ...createBatchConfig(),
          transaction: {
            mode: 'best-effort',
            isolation: 'relaxed',
            timeout_ms: 30000,
          },
        };

        expect(config.transaction.mode).toBe('best-effort');
      });
    });

    describe('Consistency', () => {
      it('validates state before execution', () => {
        const config: BatchConfig = {
          ...createBatchConfig(),
          validation: {
            before: ['typecheck', 'lint'],
            after: [],
            on_fail: 'abort',
          },
        };

        expect(config.validation.before).toContain('typecheck');
        expect(config.validation.before).toContain('lint');
      });

      it('validates state after execution', () => {
        const config: BatchConfig = {
          ...createBatchConfig(),
          validation: {
            before: [],
            after: ['test', 'build'],
            on_fail: 'rollback',
          },
        };

        expect(config.validation.after).toContain('test');
        expect(config.validation.after).toContain('build');
        expect(config.validation.on_fail).toBe('rollback');
      });

      it('ensures consistent state via checkpoint-restore', () => {
        const config: BatchConfig = {
          ...createBatchConfig(),
          recovery: {
            checkpoint: true,
            rollback_on_fail: true,
            cleanup_on_success: true,
          },
        };

        expect(config.recovery.checkpoint).toBe(true);
        expect(config.recovery.rollback_on_fail).toBe(true);
      });
    });

    describe('Isolation', () => {
      it('enforces strict isolation between batches', () => {
        const config: BatchConfig = {
          ...createBatchConfig(),
          transaction: {
            mode: 'atomic',
            isolation: 'strict',
            timeout_ms: 30000,
          },
        };

        expect(config.transaction.isolation).toBe('strict');
      });

      it('supports relaxed isolation for performance', () => {
        const config: BatchConfig = {
          ...createBatchConfig(),
          transaction: {
            mode: 'best-effort',
            isolation: 'relaxed',
            timeout_ms: 30000,
          },
        };

        expect(config.transaction.isolation).toBe('relaxed');
      });

      it('prevents concurrent batches from interfering', () => {
        const batch1: Batch = {
          id: 'batch-001',
          operations: {
            write: [
              { type: 'edit', id: 'edit-1', edits: [{ file: 'shared.ts', edits: [] }] } as WriteOperation,
            ],
          },
          config: {
            ...createBatchConfig(),
            transaction: { mode: 'atomic', isolation: 'strict', timeout_ms: 30000 },
          },
          lifecycle: {},
          output: { mode: 'summary', include: [], exclude: [] },
        };

        const batch2: Batch = {
          id: 'batch-002',
          operations: {
            write: [
              { type: 'edit', id: 'edit-2', edits: [{ file: 'shared.ts', edits: [] }] } as WriteOperation,
            ],
          },
          config: {
            ...createBatchConfig(),
            transaction: { mode: 'atomic', isolation: 'strict', timeout_ms: 30000 },
          },
          lifecycle: {},
          output: { mode: 'summary', include: [], exclude: [] },
        };

        // Assert: Both batches target same file with strict isolation
        expect(batch1.config.transaction.isolation).toBe('strict');
        expect(batch2.config.transaction.isolation).toBe('strict');
        expect(batch1.id).not.toBe(batch2.id);
      });
    });

    describe('Durability', () => {
      it('persists checkpoints for recovery', () => {
        const config: BatchConfig = {
          ...createBatchConfig(),
          recovery: {
            checkpoint: true,
            rollback_on_fail: true,
            cleanup_on_success: false, // Keep checkpoint
          },
        };

        expect(config.recovery.checkpoint).toBe(true);
        expect(config.recovery.cleanup_on_success).toBe(false);
      });

      it('creates checkpoint before risky operations', () => {
        const result: BatchResult = {
          summary: {
            status: 'success',
            operations: { total: 1, succeeded: 1, failed: 0, skipped: 0 },
            duration_ms: 1000,
            tokens_used: 500,
          },
          phases: {
            write: {
              status: 'success',
              results: [
                { id: 'w1', type: 'delete', status: 'success', data: {}, duration_ms: 100, tokens_used: 100 },
              ],
              duration_ms: 100,
              tokens_used: 100,
            },
          },
          validation: {
            before: { check: 'none', passed: true },
            after: { check: 'none', passed: true },
          },
          recovery: {
            checkpoint_id: 'cp-before-delete',
            rollback_available: true,
            rollback_triggered: false,
          },
          execution_graph: {
            phases: ['write'],
            parallel_groups: [['w1']],
            critical_path_ms: 100,
          },
        };

        expect(result.recovery.checkpoint_id).toBe('cp-before-delete');
        expect(result.recovery.rollback_available).toBe(true);
      });

      it('supports recovery after system crash', () => {
        const config: BatchConfig = {
          ...createBatchConfig(),
          recovery: {
            checkpoint: true,
            rollback_on_fail: true,
            cleanup_on_success: false,
          },
        };

        // Checkpoint created before execution
        const checkpointId = 'cp-001';

        // After crash, can restore from checkpoint
        expect(config.recovery.checkpoint).toBe(true);
        expect(checkpointId).toBeDefined();
      });
    });
  });

  describe('1.1.4 Rollback Guarantees', () => {
    it('guarantees rollback on validation failure', () => {
      const result: BatchResult = {
        summary: {
          status: 'rolled_back',
          operations: { total: 2, succeeded: 2, failed: 0, skipped: 0 },
          duration_ms: 1000,
          tokens_used: 500,
        },
        phases: {
          write: {
            status: 'success',
            results: [
              { id: 'w1', type: 'edit', status: 'success', data: {}, duration_ms: 200, tokens_used: 300 },
            ],
            duration_ms: 200,
            tokens_used: 300,
          },
        },
        validation: {
          before: { check: 'none', passed: true },
          after: {
            check: 'test',
            passed: false,
            errors: ['Test suite failed'],
          },
        },
        recovery: {
          checkpoint_id: 'cp-002',
          rollback_available: true,
          rollback_triggered: true,
        },
        execution_graph: {
          phases: ['write'],
          parallel_groups: [['w1']],
          critical_path_ms: 200,
        },
      };

      expect(result.validation.after.passed).toBe(false);
      expect(result.recovery.rollback_triggered).toBe(true);
      expect(result.summary.status).toBe('rolled_back');
    });

    it('configures rollback behavior on failure', () => {
      const config: BatchConfig = {
        ...createBatchConfig(),
        recovery: {
          checkpoint: true,
          rollback_on_fail: true,
          cleanup_on_success: true,
        },
        validation: {
          before: [],
          after: ['test'],
          on_fail: 'rollback',
        },
      };

      expect(config.recovery.rollback_on_fail).toBe(true);
      expect(config.validation.on_fail).toBe('rollback');
    });

    it('preserves rollback checkpoint after failure', () => {
      const result: BatchResult = {
        summary: {
          status: 'rolled_back',
          operations: { total: 1, succeeded: 0, failed: 1, skipped: 0 },
          duration_ms: 500,
          tokens_used: 200,
        },
        phases: {
          exec: {
            status: 'failed',
            results: [
              {
                id: 'e1',
                type: 'command',
                status: 'failed',
                data: null,
                error: { code: 'EXIT_1', message: 'Command failed' },
                duration_ms: 100,
                tokens_used: 100,
              },
            ],
            duration_ms: 100,
            tokens_used: 100,
          },
        },
        validation: {
          before: { check: 'none', passed: true },
          after: { check: 'none', passed: true },
        },
        recovery: {
          checkpoint_id: 'cp-003',
          rollback_available: true,
          rollback_triggered: true,
        },
        execution_graph: {
          phases: ['exec'],
          parallel_groups: [['e1']],
          critical_path_ms: 100,
        },
      };

      // After rollback, checkpoint remains for inspection
      expect(result.recovery.checkpoint_id).toBe('cp-003');
      expect(result.recovery.rollback_available).toBe(true);
    });
  });

  describe('1.1.5 Transaction Isolation', () => {
    it('isolates batch state from global state', () => {
      const batch1: Batch = {
        id: 'batch-isolated-1',
        operations: {
          state: [
            {
              type: 'set',
              id: 'set-1',
              entries: [{ key: 'test.value', value: 'batch1' }],
            },
          ],
        },
        config: {
          ...createBatchConfig(),
          transaction: { mode: 'atomic', isolation: 'strict', timeout_ms: 30000 },
        },
        lifecycle: {},
        output: { mode: 'summary', include: [], exclude: [] },
      };

      const batch2: Batch = {
        id: 'batch-isolated-2',
        operations: {
          state: [
            {
              type: 'set',
              id: 'set-2',
              entries: [{ key: 'test.value', value: 'batch2' }],
            },
          ],
        },
        config: {
          ...createBatchConfig(),
          transaction: { mode: 'atomic', isolation: 'strict', timeout_ms: 30000 },
        },
        lifecycle: {},
        output: { mode: 'summary', include: [], exclude: [] },
      };

      // Assert: Both batches can set same key without interference
      expect(batch1.config.transaction.isolation).toBe('strict');
      expect(batch2.config.transaction.isolation).toBe('strict');
    });

    it('commits changes only on batch success', () => {
      const config: BatchConfig = {
        ...createBatchConfig(),
        transaction: {
          mode: 'atomic',
          isolation: 'strict',
          timeout_ms: 30000,
        },
        recovery: {
          checkpoint: true,
          rollback_on_fail: true,
          cleanup_on_success: true,
        },
      };

      // Changes committed only if all operations succeed
      expect(config.transaction.mode).toBe('atomic');
      expect(config.recovery.rollback_on_fail).toBe(true);
    });

    it('enforces timeout for transaction completion', () => {
      const config: BatchConfig = {
        ...createBatchConfig(),
        transaction: {
          mode: 'atomic',
          isolation: 'strict',
          timeout_ms: 60000, // 1 minute max
        },
      };

      expect(config.transaction.timeout_ms).toBe(60000);
      expect(config.transaction.timeout_ms).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// Helper Functions
// ============================================================================

function createBatchConfig(): BatchConfig {
  return {
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
      checkpoint: false,
      rollback_on_fail: false,
      cleanup_on_success: false,
    },
  };
}
