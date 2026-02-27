/**
 * Unit tests for the stale workflow watchdog in ProcessManager.
 *
 * Strategy:
 * - Use vi.hoisted() for mock variables, same pattern as process-manager.test.ts
 * - DO NOT call startup() — construct ProcessManager and inject mocks into
 *   private fields directly using (pm as any).
 * - Test checkStaleWorkflows() via (pm as any).checkStaleWorkflows()
 * - buildSpawnDirectiveMessage and buildEscalationMessage are mocked to return
 *   predictable strings so enqueue call args can be asserted.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Hoisted mock variables ───────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  // state store
  const JsonStateStore = vi.fn().mockImplementation(function () {
    return { initialize: vi.fn().mockResolvedValue(undefined), set: vi.fn().mockResolvedValue(undefined) };
  });

  // health checker
  const HealthChecker = vi.fn().mockImplementation(function () {
    return { check: vi.fn().mockReturnValue({ status: 'healthy', memory_usage_mb: 50 }), updateConfig: vi.fn() };
  });

  // event bus
  const EventBus = vi.fn().mockImplementation(function () {
    return { emit: vi.fn(), on: vi.fn(), off: vi.fn(), setEventLog: vi.fn(), removeAllListeners: vi.fn() };
  });

  // event log
  const EventLog = vi.fn().mockImplementation(function () {
    return {
      initialize: vi.fn().mockResolvedValue(undefined),
      flush: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      compact: vi.fn().mockResolvedValue(undefined),
    };
  });

  // event queue
  const EventQueue = vi.fn().mockImplementation(function () {
    return { start: vi.fn(), stop: vi.fn(), drain: vi.fn().mockResolvedValue(undefined) };
  });

  // IPC server
  const IPCServer = vi.fn().mockImplementation(function () {
    return { listen: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined), onMessage: vi.fn() };
  });

  // IPC router
  const IPCRouter = vi.fn().mockImplementation(function () {
    return { route: vi.fn() };
  });

  // workflow engine
  const workflowEngineListActive = vi.fn().mockReturnValue([]);
  const WorkflowEngine = vi.fn().mockImplementation(function () {
    return {
      setEventBus: vi.fn(),
      registerDefinition: vi.fn(),
      registerGuard: vi.fn(),
      listActive: workflowEngineListActive,
      cancel: vi.fn(),
      prune: vi.fn(),
    };
  });

  // trigger registry
  const TriggerRegistry = vi.fn().mockImplementation(function () {
    return { setDependencies: vi.fn(), register: vi.fn(), evaluate: vi.fn().mockResolvedValue([]) };
  });

  // builtins
  const getBuiltinTriggers = vi.fn().mockReturnValue([]);

  // agent coordinator
  const AgentCoordinator = vi.fn().mockImplementation(function () {
    return { updateConfig: vi.fn(), prune: vi.fn() };
  });

  // budget tracker
  const BudgetTracker = vi.fn().mockImplementation(function () { return {}; });

  // directives
  const directiveQueueSize = vi.fn().mockReturnValue(0);
  const directiveQueueEnqueue = vi.fn();
  const DirectiveQueue = vi.fn().mockImplementation(function () {
    return {
      drain: vi.fn().mockReturnValue([]),
      enqueue: directiveQueueEnqueue,
      peek: vi.fn().mockReturnValue([]),
      size: directiveQueueSize,
      setWRFCConfig: vi.fn(),
    };
  });
  const agentWorkflowMapAddPendingBind = vi.fn();
  const AgentWorkflowMap = vi.fn().mockImplementation(function () {
    return { addPendingBind: agentWorkflowMapAddPendingBind };
  });
  const registerWRFCHandlers = vi.fn();
  const registerTestFixHandlers = vi.fn();
  const registerReviewOnlyHandlers = vi.fn();
  const buildSpawnDirectiveMessage = vi.fn().mockImplementation(
    (agentType: string, task: string) => `spawn:${agentType}:${task}`,
  );
  const buildEscalationMessage = vi.fn().mockImplementation(
    (workflowId: string, fixAttempts: number, score: number) =>
      `escalate:${workflowId}:${fixAttempts}:${score}`,
  );

  // config
  const loadConfig = vi.fn().mockReturnValue({
    schema_version: '1.0.0',
    ipc: { socket_dir: '/tmp/test', connect_timeout_ms: 500, query_timeout_ms: 200 },
    queue: { max_size: 1000, max_attempts: 3, backoff_base_ms: 100, backoff_multiplier: 2, process_interval_ms: 10 },
    persistence: { checkpoint_interval_ms: 30000, event_log_max_size_mb: 50, compact_after_hours: 24, state_dir: '.goodvibes/state' },
    workflows: { max_active: 10, max_transitions_per_workflow: 100, wrfc_max_fix_iterations: 3, fix_loop_max_attempts: 5 },
    triggers: { max_triggers: 100, default_cooldown_ms: 5000, max_fires_per_session: 50 },
    health: { check_interval_ms: 60000, memory_warn_mb: 256, memory_critical_mb: 512, queue_depth_warn: 100 },
    features: { ipc_enabled: false, workflows_enabled: true, agents_enabled: true, full_integration: false },
    agents: { max_concurrent: 6, session_budget: 0, budget_thresholds: [50, 80, 95], default_budget: 200000, max_review_iterations: 3 },
    executor: {
      mode: 'engaged',
      daemon: { clear_context_after_batch: false, tmux_session_name: 'goodvibes', tick_command: '/tick' },
      budget: { warning_threshold: 0.8, daily_reset_hour: 0 },
    },
  });

  return {
    JsonStateStore,
    HealthChecker,
    EventBus,
    EventLog,
    EventQueue,
    IPCServer,
    IPCRouter,
    workflowEngineListActive,
    WorkflowEngine,
    TriggerRegistry,
    getBuiltinTriggers,
    AgentCoordinator,
    BudgetTracker,
    directiveQueueSize,
    directiveQueueEnqueue,
    DirectiveQueue,
    agentWorkflowMapAddPendingBind,
    AgentWorkflowMap,
    registerWRFCHandlers,
    registerTestFixHandlers,
    registerReviewOnlyHandlers,
    buildSpawnDirectiveMessage,
    buildEscalationMessage,
    loadConfig,
  };
});

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('../../shared/config.js', () => ({ loadConfig: mocks.loadConfig }));
vi.mock('../../shared/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('../../shared/constants.js', () => ({ ENGINE_VERSION: '1.0.0-test' }));
vi.mock('../../shared/utils.js', () => ({
  generateEventId: vi.fn().mockReturnValue('evt-id-001'),
  timestamp: vi.fn().mockReturnValue('2026-01-01T00:00:00.000Z'),
  toErrorMessage: vi.fn((err: unknown) => String(err)),
}));
vi.mock('../../persistence/state-store.js', () => ({ JsonStateStore: mocks.JsonStateStore }));
vi.mock('../health.js', () => ({ HealthChecker: mocks.HealthChecker }));
vi.mock('../../events/event-bus.js', () => ({ EventBus: mocks.EventBus }));
vi.mock('../../events/event-log.js', () => ({ EventLog: mocks.EventLog }));
vi.mock('../../events/event-queue.js', () => ({ EventQueue: mocks.EventQueue }));
vi.mock('../../ipc/ipc-server.js', () => ({ IPCServer: mocks.IPCServer }));
vi.mock('../../ipc/ipc-router.js', () => ({ IPCRouter: mocks.IPCRouter }));
vi.mock('../../workflow/workflow-engine.js', () => ({ WorkflowEngine: mocks.WorkflowEngine }));
vi.mock('../../workflow/index.js', () => ({
  WRFC_LOOP_DEFINITION: { id: 'wrfc_loop', name: 'WRFC Loop', version: 1, states: {} },
  FIX_LOOP_DEFINITION: { id: 'fix_loop', name: 'Fix Loop', version: 1, states: {} },
  TEST_THEN_FIX_DEFINITION: { id: 'test_then_fix', name: 'Test-Then-Fix', version: 1, states: {} },
  REVIEW_ONLY_DEFINITION: { id: 'review_only', name: 'Review Only', version: 1, states: {} },
  loadCustomWorkflows: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../triggers/trigger-registry.js', () => ({ TriggerRegistry: mocks.TriggerRegistry }));
vi.mock('../../triggers/builtins.js', () => ({ getBuiltinTriggers: mocks.getBuiltinTriggers }));
vi.mock('../../agents/agent-coordinator.js', () => ({ AgentCoordinator: mocks.AgentCoordinator }));
vi.mock('../../agents/budget-tracker.js', () => ({ BudgetTracker: mocks.BudgetTracker }));
vi.mock('../../directives/index.js', () => ({
  DirectiveQueue: mocks.DirectiveQueue,
  AgentWorkflowMap: mocks.AgentWorkflowMap,
  registerWRFCHandlers: mocks.registerWRFCHandlers,
  registerTestFixHandlers: mocks.registerTestFixHandlers,
  registerReviewOnlyHandlers: mocks.registerReviewOnlyHandlers,
  buildSpawnDirectiveMessage: mocks.buildSpawnDirectiveMessage,
  buildEscalationMessage: mocks.buildEscalationMessage,
}));
vi.mock('../../persistence/index.js', () => ({
  SnapshotManager: vi.fn().mockImplementation(function () { return { start: vi.fn(), stop: vi.fn() }; }),
  recoverState: vi.fn().mockResolvedValue(null),
}));
vi.mock('../../core/index.js', () => ({
  EventQueue: vi.fn().mockImplementation(function () { return { start: vi.fn(), stop: vi.fn(), enqueue: vi.fn() }; }),
  TriggerRegistry: vi.fn().mockImplementation(function () { return { register: vi.fn(), evaluate: vi.fn().mockResolvedValue([]) }; }),
  CoreStateStore: vi.fn().mockImplementation(function () { return { get: vi.fn(), set: vi.fn() }; }),
  LoopLifecycleManager: vi.fn().mockImplementation(function () { return { start: vi.fn(), stop: vi.fn() }; }),
  EventMetrics: vi.fn().mockImplementation(function () { return { record: vi.fn() }; }),
  DeadLetterQueue: vi.fn().mockImplementation(function () { return { enqueue: vi.fn(), drain: vi.fn().mockReturnValue([]) }; }),
  ErrorHandler: vi.fn().mockImplementation(function () { return { handle: vi.fn() }; }),
  EventProcessor: vi.fn().mockImplementation(function () { return { start: vi.fn(), stop: vi.fn() }; }),
}));
vi.mock('../../plugins/index.js', () => ({
  registerWRFCPlugin: vi.fn(),
  getDefaultWRFCConfig: vi.fn().mockReturnValue({}),
  HookProcessor: vi.fn().mockImplementation(function () { return { process: vi.fn() }; }),
  HookRegistry: vi.fn().mockImplementation(function () { return { register: vi.fn() }; }),
  registerDefaultHandlers: vi.fn(),
  TimePlugin: vi.fn().mockImplementation(function () { return { tick: vi.fn() }; }),
  getDefaultTimeConfig: vi.fn().mockReturnValue({}),
  ExternalPlugin: vi.fn().mockImplementation(function () { return { poll: vi.fn() }; }),
  createDefaultExternalPluginConfig: vi.fn().mockReturnValue({}),
}));
vi.mock('../executor-mode.js', () => ({
  ExecutorModeManager: vi.fn().mockImplementation(function () {
    return { getMode: vi.fn().mockReturnValue('engaged'), isEngaged: vi.fn().mockReturnValue(true) };
  }),
}));
vi.mock('../executor-budget.js', () => ({
  ExecutorBudgetManager: vi.fn().mockImplementation(function () {
    return { check: vi.fn(), record: vi.fn() };
  }),
}));
vi.mock('../daemon-tick-handler.js', () => ({
  DaemonTickHandler: vi.fn().mockImplementation(function () {
    return { tick: vi.fn().mockResolvedValue(undefined) };
  }),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { ProcessManager } from '../process-manager.js';
import type { RuntimeConfig } from '../../shared/config.js';
import type { WorkflowInstance } from '../../workflow/types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeConfig(): RuntimeConfig {
  return {
    schema_version: '1.0.0',
    ipc: { socket_dir: '/tmp/test', connect_timeout_ms: 500, query_timeout_ms: 200 },
    queue: { max_size: 1000, max_attempts: 3, backoff_base_ms: 100, backoff_multiplier: 2, process_interval_ms: 10 },
    persistence: { checkpoint_interval_ms: 30000, event_log_max_size_mb: 50, compact_after_hours: 24, state_dir: '.goodvibes/state' },
    workflows: { max_active: 10, max_transitions_per_workflow: 100, wrfc_max_fix_iterations: 3, fix_loop_max_attempts: 5 },
    triggers: { max_triggers: 100, default_cooldown_ms: 5000, max_fires_per_session: 50 },
    health: { check_interval_ms: 60000, memory_warn_mb: 256, memory_critical_mb: 512, queue_depth_warn: 100 },
    features: { ipc_enabled: false, workflows_enabled: true, agents_enabled: true, full_integration: false },
    agents: { max_concurrent: 6, session_budget: 0, budget_thresholds: [50, 80, 95], default_budget: 200000, max_review_iterations: 3 },
    executor: {
      mode: 'engaged',
      daemon: { clear_context_after_batch: false, tmux_session_name: 'goodvibes', tick_command: '/tick' },
      budget: { warning_threshold: 0.8, daily_reset_hour: 0 },
    },
  } as RuntimeConfig;
}

/**
 * Create a stale WorkflowInstance (updated 2.5 minutes ago by default).
 */
