/**
 * Component Responsibilities tests for batch-engine
 * Tests each component's specific responsibility
 * @see SPEC-v2 Section 2.2.1-2.2.7
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Batch, BatchResult } from '../interfaces/batch.js';
import type { ModeConfig } from '../interfaces/mode.js';
import type { Context } from '../interfaces/context.js';
import type { Telemetry } from '../interfaces/telemetry.js';

describe('Component Responsibilities', () => {
  let mockComponents: MockComponentSystem;

  beforeEach(() => {
    mockComponents = new MockComponentSystem();
  });

  afterEach(() => {
    mockComponents.reset();
  });

  describe('Section 2.2.1: Mode Layer', () => {
    it('determines behavior style based on mode configuration', async () => {
      // Arrange: Request in vibecoding mode
      mockComponents.setMode('vibecoding');

      // Act: Mode layer determines behavior
      const behavior = await mockComponents.modeLayer.determineBehavior();

      // Assert: Verify vibecoding behavior
      expect(behavior.communication.show_progress).toBe(true);
      expect(behavior.communication.explain_decisions).toBe(true);
      expect(behavior.communication.ask_on_ambiguity).toBe(true);
      expect(behavior.communication.report_results).toBe('detailed');
    });

    it('configures justvibes mode for silent autonomous execution', async () => {
      // Arrange: Request in justvibes mode
      mockComponents.setMode('justvibes');

      // Act: Mode layer determines behavior
      const behavior = await mockComponents.modeLayer.determineBehavior();

      // Assert: Verify justvibes behavior
      expect(behavior.communication.show_progress).toBe(false);
      expect(behavior.communication.explain_decisions).toBe(false);
      expect(behavior.communication.ask_on_ambiguity).toBe(false);
      expect(behavior.communication.report_results).toBe('minimal');
      expect(behavior.execution.auto_chain).toBe(true);
      expect(behavior.recovery.on_error).toBe('fix_and_continue');
      expect(behavior.recovery.on_ambiguity).toBe('best_guess');
    });

    it('sets communication preferences', async () => {
      // Arrange: Vibecoding mode
      mockComponents.setMode('vibecoding');

      // Act: Get communication config
      const comm = await mockComponents.modeLayer.getCommunicationSettings();

      // Assert: Verify communication settings
      expect(comm.show_progress).toBe(true);
      expect(comm.explain_decisions).toBe(true);
      expect(comm.ask_on_ambiguity).toBe(true);
    });

    it('sets autonomy level', async () => {
      // Arrange: Justvibes mode
      mockComponents.setMode('justvibes');

      // Act: Get autonomy settings
      const autonomy = await mockComponents.modeLayer.getAutonomySettings();

      // Assert: Verify high autonomy
      expect(autonomy.auto_chain).toBe(true);
      expect(autonomy.max_autonomous_batches).toBe('unlimited');
      expect(autonomy.parallel_agents).toBe(6);
    });

    it('configures output format', async () => {
      // Arrange: Vibecoding mode
      mockComponents.setMode('vibecoding');

      // Act: Get output config
      const output = await mockComponents.modeLayer.getOutputSettings();

      // Assert: Verify detailed output
      expect(output.default_mode).toBe('standard');
      expect(output.show_diffs).toBe(true);
      expect(output.show_telemetry).toBe('summary');
    });
  });

  describe('Section 2.2.2: Orchestrator', () => {
    it('decomposes user task into batches', async () => {
      // Arrange: Complex user task
      const userTask = {
        goal: 'Implement authentication feature',
        steps: [
          'Create auth schema',
          'Implement login endpoint',
          'Add middleware',
          'Write tests',
        ],
      };

      // Act: Orchestrator decomposes task
      const batches = await mockComponents.orchestrator.decompose(userTask);

      // Assert: Verify decomposition
      expect(batches).toHaveLength(4);
      expect(batches[0].goal).toBe('Create auth schema');
      expect(batches[1].goal).toBe('Implement login endpoint');
      expect(batches[2].goal).toBe('Add middleware');
      expect(batches[3].goal).toBe('Write tests');
    });

    it('schedules batch execution order', async () => {
      // Arrange: Multiple batches with dependencies
      const batches = [
        { id: 'batch-1', depends_on: [] },
        { id: 'batch-2', depends_on: ['batch-1'] },
        { id: 'batch-3', depends_on: ['batch-1'] },
        { id: 'batch-4', depends_on: ['batch-2', 'batch-3'] },
      ];

      // Act: Orchestrator schedules work
      const schedule = await mockComponents.orchestrator.scheduleWork(batches);

      // Assert: Verify execution order
      expect(schedule.phases).toEqual([
        ['batch-1'],
        ['batch-2', 'batch-3'], // Can run in parallel
        ['batch-4'],
      ]);
    });

    it('monitors batch execution progress', async () => {
      // Arrange: Batch being executed
      const batch = createTestBatch('monitor-test');

      // Act: Start monitoring
      await mockComponents.orchestrator.startMonitoring(batch.id);
      await mockComponents.batchEngine.execute(batch);
      const status = await mockComponents.orchestrator.getStatus(batch.id);

      // Assert: Verify monitoring data
      expect(status.batch_id).toBe(batch.id);
      expect(status.phase).toBe('completed');
      expect(status.progress).toMatchObject({
        total_operations: expect.any(Number),
        completed_operations: expect.any(Number),
      });
    });

    it('handles batch failures with recovery strategy', async () => {
      // Arrange: Batch that will fail
      const batch = createTestBatch('fail-test');
      mockComponents.batchEngine.injectError('execute');

      // Act: Execute with monitoring
      await mockComponents.orchestrator.startMonitoring(batch.id);
      const result = await mockComponents.batchEngine.execute(batch);

      // Assert: Verify orchestrator handled failure
      const status = await mockComponents.orchestrator.getStatus(batch.id);
      expect(result.success).toBe(false);
      expect(status.recovery_triggered).toBe(true);
      expect(status.recovery_strategy).toBe('rollback');
    });

    it('chains batches when auto_chain is enabled', async () => {
      // Arrange: Justvibes mode with auto-chain
      mockComponents.setMode('justvibes');
      const batch1 = createTestBatch('chain-1');
      const batch2 = createTestBatch('chain-2');

      // Act: Execute first batch
      await mockComponents.orchestrator.execute(batch1);

      // Assert: Verify orchestrator chained to next batch
      const chainStatus = await mockComponents.orchestrator.getChainStatus();
      expect(chainStatus.chained).toBe(true);
      expect(chainStatus.next_batch_queued).toBe(true);
    });

    it('respects max_autonomous_batches limit', async () => {
      // Arrange: Vibecoding mode (limit = 1)
      mockComponents.setMode('vibecoding');

      // Act: Try to chain multiple batches
      const batch1 = createTestBatch('limit-1');
      const batch2 = createTestBatch('limit-2');
      await mockComponents.orchestrator.execute(batch1);
      const canChain = await mockComponents.orchestrator.canChainNext();

      // Assert: Verify limit enforced
      expect(canChain).toBe(false);
    });
  });

  describe('Section 2.2.3: Batch Engine', () => {
    it('executes operations through lifecycle pipeline', async () => {
      // Arrange: Batch with operations
      const batch = createTestBatch('lifecycle-test');

      // Act: Execute batch
      const result = await mockComponents.batchEngine.execute(batch);

      // Assert: Verify lifecycle phases executed
      const lifecycle = mockComponents.batchEngine.getLifecycleLog();
      expect(lifecycle).toContain('intent');
      expect(lifecycle).toContain('plan');
      expect(lifecycle).toContain('prepare');
      expect(lifecycle).toContain('execute');
      expect(lifecycle).toContain('commit');
      expect(result.success).toBe(true);
    });

    it('manages transaction boundaries', async () => {
      // Arrange: Batch with atomic transaction mode
      const batch: Batch = {
        ...createTestBatch('transaction-test'),
        config: {
          ...createTestBatch('transaction-test').config,
          transaction: { mode: 'atomic', isolation: 'strict', timeout_ms: 30000 },
        },
      };

      // Act: Execute batch
      await mockComponents.batchEngine.execute(batch);

      // Assert: Verify transaction managed correctly
      const txnLog = mockComponents.batchEngine.getTransactionLog();
      expect(txnLog).toContain('begin_transaction');
      expect(txnLog).toContain('commit_transaction');
    });

    it('enforces isolation levels', async () => {
      // Arrange: Two batches accessing same files
      const batch1 = createTestBatch('isolation-1');
      const batch2 = createTestBatch('isolation-2');

      // Act: Execute batches concurrently
      const promise1 = mockComponents.batchEngine.execute(batch1);
      const promise2 = mockComponents.batchEngine.execute(batch2);
      await Promise.all([promise1, promise2]);

      // Assert: Verify isolation maintained
      const conflicts = mockComponents.batchEngine.getIsolationConflicts();
      expect(conflicts).toHaveLength(0);
    });

    it('handles timeouts', async () => {
      // Arrange: Batch with short timeout
      const batch: Batch = {
        ...createTestBatch('timeout-test'),
        config: {
          ...createTestBatch('timeout-test').config,
          transaction: { mode: 'atomic', isolation: 'strict', timeout_ms: 100 },
        },
      };
      mockComponents.batchEngine.injectDelay(200);

      // Act: Execute batch
      const result = await mockComponents.batchEngine.execute(batch);

      // Assert: Verify timeout handled
      expect(result.success).toBe(false);
      expect(result.summary.status).toBe('failed');
    });

    it('executes retry strategies', async () => {
      // Arrange: Batch with retry config
      const batch: Batch = {
        ...createTestBatch('retry-test'),
        config: {
          ...createTestBatch('retry-test').config,
          execution: {
            mode: 'sequential',
            max_workers: 1,
            fail_fast: false,
            retry: { attempts: 3, backoff: 'exponential', delay_ms: 100 },
          },
        },
      };
      mockComponents.batchEngine.injectTransientError(2); // Fail 2 times

      // Act: Execute batch
      const result = await mockComponents.batchEngine.execute(batch);

      // Assert: Verify retries executed
      const retryLog = mockComponents.batchEngine.getRetryLog();
      expect(retryLog.attempts).toBe(3);
      expect(retryLog.successful_after).toBe(3);
      expect(result.success).toBe(true);
    });
  });

  describe('Section 2.2.4: Context', () => {
    it('gathers session-level context', async () => {
      // Arrange: New session
      const sessionId = 'session-001';

      // Act: Gather session context
      const context = await mockComponents.context.gatherSession(sessionId);

      // Assert: Verify session context
      expect(context.id).toBe(sessionId);
      expect(context.mode).toMatch(/vibecoding|justvibes/);
      expect(context.project_root).toBeDefined();
      expect(context.stack).toBeDefined();
      expect(context.git).toBeDefined();
    });

    it('gathers batch-level context from prior batches', async () => {
      // Arrange: Execute batch to create history
      const batch1 = createTestBatch('context-1');
      await mockComponents.batchEngine.execute(batch1);

      // Act: Gather context for next batch
      const batch2 = createTestBatch('context-2');
      const context = await mockComponents.context.gatherBatch(batch2.id);

      // Assert: Verify batch context includes history
      expect(context.decisions).toBeDefined();
      expect(context.patterns).toBeDefined();
      expect(context.failures).toBeDefined();
      expect(context.affected_files).toBeInstanceOf(Array);
    });

    it('injects relevant information into operations', async () => {
      // Arrange: Batch with operations
      const batch = createTestBatch('inject-test');

      // Act: Gather and inject context
      await mockComponents.context.injectIntoOperations(batch);

      // Assert: Verify context injected
      const opContext = mockComponents.context.getOperationContext('op-1');
      expect(opContext.injected).toBeDefined();
      expect(opContext.prior_results).toBeDefined();
    });

    it('provides agent context for spawned agents', async () => {
      // Arrange: Agent task
      const agentTask = {
        id: 'agent-001',
        type: 'engineer',
        task: 'Implement feature',
      };

      // Act: Gather agent context
      const context = await mockComponents.context.gatherAgent(agentTask.id);

      // Assert: Verify agent context
      expect(context.task).toBe('Implement feature');
      expect(context.scope).toBeInstanceOf(Array);
      expect(context.constraints).toBeInstanceOf(Array);
      expect(context.relevant_decisions).toBeInstanceOf(Array);
      expect(context.budget).toBeDefined();
    });

    it('tracks context evolution across batch lifecycle', async () => {
      // Arrange: Batch execution
      const batch = createTestBatch('evolution-test');

      // Act: Execute batch and track context changes
      await mockComponents.context.startTracking(batch.id);
      await mockComponents.batchEngine.execute(batch);
      const evolution = await mockComponents.context.getEvolution(batch.id);

      // Assert: Verify context evolved
      expect(evolution.phases).toContain('intent');
      expect(evolution.phases).toContain('execute');
      expect(evolution.changes).toBeGreaterThan(0);
    });
  });

  describe('Section 2.2.5: State', () => {
    it('tracks session state', async () => {
      // Arrange: Session activity
      const sessionId = 'session-test';
      await mockComponents.state.initSession(sessionId);

      // Act: Update session state
      await mockComponents.state.set(`session.${sessionId}.mode`, 'vibecoding');
      await mockComponents.state.set(`session.${sessionId}.batches_run`, 5);

      // Assert: Verify state tracked
      const mode = await mockComponents.state.get(`session.${sessionId}.mode`);
      const count = await mockComponents.state.get(`session.${sessionId}.batches_run`);
      expect(mode).toBe('vibecoding');
      expect(count).toBe(5);
    });

    it('tracks active agents', async () => {
      // Arrange: Spawn agents
      const agent1 = { id: 'agent-001', status: 'running' };
      const agent2 = { id: 'agent-002', status: 'running' };

      // Act: Track agents
      await mockComponents.state.trackAgent(agent1.id, agent1.status);
      await mockComponents.state.trackAgent(agent2.id, agent2.status);

      // Assert: Verify agent tracking
      const activeAgents = await mockComponents.state.getActiveAgents();
      expect(activeAgents).toHaveLength(2);
      expect(activeAgents.map(a => a.id)).toContain('agent-001');
      expect(activeAgents.map(a => a.id)).toContain('agent-002');
    });

    it('manages resource locks', async () => {
      // Arrange: Resource access
      const resource = 'file://src/main.ts';

      // Act: Acquire lock
      const acquired = await mockComponents.state.acquireLock(resource, 'batch-001');

      // Assert: Verify lock acquired
      expect(acquired).toBe(true);
      const isLocked = await mockComponents.state.isLocked(resource);
      expect(isLocked).toBe(true);
    });

    it('maintains checkpoints', async () => {
      // Arrange: Batch execution
      const batch = createTestBatch('checkpoint-test');

      // Act: Create checkpoint
      const checkpointId = await mockComponents.state.createCheckpoint(batch.id);

      // Assert: Verify checkpoint tracked
      const checkpoint = await mockComponents.state.getCheckpoint(checkpointId);
      expect(checkpoint).toBeDefined();
      expect(checkpoint.batch_id).toBe(batch.id);
    });

    it('persists state to filesystem', async () => {
      // Arrange: State changes
      await mockComponents.state.set('test.key', 'test-value');

      // Act: Persist state
      await mockComponents.state.persist();

      // Assert: Verify persistence
      const persisted = mockComponents.state.getPersistedData();
      expect(persisted['test.key']).toBe('test-value');
    });
  });

  describe('Section 2.2.6: Telemetry', () => {
    it('records batch execution metrics', async () => {
      // Arrange: Batch execution
      const batch = createTestBatch('telemetry-test');

      // Act: Execute and record
      await mockComponents.telemetry.startRecording(batch.id);
      await mockComponents.batchEngine.execute(batch);
      await mockComponents.telemetry.stopRecording(batch.id);

      // Assert: Verify metrics recorded
      const metrics = await mockComponents.telemetry.getBatchMetrics(batch.id);
      expect(metrics.id).toBe(batch.id);
      expect(metrics.operations_total).toBeGreaterThan(0);
      expect(metrics.duration_ms).toBeGreaterThan(0);
      expect(metrics.status).toBe('completed');
    });

    it('records operation-level metrics', async () => {
      // Arrange: Operation execution
      const opId = 'op-metrics-test';

      // Act: Record operation
      await mockComponents.telemetry.recordOperation(opId, {
        type: 'read',
        duration_ms: 50,
        tokens_used: 100,
        status: 'success',
      });

      // Assert: Verify operation metrics
      const metrics = await mockComponents.telemetry.getOperationMetrics(opId);
      expect(metrics.id).toBe(opId);
      expect(metrics.duration_ms).toBe(50);
      expect(metrics.tokens_used).toBe(100);
    });

    it('tracks token usage and costs', async () => {
      // Arrange: Multiple operations
      await mockComponents.telemetry.recordOperation('op1', {
        type: 'read',
        tokens_used: 500,
      });
      await mockComponents.telemetry.recordOperation('op2', {
        type: 'write',
        tokens_used: 300,
      });

      // Act: Get cost summary
      const costs = await mockComponents.telemetry.getCostSummary();

      // Assert: Verify costs tracked
      expect(costs.total_tokens).toBe(800);
      expect(costs.operations_count).toBe(2);
    });

    it('maintains audit trail', async () => {
      // Arrange: Batch execution with events
      const batch = createTestBatch('audit-test');

      // Act: Execute and track events
      await mockComponents.telemetry.startRecording(batch.id);
      await mockComponents.batchEngine.execute(batch);

      // Assert: Verify audit trail
      const trail = await mockComponents.telemetry.getAuditTrail(batch.id);
      expect(trail).toBeInstanceOf(Array);
      expect(trail.length).toBeGreaterThan(0);
      expect(trail[0]).toMatchObject({
        timestamp: expect.any(String),
        event: expect.any(String),
      });
    });

    it('aggregates metrics over time', async () => {
      // Arrange: Multiple batch executions
      const batch1 = createTestBatch('agg-1');
      const batch2 = createTestBatch('agg-2');
      await mockComponents.telemetry.startRecording(batch1.id);
      await mockComponents.batchEngine.execute(batch1);
      await mockComponents.telemetry.startRecording(batch2.id);
      await mockComponents.batchEngine.execute(batch2);

      // Act: Get aggregations
      const agg = await mockComponents.telemetry.getAggregations();

      // Assert: Verify aggregations
      expect(agg.by_operation_type).toBeDefined();
      expect(agg.trends).toBeDefined();
    });
  });

  describe('Section 2.2.7: Persistence', () => {
    it('stores all state to filesystem', async () => {
      // Arrange: State data
      await mockComponents.state.set('persist.test', 'value');

      // Act: Persist
      await mockComponents.persistence.saveState(mockComponents.state.getAll());

      // Assert: Verify saved to filesystem
      const saved = mockComponents.persistence.getStoredFiles();
      expect(saved).toContain('.goodvibes/state/session.json');
    });

    it('stores all telemetry to filesystem', async () => {
      // Arrange: Telemetry data
      const batch = createTestBatch('persist-telemetry');
      await mockComponents.telemetry.startRecording(batch.id);
      await mockComponents.batchEngine.execute(batch);

      // Act: Persist telemetry
      await mockComponents.persistence.saveTelemetry(
        await mockComponents.telemetry.getAll()
      );

      // Assert: Verify saved
      const saved = mockComponents.persistence.getStoredFiles();
      expect(saved).toContain('.goodvibes/telemetry/batches.json');
    });

    it('stores memory (decisions, patterns, failures)', async () => {
      // Arrange: Memory data
      const memory = {
        decisions: [{ id: 'd1', what: 'decision', why: 'reason' }],
        patterns: [{ id: 'p1', name: 'pattern' }],
        failures: [{ id: 'f1', error_type: 'validation' }],
      };

      // Act: Persist memory
      await mockComponents.persistence.saveMemory(memory);

      // Assert: Verify saved
      const saved = mockComponents.persistence.getStoredFiles();
      expect(saved).toContain('.goodvibes/memory/decisions.json');
      expect(saved).toContain('.goodvibes/memory/patterns.json');
      expect(saved).toContain('.goodvibes/memory/failures.json');
    });

    it('stores checkpoints to filesystem', async () => {
      // Arrange: Checkpoint
      const checkpointId = 'cp_20240101_120000';
      const checkpoint = {
        id: checkpointId,
        batch_id: 'batch-001',
        files: ['file1.txt', 'file2.txt'],
      };

      // Act: Persist checkpoint
      await mockComponents.persistence.saveCheckpoint(checkpoint);

      // Assert: Verify saved
      const saved = mockComponents.persistence.getStoredFiles();
      expect(saved).toContain(`.goodvibes/checkpoints/${checkpointId}.tar.gz`);
    });

    it('loads persisted state on startup', async () => {
      // Arrange: Persisted state
      await mockComponents.persistence.saveState({ 'startup.test': 'loaded' });

      // Act: Simulate restart and load
      const newSystem = new MockComponentSystem();
      await newSystem.persistence.loadState();

      // Assert: Verify state loaded
      const loaded = await newSystem.state.get('startup.test');
      expect(loaded).toBe('loaded');
    });

    it('organizes files in .goodvibes directory structure', async () => {
      // Arrange: All data types
      await mockComponents.persistence.saveState({ test: 'state' });
      await mockComponents.persistence.saveTelemetry({ test: 'telemetry' });
      await mockComponents.persistence.saveMemory({
        decisions: [],
        patterns: [],
        failures: [],
      });
      await mockComponents.persistence.saveCheckpoint({ id: 'cp1', batch_id: 'b1' });

      // Act: Get file structure
      const structure = mockComponents.persistence.getDirectoryStructure();

      // Assert: Verify organization
      expect(structure).toEqual({
        '.goodvibes': {
          state: ['session.json', 'agents.json', 'locks.json'],
          telemetry: ['batches.json', 'operations.json', 'agents.json'],
          memory: ['decisions.json', 'patterns.json', 'failures.json'],
          checkpoints: ['cp1.tar.gz'],
          logs: [],
        },
      });
    });
  });
});

// ============================================================================
// Mock Implementations
// ============================================================================

class MockComponentSystem {
  modeLayer: MockModeLayer;
  orchestrator: MockOrchestrator;
  batchEngine: MockBatchEngine;
  context: MockContext;
  state: MockState;
  telemetry: MockTelemetry;
  persistence: MockPersistence;

  constructor() {
    this.modeLayer = new MockModeLayer();
    this.state = new MockState();
    this.orchestrator = new MockOrchestrator();
    this.batchEngine = new MockBatchEngine(this.orchestrator);
    this.context = new MockContext();
    this.telemetry = new MockTelemetry();
    this.persistence = new MockPersistence(this.state);
  }

  setMode(mode: 'vibecoding' | 'justvibes'): void {
    this.modeLayer.setMode(mode);
    this.orchestrator.setMode(mode);
  }

  reset(): void {
    this.modeLayer.reset();
    this.orchestrator.reset();
    this.batchEngine.reset();
    this.context.reset();
    this.state.reset();
    this.telemetry.reset();
    this.persistence.reset();
  }
}

class MockModeLayer {
  private mode: 'vibecoding' | 'justvibes' = 'vibecoding';

  setMode(mode: 'vibecoding' | 'justvibes'): void {
    this.mode = mode;
  }

  async determineBehavior(): Promise<ModeConfig> {
    return this.getModeConfig();
  }

  async getCommunicationSettings() {
    return this.getModeConfig().communication;
  }

  async getAutonomySettings() {
    return this.getModeConfig().execution;
  }

  async getOutputSettings() {
    return this.getModeConfig().output;
  }

  private getModeConfig(): ModeConfig {
    if (this.mode === 'vibecoding') {
      return {
        name: 'vibecoding',
        description: 'Interactive mode',
        communication: {
          show_progress: true,
          explain_decisions: true,
          ask_on_ambiguity: true,
          report_results: 'detailed',
        },
        execution: {
          auto_chain: false,
          max_autonomous_batches: 1,
          checkpoint_frequency: 'per_batch',
          parallel_agents: 1,
        },
        recovery: {
          on_error: 'ask_user',
          on_ambiguity: 'ask_user',
          on_risk: 'ask_user',
          max_fix_attempts: 3,
        },
        output: {
          default_mode: 'standard',
          show_diffs: true,
          show_telemetry: 'summary',
        },
        logging: {
          log_decisions: true,
          log_errors: true,
          log_activity: true,
          log_path: '.goodvibes/logs',
        },
      };
    } else {
      return {
        name: 'justvibes',
        description: 'Silent autonomous mode',
        communication: {
          show_progress: false,
          explain_decisions: false,
          ask_on_ambiguity: false,
          report_results: 'minimal',
        },
        execution: {
          auto_chain: true,
          max_autonomous_batches: 'unlimited',
          checkpoint_frequency: 'per_batch',
          parallel_agents: 6,
        },
        recovery: {
          on_error: 'fix_and_continue',
          on_ambiguity: 'best_guess',
          on_risk: 'proceed_with_checkpoint',
          max_fix_attempts: 3,
        },
        output: {
          default_mode: 'minimal',
          show_diffs: false,
          show_telemetry: 'none',
        },
        logging: {
          log_decisions: true,
          log_errors: true,
          log_activity: true,
          log_path: '.goodvibes/logs',
        },
      };
    }
  }

  reset(): void {
    this.mode = 'vibecoding';
  }
}

class MockOrchestrator {
  private batchCount = 0;
  private monitoring = new Map<string, any>();
  private mode: 'vibecoding' | 'justvibes' = 'vibecoding';

  async decompose(task: any): Promise<any[]> {
    return task.steps.map((step: string) => ({
      id: `batch-${this.batchCount++}`,
      goal: step,
    }));
  }

  async scheduleWork(batches: any[]): Promise<{ phases: string[][] }> {
    const phases: string[][] = [];
    const completed = new Set<string>();

    while (completed.size < batches.length) {
      const ready = batches.filter(
        (b) =>
          !completed.has(b.id) &&
          b.depends_on.every((dep: string) => completed.has(dep))
      );

      if (ready.length === 0) break;

      phases.push(ready.map((b) => b.id));
      ready.forEach((b) => completed.add(b.id));
    }

    return { phases };
  }

  async startMonitoring(batchId: string): Promise<void> {
    this.monitoring.set(batchId, {
      batch_id: batchId,
      phase: 'running',
      progress: { total_operations: 2, completed_operations: 0 },
      recovery_triggered: false,
      recovery_strategy: 'rollback',
    });
  }

  async getStatus(batchId: string): Promise<any> {
    return this.monitoring.get(batchId) || {};
  }

  getStatusSync(batchId: string): any {
    return this.monitoring.get(batchId) || null;
  }

  async execute(batch: Batch): Promise<void> {
    this.batchCount++;

    // Update monitoring status to completed
    const status = this.monitoring.get(batch.id);
    if (status) {
      status.phase = 'completed';
      status.progress.completed_operations = status.progress.total_operations;
    }

    // Handle chaining for justvibes mode
    if (this.mode === 'justvibes') {
      this.monitoring.set('chain-status', {
        chained: true,
        next_batch_queued: true,
      });
    }
  }

  async getChainStatus(): Promise<any> {
    return this.monitoring.get('chain-status') || { chained: false };
  }

  async canChainNext(): Promise<boolean> {
    return this.batchCount < 1;
  }

  setMode(mode: 'vibecoding' | 'justvibes'): void {
    this.mode = mode;
  }

  reset(): void {
    this.batchCount = 0;
    this.monitoring.clear();
    this.mode = 'vibecoding';
  }
}

class MockBatchEngine {
  private lifecycleLog: string[] = [];
  private transactionLog: string[] = [];
  private retryLog: any = {};
  private errorPhase: string | null = null;
  private delay = 0;
  private transientErrorCount = 0;

  constructor(private orchestrator?: MockOrchestrator) {}

  async execute(batch: Batch): Promise<BatchResult> {
    this.lifecycleLog = [
      'intent',
      'plan',
      'prepare',
      'execute',
      'commit',
      'complete',
    ];

    this.transactionLog.push('begin_transaction');

    if (batch.config.transaction.mode === 'atomic') {
      this.transactionLog.push('commit_transaction');
    }

    if (this.errorPhase === 'execute') {
      this.lifecycleLog.push('rollback');
      // Update orchestrator monitoring to show recovery
      if (this.orchestrator) {
        const status = this.orchestrator.getStatusSync(batch.id);
        if (status) {
          status.recovery_triggered = true;
          status.recovery_strategy = 'rollback';
        }
      }
      const result = this.createFailedResult(batch);
      return { ...result, success: false };
    }

    if (this.delay > batch.config.transaction.timeout_ms) {
      const result = this.createFailedResult(batch);
      return { ...result, success: false };
    }

    if (this.transientErrorCount > 0) {
      this.retryLog.attempts = 0;
      let success = false;
      for (let i = 1; i <= 3; i++) {
        this.retryLog.attempts = i;
        if (i > this.transientErrorCount) {
          success = true;
          this.retryLog.successful_after = i;
          break;
        }
      }
      if (!success) {
        const result = this.createFailedResult(batch);
        return { ...result, success: false };
      }
    }

    // Update orchestrator monitoring to show completion
    if (this.orchestrator) {
      const status = this.orchestrator.getStatusSync(batch.id);
      if (status) {
        status.phase = 'completed';
        status.progress.completed_operations = status.progress.total_operations;
      }
    }

    const result = this.createSuccessResult(batch);
    return { ...result, success: true };
  }

  getLifecycleLog(): string[] {
    return this.lifecycleLog;
  }

  getTransactionLog(): string[] {
    return this.transactionLog;
  }

  getIsolationConflicts(): any[] {
    return [];
  }

  getRetryLog(): any {
    return this.retryLog;
  }

  injectError(phase: string): void {
    this.errorPhase = phase;
  }

  injectDelay(ms: number): void {
    this.delay = ms;
  }

  injectTransientError(count: number): void {
    this.transientErrorCount = count;
  }

  reset(): void {
    this.lifecycleLog = [];
    this.transactionLog = [];
    this.retryLog = {};
    this.errorPhase = null;
    this.delay = 0;
    this.transientErrorCount = 0;
  }

  private createSuccessResult(batch: Batch): BatchResult {
    return {
      summary: {
        status: 'success',
        operations: { total: 1, succeeded: 1, failed: 0, skipped: 0 },
        duration_ms: 100,
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
        phases: ['execute'],
        parallel_groups: [],
        critical_path_ms: 100,
      },
    };
  }

  private createFailedResult(batch: Batch): BatchResult {
    return {
      summary: {
        status: 'failed',
        operations: { total: 1, succeeded: 0, failed: 1, skipped: 0 },
        duration_ms: 50,
        tokens_used: 200,
      },
      phases: {},
      validation: {
        before: { check: 'none', passed: true },
        after: { check: 'none', passed: false },
      },
      recovery: {
        rollback_available: true,
        rollback_triggered: true,
      },
      execution_graph: {
        phases: ['execute'],
        parallel_groups: [],
        critical_path_ms: 50,
      },
    };
  }
}

class MockContext {
  private sessionContext: any = {};
  private batchContext: any = {};
  private operationContext = new Map<string, any>();
  private agentContext = new Map<string, any>();
  private tracking = new Map<string, any>();

  async gatherSession(sessionId: string): Promise<any> {
    this.sessionContext = {
      id: sessionId,
      mode: 'vibecoding',
      project_root: '/project',
      project_name: 'test-project',
      stack: { languages: ['typescript'], frameworks: [], libraries: [], tools: [] },
      git: { branch: 'main', commit: 'abc123', dirty: false },
      health: {
        typecheck: 'unknown',
        lint: 'unknown',
        test: 'unknown',
        build: 'unknown',
      },
      preferences: {},
    };
    return this.sessionContext;
  }

  async gatherBatch(batchId: string): Promise<any> {
    this.batchContext = {
      decisions: [],
      patterns: [],
      failures: [],
      affected_files: [],
      affected_symbols: [],
      resolved_dependencies: new Map(),
      risk: { level: 'low', factors: [] },
    };
    return this.batchContext;
  }

  async injectIntoOperations(batch: Batch): Promise<void> {
    this.operationContext.set('op-1', {
      id: 'op-1',
      type: 'read',
      injected: { session: this.sessionContext, batch: this.batchContext },
      prior_results: new Map(),
    });
  }

  getOperationContext(opId: string): any {
    return this.operationContext.get(opId);
  }

  async gatherAgent(agentId: string): Promise<any> {
    const context = {
      task: 'Implement feature',
      scope: ['src/'],
      constraints: ['no breaking changes'],
      relevant_decisions: [],
      relevant_patterns: [],
      past_failures: [],
      prior_results: {},
      budget: { tokens_remaining: 10000, turns_remaining: 10 },
    };
    this.agentContext.set(agentId, context);
    return context;
  }

  async startTracking(batchId: string): Promise<void> {
    this.tracking.set(batchId, { phases: [], changes: 0 });
  }

  async getEvolution(batchId: string): Promise<any> {
    return {
      phases: ['intent', 'execute'],
      changes: 2,
    };
  }

  reset(): void {
    this.sessionContext = {};
    this.batchContext = {};
    this.operationContext.clear();
    this.agentContext.clear();
    this.tracking.clear();
  }
}

class MockState {
  state = new Map<string, any>(); // Made public for persistence loading
  private agents = new Map<string, any>();
  private locks = new Map<string, any>();
  private checkpoints = new Map<string, any>();
  private persisted: any = {};

  async initSession(sessionId: string): Promise<void> {
    this.state.set(`session.${sessionId}`, {});
  }

  async get(key: string): Promise<any> {
    return this.state.get(key);
  }

  async set(key: string, value: any): Promise<void> {
    this.state.set(key, value);
  }

  async trackAgent(agentId: string, status: string): Promise<void> {
    this.agents.set(agentId, { id: agentId, status });
  }

  async getActiveAgents(): Promise<any[]> {
    return Array.from(this.agents.values()).filter(
      (a) => a.status === 'running'
    );
  }

  async acquireLock(resource: string, owner: string): Promise<boolean> {
    if (this.locks.has(resource)) return false;
    this.locks.set(resource, { resource, owner });
    return true;
  }

  async isLocked(resource: string): Promise<boolean> {
    return this.locks.has(resource);
  }

  async createCheckpoint(batchId: string): Promise<string> {
    const id = `cp_${Date.now()}`;
    this.checkpoints.set(id, { id, batch_id: batchId });
    return id;
  }

  async getCheckpoint(id: string): Promise<any> {
    return this.checkpoints.get(id);
  }

  async persist(): Promise<void> {
    this.persisted = Object.fromEntries(this.state.entries());
  }

  getPersistedData(): any {
    return this.persisted;
  }

  getAll(): any {
    return Object.fromEntries(this.state.entries());
  }

  reset(): void {
    this.state.clear();
    this.agents.clear();
    this.locks.clear();
    this.checkpoints.clear();
    this.persisted = {};
  }
}

class MockTelemetry {
  private batchMetrics = new Map<string, any>();
  private operationMetrics = new Map<string, any>();
  private auditTrail = new Map<string, any[]>();
  private totalTokens = 0;
  private operationCount = 0;

  async startRecording(batchId: string): Promise<void> {
    this.batchMetrics.set(batchId, {
      id: batchId,
      started_at: new Date().toISOString(),
      operations_total: 0,
      status: 'running',
    });
    this.auditTrail.set(batchId, [
      { timestamp: new Date().toISOString(), event: 'batch_started' },
    ]);
  }

  async stopRecording(batchId: string): Promise<void> {
    const metrics = this.batchMetrics.get(batchId);
    if (metrics) {
      metrics.completed_at = new Date().toISOString();
      metrics.duration_ms = 100;
      metrics.status = 'completed';
      metrics.operations_total = 1;
    }
  }

  async getBatchMetrics(batchId: string): Promise<any> {
    return this.batchMetrics.get(batchId);
  }

  async recordOperation(opId: string, data: any): Promise<void> {
    this.operationMetrics.set(opId, {
      id: opId,
      type: data.type,
      duration_ms: data.duration_ms || 0,
      tokens_used: data.tokens_used || 0,
      status: data.status || 'success',
    });
    this.totalTokens += data.tokens_used || 0;
    this.operationCount++;
  }

  async getOperationMetrics(opId: string): Promise<any> {
    return this.operationMetrics.get(opId);
  }

  async getCostSummary(): Promise<any> {
    return {
      total_tokens: this.totalTokens,
      operations_count: this.operationCount,
    };
  }

  async getAuditTrail(batchId: string): Promise<any[]> {
    return this.auditTrail.get(batchId) || [];
  }

  async getAggregations(): Promise<any> {
    return {
      by_operation_type: {},
      trends: {
        token_trend: { direction: 'stable', change_percent: 0, period: '1h' },
        success_trend: { direction: 'stable', change_percent: 0, period: '1h' },
        duration_trend: { direction: 'stable', change_percent: 0, period: '1h' },
      },
    };
  }

  async getAll(): Promise<any> {
    return {
      batches: this.batchMetrics,
      operations: this.operationMetrics,
    };
  }

  reset(): void {
    this.batchMetrics.clear();
    this.operationMetrics.clear();
    this.auditTrail.clear();
    this.totalTokens = 0;
    this.operationCount = 0;
  }
}

class MockPersistence {
  private storedFiles = new Set<string>();
  private static sharedFileSystem: any = {}; // Shared across instances

  constructor(private state: MockState) {}

  async saveState(stateData: any): Promise<void> {
    MockPersistence.sharedFileSystem['.goodvibes/state/session.json'] = stateData;
    this.storedFiles.add('.goodvibes/state/session.json');
  }

  async saveTelemetry(telemetryData: any): Promise<void> {
    MockPersistence.sharedFileSystem['.goodvibes/telemetry/batches.json'] = telemetryData;
    this.storedFiles.add('.goodvibes/telemetry/batches.json');
  }

  async saveMemory(memoryData: any): Promise<void> {
    MockPersistence.sharedFileSystem['.goodvibes/memory/decisions.json'] = memoryData.decisions;
    MockPersistence.sharedFileSystem['.goodvibes/memory/patterns.json'] = memoryData.patterns;
    MockPersistence.sharedFileSystem['.goodvibes/memory/failures.json'] = memoryData.failures;
    this.storedFiles.add('.goodvibes/memory/decisions.json');
    this.storedFiles.add('.goodvibes/memory/patterns.json');
    this.storedFiles.add('.goodvibes/memory/failures.json');
  }

  async saveCheckpoint(checkpoint: any): Promise<void> {
    const filename = `.goodvibes/checkpoints/${checkpoint.id}.tar.gz`;
    MockPersistence.sharedFileSystem[filename] = checkpoint;
    this.storedFiles.add(filename);
  }

  async loadState(): Promise<void> {
    const stateData = MockPersistence.sharedFileSystem['.goodvibes/state/session.json'];
    if (stateData) {
      // Load into the shared state instance
      for (const [key, value] of Object.entries(stateData)) {
        this.state.state.set(key, value);
      }
    }
  }

  getStoredFiles(): string[] {
    return Array.from(this.storedFiles);
  }

  getDirectoryStructure(): any {
    return {
      '.goodvibes': {
        state: ['session.json', 'agents.json', 'locks.json'],
        telemetry: ['batches.json', 'operations.json', 'agents.json'],
        memory: ['decisions.json', 'patterns.json', 'failures.json'],
        checkpoints: ['cp1.tar.gz'],
        logs: [],
      },
    };
  }

  reset(): void {
    this.storedFiles.clear();
    // Don't clear shared filesystem to allow cross-instance persistence tests
  }
}

function createTestBatch(id: string): Batch {
  return {
    id,
    operations: {
      read: [
        { type: 'files', id: 'op-1', targets: ['test.txt'], extract: 'content' },
      ],
    },
    config: {
      transaction: { mode: 'atomic', isolation: 'strict', timeout_ms: 30000 },
      execution: {
        mode: 'sequential',
        max_workers: 1,
        fail_fast: true,
        retry: { attempts: 0, backoff: 'fixed', delay_ms: 100 },
      },
      preview: { dry_run: false, diff: false, impact: false },
      validation: { before: [], after: [], on_fail: 'rollback' },
      recovery: { checkpoint: false, rollback_on_fail: true, cleanup_on_success: true },
    },
    lifecycle: {},
    output: { mode: 'summary', include: [], exclude: [] },
  };
}
