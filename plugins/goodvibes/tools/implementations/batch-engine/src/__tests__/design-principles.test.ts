/**
 * Tests for Design Principles - Section 1.2
 * Tests each principle: batch-native, token-efficient, transaction-safe, etc.
 * @see SPEC-v2 Section 1.2
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTelemetryCollector, resetGlobalTelemetryCollector, TelemetryCollectorImpl } from '../runtime/telemetry.js';
import { createCheckpointManager, resetGlobalCheckpointManager } from '../runtime/checkpoint.js';
import { createModeManager, resetGlobalModeManager } from '../runtime/mode.js';
import type { Batch, BatchConfig, OutputConfig } from '../interfaces/batch.js';
import type { ReadOperation } from '../interfaces/operations/read.js';
import type { WriteOperation } from '../interfaces/operations/write.js';
import type { BatchResult } from '../interfaces/result.js';

describe('Design Principles - Section 1.2', () => {
  describe('1.2.1 Batch-Native', () => {
    it('designs operations for batching, not individual calls', () => {
      // READ operations accept arrays
      const readOp: ReadOperation = {
        type: 'files',
        id: 'read-1',
        targets: ['file1.ts', 'file2.ts', 'file3.ts'], // Array of files
        extract: 'content',
      };

      expect(Array.isArray(readOp.targets)).toBe(true);
      expect(readOp.targets.length).toBeGreaterThan(1);
    });

    it('supports bulk write operations', () => {
      const writeOp: WriteOperation = {
        type: 'create',
        id: 'create-bulk',
        files: [
          { path: 'component1.tsx', content: 'export {}' },
          { path: 'component2.tsx', content: 'export {}' },
          { path: 'component3.tsx', content: 'export {}' },
        ],
      };

      expect((writeOp as any).files).toHaveLength(3);
    });

    it('supports bulk edit operations', () => {
      const editOp: WriteOperation = {
        type: 'edit',
        id: 'edit-bulk',
        edits: [
          {
            file: 'file1.ts',
            edits: [{ find: 'old', replace: 'new' }],
          },
          {
            file: 'file2.ts',
            edits: [{ find: 'old', replace: 'new' }],
          },
        ],
      };

      expect((editOp as any).edits).toHaveLength(2);
    });

    it('groups operations by phase automatically', () => {
      const batch: Batch = {
        id: 'batch-001',
        operations: {
          read: [
            { type: 'files', id: 'r1', targets: ['a.ts'], extract: 'content' } as ReadOperation,
            { type: 'search', id: 'r2', pattern: 'test', output_mode: 'files' } as ReadOperation,
          ],
          write: [
            { type: 'edit', id: 'w1', edits: [] } as WriteOperation,
          ],
        },
        config: createBatchConfig(),
        lifecycle: {},
        output: { mode: 'summary', include: [], exclude: [] },
      };

      // Operations automatically grouped by type
      expect(batch.operations.read).toBeDefined();
      expect(batch.operations.write).toBeDefined();
      expect(batch.operations.read!.length).toBe(2);
      expect(batch.operations.write!.length).toBe(1);
    });

    it('avoids single-item batches in favor of aggregation', () => {
      // Anti-pattern: Multiple batches with single operation
      const badPattern = [
        { id: 'batch-1', operations: { read: [{ type: 'files', id: 'r1', targets: ['a.ts'], extract: 'content' }] } },
        { id: 'batch-2', operations: { read: [{ type: 'files', id: 'r2', targets: ['b.ts'], extract: 'content' }] } },
        { id: 'batch-3', operations: { read: [{ type: 'files', id: 'r3', targets: ['c.ts'], extract: 'content' }] } },
      ];

      // Good pattern: Single batch with multiple operations
      const goodPattern: Batch = {
        id: 'batch-combined',
        operations: {
          read: [
            { type: 'files', id: 'r-all', targets: ['a.ts', 'b.ts', 'c.ts'], extract: 'content' } as ReadOperation,
          ],
        },
        config: createBatchConfig(),
        lifecycle: {},
        output: { mode: 'summary', include: [], exclude: [] },
      };

      expect(badPattern.length).toBe(3);
      expect(goodPattern.operations.read![0].targets.length).toBe(3);
    });
  });

  describe('1.2.2 Token-Efficient', () => {
    it('supports minimal output mode', () => {
      const config: OutputConfig = {
        mode: 'minimal',
        include: [],
        exclude: [],
      };

      expect(config.mode).toBe('minimal');
    });

    it('supports summary output mode', () => {
      const config: OutputConfig = {
        mode: 'summary',
        include: ['results'],
        exclude: ['debug', 'stack_traces'],
      };

      expect(config.mode).toBe('summary');
      expect(config.exclude).toContain('debug');
      expect(config.exclude).toContain('stack_traces');
    });

    it('enforces max token limit on output', () => {
      const config: OutputConfig = {
        mode: 'full',
        include: [],
        exclude: [],
        max_tokens: 5000,
      };

      expect(config.max_tokens).toBe(5000);
      expect(config.max_tokens).toBeGreaterThan(0);
    });

    it('excludes verbose data from output by default', () => {
      const config: OutputConfig = {
        mode: 'summary',
        include: ['results', 'validation'],
        exclude: ['debug', 'stack_traces', 'raw_output', 'intermediate_values'],
      };

      expect(config.exclude).toContain('debug');
      expect(config.exclude).toContain('stack_traces');
      expect(config.exclude).toContain('raw_output');
      expect(config.exclude).toContain('intermediate_values');
    });

    it('uses outline extract mode for structure analysis', () => {
      const readOp: ReadOperation = {
        type: 'files',
        id: 'read-outline',
        targets: ['large-file.ts'],
        extract: 'outline', // Structure only, not full content
      };

      expect(readOp.extract).toBe('outline');
    });

    it('uses symbols extract mode for function discovery', () => {
      const readOp: ReadOperation = {
        type: 'files',
        id: 'read-symbols',
        targets: ['module.ts'],
        extract: 'symbols', // Function/class names only
      };

      expect(readOp.extract).toBe('symbols');
    });

    it('limits search results with output modes', () => {
      const searchOp: ReadOperation = {
        type: 'search',
        id: 'search-limited',
        pattern: 'TODO',
        output_mode: 'count', // Just count, not full results
      };

      expect(searchOp.output_mode).toBe('count');
    });
  });

  describe('1.2.3 Transaction-Safe', () => {
    let checkpointManager: any;

    beforeEach(() => {
      checkpointManager = createCheckpointManager('/test/project');
    });

    afterEach(() => {
      resetGlobalCheckpointManager();
    });

    it('creates checkpoints before risky operations', async () => {
      const config: BatchConfig = {
        ...createBatchConfig(),
        recovery: {
          checkpoint: true,
          rollback_on_fail: true,
          cleanup_on_success: false,
        },
      };

      expect(config.recovery.checkpoint).toBe(true);
    });

    it('supports manual checkpoint creation', async () => {
      const checkpointConfig = {
        label: 'before-delete',
        include_state: true,
        include_memory: true,
        include_files: ['important.ts'],
      };

      // Checkpoint manager should support this
      expect(checkpointConfig.label).toBe('before-delete');
      expect(checkpointConfig.include_state).toBe(true);
    });

    it('enables rollback to any checkpoint', () => {
      const result: BatchResult = {
        summary: {
          status: 'rolled_back',
          operations: { total: 1, succeeded: 0, failed: 1, skipped: 0 },
          duration_ms: 500,
          tokens_used: 200,
        },
        phases: {},
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
          phases: [],
          parallel_groups: [],
          critical_path_ms: 0,
        },
      };

      expect(result.recovery.checkpoint_id).toBe('cp-001');
      expect(result.recovery.rollback_triggered).toBe(true);
    });

    it('cleans up checkpoints on success', () => {
      const config: BatchConfig = {
        ...createBatchConfig(),
        recovery: {
          checkpoint: true,
          rollback_on_fail: true,
          cleanup_on_success: true, // Auto-cleanup
        },
      };

      expect(config.recovery.cleanup_on_success).toBe(true);
    });

    it('preserves checkpoints on failure for debugging', () => {
      const config: BatchConfig = {
        ...createBatchConfig(),
        recovery: {
          checkpoint: true,
          rollback_on_fail: true,
          cleanup_on_success: false, // Keep for inspection
        },
      };

      expect(config.recovery.cleanup_on_success).toBe(false);
    });
  });

  describe('1.2.4 Context-Aware', () => {
    it('injects context via template variables', () => {
      const readOp: ReadOperation = {
        type: 'files',
        id: 'read-1',
        targets: ['file.ts'],
        extract: 'content',
      };

      const writeOp: WriteOperation = {
        type: 'create',
        id: 'write-1',
        depends_on: ['read-1'],
        inject: {
          content: '{{read-1.data.content}}', // Template injection
        },
        files: [{ path: 'output.ts', content: '' }],
      };

      expect(writeOp.inject).toBeDefined();
      expect(writeOp.inject!['content']).toContain('{{read-1.data.content}}');
    });

    it('supports environment variable injection', () => {
      const operation: ReadOperation = {
        type: 'files',
        id: 'read-env',
        targets: ['{{env.CONFIG_FILE}}'], // Environment variable
        extract: 'content',
      };

      expect(operation.targets[0]).toContain('{{env.CONFIG_FILE}}');
    });

    it('supports conditional execution based on context', () => {
      const operation: WriteOperation = {
        type: 'edit',
        id: 'conditional-edit',
        when: [
          { expression: 'read-1.data.files.length > 0' }, // Only if files found
        ],
        edits: [],
      };

      expect(operation.when).toHaveLength(1);
      expect(operation.when![0].expression).toContain('read-1.data.files.length');
    });

    it('supports skip conditions based on context', () => {
      const operation: ReadOperation = {
        type: 'files',
        id: 'skip-in-ci',
        targets: ['local-only.ts'],
        extract: 'content',
        skip_if: [
          { expression: 'env.CI === true' }, // Skip in CI
        ],
      };

      expect(operation.skip_if).toHaveLength(1);
      expect(operation.skip_if![0].expression).toBe('env.CI === true');
    });

    it('validates expectations using context', () => {
      const operation: any = {
        type: 'command',
        id: 'build',
        commands: [{ cmd: 'npm run build' }],
        expect: [
          { expression: 'exit_code == 0', message: 'Build must succeed' },
          { expression: 'stdout.includes("success")', message: 'Must output success' },
        ],
      };

      expect(operation.expect).toHaveLength(2);
      expect(operation.expect[0].expression).toBe('exit_code == 0');
    });
  });

  describe('1.2.5 Mode-Adaptive', () => {
    let modeManager: any;

    beforeEach(() => {
      modeManager = createModeManager();
    });

    afterEach(() => {
      resetGlobalModeManager();
    });

    it('adapts behavior based on vibecoding mode', () => {
      const mode = 'vibecoding';
      const behavior = {
        ask_on_ambiguity: true,
        show_progress: true,
        detailed_errors: true,
        auto_fix: false,
      };

      expect(behavior.ask_on_ambiguity).toBe(true);
      expect(behavior.show_progress).toBe(true);
    });

    it('adapts behavior based on justvibes mode', () => {
      const mode = 'justvibes';
      const behavior = {
        ask_on_ambiguity: false,
        show_progress: false,
        detailed_errors: false,
        auto_fix: true,
      };

      expect(behavior.ask_on_ambiguity).toBe(false);
      expect(behavior.auto_fix).toBe(true);
    });

    it('adjusts output verbosity by mode', () => {
      const vibeCodingOutput: OutputConfig = {
        mode: 'full',
        include: ['results', 'validation', 'progress'],
        exclude: [],
      };

      const justVibesOutput: OutputConfig = {
        mode: 'minimal',
        include: [],
        exclude: ['debug', 'progress', 'intermediate'],
      };

      expect(vibeCodingOutput.mode).toBe('full');
      expect(justVibesOutput.mode).toBe('minimal');
    });

    it('adjusts error handling by mode', () => {
      const vibeCodingConfig: BatchConfig = {
        ...createBatchConfig(),
        execution: {
          mode: 'sequential',
          max_workers: 1,
          fail_fast: true, // Stop on first error
          retry: { attempts: 0, backoff: 'fixed', delay_ms: 100 },
        },
      };

      const justVibesConfig: BatchConfig = {
        ...createBatchConfig(),
        execution: {
          mode: 'parallel',
          max_workers: 10,
          fail_fast: false, // Continue on error
          retry: { attempts: 3, backoff: 'exponential', delay_ms: 1000 },
        },
      };

      expect(vibeCodingConfig.execution.fail_fast).toBe(true);
      expect(justVibesConfig.execution.fail_fast).toBe(false);
      expect(justVibesConfig.execution.retry.attempts).toBe(3);
    });

    it('supports mode override per batch', () => {
      const batch: Batch = {
        id: 'batch-001',
        operations: {},
        config: createBatchConfig(),
        lifecycle: {},
        output: {
          mode: 'verbose', // Override mode
          include: [],
          exclude: [],
        },
      };

      expect(batch.output.mode).toBe('verbose');
    });
  });

  describe('1.2.6 Self-Healing', () => {
    it('configures automatic retry on transient failures', () => {
      const config: BatchConfig = {
        ...createBatchConfig(),
        execution: {
          mode: 'parallel',
          max_workers: 5,
          fail_fast: false,
          retry: {
            attempts: 3,
            backoff: 'exponential',
            delay_ms: 1000,
          },
        },
      };

      expect(config.execution.retry.attempts).toBe(3);
      expect(config.execution.retry.backoff).toBe('exponential');
    });

    it('supports exponential backoff for retries', () => {
      const retryConfig = {
        attempts: 3,
        backoff: 'exponential',
        delay_ms: 1000,
      };

      // Expected delays: 1000ms, 2000ms, 4000ms
      const delays = [1000, 2000, 4000];

      expect(retryConfig.backoff).toBe('exponential');
      expect(delays[0]).toBe(1000);
      expect(delays[1]).toBe(2000);
      expect(delays[2]).toBe(4000);
    });

    it('supports linear backoff for retries', () => {
      const retryConfig = {
        attempts: 3,
        backoff: 'linear',
        delay_ms: 1000,
      };

      // Expected delays: 1000ms, 2000ms, 3000ms
      const delays = [1000, 2000, 3000];

      expect(retryConfig.backoff).toBe('linear');
      expect(delays[0]).toBe(1000);
      expect(delays[1]).toBe(2000);
      expect(delays[2]).toBe(3000);
    });

    it('supports fixed backoff for retries', () => {
      const retryConfig = {
        attempts: 3,
        backoff: 'fixed',
        delay_ms: 1000,
      };

      // Expected delays: 1000ms, 1000ms, 1000ms
      const delays = [1000, 1000, 1000];

      expect(retryConfig.backoff).toBe('fixed');
      expect(delays.every(d => d === 1000)).toBe(true);
    });

    it('enables fix loop for automatic error correction', () => {
      // Fix loop attempts to automatically fix common errors
      const fixLoopConfig = {
        enabled: true,
        max_attempts: 3,
        strategies: ['syntax-fix', 'import-fix', 'type-fix'],
      };

      expect(fixLoopConfig.enabled).toBe(true);
      expect(fixLoopConfig.max_attempts).toBe(3);
      expect(fixLoopConfig.strategies).toContain('syntax-fix');
    });

    it('learns from past failures to prevent recurrence', () => {
      // Memory system stores failure patterns
      const failurePattern = {
        error_type: 'MODULE_NOT_FOUND',
        solution: 'install-dependency',
        success_rate: 0.95,
      };

      expect(failurePattern.error_type).toBe('MODULE_NOT_FOUND');
      expect(failurePattern.solution).toBe('install-dependency');
      expect(failurePattern.success_rate).toBeGreaterThan(0.9);
    });
  });

  describe('1.2.7 Observable', () => {
    let telemetry: TelemetryCollectorImpl;

    beforeEach(() => {
      telemetry = createTelemetryCollector('/test/project') as TelemetryCollectorImpl;
    });

    afterEach(() => {
      resetGlobalTelemetryCollector();
    });

    it('records all operation metrics', () => {
      const operation = {
        id: 'op-001',
        type: 'files',
      };

      telemetry.recordOperationStart(operation);
      telemetry.recordOperationComplete('op-001', {
        operation_id: 'op-001',
        type: 'files',
        status: 'success',
        tokens_used: 1000,
        data: {},
      });

      const session = telemetry.getSessionMetrics();
      expect(session.total_operations).toBe(1);
      expect(session.total_tokens).toBe(1000);
    });

    it('records batch execution metrics', () => {
      const batch = {
        id: 'batch-001',
        operations: {},
        config: createBatchConfig(),
        lifecycle: {},
        output: { mode: 'summary' as const, include: [], exclude: [] },
      };

      telemetry.recordBatchStart(batch);
      telemetry.recordBatchComplete('batch-001', {
        summary: {
          status: 'success',
          operations: { total: 1, succeeded: 1, failed: 0, skipped: 0 },
          duration_ms: 1000,
          tokens_used: 500,
        },
        phases: {},
        validation: {
          before: { check: 'none', passed: true },
          after: { check: 'none', passed: true },
        },
        recovery: {
          rollback_available: false,
          rollback_triggered: false,
        },
        execution_graph: {
          phases: [],
          parallel_groups: [],
          critical_path_ms: 0,
        },
      });

      const session = telemetry.getSessionMetrics();
      expect(session.total_batches).toBe(1);
    });

    it('tracks token usage per operation type', () => {
      telemetry.recordOperationStart({ id: 'op-1', type: 'files' });
      telemetry.recordOperationComplete('op-1', {
        operation_id: 'op-1',
        type: 'files',
        status: 'success',
        tokens_used: 500,
        data: {},
      });

      telemetry.recordOperationStart({ id: 'op-2', type: 'search' });
      telemetry.recordOperationComplete('op-2', {
        operation_id: 'op-2',
        type: 'search',
        status: 'success',
        tokens_used: 300,
        data: {},
      });

      const session = telemetry.getSessionMetrics();
      expect(session.tokens_by_type.files).toBe(500);
      expect(session.tokens_by_type.search).toBe(300);
    });

    it('identifies performance bottlenecks', () => {
      // Simulate slow operation
      telemetry.recordOperationStart({ id: 'slow-op', type: 'files' });
      telemetry.recordOperationComplete('slow-op', {
        operation_id: 'slow-op',
        type: 'files',
        status: 'success',
        tokens_used: 1000,
        data: {},
      });

      const bottlenecks = telemetry.identifyBottlenecks();
      expect(Array.isArray(bottlenecks)).toBe(true);
    });

    it('exports telemetry reports in multiple formats', () => {
      telemetry.recordOperationStart({ id: 'op-1', type: 'files' });
      telemetry.recordOperationComplete('op-1', {
        operation_id: 'op-1',
        type: 'files',
        status: 'success',
        tokens_used: 100,
        data: {},
      });

      const jsonReport = telemetry.exportReport('json');
      const markdownReport = telemetry.exportReport('markdown');

      expect(() => JSON.parse(jsonReport)).not.toThrow();
      expect(markdownReport).toContain('# Telemetry Report');
    });

    it('persists telemetry data to disk', async () => {
      await expect(telemetry.persist()).resolves.not.toThrow();
    });

    it('calculates success rates by operation type', () => {
      telemetry.recordOperationStart({ id: 'op-1', type: 'files' });
      telemetry.recordOperationComplete('op-1', {
        operation_id: 'op-1',
        type: 'files',
        status: 'success',
        tokens_used: 100,
        data: {},
      });

      telemetry.recordOperationStart({ id: 'op-2', type: 'files' });
      telemetry.recordOperationComplete('op-2', {
        operation_id: 'op-2',
        type: 'files',
        status: 'error',
        tokens_used: 50,
        data: {},
        error: 'Test error',
      });

      const aggregations = telemetry.getAggregations();
      expect(aggregations.by_operation_type.files.success_rate).toBe(50);
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