function makeWorkflow(overrides: Partial<WorkflowInstance> = {}): WorkflowInstance {
  return {
    id: 'wrfc_test123',
    definition_id: 'wrfc_loop',
    current_state: 'REVIEWING',
    context: {},
    history: [],
    created_at: new Date(Date.now() - 200_000).toISOString(),
    updated_at: new Date(Date.now() - 150_000).toISOString(), // 2.5 min ago (stale)
    status: 'active',
    ...overrides,
  };
}

/**
 * Build a ProcessManager with mock dependencies injected into private fields.
 * Does NOT call startup() — dependencies are injected directly.
 */
function buildPm(opts: {
  workflowEngine?: object | null;
  directiveQueue?: object | null;
  agentWorkflowMap?: object | null;
} = {}): ProcessManager {
  const pm = new ProcessManager(makeConfig(), '/tmp/test-watchdog');

  const mockWorkflowEngine = opts.workflowEngine !== undefined
    ? opts.workflowEngine
    : { listActive: vi.fn().mockReturnValue([]) };

  const mockDirectiveQueue = opts.directiveQueue !== undefined
    ? opts.directiveQueue
    : { peek: vi.fn().mockReturnValue([]), enqueue: vi.fn() };

  const mockAgentWorkflowMap = opts.agentWorkflowMap !== undefined
    ? opts.agentWorkflowMap
    : { addPendingBind: vi.fn() };

  (pm as any).workflowEngine = mockWorkflowEngine;
  (pm as any).directiveQueue = mockDirectiveQueue;
  (pm as any).agentWorkflowMap = mockAgentWorkflowMap;

  return pm;
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Re-apply defaults after clearAllMocks
  mocks.directiveQueueSize.mockReturnValue(0);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ProcessManager — stale workflow watchdog', () => {
  // ─── Guard: missing dependencies ──────────────────────────────────────────

  describe('no-op when dependencies are missing', () => {
    it('does nothing when workflowEngine is null', () => {
      const enqueue = vi.fn();
      const pm = buildPm({
        workflowEngine: null,
        directiveQueue: { peek: vi.fn().mockReturnValue([]), enqueue },
      });
      (pm as any).checkStaleWorkflows();
      expect(enqueue).not.toHaveBeenCalled();
    });

    it('does nothing when directiveQueue is null', () => {
      const listActive = vi.fn().mockReturnValue([makeWorkflow()]);
      const pm = buildPm({
        workflowEngine: { listActive },
        directiveQueue: null,
      });
      (pm as any).checkStaleWorkflows();
      // listActive is never called because guard exits early
      expect(listActive).not.toHaveBeenCalled();
    });
  });

  // ─── State filtering ──────────────────────────────────────────────────────

  describe('ignores non-transitional workflow states', () => {
    const ignoredStates = ['WRITING', 'IDLE', 'COMPLETE', 'ESCALATED', 'PENDING', 'DONE'];

    it.each(ignoredStates)('ignores workflow in %s state', (state) => {
      const enqueue = vi.fn();
      const staleWorkflow = makeWorkflow({ current_state: state });
      const pm = buildPm({
        workflowEngine: { listActive: vi.fn().mockReturnValue([staleWorkflow]) },
        directiveQueue: { peek: vi.fn().mockReturnValue([]), enqueue },
      });
      (pm as any).checkStaleWorkflows();
      expect(enqueue).not.toHaveBeenCalled();
    });
  });

  // ─── Staleness threshold ──────────────────────────────────────────────────

  describe('staleness threshold (WATCHDOG_STALE_MS = 120,000 ms)', () => {
    it('does not recover a REVIEWING workflow updated less than 2 minutes ago', () => {
      const enqueue = vi.fn();
      // Updated only 60 seconds ago — not stale yet
      const freshWorkflow = makeWorkflow({
        current_state: 'REVIEWING',
        updated_at: new Date(Date.now() - 60_000).toISOString(),
      });
      const pm = buildPm({
        workflowEngine: { listActive: vi.fn().mockReturnValue([freshWorkflow]) },
        directiveQueue: { peek: vi.fn().mockReturnValue([]), enqueue },
      });
      (pm as any).checkStaleWorkflows();
      expect(enqueue).not.toHaveBeenCalled();
    });

    it('does not recover a FIXING workflow updated exactly at 119 seconds ago', () => {
      const enqueue = vi.fn();
      const almostStaleWorkflow = makeWorkflow({
        current_state: 'FIXING',
        updated_at: new Date(Date.now() - 119_000).toISOString(),
      });
      const pm = buildPm({
        workflowEngine: { listActive: vi.fn().mockReturnValue([almostStaleWorkflow]) },
        directiveQueue: { peek: vi.fn().mockReturnValue([]), enqueue },
      });
      (pm as any).checkStaleWorkflows();
      expect(enqueue).not.toHaveBeenCalled();
    });
  });

  // ─── Recovery: REVIEWING state ────────────────────────────────────────────

  describe('recovers stale REVIEWING workflow', () => {
    it('calls enqueue with a reviewer spawn directive when REVIEWING for > 2 minutes', () => {
      const enqueue = vi.fn();
      const workflow = makeWorkflow({ current_state: 'REVIEWING' });
      const pm = buildPm({
        workflowEngine: { listActive: vi.fn().mockReturnValue([workflow]) },
        directiveQueue: { peek: vi.fn().mockReturnValue([]), enqueue },
      });
      (pm as any).checkStaleWorkflows();

      expect(enqueue).toHaveBeenCalledTimes(1);
      const [target, directive] = enqueue.mock.calls[0];
      expect(target).toBe('subagent_stop');
      expect(directive.type).toBe('inject_system_message');
      expect(directive.source).toBe('watchdog');
      expect(directive.priority).toBeTypeOf('number');
    });

    it('passes agentType=reviewer and task containing workflow id to buildSpawnDirectiveMessage', () => {
      const workflow = makeWorkflow({ id: 'wrfc_abc999', current_state: 'REVIEWING' });
      const pm = buildPm({
        workflowEngine: { listActive: vi.fn().mockReturnValue([workflow]) },
      });
      (pm as any).checkStaleWorkflows();

      expect(mocks.buildSpawnDirectiveMessage).toHaveBeenCalledWith(
        'reviewer',
        expect.stringContaining('wrfc_abc999'),
        undefined,
        expect.objectContaining({ workflow_id: 'wrfc_abc999' }),
      );
    });

    it('includes files_modified from workflow context in reviewer directive', () => {
      const workflow = makeWorkflow({
        current_state: 'REVIEWING',
        context: { files_modified: ['src/foo.ts', 'src/bar.ts'] },
      });
      const pm = buildPm({
        workflowEngine: { listActive: vi.fn().mockReturnValue([workflow]) },
      });
      (pm as any).checkStaleWorkflows();

      expect(mocks.buildSpawnDirectiveMessage).toHaveBeenCalledWith(
        'reviewer',
        expect.stringContaining('src/foo.ts'),
        undefined,
        expect.objectContaining({ files_modified: ['src/foo.ts', 'src/bar.ts'] }),
      );
    });

    it('handles missing files_modified gracefully (defaults to empty array)', () => {
      const workflow = makeWorkflow({ current_state: 'REVIEWING', context: {} });
      const pm = buildPm({
        workflowEngine: { listActive: vi.fn().mockReturnValue([workflow]) },
      });
      (pm as any).checkStaleWorkflows();

      expect(mocks.buildSpawnDirectiveMessage).toHaveBeenCalledWith(
        'reviewer',
        expect.any(String),
        undefined,
        expect.objectContaining({ files_modified: [] }),
      );
    });

    it('calls addPendingBind for both reviewer and goodvibes:reviewer agent types', () => {
      const addPendingBind = vi.fn();
      const workflow = makeWorkflow({ id: 'wrfc_bind_test', current_state: 'REVIEWING' });
      const pm = buildPm({
        workflowEngine: { listActive: vi.fn().mockReturnValue([workflow]) },
        agentWorkflowMap: { addPendingBind },
      });
      (pm as any).checkStaleWorkflows();

      expect(addPendingBind).toHaveBeenCalledWith('reviewer', 'wrfc_bind_test');
      expect(addPendingBind).toHaveBeenCalledWith('goodvibes:reviewer', 'wrfc_bind_test');
      expect(addPendingBind).toHaveBeenCalledTimes(2);
    });

    it('state match is case-insensitive (lowercase "reviewing" is detected as stale)', () => {
      const enqueue = vi.fn();
      const workflow = makeWorkflow({ current_state: 'reviewing' });
      const pm = buildPm({
        workflowEngine: { listActive: vi.fn().mockReturnValue([workflow]) },
        directiveQueue: { peek: vi.fn().mockReturnValue([]), enqueue },
      });
      (pm as any).checkStaleWorkflows();
      expect(enqueue).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Recovery: FIXING state ───────────────────────────────────────────────

  describe('recovers stale FIXING workflow', () => {
    it('enqueues engineer fix directive when fix budget is not exhausted', () => {
      const enqueue = vi.fn();
      const workflow = makeWorkflow({
        current_state: 'FIXING',
        context: { fix_attempts: 1, max_fix_attempts: 3, review_score: 6 },
      });
      const pm = buildPm({
        workflowEngine: { listActive: vi.fn().mockReturnValue([workflow]) },
        directiveQueue: { peek: vi.fn().mockReturnValue([]), enqueue },
      });
      (pm as any).checkStaleWorkflows();

      expect(enqueue).toHaveBeenCalledTimes(1);
      const [target, directive] = enqueue.mock.calls[0];
      expect(target).toBe('subagent_stop');
      expect(directive.type).toBe('inject_system_message');
      expect(directive.source).toBe('watchdog');
    });

    it('passes agentType=engineer to buildSpawnDirectiveMessage when fixing', () => {
      const workflow = makeWorkflow({
        id: 'wrfc_fix_test',
        current_state: 'FIXING',
        context: { fix_attempts: 0, max_fix_attempts: 3, review_score: 5 },
      });
      const pm = buildPm({
        workflowEngine: { listActive: vi.fn().mockReturnValue([workflow]) },
      });
      (pm as any).checkStaleWorkflows();

      expect(mocks.buildSpawnDirectiveMessage).toHaveBeenCalledWith(
        'engineer',
        expect.stringContaining('wrfc_fix_test'),
        undefined,
        expect.objectContaining({ workflow_id: 'wrfc_fix_test' }),
      );
    });

    it('includes review_score, fix_attempts, max_fix_attempts, and review_issues in fix directive context', () => {
      const reviewIssues = [
        { dimension: 'correctness', severity: 'high', description: 'logic bug' },
      ];
      const workflow = makeWorkflow({
        current_state: 'FIXING',
        context: {
          fix_attempts: 1,
          max_fix_attempts: 3,
          review_score: 5,
          review_issues: reviewIssues,
          files_modified: ['src/thing.ts'],
        },
      });
      const pm = buildPm({
        workflowEngine: { listActive: vi.fn().mockReturnValue([workflow]) },
      });
      (pm as any).checkStaleWorkflows();

      expect(mocks.buildSpawnDirectiveMessage).toHaveBeenCalledWith(
        'engineer',
        expect.any(String),
        undefined,
        expect.objectContaining({
          review_score: 5,
          fix_attempts: 1,
          max_fix_attempts: 3,
          review_issues: reviewIssues,
          files_modified: ['src/thing.ts'],
        }),
      );
    });

    it('calls addPendingBind for both engineer and goodvibes:engineer agent types when fixing', () => {
      const addPendingBind = vi.fn();
      const workflow = makeWorkflow({
        id: 'wrfc_eng_bind',
        current_state: 'FIXING',
        context: { fix_attempts: 0, max_fix_attempts: 3 },
      });
      const pm = buildPm({
        workflowEngine: { listActive: vi.fn().mockReturnValue([workflow]) },
        agentWorkflowMap: { addPendingBind },
      });
      (pm as any).checkStaleWorkflows();

      expect(addPendingBind).toHaveBeenCalledWith('engineer', 'wrfc_eng_bind');
      expect(addPendingBind).toHaveBeenCalledWith('goodvibes:engineer', 'wrfc_eng_bind');
      expect(addPendingBind).toHaveBeenCalledTimes(2);
    });

    it('defaults fix_attempts to 0 and max_fix_attempts to 3 when not in context', () => {
      const workflow = makeWorkflow({
        current_state: 'FIXING',
        context: {}, // no fix_attempts or max_fix_attempts
      });
      const pm = buildPm({
        workflowEngine: { listActive: vi.fn().mockReturnValue([workflow]) },
      });
      (pm as any).checkStaleWorkflows();

      // Should spawn engineer (not escalate) because 0 < 3
      expect(mocks.buildSpawnDirectiveMessage).toHaveBeenCalledWith(
        'engineer',
        expect.any(String),
        undefined,
        expect.objectContaining({ fix_attempts: 0, max_fix_attempts: 3 }),
      );
      expect(mocks.buildEscalationMessage).not.toHaveBeenCalled();
    });
  });

  // ─── Escalation: fix budget exhausted ─────────────────────────────────────

  describe('escalates when fix budget is exhausted', () => {
    it('calls buildEscalationMessage when fix_attempts >= max_fix_attempts', () => {
      const workflow = makeWorkflow({
        id: 'wrfc_escalate',
        current_state: 'FIXING',
        context: { fix_attempts: 3, max_fix_attempts: 3, review_score: 4 },
      });
      const pm = buildPm({
        workflowEngine: { listActive: vi.fn().mockReturnValue([workflow]) },
      });
      (pm as any).checkStaleWorkflows();

      expect(mocks.buildEscalationMessage).toHaveBeenCalledWith('wrfc_escalate', 3, 4);
      expect(mocks.buildSpawnDirectiveMessage).not.toHaveBeenCalled();
    });

    it('enqueues escalation directive with higher priority (30) when fix budget exhausted', () => {
      const enqueue = vi.fn();
      const workflow = makeWorkflow({
        current_state: 'FIXING',
        context: { fix_attempts: 5, max_fix_attempts: 3, review_score: 3 },
      });
      const pm = buildPm({
        workflowEngine: { listActive: vi.fn().mockReturnValue([workflow]) },
        directiveQueue: { peek: vi.fn().mockReturnValue([]), enqueue },
      });
      (pm as any).checkStaleWorkflows();

      expect(enqueue).toHaveBeenCalledTimes(1);
      const [target, directive] = enqueue.mock.calls[0];
      expect(target).toBe('subagent_stop');
      expect(directive.type).toBe('inject_system_message');
      expect(directive.priority).toBe(30);
      expect(directive.source).toBe('watchdog');
    });

    it('escalates when fix_attempts equals max_fix_attempts exactly', () => {
      const enqueue = vi.fn();
      const workflow = makeWorkflow({
        current_state: 'FIXING',
        context: { fix_attempts: 3, max_fix_attempts: 3 },
      });
      const pm = buildPm({
        workflowEngine: { listActive: vi.fn().mockReturnValue([workflow]) },
        directiveQueue: { peek: vi.fn().mockReturnValue([]), enqueue },
      });
      (pm as any).checkStaleWorkflows();

      expect(mocks.buildEscalationMessage).toHaveBeenCalled();
      expect(mocks.buildSpawnDirectiveMessage).not.toHaveBeenCalled();
    });

    it('defaults review_score to 0 when not in context during escalation', () => {
      const workflow = makeWorkflow({
        id: 'wrfc_no_score',
        current_state: 'FIXING',
        context: { fix_attempts: 3, max_fix_attempts: 3 }, // no review_score
      });
      const pm = buildPm({
        workflowEngine: { listActive: vi.fn().mockReturnValue([workflow]) },
      });
      (pm as any).checkStaleWorkflows();

      expect(mocks.buildEscalationMessage).toHaveBeenCalledWith('wrfc_no_score', 3, 0);
    });
  });

  // ─── Cooldown ─────────────────────────────────────────────────────────────

  describe('cooldown between recovery attempts', () => {
    it('does not re-enqueue the same workflow within the 2-minute cooldown window', () => {
      const enqueue = vi.fn();
      const workflow = makeWorkflow({ id: 'wrfc_cooldown', current_state: 'REVIEWING' });
      const pm = buildPm({
        workflowEngine: { listActive: vi.fn().mockReturnValue([workflow]) },
        directiveQueue: { peek: vi.fn().mockReturnValue([]), enqueue },
      });

      // First call — should enqueue
      (pm as any).checkStaleWorkflows();
      expect(enqueue).toHaveBeenCalledTimes(1);

      // Second call immediately after — should be blocked by cooldown
      (pm as any).checkStaleWorkflows();
      expect(enqueue).toHaveBeenCalledTimes(1);
    });

    it('allows recovery after cooldown has elapsed', () => {
      const enqueue = vi.fn();
      const workflow = makeWorkflow({ id: 'wrfc_after_cooldown', current_state: 'REVIEWING' });
      const pm = buildPm({
        workflowEngine: { listActive: vi.fn().mockReturnValue([workflow]) },
        directiveQueue: { peek: vi.fn().mockReturnValue([]), enqueue },
      });

      // First call — sets watchdogRecovery timestamp
      (pm as any).checkStaleWorkflows();
      expect(enqueue).toHaveBeenCalledTimes(1);

      // Manually backdate the recovery timestamp to simulate cooldown elapsed
      (pm as any).watchdogRecovery.set('wrfc_after_cooldown', Date.now() - 121_000);

      // Second call after cooldown — should enqueue again
      (pm as any).checkStaleWorkflows();
      expect(enqueue).toHaveBeenCalledTimes(2);
    });

    it('cooldown is per-workflow (other workflows still get recovered)', () => {
      const enqueue = vi.fn();
      const workflow1 = makeWorkflow({ id: 'wrfc_cooled', current_state: 'REVIEWING' });
      const workflow2 = makeWorkflow({ id: 'wrfc_fresh', current_state: 'REVIEWING' });

      const listActive = vi.fn().mockReturnValue([workflow1, workflow2]);
      const pm = buildPm({
        workflowEngine: { listActive },
        directiveQueue: { peek: vi.fn().mockReturnValue([]), enqueue },
      });

      // First call — both get recovered
      (pm as any).checkStaleWorkflows();
      expect(enqueue).toHaveBeenCalledTimes(2);

      // Second call immediately — both should be blocked by cooldown
      (pm as any).checkStaleWorkflows();
      expect(enqueue).toHaveBeenCalledTimes(2);

      // Backdate only workflow1's cooldown
      (pm as any).watchdogRecovery.set('wrfc_cooled', Date.now() - 121_000);

      // Third call — only workflow1 is recovered again
      (pm as any).checkStaleWorkflows();
      expect(enqueue).toHaveBeenCalledTimes(3);
    });
  });

  // ─── Cleanup of stale recovery entries ───────────────────────────────────

  describe('cleanup of watchdogRecovery entries', () => {
    it('removes watchdogRecovery entry when a workflow is no longer active', () => {
      const workflow = makeWorkflow({ id: 'wrfc_gone', current_state: 'REVIEWING' });
      const listActive = vi.fn();
        // First call: workflow is active
      listActive.mockReturnValueOnce([workflow]);
      // Second call: workflow has completed/disappeared
      listActive.mockReturnValueOnce([]);

      const pm = buildPm({
        workflowEngine: { listActive },
      });

      // First call — workflow is recovered, entry is set
      (pm as any).checkStaleWorkflows();
      expect((pm as any).watchdogRecovery.has('wrfc_gone')).toBe(true);

      // Second call — workflow is gone, entry should be cleaned up
      (pm as any).checkStaleWorkflows();
      expect((pm as any).watchdogRecovery.has('wrfc_gone')).toBe(false);
    });

    it('does not remove entries for workflows that are still active', () => {
      const workflow = makeWorkflow({ id: 'wrfc_still_here', current_state: 'REVIEWING' });
      const listActive = vi.fn().mockReturnValue([workflow]);
      const pm = buildPm({
        workflowEngine: { listActive },
      });

      // First call — workflow is recovered, entry is set
      (pm as any).checkStaleWorkflows();
      expect((pm as any).watchdogRecovery.has('wrfc_still_here')).toBe(true);

      // Immediately second call — entry remains (workflow still active)
      (pm as any).checkStaleWorkflows();
      expect((pm as any).watchdogRecovery.has('wrfc_still_here')).toBe(true);
    });

    it('watchdogRecovery map is set with current timestamp after recovery', () => {
      const before = Date.now();
      const workflow = makeWorkflow({ id: 'wrfc_ts_check', current_state: 'REVIEWING' });
      const pm = buildPm({
        workflowEngine: { listActive: vi.fn().mockReturnValue([workflow]) },
      });

      (pm as any).checkStaleWorkflows();
      const after = Date.now();

      const recorded = (pm as any).watchdogRecovery.get('wrfc_ts_check');
      expect(recorded).toBeGreaterThanOrEqual(before);
      expect(recorded).toBeLessThanOrEqual(after);
    });
  });

  // ─── Pending directives: skip if already queued ───────────────────────────

  describe('skips recovery when directives are already pending for the workflow', () => {
    it('does not enqueue when a pending directive references this workflow ID', () => {
      const enqueue = vi.fn();
      const workflow = makeWorkflow({ current_state: 'REVIEWING' });
      const pm = buildPm({
        workflowEngine: { listActive: vi.fn().mockReturnValue([workflow]) },
        directiveQueue: {
          peek: vi.fn().mockReturnValue([
            { content: `<gv>{"action":"spawn","wid":"${workflow.id}","type":"reviewer"}</gv>` },
          ]),
          enqueue,
        },
      });
      (pm as any).checkStaleWorkflows();
      expect(enqueue).not.toHaveBeenCalled();
    });

    it('does not enqueue for FIXING workflow when directive references its ID', () => {
      const enqueue = vi.fn();
      const workflow = makeWorkflow({
        current_state: 'FIXING',
        context: { fix_attempts: 0, max_fix_attempts: 3 },
      });
      const pm = buildPm({
        workflowEngine: { listActive: vi.fn().mockReturnValue([workflow]) },
        directiveQueue: {
          peek: vi.fn().mockReturnValue([
            { content: `<gv>{"action":"spawn","wid":"${workflow.id}","type":"engineer"}</gv>` },
          ]),
          enqueue,
        },
      });
      (pm as any).checkStaleWorkflows();
      expect(enqueue).not.toHaveBeenCalled();
    });

    it('proceeds with recovery when pending directives exist but none reference this workflow', () => {
      const enqueue = vi.fn();
      const workflow = makeWorkflow({ current_state: 'REVIEWING' });
      const pm = buildPm({
        workflowEngine: { listActive: vi.fn().mockReturnValue([workflow]) },
        directiveQueue: {
          peek: vi.fn().mockReturnValue([
            { content: '<gv>{"action":"spawn","wid":"wrfc_OTHER_WORKFLOW","type":"reviewer"}</gv>' },
          ]),
          enqueue,
        },
      });
      (pm as any).checkStaleWorkflows();
      expect(enqueue).toHaveBeenCalledTimes(1);
    });

    it('proceeds with recovery when pending queue is empty', () => {
      const enqueue = vi.fn();
      const workflow = makeWorkflow({ current_state: 'REVIEWING' });
      const pm = buildPm({
        workflowEngine: { listActive: vi.fn().mockReturnValue([workflow]) },
        directiveQueue: {
          peek: vi.fn().mockReturnValue([]),
          enqueue,
        },
      });
      (pm as any).checkStaleWorkflows();
      expect(enqueue).toHaveBeenCalledTimes(1);
    });
  });

  // ─── agentWorkflowMap: null safety ────────────────────────────────────────

  describe('agentWorkflowMap null safety', () => {
    it('does not throw when agentWorkflowMap is null during REVIEWING recovery', () => {
      const workflow = makeWorkflow({ current_state: 'REVIEWING' });
      const pm = buildPm({
        workflowEngine: { listActive: vi.fn().mockReturnValue([workflow]) },
        agentWorkflowMap: null,
      });
      expect(() => (pm as any).checkStaleWorkflows()).not.toThrow();
    });

    it('does not throw when agentWorkflowMap is null during FIXING recovery', () => {
      const workflow = makeWorkflow({
        current_state: 'FIXING',
        context: { fix_attempts: 0, max_fix_attempts: 3 },
      });
      const pm = buildPm({
        workflowEngine: { listActive: vi.fn().mockReturnValue([workflow]) },
        agentWorkflowMap: null,
      });
      expect(() => (pm as any).checkStaleWorkflows()).not.toThrow();
    });

    it('still enqueues directive even when agentWorkflowMap is null', () => {
      const enqueue = vi.fn();
      const workflow = makeWorkflow({ current_state: 'REVIEWING' });
      const pm = buildPm({
        workflowEngine: { listActive: vi.fn().mockReturnValue([workflow]) },
        directiveQueue: { peek: vi.fn().mockReturnValue([]), enqueue },
        agentWorkflowMap: null,
      });
      (pm as any).checkStaleWorkflows();
      expect(enqueue).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Multiple workflows in one tick ──────────────────────────────────────

  describe('processes multiple workflows in one tick', () => {
    it('recovers multiple stale workflows in a single checkStaleWorkflows call', () => {
      const enqueue = vi.fn();
      const workflow1 = makeWorkflow({ id: 'wrfc_multi_1', current_state: 'REVIEWING' });
      const workflow2 = makeWorkflow({ id: 'wrfc_multi_2', current_state: 'FIXING', context: { fix_attempts: 1, max_fix_attempts: 3 } });
      const pm = buildPm({
        workflowEngine: { listActive: vi.fn().mockReturnValue([workflow1, workflow2]) },
        directiveQueue: { peek: vi.fn().mockReturnValue([]), enqueue },
      });
      (pm as any).checkStaleWorkflows();

      // Both should get a directive enqueued
      expect(enqueue).toHaveBeenCalledTimes(2);
      expect(mocks.buildSpawnDirectiveMessage).toHaveBeenCalledWith('reviewer', expect.any(String), undefined, expect.any(Object));
      expect(mocks.buildSpawnDirectiveMessage).toHaveBeenCalledWith('engineer', expect.any(String), undefined, expect.any(Object));
    });

    it('skips fresh workflow but recovers stale workflow in same tick', () => {
      const enqueue = vi.fn();
      const staleWorkflow = makeWorkflow({ id: 'wrfc_stale', current_state: 'REVIEWING' });
      const freshWorkflow = makeWorkflow({
        id: 'wrfc_fresh_only',
        current_state: 'REVIEWING',
        updated_at: new Date(Date.now() - 30_000).toISOString(), // 30 seconds ago
      });
      const pm = buildPm({
        workflowEngine: { listActive: vi.fn().mockReturnValue([staleWorkflow, freshWorkflow]) },
        directiveQueue: { peek: vi.fn().mockReturnValue([]), enqueue },
      });
      (pm as any).checkStaleWorkflows();

      // Only the stale one should be recovered
      expect(enqueue).toHaveBeenCalledTimes(1);
    });
  });

  // ─── recoverStaleWorkflow review_issues formatting ───────────────────────

  describe('recoverStaleWorkflow: review_issues in fix task description', () => {
    it('uses review_issues to build the issues summary in the fix task', () => {
      const reviewIssues = [
        { dimension: 'testing', severity: 'medium', description: 'missing tests' },
        { dimension: 'security', severity: 'high', description: 'sql injection' },
      ];
      const workflow = makeWorkflow({
        current_state: 'FIXING',
        context: {
          fix_attempts: 0,
          max_fix_attempts: 3,
          review_score: 4,
          review_issues: reviewIssues,
        },
      });
      const pm = buildPm({
        workflowEngine: { listActive: vi.fn().mockReturnValue([workflow]) },
      });
      (pm as any).checkStaleWorkflows();

      // The fix task string passed to buildSpawnDirectiveMessage should contain the issues
      const taskArg = mocks.buildSpawnDirectiveMessage.mock.calls[0][1] as string;
      expect(taskArg).toContain('[medium] testing: missing tests');
      expect(taskArg).toContain('[high] security: sql injection');
    });

    it('uses fallback message when review_issues is missing', () => {
      const workflow = makeWorkflow({
        current_state: 'FIXING',
        context: { fix_attempts: 0, max_fix_attempts: 3, review_score: 5 },
      });
      const pm = buildPm({
        workflowEngine: { listActive: vi.fn().mockReturnValue([workflow]) },
      });
      (pm as any).checkStaleWorkflows();

      const taskArg = mocks.buildSpawnDirectiveMessage.mock.calls[0][1] as string;
      expect(taskArg).toContain('See previous review output for details.');
    });

    it('uses fallback message when review_issues is not an array', () => {
      const workflow = makeWorkflow({
        current_state: 'FIXING',
        context: { fix_attempts: 0, max_fix_attempts: 3, review_issues: 'bad-format' },
      });
      const pm = buildPm({
        workflowEngine: { listActive: vi.fn().mockReturnValue([workflow]) },
      });
      (pm as any).checkStaleWorkflows();

      const taskArg = mocks.buildSpawnDirectiveMessage.mock.calls[0][1] as string;
      expect(taskArg).toContain('See previous review output for details.');
    });
  });
});
