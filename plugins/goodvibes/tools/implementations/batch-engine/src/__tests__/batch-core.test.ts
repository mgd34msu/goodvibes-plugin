/**
 * Unit tests for Batch Engine Core interfaces
 * Tests batch construction, operation base, and result aggregation
 * @see SPEC-v2 Section 3
 */

import { describe, it, expect } from 'vitest';
import type { Batch, BatchConfig, OutputConfig } from '../interfaces/batch.js';
import type { OperationBase, Condition, Expectation } from '../interfaces/operation.js';
import type { BatchResult, PhaseResult, OperationResult, ErrorInfo, ValidationResult } from '../interfaces/result.js';
import type { ReadOperation } from '../interfaces/operations/read.js';
import type { WriteOperation } from '../interfaces/operations/write.js';
import type { ExecOperation } from '../interfaces/operations/exec.js';

describe('Batch Engine Core - SPEC-v2 Section 3', () => {
  describe('3.1 Batch Definition', () => {
    it('creates a valid minimal batch', () => {
      const batch: Batch = {
        id: 'batch-001',
        operations: {},
        config: createDefaultBatchConfig(),
        lifecycle: {},
        output: {
          mode: 'minimal',
          include: [],
          exclude: [],
        },
      };

      expect(batch.id).toBe('batch-001');
      expect(batch.parent_id).toBeUndefined();
      expect(batch.operations).toBeDefined();
      expect(batch.config).toBeDefined();
      expect(batch.lifecycle).toBeDefined();
      expect(batch.output).toBeDefined();
    });

    it('creates a batch with parent_id for chaining', () => {
      const parentBatch: Batch = {
        id: 'parent-001',
        operations: {},
        config: createDefaultBatchConfig(),
        lifecycle: {},
        output: { mode: 'summary', include: [], exclude: [] },
      };

      const childBatch: Batch = {
        id: 'child-001',
        parent_id: parentBatch.id,
        operations: {},
        config: createDefaultBatchConfig(),
        lifecycle: {},
        output: { mode: 'summary', include: [], exclude: [] },
      };

      expect(childBatch.parent_id).toBe('parent-001');
    });

    it('creates a batch with all operation types', () => {
      const batch: Batch = {
        id: 'batch-002',
        operations: {
          read: [
            {
              type: 'files',
              id: 'read-1',
              targets: ['file.ts'],
              extract: 'content',
            } as ReadOperation,
          ],
          write: [
            {
              type: 'create',
              id: 'write-1',
              files: [{ path: 'new.ts', content: 'export {}' }],
            } as WriteOperation,
          ],
          exec: [
            {
              type: 'command',
              id: 'exec-1',
              commands: [{ cmd: 'npm test' }],
            } as ExecOperation,
          ],
        },
        config: createDefaultBatchConfig(),
        lifecycle: {},
        output: { mode: 'full', include: [], exclude: [] },
      };

      expect(batch.operations.read).toHaveLength(1);
      expect(batch.operations.write).toHaveLength(1);
      expect(batch.operations.exec).toHaveLength(1);
    });

    describe('BatchConfig', () => {
      it('configures transaction control', () => {
        const config: BatchConfig = createDefaultBatchConfig();

        expect(config.transaction.mode).toBe('atomic');
        expect(config.transaction.isolation).toBe('strict');
        expect(config.transaction.timeout_ms).toBeGreaterThan(0);
      });

      it('configures execution control with retry', () => {
        const config: BatchConfig = {
          ...createDefaultBatchConfig(),
          execution: {
            mode: 'parallel',
            max_workers: 4,
            fail_fast: true,
            retry: {
              attempts: 3,
              backoff: 'exponential',
              delay_ms: 1000,
            },
          },
        };

        expect(config.execution.mode).toBe('parallel');
        expect(config.execution.max_workers).toBe(4);
        expect(config.execution.retry.attempts).toBe(3);
        expect(config.execution.retry.backoff).toBe('exponential');
      });

      it('configures preview and validation', () => {
        const config: BatchConfig = {
          ...createDefaultBatchConfig(),
          preview: {
            dry_run: true,
            diff: true,
            impact: true,
          },
          validation: {
            before: ['typecheck', 'lint'],
            after: ['test', 'build'],
            on_fail: 'rollback',
          },
        };

        expect(config.preview.dry_run).toBe(true);
        expect(config.validation.before).toContain('typecheck');
        expect(config.validation.after).toContain('test');
        expect(config.validation.on_fail).toBe('rollback');
      });

      it('configures recovery options', () => {
        const config: BatchConfig = {
          ...createDefaultBatchConfig(),
          recovery: {
            checkpoint: true,
            rollback_on_fail: true,
            cleanup_on_success: true,
          },
        };

        expect(config.recovery.checkpoint).toBe(true);
        expect(config.recovery.rollback_on_fail).toBe(true);
        expect(config.recovery.cleanup_on_success).toBe(true);
      });
    });

    describe('OutputConfig', () => {
      it('supports all output modes per SPEC-v2', () => {
        const modes: OutputConfig['mode'][] = ['minimal', 'summary', 'full', 'verbose'];

        modes.forEach((mode) => {
          const config: OutputConfig = {
            mode,
            include: [],
            exclude: [],
          };
          expect(config.mode).toBe(mode);
        });
      });

      it('configures include/exclude filters', () => {
        const config: OutputConfig = {
          mode: 'full',
          include: ['results', 'validation'],
          exclude: ['debug', 'stack_traces'],
          max_tokens: 10000,
        };

        expect(config.include).toContain('results');
        expect(config.exclude).toContain('debug');
        expect(config.max_tokens).toBe(10000);
      });
    });
  });

  describe('3.2 Operation Base', () => {
    it('creates operation with identity fields', () => {
      const operation: OperationBase = {
        id: 'op-001',
        type: 'files',
      };

      expect(operation.id).toBe('op-001');
      expect(operation.type).toBe('files');
    });

    it('creates operation with dependencies', () => {
      const operation: OperationBase = {
        id: 'op-002',
        type: 'edit',
        depends_on: ['op-001'],
      };

      expect(operation.depends_on).toContain('op-001');
    });

    it('creates operation with conditions', () => {
      const whenCondition: Condition = {
        expression: 'read_1.files.length > 0',
      };

      const skipCondition: Condition = {
        expression: 'env.CI === true',
      };

      const operation: OperationBase = {
        id: 'op-003',
        type: 'create',
        when: [whenCondition],
        skip_if: [skipCondition],
      };

      expect(operation.when).toHaveLength(1);
      expect(operation.when![0].expression).toBe('read_1.files.length > 0');
      expect(operation.skip_if).toHaveLength(1);
      expect(operation.skip_if![0].expression).toBe('env.CI === true');
    });

    it('creates operation with expectations', () => {
      const expectation: Expectation = {
        expression: 'exit_code == 0',
        message: 'Command must succeed',
      };

      const operation: OperationBase = {
        id: 'op-004',
        type: 'command',
        expect: [expectation],
      };

      expect(operation.expect).toHaveLength(1);
      expect(operation.expect![0].expression).toBe('exit_code == 0');
      expect(operation.expect![0].message).toBe('Command must succeed');
    });

    it('creates operation with template injection', () => {
      const operation: OperationBase = {
        id: 'op-005',
        type: 'create',
        inject: {
          content: '{{read_1.data.content}}',
          path: '{{env.OUTPUT_DIR}}/result.txt',
        },
      };

      expect(operation.inject).toBeDefined();
      expect(operation.inject!['content']).toBe('{{read_1.data.content}}');
      expect(operation.inject!['path']).toBe('{{env.OUTPUT_DIR}}/result.txt');
    });

    it('creates complex operation with all fields', () => {
      const operation: OperationBase = {
        id: 'op-complex',
        type: 'agent',
        depends_on: ['op-001', 'op-002'],
        when: [{ expression: 'config.mode === "production"' }],
        skip_if: [{ expression: 'skip_agents === true' }],
        expect: [
          { expression: 'status === "success"', message: 'Agent must complete successfully' },
          { expression: 'tokens_used < 50000', message: 'Token budget exceeded' },
        ],
        inject: {
          context: '{{op-001.data}}',
          config: '{{op-002.result}}',
        },
      };

      expect(operation.id).toBe('op-complex');
      expect(operation.depends_on).toHaveLength(2);
      expect(operation.when).toHaveLength(1);
      expect(operation.skip_if).toHaveLength(1);
      expect(operation.expect).toHaveLength(2);
      expect(operation.inject).toBeDefined();
    });
  });

  describe('3.3 Result Structure', () => {
    describe('OperationResult', () => {
      it('creates successful operation result', () => {
        const result: OperationResult = {
          id: 'op-001',
          type: 'files',
          status: 'success',
          data: { files: ['file1.ts', 'file2.ts'] },
          duration_ms: 150,
          tokens_used: 1200,
        };

        expect(result.status).toBe('success');
        expect(result.error).toBeUndefined();
        expect(result.duration_ms).toBeGreaterThan(0);
        expect(result.tokens_used).toBeGreaterThan(0);
      });

      it('creates failed operation result with error', () => {
        const errorInfo: ErrorInfo = {
          code: 'ENOENT',
          message: 'File not found',
          stack: 'Error: File not found\n  at ...',
        };

        const result: OperationResult = {
          id: 'op-002',
          type: 'files',
          status: 'failed',
          data: null,
          error: errorInfo,
          duration_ms: 50,
          tokens_used: 0,
        };

        expect(result.status).toBe('failed');
        expect(result.error).toBeDefined();
        expect(result.error!.code).toBe('ENOENT');
        expect(result.error!.message).toBe('File not found');
      });

      it('creates skipped operation result', () => {
        const result: OperationResult = {
          id: 'op-003',
          type: 'create',
          status: 'skipped',
          data: null,
          duration_ms: 0,
          tokens_used: 0,
        };

        expect(result.status).toBe('skipped');
        expect(result.duration_ms).toBe(0);
      });
    });

    describe('PhaseResult', () => {
      it('aggregates successful phase results', () => {
        const opResults: OperationResult[] = [
          { id: 'op-1', type: 'files', status: 'success', data: {}, duration_ms: 100, tokens_used: 500 },
          { id: 'op-2', type: 'files', status: 'success', data: {}, duration_ms: 150, tokens_used: 600 },
        ];

        const phaseResult: PhaseResult = {
          status: 'success',
          results: opResults,
          duration_ms: 250,
          tokens_used: 1100,
        };

        expect(phaseResult.status).toBe('success');
        expect(phaseResult.results).toHaveLength(2);
        expect(phaseResult.duration_ms).toBe(250);
        expect(phaseResult.tokens_used).toBe(1100);
      });

      it('marks phase as partial when some operations fail', () => {
        const opResults: OperationResult[] = [
          { id: 'op-1', type: 'create', status: 'success', data: {}, duration_ms: 100, tokens_used: 500 },
          { id: 'op-2', type: 'create', status: 'failed', data: null, error: { code: 'ERR', message: 'Failed' }, duration_ms: 50, tokens_used: 100 },
        ];

        const phaseResult: PhaseResult = {
          status: 'partial',
          results: opResults,
          duration_ms: 150,
          tokens_used: 600,
        };

        expect(phaseResult.status).toBe('partial');
        expect(phaseResult.results.filter((r) => r.status === 'success')).toHaveLength(1);
        expect(phaseResult.results.filter((r) => r.status === 'failed')).toHaveLength(1);
      });

      it('marks phase as failed when all operations fail', () => {
        const opResults: OperationResult[] = [
          { id: 'op-1', type: 'command', status: 'failed', data: null, error: { code: 'EXIT_1', message: 'Command failed' }, duration_ms: 100, tokens_used: 50 },
        ];

        const phaseResult: PhaseResult = {
          status: 'failed',
          results: opResults,
          duration_ms: 100,
          tokens_used: 50,
        };

        expect(phaseResult.status).toBe('failed');
      });
    });

    describe('BatchResult', () => {
      it('creates complete batch result with nested operations summary per SPEC-v2', () => {
        const result: BatchResult = {
          summary: {
            status: 'success',
            operations: {
              total: 5,
              succeeded: 4,
              failed: 1,
              skipped: 0,
            },
            duration_ms: 5000,
            tokens_used: 10000,
          },
          phases: {
            read: {
              status: 'success',
              results: [
                { id: 'read-1', type: 'files', status: 'success', data: {}, duration_ms: 200, tokens_used: 1000 },
              ],
              duration_ms: 200,
              tokens_used: 1000,
            },
            write: {
              status: 'partial',
              results: [
                { id: 'write-1', type: 'create', status: 'success', data: {}, duration_ms: 300, tokens_used: 2000 },
                { id: 'write-2', type: 'edit', status: 'failed', data: null, error: { code: 'ERR', message: 'Failed' }, duration_ms: 100, tokens_used: 500 },
              ],
              duration_ms: 400,
              tokens_used: 2500,
            },
            exec: {
              status: 'success',
              results: [
                { id: 'exec-1', type: 'command', status: 'success', data: { exit_code: 0 }, duration_ms: 4000, tokens_used: 6000 },
              ],
              duration_ms: 4000,
              tokens_used: 6000,
            },
          },
          validation: {
            before: {
              check: 'pre-validation',
              passed: true,
            },
            after: {
              check: 'post-validation',
              passed: true,
            },
          },
          recovery: {
            checkpoint_id: 'cp-001',
            rollback_available: true,
            rollback_triggered: false,
          },
          execution_graph: {
            phases: ['read', 'write', 'exec'],
            parallel_groups: [['read-1'], ['write-1', 'write-2'], ['exec-1']],
            critical_path_ms: 4600,
          },
        };

        // Verify summary structure matches SPEC-v2 Section 3.3
        expect(result.summary.status).toBe('success');
        expect(result.summary.operations).toBeDefined();
        expect(result.summary.operations.total).toBe(5);
        expect(result.summary.operations.succeeded).toBe(4);
        expect(result.summary.operations.failed).toBe(1);
        expect(result.summary.operations.skipped).toBe(0);
        expect(result.summary.duration_ms).toBe(5000);
        expect(result.summary.tokens_used).toBe(10000);

        // Verify phases
        expect(result.phases.read).toBeDefined();
        expect(result.phases.write).toBeDefined();
        expect(result.phases.exec).toBeDefined();

        // Verify validation
        expect(result.validation.before.passed).toBe(true);
        expect(result.validation.after.passed).toBe(true);

        // Verify recovery
        expect(result.recovery.checkpoint_id).toBe('cp-001');
        expect(result.recovery.rollback_available).toBe(true);
        expect(result.recovery.rollback_triggered).toBe(false);

        // Verify execution graph
        expect(result.execution_graph.phases).toEqual(['read', 'write', 'exec']);
        expect(result.execution_graph.parallel_groups).toHaveLength(3);
        expect(result.execution_graph.critical_path_ms).toBe(4600);
      });

      it('marks batch as rolled_back when rollback is triggered', () => {
        const result: BatchResult = {
          summary: {
            status: 'rolled_back',
            operations: {
              total: 2,
              succeeded: 0,
              failed: 2,
              skipped: 0,
            },
            duration_ms: 500,
            tokens_used: 1000,
          },
          phases: {
            write: {
              status: 'failed',
              results: [
                { id: 'write-1', type: 'create', status: 'failed', data: null, error: { code: 'ERR', message: 'Failed' }, duration_ms: 100, tokens_used: 500 },
              ],
              duration_ms: 100,
              tokens_used: 500,
            },
          },
          validation: {
            before: { check: 'none', passed: true },
            after: { check: 'none', passed: true },
          },
          recovery: {
            checkpoint_id: 'cp-002',
            rollback_available: true,
            rollback_triggered: true,
          },
          execution_graph: {
            phases: ['write'],
            parallel_groups: [['write-1']],
            critical_path_ms: 100,
          },
        };

        expect(result.summary.status).toBe('rolled_back');
        expect(result.recovery.rollback_triggered).toBe(true);
      });

      it('aggregates token usage across all phases', () => {
        const result: BatchResult = {
          summary: {
            status: 'success',
            operations: {
              total: 3,
              succeeded: 3,
              failed: 0,
              skipped: 0,
            },
            duration_ms: 1000,
            tokens_used: 15000, // Sum of all phases
          },
          phases: {
            read: {
              status: 'success',
              results: [{ id: 'r1', type: 'files', status: 'success', data: {}, duration_ms: 100, tokens_used: 5000 }],
              duration_ms: 100,
              tokens_used: 5000,
            },
            write: {
              status: 'success',
              results: [{ id: 'w1', type: 'create', status: 'success', data: {}, duration_ms: 200, tokens_used: 6000 }],
              duration_ms: 200,
              tokens_used: 6000,
            },
            exec: {
              status: 'success',
              results: [{ id: 'e1', type: 'command', status: 'success', data: {}, duration_ms: 300, tokens_used: 4000 }],
              duration_ms: 300,
              tokens_used: 4000,
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
            phases: ['read', 'write', 'exec'],
            parallel_groups: [['r1'], ['w1'], ['e1']],
            critical_path_ms: 600,
          },
        };

        const totalTokens =
          result.phases.read!.tokens_used +
          result.phases.write!.tokens_used +
          result.phases.exec!.tokens_used;

        expect(totalTokens).toBe(15000);
        expect(result.summary.tokens_used).toBe(totalTokens);
      });
    });
  });
});

// ============================================================================
// Helper Functions
// ============================================================================

function createDefaultBatchConfig(): BatchConfig {
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
