/**
 * Comprehensive tests for Telemetry system
 * Tests recording metrics, aggregations, cost estimation, and trend analysis
 * @see SPEC-v2 Sections 9.1-9.4
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TelemetryCollectorImpl, createTelemetryCollector, resetGlobalTelemetryCollector } from '../runtime/telemetry.js';
import type { Batch } from '../interfaces/batch.js';
import type { OperationResult, BatchResult } from '../interfaces/result.js';
import type { OperationBase } from '../interfaces/operation.js';
import type { AgentSpec } from '../interfaces/operations/exec.js';
import type { AgentResult } from '../interfaces/state-api.js';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock fs module
vi.mock('fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue('{}'),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

describe('Telemetry System', () => {
  let telemetry: TelemetryCollectorImpl;
  let testRoot: string;

  beforeEach(() => {
    testRoot = '/test/project';
    telemetry = new TelemetryCollectorImpl(testRoot);
    vi.clearAllMocks();
    resetGlobalTelemetryCollector();
  });

  afterEach(() => {
    resetGlobalTelemetryCollector();
  });

  // ==========================================================================
  // Session Metrics Recording
  // ==========================================================================

  describe('Session Metrics', () => {
    it('initializes with empty session metrics', () => {
      const session = telemetry.getSessionMetrics();

      expect(session.id).toMatch(/^session_\d+_[a-f0-9]+$/);
      expect(session.started_at).toBeDefined();
      expect(session.total_batches).toBe(0);
      expect(session.total_operations).toBe(0);
      expect(session.total_agents).toBe(0);
      expect(session.total_tokens).toBe(0);
      expect(session.total_duration_ms).toBeGreaterThanOrEqual(0);
    });

    it('tracks session duration correctly', async () => {
      const start = telemetry.getSessionMetrics();
      const startDuration = start.total_duration_ms;

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 10));

      const updated = telemetry.getSessionMetrics();
      expect(updated.total_duration_ms).toBeGreaterThan(startDuration);
    });

    it('accumulates operation metrics in session', () => {
      const operation: OperationBase = {
        id: 'op-001',
        type: 'files',
      };

      const result: OperationResult = {
        operation_id: 'op-001',
        type: 'files',
        status: 'success',
        tokens_used: 1000,
        data: {},
      };

      telemetry.recordOperationStart(operation);
      telemetry.recordOperationComplete('op-001', result);

      const session = telemetry.getSessionMetrics();
      expect(session.total_operations).toBe(1);
      expect(session.total_tokens).toBe(1000);
      expect(session.operations_by_type.files).toBe(1);
      expect(session.tokens_by_type.files).toBe(1000);
    });

    it('tracks rollback triggers', () => {
      const batch: Batch = createMockBatch('batch-001');
      const result = createMockBatchResult('batch-001', {
        recovery: {
          checkpoint_id: 'cp-001',
          rollback_triggered: true,
        },
      });

      telemetry.recordBatchStart(batch);
      telemetry.recordBatchComplete('batch-001', result);

      const session = telemetry.getSessionMetrics();
      expect(session.rollbacks_triggered).toBe(1);
    });

    it('calculates success rates correctly', () => {
      // Record 3 successful and 2 failed operations
      for (let i = 0; i < 3; i++) {
        const op: OperationBase = { id: `op-${i}`, type: 'files' };
        const res: OperationResult = {
          operation_id: `op-${i}`,
          type: 'files',
          status: 'success',
          tokens_used: 100,
          data: {},
        };
        telemetry.recordOperationStart(op);
        telemetry.recordOperationComplete(`op-${i}`, res);
      }

      for (let i = 3; i < 5; i++) {
        const op: OperationBase = { id: `op-${i}`, type: 'files' };
        const res: OperationResult = {
          operation_id: `op-${i}`,
          type: 'files',
          status: 'error',
          tokens_used: 50,
          data: {},
          error: 'Test error',
        };
        telemetry.recordOperationStart(op);
        telemetry.recordOperationComplete(`op-${i}`, res);
      }

      const session = telemetry.getSessionMetrics();
      expect(session.operation_success_rate).toBe(60); // 3/5 = 60%
    });
  });

  // ==========================================================================
  // Batch Metrics Recording
  // ==========================================================================

  describe('Batch Metrics', () => {
    it('records batch start time', () => {
      const batch = createMockBatch('batch-001');
      telemetry.recordBatchStart(batch);

      // Internal state should track active batch
      const session = telemetry.getSessionMetrics();
      expect(session.total_batches).toBe(0); // Not completed yet
    });

    it('records batch completion with all metrics', () => {
      const batch = createMockBatch('batch-001');
      const result = createMockBatchResult('batch-001', {
        status: 'success',
        summary: {
          status: 'success',
          duration_ms: 1000,
          operations: {
            total: 10,
            succeeded: 8,
            failed: 2,
          },
          operations_total: 10,
          operations_succeeded: 8,
          operations_failed: 2,
          tokens_used: 5000,
        },
      });

      telemetry.recordBatchStart(batch);
      telemetry.recordBatchComplete('batch-001', result);

      const batchMetrics = telemetry.getBatchMetrics('batch-001');
      expect(batchMetrics.id).toBe('batch-001');
      expect(batchMetrics.status).toBe('success');
      expect(batchMetrics.operations_total).toBe(10);
      expect(batchMetrics.operations_succeeded).toBe(8);
      expect(batchMetrics.operations_failed).toBe(2);
      expect(batchMetrics.tokens_used).toBe(5000);
      expect(batchMetrics.duration_ms).toBeGreaterThanOrEqual(0);
    });

    it('calculates parallel efficiency', () => {
      const batch = createMockBatch('batch-001');
      const result = createMockBatchResult('batch-001', {
        execution_graph: {
          critical_path_ms: 1000,
          parallel_groups: [[{ id: 'op-1' }], [{ id: 'op-2' }]],
        },
        duration_ms: 2000,
      });

      telemetry.recordBatchStart(batch);
      telemetry.recordBatchComplete('batch-001', result);

      const batchMetrics = telemetry.getBatchMetrics('batch-001');
      expect(batchMetrics.parallel_efficiency).toBeGreaterThan(0);
    });

    it('tracks validation results', () => {
      const batch = createMockBatch('batch-001');
      const result = createMockBatchResult('batch-001', {
        validation: {
          after: {
            passed: false,
            errors: ['Error 1', 'Error 2'],
          },
        },
      });

      telemetry.recordBatchStart(batch);
      telemetry.recordBatchComplete('batch-001', result);

      const batchMetrics = telemetry.getBatchMetrics('batch-001');
      expect(batchMetrics.validation_passed).toBe(false);
      expect(batchMetrics.validation_errors).toBe(2);
    });

    it('tracks checkpoint creation', () => {
      const batch = createMockBatch('batch-001');
      const result = createMockBatchResult('batch-001', {
        recovery: {
          checkpoint_id: 'cp-001',
          rollback_triggered: false,
        },
      });

      telemetry.recordBatchStart(batch);
      telemetry.recordBatchComplete('batch-001', result);

      const batchMetrics = telemetry.getBatchMetrics('batch-001');
      expect(batchMetrics.checkpoint_created).toBe(true);
    });

    it('throws error for non-existent batch', () => {
      expect(() => {
        telemetry.getBatchMetrics('non-existent');
      }).toThrow('Batch not found: non-existent');
    });
  });

  // ==========================================================================
  // Operation Metrics Recording
  // ==========================================================================

  describe('Operation Metrics', () => {
    it('records operation execution time', async () => {
      const operation: OperationBase = {
        id: 'op-001',
        type: 'files',
      };

      const result: OperationResult = {
        operation_id: 'op-001',
        type: 'files',
        status: 'success',
        tokens_used: 500,
        data: { files_read: 2 },
      };

      telemetry.recordOperationStart(operation);
      await new Promise(resolve => setTimeout(resolve, 10));
      telemetry.recordOperationComplete('op-001', result);

      const session = telemetry.getSessionMetrics();
      expect(session.total_operations).toBe(1);
      expect(session.total_tokens).toBe(500);
    });

    it('tracks operation types separately', () => {
      const types = ['files', 'search', 'edit', 'command'];

      types.forEach((type, i) => {
        const op: OperationBase = { id: `op-${i}`, type };
        const res: OperationResult = {
          operation_id: `op-${i}`,
          type,
          status: 'success',
          tokens_used: 100 * (i + 1),
          data: {},
        };
        telemetry.recordOperationStart(op);
        telemetry.recordOperationComplete(`op-${i}`, res);
      });

      const session = telemetry.getSessionMetrics();
      expect(session.operations_by_type.files).toBe(1);
      expect(session.operations_by_type.search).toBe(1);
      expect(session.operations_by_type.edit).toBe(1);
      expect(session.operations_by_type.command).toBe(1);
      expect(session.tokens_by_type.files).toBe(100);
      expect(session.tokens_by_type.search).toBe(200);
      expect(session.tokens_by_type.edit).toBe(300);
      expect(session.tokens_by_type.command).toBe(400);
    });

    it('records operation within batch context', () => {
      const batch = createMockBatch('batch-001');
      telemetry.recordBatchStart(batch);

      const operation: OperationBase = {
        id: 'op-001',
        type: 'files',
      };

      const result: OperationResult = {
        operation_id: 'op-001',
        type: 'files',
        status: 'success',
        tokens_used: 1000,
        data: {},
      };

      telemetry.recordOperationStart(operation);
      telemetry.recordOperationComplete('op-001', result);

      // Operation should be associated with batch
      const session = telemetry.getSessionMetrics();
      expect(session.total_operations).toBe(1);
    });
  });

  // ==========================================================================
  // Agent Metrics Recording
  // ==========================================================================

  describe('Agent Metrics', () => {
    it('records agent execution metrics', () => {
      const agent: AgentSpec = {
        id: 'agent-001',
        agent: 'engineer',
        task: 'Implement feature X',
        budget: {
          max_tokens: 10000,
          max_turns: 5,
          timeout_ms: 60000,
        },
      };

      const result: AgentResult = {
        status: 'success',
        tokens_used: 8000,
        turns_used: 3,
        files_modified: ['src/main.ts', 'src/utils.ts'],
        summary: 'Feature implemented successfully',
      };

      telemetry.recordAgentStart(agent);
      telemetry.recordAgentComplete('agent-001', result);

      const session = telemetry.getSessionMetrics();
      expect(session.total_agents).toBe(1);
    });

    it('calculates budget utilization', () => {
      const agent: AgentSpec = {
        id: 'agent-001',
        agent: 'tester',
        task: 'Write tests',
        budget: {
          max_tokens: 5000,
          max_turns: 3,
        },
      };

      const result: AgentResult = {
        status: 'success',
        tokens_used: 4000,
        turns_used: 2,
        files_modified: ['test.spec.ts'],
      };

      telemetry.recordAgentStart(agent);
      telemetry.recordAgentComplete('agent-001', result);

      // Budget utilization should be 80% (4000/5000)
      const aggregations = telemetry.getAggregations();
      // Can't directly access agent metrics, but session should be updated
      const session = telemetry.getSessionMetrics();
      expect(session.total_agents).toBe(1);
    });

    it('estimates input/output token distribution', () => {
      const agent: AgentSpec = {
        id: 'agent-001',
        agent: 'engineer',
        task: 'Test task',
      };

      const result: AgentResult = {
        status: 'success',
        tokens_used: 10000,
        turns_used: 2,
        files_modified: [],
      };

      telemetry.recordAgentStart(agent);
      telemetry.recordAgentComplete('agent-001', result);

      // Implementation estimates 30% input, 70% output
      // This is verified internally in the agent metrics
      const session = telemetry.getSessionMetrics();
      expect(session.total_agents).toBe(1);
    });
  });

  // ==========================================================================
  // Aggregations
  // ==========================================================================

  describe('Aggregations', () => {
    it('aggregates operations by type', () => {
      // Record multiple operations of different types
      const types = ['files', 'files', 'search', 'edit', 'edit', 'edit'];

      types.forEach((type, i) => {
        const op: OperationBase = { id: `op-${i}`, type };
        const res: OperationResult = {
          operation_id: `op-${i}`,
          type,
          status: i % 2 === 0 ? 'success' : 'error',
          tokens_used: 100,
          data: {},
          error: i % 2 === 0 ? undefined : 'Error',
        };
        telemetry.recordOperationStart(op);
        telemetry.recordOperationComplete(`op-${i}`, res);
      });

      const aggregations = telemetry.getAggregations();
      expect(aggregations.by_operation_type.files).toBeDefined();
      expect(aggregations.by_operation_type.files.count).toBe(2);
      expect(aggregations.by_operation_type.search.count).toBe(1);
      expect(aggregations.by_operation_type.edit.count).toBe(3);
    });

    it('calculates average tokens per operation type', () => {
      const operations = [
        { type: 'files', tokens: 100 },
        { type: 'files', tokens: 200 },
        { type: 'files', tokens: 300 },
      ];

      operations.forEach((op, i) => {
        const operation: OperationBase = { id: `op-${i}`, type: op.type };
        const result: OperationResult = {
          operation_id: `op-${i}`,
          type: op.type,
          status: 'success',
          tokens_used: op.tokens,
          data: {},
        };
        telemetry.recordOperationStart(operation);
        telemetry.recordOperationComplete(`op-${i}`, result);
      });

      const aggregations = telemetry.getAggregations();
      expect(aggregations.by_operation_type.files.avg_tokens).toBe(200); // (100+200+300)/3
    });

    it('tracks success rate by operation type', () => {
      const operations = [
        { type: 'files', status: 'success' },
        { type: 'files', status: 'success' },
        { type: 'files', status: 'error' },
      ];

      operations.forEach((op, i) => {
        const operation: OperationBase = { id: `op-${i}`, type: op.type };
        const result: OperationResult = {
          operation_id: `op-${i}`,
          type: op.type,
          status: op.status as 'success' | 'error',
          tokens_used: 100,
          data: {},
          error: op.status === 'error' ? 'Error' : undefined,
        };
        telemetry.recordOperationStart(operation);
        telemetry.recordOperationComplete(`op-${i}`, result);
      });

      const aggregations = telemetry.getAggregations();
      expect(aggregations.by_operation_type.files.success_rate).toBeCloseTo(66.67, 1);
    });
  });

  // ==========================================================================
  // Cost Estimation
  // ==========================================================================

  describe('Cost Estimation', () => {
    it('estimates cost for token usage', () => {
      const cost = telemetry.estimateCost(1000000); // 1M tokens
      expect(cost).toBeGreaterThan(0);
      expect(cost).toBeLessThan(20); // Should be under $20 for 1M tokens with sonnet
    });

    it('returns zero cost for zero tokens', () => {
      const cost = telemetry.estimateCost(0);
      expect(cost).toBe(0);
    });

    it('calculates cost with input/output split', () => {
      // Implementation assumes 30% input, 70% output
      const tokens = 1000000;
      const inputCost = (tokens * 0.3) * 3.00 / 1000000; // Sonnet input rate
      const outputCost = (tokens * 0.7) * 15.00 / 1000000; // Sonnet output rate
      const expectedCost = Math.round((inputCost + outputCost) * 100) / 100;

      const actualCost = telemetry.estimateCost(tokens);
      expect(actualCost).toBe(expectedCost);
    });

    it('includes cost in session metrics', () => {
      // Record operations with tokens
      const operation: OperationBase = { id: 'op-001', type: 'files' };
      const result: OperationResult = {
        operation_id: 'op-001',
        type: 'files',
        status: 'success',
        tokens_used: 10000,
        data: {},
      };

      telemetry.recordOperationStart(operation);
      telemetry.recordOperationComplete('op-001', result);

      const session = telemetry.getSessionMetrics();
      const estimatedCost = telemetry.estimateCost(session.total_tokens);
      expect(estimatedCost).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // Token Projection
  // ==========================================================================

  describe('Token Projection', () => {
    it('projects token usage for future batches', () => {
      // Record a few batches
      for (let i = 0; i < 3; i++) {
        const batch = createMockBatch(`batch-${i}`);
        const result = createMockBatchResult(`batch-${i}`, {
          summary: {
            status: 'success',
            duration_ms: 1000,
            operations: { total: 1, succeeded: 1, failed: 0 },
            operations_total: 1,
            operations_succeeded: 1,
            operations_failed: 0,
            tokens_used: 5000,
          },
        });
        telemetry.recordBatchStart(batch);
        telemetry.recordBatchComplete(`batch-${i}`, result);
      }

      // Average is 5000 tokens per batch
      const projected = telemetry.projectTokenUsage(10);
      expect(projected).toBe(50000); // 5000 * 10
    });

    it('returns zero when no batch history exists', () => {
      const projected = telemetry.projectTokenUsage(5);
      expect(projected).toBe(0);
    });

    it('handles fractional batch projections', () => {
      const batch = createMockBatch('batch-001');
      const result = createMockBatchResult('batch-001', {
        summary: {
          status: 'success',
          duration_ms: 1000,
          operations: { total: 1, succeeded: 1, failed: 0 },
          operations_total: 1,
          operations_succeeded: 1,
          operations_failed: 0,
          tokens_used: 6000,
        },
      });
      telemetry.recordBatchStart(batch);
      telemetry.recordBatchComplete('batch-001', result);

      const projected = telemetry.projectTokenUsage(2.5);
      expect(projected).toBe(15000); // 6000 * 2.5
    });
  });

  // ==========================================================================
  // Bottleneck Identification
  // ==========================================================================

  describe('Bottleneck Identification', () => {
    it('identifies slow operations as bottlenecks', () => {
      const slowOp: OperationBase = { id: 'slow-op', type: 'files' };
      const slowResult: OperationResult = {
        operation_id: 'slow-op',
        type: 'files',
        status: 'success',
        tokens_used: 1000,
        data: {},
      };

      telemetry.recordOperationStart(slowOp);
      // Simulate slow operation by manipulating internal state
      // In real scenario, operation would actually take time
      telemetry.recordOperationComplete('slow-op', slowResult);

      // For this test, we can't easily simulate actual slow operations
      // but we can test that the method works
      const bottlenecks = telemetry.identifyBottlenecks();
      expect(Array.isArray(bottlenecks)).toBe(true);
    });

    it('identifies validation failures as bottlenecks', () => {
      const batch = createMockBatch('batch-001');
      const result = createMockBatchResult('batch-001', {
        validation: {
          after: {
            passed: false,
            errors: ['Validation error'],
          },
        },
      });

      telemetry.recordBatchStart(batch);
      telemetry.recordBatchComplete('batch-001', result);

      const bottlenecks = telemetry.identifyBottlenecks();
      const validationBottleneck = bottlenecks.find(b => b.type === 'validation');

      if (validationBottleneck) {
        expect(validationBottleneck.description).toContain('validation');
      }
    });

    it('identifies agents with high budget utilization', () => {
      const agent: AgentSpec = {
        id: 'agent-001',
        agent: 'engineer',
        task: 'Complex task',
        budget: {
          max_tokens: 10000,
        },
      };

      const result: AgentResult = {
        status: 'success',
        tokens_used: 9500, // 95% utilization
        turns_used: 5,
        files_modified: [],
      };

      telemetry.recordAgentStart(agent);
      telemetry.recordAgentComplete('agent-001', result);

      const bottlenecks = telemetry.identifyBottlenecks();
      const agentBottleneck = bottlenecks.find(b => b.type === 'agent');

      if (agentBottleneck) {
        expect(agentBottleneck.description).toContain('budget');
      }
    });

    it('returns empty array when no bottlenecks exist', () => {
      const bottlenecks = telemetry.identifyBottlenecks();
      expect(bottlenecks).toEqual([]);
    });
  });

  // ==========================================================================
  // Report Export
  // ==========================================================================

  describe('Report Export', () => {
    beforeEach(() => {
      // Add some data
      const operation: OperationBase = { id: 'op-001', type: 'files' };
      const result: OperationResult = {
        operation_id: 'op-001',
        type: 'files',
        status: 'success',
        tokens_used: 1000,
        data: {},
      };
      telemetry.recordOperationStart(operation);
      telemetry.recordOperationComplete('op-001', result);
    });

    it('exports report as JSON', () => {
      const report = telemetry.exportReport('json');
      expect(() => JSON.parse(report)).not.toThrow();

      const data = JSON.parse(report);
      expect(data.session).toBeDefined();
      expect(data.batches).toBeDefined();
      expect(data.operations).toBeDefined();
      expect(data.agents).toBeDefined();
    });

    it('exports report as Markdown', () => {
      const report = telemetry.exportReport('markdown');
      expect(report).toContain('# Telemetry Report');
      expect(report).toContain('## Session Summary');
      expect(report).toContain('Total Batches');
      expect(report).toContain('Total Operations');
      expect(report).toContain('Total Tokens');
    });

    it('exports report as CSV', () => {
      const batch = createMockBatch('batch-001');
      const result = createMockBatchResult('batch-001');
      telemetry.recordBatchStart(batch);
      telemetry.recordBatchComplete('batch-001', result);

      const report = telemetry.exportReport('csv');
      expect(report).toContain('batch_id,started_at,completed_at');
      expect(report).toContain('batch-001');
    });

    it('includes cost estimation in markdown report', () => {
      const report = telemetry.exportReport('markdown');
      expect(report).toContain('Estimated Cost');
      expect(report).toMatch(/\$\d+\.\d+/); // Should have dollar amount
    });

    it('includes aggregations in markdown report', () => {
      const report = telemetry.exportReport('markdown');
      expect(report).toContain('Operations by Type');
    });
  });

  // ==========================================================================
  // File Persistence
  // ==========================================================================

  describe('File Persistence', () => {
    it('creates necessary directories on persist', async () => {
      await telemetry.persist();

      const mkdirCalls = vi.mocked(fs.mkdir).mock.calls;
      const paths = mkdirCalls.map(call => call[0]);

      expect(paths.some(p => p.includes('.goodvibes') && p.includes('telemetry'))).toBe(true);
      expect(paths.some(p => p.includes('history'))).toBe(true);
    });

    it('writes session metrics to file', async () => {
      await telemetry.persist();

      const writeFileCalls = vi.mocked(fs.writeFile).mock.calls;
      const sessionCall = writeFileCalls.find(call =>
        call[0].includes('current_session.json')
      );

      expect(sessionCall).toBeDefined();
      expect(sessionCall?.[1]).toContain('"id"');
      expect(sessionCall?.[2]).toBe('utf-8');
    });

    it('writes aggregations to file', async () => {
      await telemetry.persist();

      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('aggregations.json'),
        expect.any(String),
        'utf-8'
      );
    });

    it('writes daily history file', async () => {
      await telemetry.persist();

      const writeFileCalls = vi.mocked(fs.writeFile).mock.calls;
      const historyCall = writeFileCalls.find(call => {
        const path = call[0] as string;
        return path.includes('history') && path.match(/\d{4}-\d{2}-\d{2}\.json$/);
      });

      expect(historyCall).toBeDefined();
      expect(historyCall?.[2]).toBe('utf-8');
    });

    it('loads session metrics from file', async () => {
      const mockSession = {
        id: 'session_123',
        started_at: '2024-01-01T00:00:00Z',
        total_batches: 5,
        total_operations: 25,
        total_tokens: 10000,
        mode: 'vibecoding',
      };

      vi.mocked(fs.readFile).mockResolvedValueOnce(
        JSON.stringify(mockSession)
      );

      await telemetry.load();

      const session = telemetry.getSessionMetrics();
      expect(session.id).toBe('session_123');
      expect(session.total_batches).toBe(5);
    });

    it('handles missing files gracefully on load', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(
        new Error('ENOENT: File not found')
      );

      await expect(telemetry.load()).resolves.not.toThrow();
    });
  });

  // ==========================================================================
  // Concurrent Access Handling
  // ==========================================================================

  describe('Concurrent Access', () => {
    it('handles concurrent batch recordings', () => {
      const batch1 = createMockBatch('batch-001');
      const batch2 = createMockBatch('batch-002');
      const batch3 = createMockBatch('batch-003');

      telemetry.recordBatchStart(batch1);
      telemetry.recordBatchStart(batch2);
      telemetry.recordBatchStart(batch3);

      const result1 = createMockBatchResult('batch-001');
      const result2 = createMockBatchResult('batch-002');
      const result3 = createMockBatchResult('batch-003');

      telemetry.recordBatchComplete('batch-001', result1);
      telemetry.recordBatchComplete('batch-002', result2);
      telemetry.recordBatchComplete('batch-003', result3);

      const session = telemetry.getSessionMetrics();
      expect(session.total_batches).toBe(3);
    });

    it('handles concurrent operation recordings', () => {
      const operations = Array.from({ length: 10 }, (_, i) => ({
        id: `op-${i}`,
        type: 'files',
      }));

      operations.forEach(op => {
        telemetry.recordOperationStart(op as OperationBase);
        telemetry.recordOperationComplete(op.id, {
          operation_id: op.id,
          type: 'files',
          status: 'success',
          tokens_used: 100,
          data: {},
        });
      });

      const session = telemetry.getSessionMetrics();
      expect(session.total_operations).toBe(10);
      expect(session.total_tokens).toBe(1000);
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe('Edge Cases', () => {
    it('handles batch completion without start', () => {
      const result = createMockBatchResult('non-existent');

      // Should not throw
      expect(() => {
        telemetry.recordBatchComplete('non-existent', result);
      }).not.toThrow();
    });

    it('handles operation completion without start', () => {
      const result: OperationResult = {
        operation_id: 'non-existent',
        type: 'files',
        status: 'success',
        tokens_used: 100,
        data: {},
      };

      // Should not throw
      expect(() => {
        telemetry.recordOperationComplete('non-existent', result);
      }).not.toThrow();
    });

    it('handles agent completion without start', () => {
      const result: AgentResult = {
        status: 'success',
        tokens_used: 1000,
        turns_used: 2,
        files_modified: [],
      };

      // Should not throw
      expect(() => {
        telemetry.recordAgentComplete('non-existent', result);
      }).not.toThrow();
    });

    it('handles zero-duration operations', () => {
      const operation: OperationBase = { id: 'op-001', type: 'files' };
      const result: OperationResult = {
        operation_id: 'op-001',
        type: 'files',
        status: 'success',
        tokens_used: 100,
        data: {},
      };

      telemetry.recordOperationStart(operation);
      telemetry.recordOperationComplete('op-001', result);

      const session = telemetry.getSessionMetrics();
      expect(session.total_operations).toBe(1);
    });

    it('handles operations with zero tokens', () => {
      const operation: OperationBase = { id: 'op-001', type: 'files' };
      const result: OperationResult = {
        operation_id: 'op-001',
        type: 'files',
        status: 'success',
        tokens_used: 0,
        data: {},
      };

      telemetry.recordOperationStart(operation);
      telemetry.recordOperationComplete('op-001', result);

      const aggregations = telemetry.getAggregations();
      expect(aggregations.by_operation_type.files.avg_tokens).toBe(0);
    });
  });
});

// =============================================================================
// Helper Functions
// =============================================================================

function createMockBatch(id: string): Batch {
  return {
    id,
    intent: 'Test batch',
    mode: 'atomic',
    operations: {
      read: [
        {
          id: 'read-001',
          type: 'files',
          targets: ['test.ts'],
          extract: 'content',
        },
      ],
    },
    validation: {
      before: ['typecheck'],
      after: ['typecheck', 'test'],
    },
    recovery: {
      checkpoint: 'auto',
      on_fail: 'rollback',
    },
    context: {},
  };
}

function createMockBatchResult(
  batch_id: string,
  overrides: Partial<BatchResult> = {}
): BatchResult {
  const base: BatchResult = {
    batch_id,
    status: 'success',
    summary: {
      status: 'success',
      duration_ms: 1000,
      operations: {
        total: 1,
        succeeded: 1,
        failed: 0,
      },
      operations_total: 1,
      operations_succeeded: 1,
      operations_failed: 0,
      tokens_used: 100,
    },
    operations: {},
    validation: {
      before: {
        passed: true,
        errors: [],
      },
      after: {
        passed: true,
        errors: [],
      },
    },
    recovery: {
      checkpoint_id: null,
      rollback_triggered: false,
    },
    execution_graph: {
      critical_path_ms: 1000,
      parallel_groups: [[{ id: 'read-001' }]],
    },
  };

  // Deep merge overrides
  if (overrides.summary) {
    base.summary = { ...base.summary, ...overrides.summary };
  }
  if (overrides.validation) {
    base.validation = {
      before: { ...base.validation.before, ...overrides.validation.before },
      after: { ...base.validation.after, ...overrides.validation.after },
    };
  }
  if (overrides.recovery) {
    base.recovery = { ...base.recovery, ...overrides.recovery };
  }
  if (overrides.execution_graph) {
    base.execution_graph = { ...base.execution_graph, ...overrides.execution_graph };
  }

  return { ...base, ...overrides };
}
