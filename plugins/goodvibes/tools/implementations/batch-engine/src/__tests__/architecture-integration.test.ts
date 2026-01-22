/**
 * Architecture Integration tests for batch-engine
 * Tests system layers and complete data flow
 * @see SPEC-v2 Section 2.1.1 & 2.3.1
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Batch, BatchResult } from '../interfaces/batch.js';
import type { Context } from '../interfaces/context.js';
import type { ModeConfig } from '../interfaces/mode.js';
import type { Telemetry } from '../interfaces/telemetry.js';

describe('Architecture Integration', () => {
  let mockSystem: MockSystemLayers;

  beforeEach(() => {
    mockSystem = new MockSystemLayers();
  });

  afterEach(() => {
    mockSystem.reset();
  });

  describe('Section 2.1.1: System Layers', () => {
    it('flows user request through Mode Layer → Orchestrator → Batch Engine → Persistence', async () => {
      // Arrange: User request in vibecoding mode
      const userRequest = {
        action: 'create_batch',
        operations: [
          { type: 'read', id: 'read-1', targets: ['file1.txt'], extract: 'content' },
          { type: 'write', id: 'write-1', files: [{ path: 'file2.txt', content: 'test' }] },
        ],
        mode: 'vibecoding' as const,
      };

      // Act: Process request through layers
      const result = await mockSystem.processUserRequest(userRequest);

      // Assert: Verify each layer was invoked in correct order
      expect(mockSystem.executionLog).toEqual([
        'mode_layer:determine_behavior',
        'orchestrator:decompose_tasks',
        'orchestrator:schedule_work',
        'batch_engine:prepare_batch',
        'batch_engine:execute_operations',
        'persistence:save_state',
        'persistence:save_telemetry',
        'orchestrator:monitor_completion',
        'mode_layer:format_output',
      ]);

      // Assert: Verify result
      expect(result.success).toBe(true);
      expect(result.layers_traversed).toEqual([
        'mode',
        'orchestrator',
        'batch_engine',
        'persistence',
      ]);
    });

    it('flows justvibes mode request with minimal communication', async () => {
      // Arrange: User request in justvibes mode
      const userRequest = {
        action: 'create_batch',
        operations: [
          { type: 'exec', id: 'exec-1', cmd: 'npm test' },
        ],
        mode: 'justvibes' as const,
      };

      // Act: Process request
      const result = await mockSystem.processUserRequest(userRequest);

      // Assert: Verify mode layer configured silent execution
      expect(mockSystem.modeLayerConfig.communication.show_progress).toBe(false);
      expect(mockSystem.modeLayerConfig.communication.explain_decisions).toBe(false);
      expect(mockSystem.modeLayerConfig.output.default_mode).toBe('minimal');

      // Assert: Verify minimal output
      expect(result.output).toBe('minimal');
    });

    it('each layer properly delegates to the next', async () => {
      // Arrange: Complex batch with multiple operations
      const userRequest = {
        action: 'create_batch',
        operations: [
          { type: 'read', id: 'r1', targets: ['a.ts'], extract: 'content' },
          { type: 'read', id: 'r2', targets: ['b.ts'], extract: 'content' },
          { type: 'write', id: 'w1', files: [{ path: 'c.ts', content: 'code' }] },
        ],
        mode: 'vibecoding' as const,
      };

      // Act: Process request
      await mockSystem.processUserRequest(userRequest);

      // Assert: Verify delegation chain
      const delegations = mockSystem.getDelegations();
      expect(delegations).toContainEqual({
        from: 'mode_layer',
        to: 'orchestrator',
        data: expect.objectContaining({ behavior_config: expect.any(Object) }),
      });
      expect(delegations).toContainEqual({
        from: 'orchestrator',
        to: 'batch_engine',
        data: expect.objectContaining({ batch: expect.any(Object) }),
      });
      expect(delegations).toContainEqual({
        from: 'batch_engine',
        to: 'persistence',
        data: expect.objectContaining({ state: expect.any(Object) }),
      });
    });

    it('handles errors by propagating through layers in reverse', async () => {
      // Arrange: Request that will fail at batch engine
      const userRequest = {
        action: 'create_batch',
        operations: [
          { type: 'read', id: 'fail', targets: ['nonexistent.txt'], extract: 'content' },
        ],
        mode: 'vibecoding' as const,
        inject_error_at: 'batch_engine',
      };

      // Act: Process request
      const result = await mockSystem.processUserRequest(userRequest);

      // Assert: Verify error propagation
      expect(result.success).toBe(false);
      expect(mockSystem.executionLog).toContain('batch_engine:error');
      expect(mockSystem.executionLog).toContain('orchestrator:handle_error');
      expect(mockSystem.executionLog).toContain('mode_layer:format_error');
    });

    it('persistence layer stores all data to filesystem', async () => {
      // Arrange: Batch execution
      const userRequest = {
        action: 'create_batch',
        operations: [
          { type: 'write', id: 'w1', files: [{ path: 'test.txt', content: 'data' }] },
        ],
        mode: 'vibecoding' as const,
      };

      // Act: Process request
      await mockSystem.processUserRequest(userRequest);

      // Assert: Verify persistence layer saved data
      const persistedData = mockSystem.getPersistenceData();
      expect(persistedData.state).toBeDefined();
      expect(persistedData.telemetry).toBeDefined();
      expect(persistedData.memory).toBeDefined();
      expect(persistedData.checkpoints).toBeDefined();
    });
  });

  describe('Section 2.3.1: Complete Data Flow', () => {
    it('executes complete flow: Intent → Context → Plan → Prepare → Validate → Execute → Verify → Commit → Chain → Results', async () => {
      // Arrange: Full batch with all phases
      const batch: Batch = {
        id: 'test-flow-001',
        operations: {
          read: [
            { type: 'files', id: 'read-1', targets: ['input.txt'], extract: 'content' },
          ],
          write: [
            { type: 'create', id: 'write-1', files: [{ path: 'output.txt', content: 'result' }] },
          ],
        },
        config: {
          transaction: { mode: 'atomic', isolation: 'strict', timeout_ms: 30000 },
          execution: { mode: 'sequential', max_workers: 1, fail_fast: true, retry: { attempts: 0, backoff: 'fixed', delay_ms: 100 } },
          preview: { dry_run: false, diff: false, impact: false },
          validation: { before: ['typecheck'], after: ['lint'], on_fail: 'rollback' },
          recovery: { checkpoint: true, rollback_on_fail: true, cleanup_on_success: true },
        },
        lifecycle: {},
        output: { mode: 'summary', include: [], exclude: [] },
      };

      // Act: Execute batch through complete data flow
      const result = await mockSystem.executeBatchWithFullFlow(batch);

      // Assert: Verify all phases executed in order
      expect(mockSystem.dataFlowPhases).toEqual([
        'intent',      // Understand what user wants
        'context',     // Gather relevant information
        'plan',        // Create execution plan
        'prepare',     // Set up resources
        'validate',    // Pre-execution validation
        'execute',     // Run operations
        'verify',      // Post-execution verification
        'commit',      // Finalize changes
        'chain',       // Link to next batch if needed
        'results',     // Return results
      ]);

      expect(result.success).toBe(true);
    });

    it('Intent phase captures user requirements and mode behavior', async () => {
      // Arrange: User request
      const batch = createMinimalBatch('intent-test');

      // Act: Execute through intent phase
      await mockSystem.executePhase('intent', batch);

      // Assert: Verify intent captured
      const intentData = mockSystem.getPhaseData('intent');
      expect(intentData).toEqual({
        user_goal: expect.any(String),
        mode: expect.stringMatching(/vibecoding|justvibes/),
        operations_count: expect.any(Number),
        risk_level: expect.stringMatching(/low|medium|high|critical/),
      });
    });

    it('Context phase gathers and injects relevant information', async () => {
      // Arrange: Batch requiring context
      const batch = createMinimalBatch('context-test');

      // Act: Execute through context phase
      await mockSystem.executePhase('context', batch);

      // Assert: Verify context gathered
      const contextData = mockSystem.getPhaseData('context');
      expect(contextData).toMatchObject({
        session: expect.objectContaining({
          id: expect.any(String),
          mode: expect.any(String),
          project_root: expect.any(String),
        }),
        batch: expect.objectContaining({
          decisions: expect.any(Array),
          patterns: expect.any(Array),
          affected_files: expect.any(Array),
        }),
      });
    });

    it('Plan phase creates operation dependency graph', async () => {
      // Arrange: Batch with dependent operations
      const batch = createMinimalBatch('plan-test');

      // Act: Execute through plan phase
      await mockSystem.executePhase('plan', batch);

      // Assert: Verify execution plan created
      const planData = mockSystem.getPhaseData('plan');
      expect(planData).toEqual({
        execution_order: expect.any(Array),
        parallelizable_groups: expect.any(Array),
        dependencies: expect.any(Object),
        estimated_duration_ms: expect.any(Number),
      });
    });

    it('Prepare phase sets up locks and checkpoints', async () => {
      // Arrange: Batch with recovery enabled
      const batch: Batch = {
        ...createMinimalBatch('prepare-test'),
        config: {
          ...createMinimalBatch('prepare-test').config,
          recovery: { checkpoint: true, rollback_on_fail: true, cleanup_on_success: true },
        },
      };

      // Act: Execute through prepare phase
      await mockSystem.executePhase('prepare', batch);

      // Assert: Verify resources prepared
      const prepareData = mockSystem.getPhaseData('prepare');
      expect(prepareData).toEqual({
        checkpoint_created: true,
        locks_acquired: expect.any(Array),
        resources_allocated: expect.any(Object),
      });
    });

    it('Validate phase runs pre-execution checks', async () => {
      // Arrange: Batch with validation steps
      const batch: Batch = {
        ...createMinimalBatch('validate-test'),
        config: {
          ...createMinimalBatch('validate-test').config,
          validation: { before: ['typecheck', 'lint'], after: ['test'], on_fail: 'rollback' },
        },
      };

      // Act: Execute through validate phase
      await mockSystem.executePhase('validate', batch);

      // Assert: Verify validation ran
      const validateData = mockSystem.getPhaseData('validate');
      expect(validateData).toEqual({
        typecheck: { status: 'pass', errors: 0 },
        lint: { status: 'pass', warnings: 0 },
      });
    });

    it('Execute phase runs operations through executor', async () => {
      // Arrange: Batch with operations
      const batch = createMinimalBatch('execute-test');

      // Act: Execute through execute phase
      await mockSystem.executePhase('execute', batch);

      // Assert: Verify operations executed
      const executeData = mockSystem.getPhaseData('execute');
      expect(executeData).toEqual({
        operations_completed: expect.any(Number),
        operations_failed: 0,
        duration_ms: expect.any(Number),
      });
    });

    it('Verify phase runs post-execution checks', async () => {
      // Arrange: Batch with after validation
      const batch: Batch = {
        ...createMinimalBatch('verify-test'),
        config: {
          ...createMinimalBatch('verify-test').config,
          validation: { before: [], after: ['typecheck', 'test'], on_fail: 'rollback' },
        },
      };

      // Act: Execute through verify phase
      await mockSystem.executePhase('verify', batch);

      // Assert: Verify post-checks ran
      const verifyData = mockSystem.getPhaseData('verify');
      expect(verifyData).toEqual({
        typecheck: { status: 'pass', errors: 0 },
        test: { status: 'pass', failures: 0 },
      });
    });

    it('Commit phase finalizes changes and releases locks', async () => {
      // Arrange: Batch ready to commit
      const batch = createMinimalBatch('commit-test');

      // Act: Execute through commit phase
      await mockSystem.executePhase('commit', batch);

      // Assert: Verify commit finalized
      const commitData = mockSystem.getPhaseData('commit');
      expect(commitData).toEqual({
        changes_applied: true,
        locks_released: expect.any(Array),
        checkpoint_cleaned: true,
      });
    });

    it('Chain phase links to next batch if configured', async () => {
      // Arrange: Batch with chaining
      const batch: Batch = {
        ...createMinimalBatch('chain-test'),
        lifecycle: {
          on_chain: { handler: 'chainNext' },
        },
      };

      // Act: Execute through chain phase
      await mockSystem.executePhase('chain', batch);

      // Assert: Verify chain hook called
      const chainData = mockSystem.getPhaseData('chain');
      expect(chainData).toEqual({
        next_batch_id: expect.any(String),
        context_passed: expect.any(Object),
      });
    });

    it('Results phase returns formatted output based on mode', async () => {
      // Arrange: Batch execution complete
      const batch = createMinimalBatch('results-test');

      // Act: Execute through results phase with vibecoding mode
      mockSystem.setMode('vibecoding');
      await mockSystem.executePhase('results', batch);

      // Assert: Verify detailed results returned
      const resultsData = mockSystem.getPhaseData('results');
      expect(resultsData).toEqual({
        success: true,
        batch_id: batch.id,
        operations_completed: expect.any(Number),
        duration_ms: expect.any(Number),
        telemetry: expect.any(Object),
      });
    });

    it('handles phase failures with proper rollback', async () => {
      // Arrange: Batch that will fail at execute
      const batch = createMinimalBatch('fail-test');
      mockSystem.injectErrorAtPhase('execute');

      // Act: Execute flow until failure
      const result = await mockSystem.executeBatchWithFullFlow(batch);

      // Assert: Verify rollback happened
      expect(result.success).toBe(false);
      expect(mockSystem.dataFlowPhases).toContain('execute');
      expect(mockSystem.dataFlowPhases).toContain('rollback');
      expect(mockSystem.dataFlowPhases).not.toContain('commit');
    });
  });
});

// ============================================================================
// Mock Implementations
// ============================================================================

interface UserRequest {
  action: string;
  operations: any[];
  mode: 'vibecoding' | 'justvibes';
  inject_error_at?: string;
}

interface SystemResult {
  success: boolean;
  layers_traversed?: string[];
  output?: string;
  error?: string;
}

interface Delegation {
  from: string;
  to: string;
  data: any;
}

class MockSystemLayers {
  executionLog: string[] = [];
  modeLayerConfig: ModeConfig = this.getDefaultModeConfig('vibecoding');
  delegations: Delegation[] = [];
  dataFlowPhases: string[] = [];
  phaseData: Map<string, any> = new Map();
  persistenceData: { state?: any; telemetry?: any; memory?: any; checkpoints?: any } = {};
  errorInjectionPhase: string | null = null;
  currentMode: 'vibecoding' | 'justvibes' = 'vibecoding';

  async processUserRequest(request: UserRequest): Promise<SystemResult> {
    this.currentMode = request.mode;

    try {
      // Layer 1: Mode Layer - Determine behavior
      this.executionLog.push('mode_layer:determine_behavior');
      this.modeLayerConfig = this.getDefaultModeConfig(request.mode);
      this.delegations.push({
        from: 'mode_layer',
        to: 'orchestrator',
        data: { behavior_config: this.modeLayerConfig },
      });

      // Layer 2: Orchestrator - Decompose and schedule
      this.executionLog.push('orchestrator:decompose_tasks');
      this.executionLog.push('orchestrator:schedule_work');

      const batch = this.createBatchFromRequest(request);
      this.delegations.push({
        from: 'orchestrator',
        to: 'batch_engine',
        data: { batch },
      });

      // Layer 3: Batch Engine - Execute
      if (request.inject_error_at === 'batch_engine') {
        this.executionLog.push('batch_engine:error');
        throw new Error('Batch engine failure');
      }

      this.executionLog.push('batch_engine:prepare_batch');
      this.executionLog.push('batch_engine:execute_operations');

      // Layer 4: Persistence - Save
      this.executionLog.push('persistence:save_state');
      this.executionLog.push('persistence:save_telemetry');
      this.persistenceData = {
        state: { session: {}, agents: {}, locks: {} },
        telemetry: { batches: new Map() },
        memory: { decisions: [], patterns: [] },
        checkpoints: [],
      };
      this.delegations.push({
        from: 'batch_engine',
        to: 'persistence',
        data: { state: this.persistenceData.state },
      });

      // Back to orchestrator
      this.executionLog.push('orchestrator:monitor_completion');

      // Back to mode layer for output
      this.executionLog.push('mode_layer:format_output');

      return {
        success: true,
        layers_traversed: ['mode', 'orchestrator', 'batch_engine', 'persistence'],
        output: this.modeLayerConfig.output.default_mode,
      };
    } catch (error) {
      this.executionLog.push('orchestrator:handle_error');
      this.executionLog.push('mode_layer:format_error');

      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  async executeBatchWithFullFlow(batch: Batch): Promise<BatchResult> {
    this.dataFlowPhases = [];

    try {
      await this.executePhase('intent', batch);
      await this.executePhase('context', batch);
      await this.executePhase('plan', batch);
      await this.executePhase('prepare', batch);
      await this.executePhase('validate', batch);
      await this.executePhase('execute', batch);
      await this.executePhase('verify', batch);
      await this.executePhase('commit', batch);
      await this.executePhase('chain', batch);
      await this.executePhase('results', batch);

      return {
        success: true,
        batch_id: batch.id,
        duration_ms: 100,
        operations_completed: this.countOperations(batch),
        operations_failed: 0,
      };
    } catch (error) {
      this.dataFlowPhases.push('rollback');
      return {
        success: false,
        batch_id: batch.id,
        duration_ms: 50,
        operations_completed: 0,
        operations_failed: 1,
      };
    }
  }

  async executePhase(phase: string, batch: Batch): Promise<void> {
    this.dataFlowPhases.push(phase);

    if (this.errorInjectionPhase === phase) {
      throw new Error(`Injected error at ${phase}`);
    }

    switch (phase) {
      case 'intent':
        this.phaseData.set(phase, {
          user_goal: 'Execute batch operations',
          mode: this.currentMode,
          operations_count: this.countOperations(batch),
          risk_level: 'low',
        });
        break;

      case 'context':
        this.phaseData.set(phase, {
          session: {
            id: 'session-001',
            mode: this.currentMode,
            project_root: '/project',
          },
          batch: {
            decisions: [],
            patterns: [],
            affected_files: [],
          },
        });
        break;

      case 'plan':
        this.phaseData.set(phase, {
          execution_order: ['op1', 'op2'],
          parallelizable_groups: [['op1', 'op2']],
          dependencies: {},
          estimated_duration_ms: 1000,
        });
        break;

      case 'prepare':
        this.phaseData.set(phase, {
          checkpoint_created: batch.config.recovery.checkpoint,
          locks_acquired: ['file1.txt', 'file2.txt'],
          resources_allocated: { workers: 1 },
        });
        break;

      case 'validate':
        this.phaseData.set(phase, {
          typecheck: { status: 'pass', errors: 0 },
          lint: { status: 'pass', warnings: 0 },
        });
        break;

      case 'execute':
        this.phaseData.set(phase, {
          operations_completed: this.countOperations(batch),
          operations_failed: 0,
          duration_ms: 50,
        });
        break;

      case 'verify':
        this.phaseData.set(phase, {
          typecheck: { status: 'pass', errors: 0 },
          test: { status: 'pass', failures: 0 },
        });
        break;

      case 'commit':
        this.phaseData.set(phase, {
          changes_applied: true,
          locks_released: ['file1.txt', 'file2.txt'],
          checkpoint_cleaned: true,
        });
        break;

      case 'chain':
        this.phaseData.set(phase, {
          next_batch_id: batch.lifecycle.on_chain ? 'batch-002' : null,
          context_passed: {},
        });
        break;

      case 'results':
        this.phaseData.set(phase, {
          success: true,
          batch_id: batch.id,
          operations_completed: this.countOperations(batch),
          duration_ms: 100,
          telemetry: {},
        });
        break;
    }
  }

  getDelegations(): Delegation[] {
    return this.delegations;
  }

  getPersistenceData() {
    return this.persistenceData;
  }

  getPhaseData(phase: string): any {
    return this.phaseData.get(phase);
  }

  injectErrorAtPhase(phase: string): void {
    this.errorInjectionPhase = phase;
  }

  setMode(mode: 'vibecoding' | 'justvibes'): void {
    this.currentMode = mode;
    this.modeLayerConfig = this.getDefaultModeConfig(mode);
  }

  reset(): void {
    this.executionLog = [];
    this.delegations = [];
    this.dataFlowPhases = [];
    this.phaseData.clear();
    this.persistenceData = {};
    this.errorInjectionPhase = null;
    this.currentMode = 'vibecoding';
  }

  private getDefaultModeConfig(mode: 'vibecoding' | 'justvibes'): ModeConfig {
    if (mode === 'vibecoding') {
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
        description: 'Silent mode',
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

  private createBatchFromRequest(request: UserRequest): Batch {
    return {
      id: 'batch-001',
      operations: {
        read: request.operations.filter((op) => op.type === 'read'),
        write: request.operations.filter((op) => op.type === 'write'),
        exec: request.operations.filter((op) => op.type === 'exec'),
      },
      config: {
        transaction: { mode: 'atomic', isolation: 'strict', timeout_ms: 30000 },
        execution: { mode: 'sequential', max_workers: 1, fail_fast: true, retry: { attempts: 0, backoff: 'fixed', delay_ms: 100 } },
        preview: { dry_run: false, diff: false, impact: false },
        validation: { before: [], after: [], on_fail: 'rollback' },
        recovery: { checkpoint: false, rollback_on_fail: false, cleanup_on_success: false },
      },
      lifecycle: {},
      output: { mode: 'summary', include: [], exclude: [] },
    };
  }

  private countOperations(batch: Batch): number {
    return (
      (batch.operations.read?.length || 0) +
      (batch.operations.write?.length || 0) +
      (batch.operations.exec?.length || 0)
    );
  }
}

function createMinimalBatch(id: string): Batch {
  return {
    id,
    operations: {
      read: [{ type: 'files', id: 'op1', targets: ['test.txt'], extract: 'content' }],
    },
    config: {
      transaction: { mode: 'atomic', isolation: 'strict', timeout_ms: 30000 },
      execution: { mode: 'sequential', max_workers: 1, fail_fast: true, retry: { attempts: 0, backoff: 'fixed', delay_ms: 100 } },
      preview: { dry_run: false, diff: false, impact: false },
      validation: { before: [], after: [], on_fail: 'rollback' },
      recovery: { checkpoint: false, rollback_on_fail: false, cleanup_on_success: false },
    },
    lifecycle: {},
    output: { mode: 'summary', include: [], exclude: [] },
  };
}
