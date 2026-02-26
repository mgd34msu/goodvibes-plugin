/**
 * Unit tests for ProcessManager lifecycle, PID file management, socket pointer
 * file, isAlreadyRunning (checkCrashRecovery), startup/shutdown sequences, and
 * IPC handler wiring.
 *
 * Strategy:
 * - vi.hoisted() declares mock variables before vi.mock() hoisting fires so
 *   factory functions can reference them without a TDZ error.
 * - Paths in vi.mock() are relative to THIS file (src/lifecycle/__tests__/).
 * - 'fs' is partially mocked via importOriginal to preserve fs internals.
 * - ProcessManager public API tested to verify lifecycle and wiring.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

// ─── Hoisted mock variables (safe to reference in vi.mock factories) ─────────

const mocks = vi.hoisted(() => {
  // fs
  const writeFileSync = vi.fn();
  const readFileSync = vi.fn();
  const unlinkSync = vi.fn();
  const existsSync = vi.fn().mockReturnValue(false);
  const mkdirSync = vi.fn();

  // state store
  const stateStoreInitialize = vi.fn().mockResolvedValue(undefined);
  const stateStoreSet = vi.fn().mockResolvedValue(undefined);
  const JsonStateStore = vi.fn().mockImplementation(function() {
    return { initialize: stateStoreInitialize, set: stateStoreSet };
  });

  // health checker
  const healthCheck = vi.fn().mockReturnValue({ status: 'healthy', memory_usage_mb: 50 });
  const healthUpdateConfig = vi.fn();
  const HealthChecker = vi.fn().mockImplementation(function() {
    return { check: healthCheck, updateConfig: healthUpdateConfig };
  });

  // event bus
  const eventBusEmit = vi.fn();
  const eventBusOn = vi.fn();
  const eventBusOff = vi.fn();
  const eventBusSetEventLog = vi.fn();
  const eventBusRemoveAllListeners = vi.fn();
  const EventBus = vi.fn().mockImplementation(function() {
    return { emit: eventBusEmit, on: eventBusOn, off: eventBusOff, setEventLog: eventBusSetEventLog, removeAllListeners: eventBusRemoveAllListeners };
  });

  // event log
  const eventLogInitialize = vi.fn().mockResolvedValue(undefined);
  const eventLogFlush = vi.fn().mockResolvedValue(undefined);
  const eventLogClose = vi.fn().mockResolvedValue(undefined);
  const eventLogCompact = vi.fn().mockResolvedValue(undefined);
  const EventLog = vi.fn().mockImplementation(function() {
    return { initialize: eventLogInitialize, flush: eventLogFlush, close: eventLogClose, compact: eventLogCompact };
  });

  // event queue
  const eventQueueStart = vi.fn();
  const eventQueueStop = vi.fn();
  const eventQueueDrain = vi.fn().mockResolvedValue(undefined);
  const EventQueue = vi.fn().mockImplementation(function() {
    return { start: eventQueueStart, stop: eventQueueStop, drain: eventQueueDrain };
  });

  // IPC server
  const ipcServerListen = vi.fn().mockResolvedValue(undefined);
  const ipcServerClose = vi.fn().mockResolvedValue(undefined);
  const ipcServerOnMessage = vi.fn();
  const IPCServer = vi.fn().mockImplementation(function() {
    return { listen: ipcServerListen, close: ipcServerClose, onMessage: ipcServerOnMessage };
  });

  // IPC router
  const ipcRouterRoute = vi.fn();
  const IPCRouter = vi.fn().mockImplementation(function() {
    return { route: ipcRouterRoute };
  });

  // workflow engine
  const workflowEngineSetEventBus = vi.fn();
  const workflowEngineRegisterDefinition = vi.fn();
  const workflowEngineRegisterGuard = vi.fn();
  const workflowEngineListActive = vi.fn().mockReturnValue([]);
  const workflowEngineCancel = vi.fn();
  const workflowEnginePrune = vi.fn();
  const WorkflowEngine = vi.fn().mockImplementation(function() {
    return { setEventBus: workflowEngineSetEventBus, registerDefinition: workflowEngineRegisterDefinition, registerGuard: workflowEngineRegisterGuard, listActive: workflowEngineListActive, cancel: workflowEngineCancel, prune: workflowEnginePrune };
  });

  // trigger registry
  const triggerRegistrySetDependencies = vi.fn();
  const triggerRegistryRegister = vi.fn();
  const triggerRegistryEvaluate = vi.fn().mockResolvedValue([]);
  const TriggerRegistry = vi.fn().mockImplementation(function() {
    return { setDependencies: triggerRegistrySetDependencies, register: triggerRegistryRegister, evaluate: triggerRegistryEvaluate };
  });

  // builtins
  const getBuiltinTriggers = vi.fn().mockReturnValue([
    { id: 'builtin-1', name: 'Builtin 1' },
    { id: 'builtin-2', name: 'Builtin 2' },
  ]);

  // agent coordinator
  const agentCoordinatorUpdateConfig = vi.fn();
  const agentCoordinatorPrune = vi.fn();
  const AgentCoordinator = vi.fn().mockImplementation(function() {
    return { updateConfig: agentCoordinatorUpdateConfig, prune: agentCoordinatorPrune };
  });

  // budget tracker
  const BudgetTracker = vi.fn().mockImplementation(function() { return {}; });

  // directives
  const directiveQueueDrain = vi.fn().mockReturnValue([]);
  const directiveQueueEnqueue = vi.fn();
  const directiveQueueSetWRFCConfig = vi.fn();
  const DirectiveQueue = vi.fn().mockImplementation(function() {
    return { drain: directiveQueueDrain, enqueue: directiveQueueEnqueue, setWRFCConfig: directiveQueueSetWRFCConfig };
  });
  const AgentWorkflowMap = vi.fn().mockImplementation(function() { return {}; });
  const registerWRFCHandlers = vi.fn();
  const registerTestFixHandlers = vi.fn();
  const registerReviewOnlyHandlers = vi.fn();

  // loadConfig
  const loadConfig = vi.fn().mockReturnValue({
    schema_version: '1.0.0',
    ipc: { socket_dir: '/tmp/test-sockets', connect_timeout_ms: 500, query_timeout_ms: 200 },
    queue: { max_size: 1000, max_attempts: 3, backoff_base_ms: 100, backoff_multiplier: 2, process_interval_ms: 10 },
    persistence: { checkpoint_interval_ms: 30000, event_log_max_size_mb: 50, compact_after_hours: 24, state_dir: '.goodvibes/state' },
    workflows: { max_active: 10, max_transitions_per_workflow: 100, wrfc_max_fix_iterations: 3, fix_loop_max_attempts: 5 },
    triggers: { max_triggers: 100, default_cooldown_ms: 5000, max_fires_per_session: 50 },
    health: { check_interval_ms: 60000, memory_warn_mb: 256, memory_critical_mb: 512, queue_depth_warn: 100 },
    features: { ipc_enabled: true, workflows_enabled: true, agents_enabled: true, full_integration: true },
    agents: { max_concurrent: 6, session_budget: 0, budget_thresholds: [50, 80, 95], default_budget: 200000, max_review_iterations: 3 },
    executor: {
      mode: 'engaged',
      daemon: { clear_context_after_batch: false, tmux_session_name: 'goodvibes', tick_command: '/tick' },
      budget: { warning_threshold: 0.8, daily_reset_hour: 0 },
    },
  });

  return {
    // fs
    writeFileSync, readFileSync, unlinkSync, existsSync, mkdirSync,
    // state store
    stateStoreInitialize, stateStoreSet, JsonStateStore,
    // health
    healthCheck, healthUpdateConfig, HealthChecker,
    // event bus
    eventBusEmit, eventBusOn, eventBusOff, eventBusSetEventLog, eventBusRemoveAllListeners, EventBus,
    // event log
    eventLogInitialize, eventLogFlush, eventLogClose, eventLogCompact, EventLog,
    // event queue
    eventQueueStart, eventQueueStop, eventQueueDrain, EventQueue,
    // IPC
    ipcServerListen, ipcServerClose, ipcServerOnMessage, IPCServer,
    ipcRouterRoute, IPCRouter,
    // workflow
    workflowEngineSetEventBus, workflowEngineRegisterDefinition, workflowEngineRegisterGuard,
    workflowEngineListActive, workflowEngineCancel, workflowEnginePrune, WorkflowEngine,
    // triggers
    triggerRegistrySetDependencies, triggerRegistryRegister, triggerRegistryEvaluate, TriggerRegistry,
    getBuiltinTriggers,
    // agents
    agentCoordinatorUpdateConfig, agentCoordinatorPrune, AgentCoordinator,
    BudgetTracker,
    // directives
    directiveQueueDrain, directiveQueueEnqueue, directiveQueueSetWRFCConfig,
    DirectiveQueue, AgentWorkflowMap, registerWRFCHandlers,
    registerTestFixHandlers, registerReviewOnlyHandlers,
    // config
    loadConfig,
  };
});

// ─── Module mocks ───────────────────────────────────────────────────────────────

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    writeFileSync: (...args: unknown[]) => mocks.writeFileSync(...args),
    readFileSync: (...args: unknown[]) => mocks.readFileSync(...args),
    unlinkSync: (...args: unknown[]) => mocks.unlinkSync(...args),
    existsSync: (...args: unknown[]) => mocks.existsSync(...args),
    mkdirSync: (...args: unknown[]) => mocks.mkdirSync(...args),
    default: {
      ...actual,
      writeFileSync: (...args: unknown[]) => mocks.writeFileSync(...args),
      readFileSync: (...args: unknown[]) => mocks.readFileSync(...args),
      unlinkSync: (...args: unknown[]) => mocks.unlinkSync(...args),
      existsSync: (...args: unknown[]) => mocks.existsSync(...args),
      mkdirSync: (...args: unknown[]) => mocks.mkdirSync(...args),
    },
  };
});

vi.mock('../../persistence/state-store.js', () => ({ JsonStateStore: mocks.JsonStateStore }));
vi.mock('../health.js', () => ({ HealthChecker: mocks.HealthChecker }));
vi.mock('../../events/event-bus.js', () => ({ EventBus: mocks.EventBus }));
vi.mock('../../events/event-log.js', () => ({ EventLog: mocks.EventLog }));
vi.mock('../../events/event-queue.js', () => ({ EventQueue: mocks.EventQueue }));
vi.mock('../../ipc/ipc-server.js', () => ({ IPCServer: mocks.IPCServer }));
vi.mock('../../ipc/ipc-router.js', () => ({ IPCRouter: mocks.IPCRouter }));
vi.mock('../../workflow/workflow-engine.js', () => ({ WorkflowEngine: mocks.WorkflowEngine }));
vi.mock('../../workflow/index.js', () => ({
  WRFC_LOOP_DEFINITION: { id: 'wrfc_loop', name: 'Write-Review-Fix-Check Loop', version: 1, states: {} },
  FIX_LOOP_DEFINITION: { id: 'fix_loop', name: 'Fix Loop', version: 1, states: {} },
  TEST_THEN_FIX_DEFINITION: { id: 'test_then_fix', name: 'Test-Then-Fix Loop', version: 1, states: {} },
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
}));
vi.mock('../../shared/config.js', () => ({ loadConfig: mocks.loadConfig }));
vi.mock('../../shared/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('../../shared/utils.js', () => ({
  generateEventId: vi.fn().mockReturnValue('evt-id-001'),
  timestamp: vi.fn().mockReturnValue('2026-01-01T00:00:00.000Z'),
  toErrorMessage: vi.fn((err: unknown) => String(err)),
}));
vi.mock('../../shared/constants.js', () => ({ ENGINE_VERSION: '1.0.0-test' }));

// ─── Imports (after mocks) ──────────────────────────────────────────────────────

import { ProcessManager } from '../process-manager.js';
import type { RuntimeConfig } from '../../shared/config.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<RuntimeConfig> = {}): RuntimeConfig {
  return {
    schema_version: '1.0.0',
    ipc: { socket_dir: '/tmp/test-sockets', connect_timeout_ms: 500, query_timeout_ms: 200 },
    queue: { max_size: 1000, max_attempts: 3, backoff_base_ms: 100, backoff_multiplier: 2, process_interval_ms: 10 },
    persistence: { checkpoint_interval_ms: 30000, event_log_max_size_mb: 50, compact_after_hours: 24, state_dir: '.goodvibes/state' },
    workflows: { max_active: 10, max_transitions_per_workflow: 100, wrfc_max_fix_iterations: 3, fix_loop_max_attempts: 5 },
    triggers: { max_triggers: 100, default_cooldown_ms: 5000, max_fires_per_session: 50 },
    health: { check_interval_ms: 60000, memory_warn_mb: 256, memory_critical_mb: 512, queue_depth_warn: 100 },
    features: { ipc_enabled: true, workflows_enabled: true, agents_enabled: true, full_integration: true },
    agents: { max_concurrent: 6, session_budget: 0, budget_thresholds: [50, 80, 95], default_budget: 200000, max_review_iterations: 3 },
    executor: {
      mode: 'engaged',
      daemon: { clear_context_after_batch: false, tmux_session_name: 'goodvibes', tick_command: '/tick' },
      budget: { warning_threshold: 0.8, daily_reset_hour: 0 },
    },
    ...overrides,
  } as RuntimeConfig;
}

const TEST_PROJECT_ROOT = '/tmp/test-project-root';

function getPidFilePath(projectRoot: string): string {
  const hash = createHash('sha256').update(projectRoot).digest('hex').slice(0, 8);
  return join(tmpdir(), `goodvibes-runtime-engine-${hash}-${process.pid}.pid`);
}

function getSocketPointerPath(projectRoot: string, stateDir: string): string {
  return join(projectRoot, stateDir, `runtime-${process.pid}.socket`);
}

/** Re-apply default return values on all mocks after vi.clearAllMocks(). */
function resetMocks(): void {
  mocks.loadConfig.mockReturnValue(makeConfig());
  mocks.existsSync.mockReturnValue(false);
  mocks.stateStoreSet.mockResolvedValue(undefined);
  mocks.stateStoreInitialize.mockResolvedValue(undefined);
  mocks.ipcServerListen.mockResolvedValue(undefined);
  mocks.ipcServerClose.mockResolvedValue(undefined);
  mocks.eventQueueDrain.mockResolvedValue(undefined);
  mocks.eventLogInitialize.mockResolvedValue(undefined);
  mocks.eventLogFlush.mockResolvedValue(undefined);
  mocks.eventLogClose.mockResolvedValue(undefined);
  mocks.eventLogCompact.mockResolvedValue(undefined);
  mocks.workflowEngineListActive.mockReturnValue([]);
  mocks.getBuiltinTriggers.mockReturnValue([
    { id: 'builtin-1', name: 'Builtin 1' },
    { id: 'builtin-2', name: 'Builtin 2' },
  ]);
  mocks.healthCheck.mockReturnValue({ status: 'healthy', memory_usage_mb: 50 });
  mocks.triggerRegistryEvaluate.mockResolvedValue([]);
  mocks.JsonStateStore.mockImplementation(function() {
    return { initialize: mocks.stateStoreInitialize, set: mocks.stateStoreSet };
  });
  mocks.EventBus.mockImplementation(function() {
    return { emit: mocks.eventBusEmit, on: mocks.eventBusOn, off: mocks.eventBusOff, setEventLog: mocks.eventBusSetEventLog, removeAllListeners: mocks.eventBusRemoveAllListeners };
  });
  mocks.EventLog.mockImplementation(function() {
    return { initialize: mocks.eventLogInitialize, flush: mocks.eventLogFlush, close: mocks.eventLogClose, compact: mocks.eventLogCompact };
  });
  mocks.EventQueue.mockImplementation(function() {
    return { start: mocks.eventQueueStart, stop: mocks.eventQueueStop, drain: mocks.eventQueueDrain };
  });
  mocks.IPCServer.mockImplementation(function() {
    return { listen: mocks.ipcServerListen, close: mocks.ipcServerClose, onMessage: mocks.ipcServerOnMessage };
  });
  mocks.IPCRouter.mockImplementation(function() { return { route: mocks.ipcRouterRoute }; });
  mocks.WorkflowEngine.mockImplementation(function() {
    return { setEventBus: mocks.workflowEngineSetEventBus, registerDefinition: mocks.workflowEngineRegisterDefinition, registerGuard: mocks.workflowEngineRegisterGuard, listActive: mocks.workflowEngineListActive, cancel: mocks.workflowEngineCancel, prune: mocks.workflowEnginePrune };
  });
  mocks.TriggerRegistry.mockImplementation(function() {
    return { setDependencies: mocks.triggerRegistrySetDependencies, register: mocks.triggerRegistryRegister, evaluate: mocks.triggerRegistryEvaluate };
  });
  mocks.AgentCoordinator.mockImplementation(function() {
    return { updateConfig: mocks.agentCoordinatorUpdateConfig, prune: mocks.agentCoordinatorPrune };
  });
  mocks.BudgetTracker.mockImplementation(function() { return {}; });
  mocks.DirectiveQueue.mockImplementation(function() {
    return { drain: mocks.directiveQueueDrain, enqueue: mocks.directiveQueueEnqueue, setWRFCConfig: mocks.directiveQueueSetWRFCConfig };
  });
  mocks.AgentWorkflowMap.mockImplementation(function() { return {}; });
  mocks.HealthChecker.mockImplementation(function() {
    return { check: mocks.healthCheck, updateConfig: mocks.healthUpdateConfig };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── PID file path ──────────────────────────────────────────────────────────────

describe('ProcessManager — PID file path', () => {
  it('derives PID file path from SHA-256 hash of project root', async () => {
    const pm = new ProcessManager(makeConfig(), TEST_PROJECT_ROOT);
    await pm.startup();

    const expectedPath = getPidFilePath(TEST_PROJECT_ROOT);
    const writeCall = mocks.writeFileSync.mock.calls.find(
      (call) => typeof call[0] === 'string' && (call[0] as string).includes('goodvibes-runtime-engine-'),
    );
    expect(writeCall).toBeDefined();
    expect(writeCall![0]).toBe(expectedPath);
  });

  it('produces different paths for different project roots', () => {
    const path1 = getPidFilePath('/project/alpha');
    const path2 = getPidFilePath('/project/beta');
    expect(path1).not.toBe(path2);
  });

  it('produces the same path for the same project root (deterministic)', () => {
    const path1 = getPidFilePath(TEST_PROJECT_ROOT);
    const path2 = getPidFilePath(TEST_PROJECT_ROOT);
    expect(path1).toBe(path2);
  });
});

// ─── writePidFile ─────────────────────────────────────────────────────────────

describe('ProcessManager — writePidFile', () => {
  it('writes current process PID to the expected file path during startup', async () => {
    const pm = new ProcessManager(makeConfig(), TEST_PROJECT_ROOT);
    await pm.startup();

    const expectedPath = getPidFilePath(TEST_PROJECT_ROOT);
    expect(mocks.writeFileSync).toHaveBeenCalledWith(
      expectedPath,
      String(process.pid),
      expect.objectContaining({ encoding: 'utf-8' }),
    );
  });

  it('writes with 0o600 permissions (owner-only read/write)', async () => {
    const pm = new ProcessManager(makeConfig(), TEST_PROJECT_ROOT);
    await pm.startup();

    const pidWriteCall = mocks.writeFileSync.mock.calls.find(
      (call) => typeof call[0] === 'string' && (call[0] as string).includes('goodvibes-runtime-engine-'),
    );
    expect(pidWriteCall).toBeDefined();
    expect((pidWriteCall![2] as { mode?: number }).mode).toBe(0o600);
  });

  it('silently ignores write errors — startup still completes', async () => {
    mocks.writeFileSync.mockImplementation((path: string) => {
      if (typeof path === 'string' && path.includes('goodvibes-runtime-engine-')) {
        throw new Error('EACCES: permission denied');
      }
    });

    const pm = new ProcessManager(makeConfig(), TEST_PROJECT_ROOT);
    await expect(pm.startup()).resolves.toBeUndefined();
    expect(pm.isRunning()).toBe(true);
  });
});

// ─── readPidFile / checkCrashRecovery ─────────────────────────────────────────

describe('ProcessManager — readPidFile / checkCrashRecovery', () => {
  it('reads the PID file during startup to check for stale locks', async () => {
    const pidFilePath = getPidFilePath(TEST_PROJECT_ROOT);
    const stalePid = String(process.pid + 9999);
    mocks.existsSync.mockImplementation((p: unknown) => p === pidFilePath);
    mocks.readFileSync.mockReturnValue(stalePid);

    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => {
      const err = Object.assign(new Error('ESRCH'), { code: 'ESRCH' });
      throw err;
    });

    const pm = new ProcessManager(makeConfig(), TEST_PROJECT_ROOT);
    await pm.startup();

    expect(mocks.readFileSync).toHaveBeenCalledWith(pidFilePath, 'utf-8');
    killSpy.mockRestore();
  });

  it('NaN guard: removes stale file when PID content is not a valid number', async () => {
    const pidFilePath = getPidFilePath(TEST_PROJECT_ROOT);
    mocks.existsSync.mockImplementation((p: unknown) => p === pidFilePath);
    mocks.readFileSync.mockReturnValue('not-a-number');

    const pm = new ProcessManager(makeConfig(), TEST_PROJECT_ROOT);
    await pm.startup();

    const unlinkCalls = mocks.unlinkSync.mock.calls.map((c) => c[0]);
    expect(unlinkCalls).toContain(pidFilePath);
  });

  it('NaN guard: startup completes normally after cleaning up invalid PID', async () => {
    const pidFilePath = getPidFilePath(TEST_PROJECT_ROOT);
    mocks.existsSync.mockImplementation((p: unknown) => p === pidFilePath);
    mocks.readFileSync.mockReturnValue('not-a-pid');

    const pm = new ProcessManager(makeConfig(), TEST_PROJECT_ROOT);
    await pm.startup();
    expect(pm.isRunning()).toBe(true);
  });

  it('NaN guard: pid of 0 is treated as invalid and removed', async () => {
    const pidFilePath = getPidFilePath(TEST_PROJECT_ROOT);
    mocks.existsSync.mockImplementation((p: unknown) => p === pidFilePath);
    mocks.readFileSync.mockReturnValue('0');

    const pm = new ProcessManager(makeConfig(), TEST_PROJECT_ROOT);
    await pm.startup();

    const unlinkCalls = mocks.unlinkSync.mock.calls.map((c) => c[0]);
    expect(unlinkCalls).toContain(pidFilePath);
  });

  it('NaN guard: negative PID is treated as invalid and removed', async () => {
    const pidFilePath = getPidFilePath(TEST_PROJECT_ROOT);
    mocks.existsSync.mockImplementation((p: unknown) => p === pidFilePath);
    mocks.readFileSync.mockReturnValue('-1');

    const pm = new ProcessManager(makeConfig(), TEST_PROJECT_ROOT);
    await pm.startup();

    const unlinkCalls = mocks.unlinkSync.mock.calls.map((c) => c[0]);
    expect(unlinkCalls).toContain(pidFilePath);
  });

  it('NaN guard: float PID is treated as invalid and removed', async () => {
    const pidFilePath = getPidFilePath(TEST_PROJECT_ROOT);
    mocks.existsSync.mockImplementation((p: unknown) => p === pidFilePath);
    mocks.readFileSync.mockReturnValue('3.14');

    const pm = new ProcessManager(makeConfig(), TEST_PROJECT_ROOT);
    await pm.startup();

    const unlinkCalls = mocks.unlinkSync.mock.calls.map((c) => c[0]);
    expect(unlinkCalls).toContain(pidFilePath);
  });

  it('no stale file: skips readFileSync when PID file does not exist', async () => {
    mocks.existsSync.mockReturnValue(false);

    const pm = new ProcessManager(makeConfig(), TEST_PROJECT_ROOT);
    await pm.startup();

    const pidFilePath = getPidFilePath(TEST_PROJECT_ROOT);
    const pidReadCall = mocks.readFileSync.mock.calls.find(
      (call) => call[0] === pidFilePath,
    );
    expect(pidReadCall).toBeUndefined();
  });
});

// ─── isAlreadyRunning (stale PID detection via checkCrashRecovery) ─────────────

describe('ProcessManager — isAlreadyRunning (stale PID detection)', () => {
  it('detects a running process when process.kill(pid, 0) succeeds', async () => {
    const pidFilePath = getPidFilePath(TEST_PROJECT_ROOT);
    const stalePid = process.pid + 1000;
    mocks.existsSync.mockImplementation((p: unknown) => p === pidFilePath);
    mocks.readFileSync.mockReturnValue(String(stalePid));

    const killSpy = vi.spyOn(process, 'kill').mockReturnValue(true as unknown as never);

    const pm = new ProcessManager(makeConfig(), TEST_PROJECT_ROOT);
    await pm.startup();

    expect(killSpy).toHaveBeenCalledWith(stalePid, 0);
    // Stale file is removed before writing fresh one
    const unlinkCalls = mocks.unlinkSync.mock.calls.map((c) => c[0]);
    expect(unlinkCalls).toContain(pidFilePath);
    killSpy.mockRestore();
  });

  it('handles stale PID file with ESRCH — process not running, removes stale file', async () => {
    const pidFilePath = getPidFilePath(TEST_PROJECT_ROOT);
    const stalePid = process.pid + 2000;
    mocks.existsSync.mockImplementation((p: unknown) => p === pidFilePath);
    mocks.readFileSync.mockReturnValue(String(stalePid));

    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => {
      const err = Object.assign(new Error('kill ESRCH'), { code: 'ESRCH' });
      throw err;
    });

    const pm = new ProcessManager(makeConfig(), TEST_PROJECT_ROOT);
    await pm.startup();

    expect(pm.isRunning()).toBe(true);
    const unlinkCalls = mocks.unlinkSync.mock.calls.map((c) => c[0]);
    expect(unlinkCalls).toContain(pidFilePath);
    killSpy.mockRestore();
  });

  it('handles alive process stale PID — startup continues after logging warning', async () => {
    const pidFilePath = getPidFilePath(TEST_PROJECT_ROOT);
    const stalePid = process.pid + 3000;
    mocks.existsSync.mockImplementation((p: unknown) => p === pidFilePath);
    mocks.readFileSync.mockReturnValue(String(stalePid));

    const killSpy = vi.spyOn(process, 'kill').mockReturnValue(true as unknown as never);

    const pm = new ProcessManager(makeConfig(), TEST_PROJECT_ROOT);
    await pm.startup();

    expect(pm.isRunning()).toBe(true);
    killSpy.mockRestore();
  });

  it('skips stale file check when PID file contains own process PID', async () => {
    const pidFilePath = getPidFilePath(TEST_PROJECT_ROOT);
    mocks.existsSync.mockImplementation((p: unknown) => p === pidFilePath);
    mocks.readFileSync.mockReturnValue(String(process.pid));

    const killSpy = vi.spyOn(process, 'kill');

    const pm = new ProcessManager(makeConfig(), TEST_PROJECT_ROOT);
    await pm.startup();

    expect(killSpy).not.toHaveBeenCalled();
    expect(pm.isRunning()).toBe(true);
    killSpy.mockRestore();
  });

  it('handles readFileSync error gracefully — startup still completes', async () => {
    const pidFilePath = getPidFilePath(TEST_PROJECT_ROOT);
    mocks.existsSync.mockImplementation((p: unknown) => p === pidFilePath);
    mocks.readFileSync.mockImplementation(() => {
      throw new Error('EACCES: permission denied');
    });

    const pm = new ProcessManager(makeConfig(), TEST_PROJECT_ROOT);
    await expect(pm.startup()).resolves.toBeUndefined();
    expect(pm.isRunning()).toBe(true);
  });
});

// ─── removePidFile ────────────────────────────────────────────────────────────

describe('ProcessManager — removePidFile', () => {
  it('removes the PID file during shutdown', async () => {
    const pm = new ProcessManager(makeConfig(), TEST_PROJECT_ROOT);
    await pm.startup();
    vi.clearAllMocks();
    resetMocks();

    await pm.shutdown();

    const expectedPath = getPidFilePath(TEST_PROJECT_ROOT);
    const unlinkCalls = mocks.unlinkSync.mock.calls.map((c) => c[0]);
    expect(unlinkCalls).toContain(expectedPath);
  });

  it('silently ignores ENOENT when PID file already removed', async () => {
    const pm = new ProcessManager(makeConfig(), TEST_PROJECT_ROOT);
    await pm.startup();
    vi.clearAllMocks();
    resetMocks();

    mocks.unlinkSync.mockImplementation(() => {
      const err = Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT' });
      throw err;
    });

    await expect(pm.shutdown()).resolves.toBeUndefined();
  });

  it('sets running to false after shutdown even when removePidFile encounters non-ENOENT error', async () => {
    const pm = new ProcessManager(makeConfig(), TEST_PROJECT_ROOT);
    await pm.startup();
    vi.clearAllMocks();
    resetMocks();

    mocks.unlinkSync.mockImplementation(() => {
      const err = Object.assign(new Error('EACCES'), { code: 'EACCES' });
      throw err;
    });

    await pm.shutdown();
    expect(pm.isRunning()).toBe(false);
  });
});

// ─── writeSocketPointerFile ───────────────────────────────────────────────────

describe('ProcessManager — writeSocketPointerFile', () => {
  it('writes the socket path to the state dir during IPC server startup', async () => {
    const config = makeConfig();
    const pm = new ProcessManager(config, TEST_PROJECT_ROOT);
    await pm.startup();

    const expectedPointerFile = getSocketPointerPath(TEST_PROJECT_ROOT, config.persistence.state_dir);
    const writeCall = mocks.writeFileSync.mock.calls.find((call) => call[0] === expectedPointerFile);
    expect(writeCall).toBeDefined();
    expect(typeof writeCall![1]).toBe('string');
    expect((writeCall![1] as string)).toMatch(/goodvibes-runtime-/);
  });

  it('socket pointer file is NOT written when IPC is disabled', async () => {
    const config = makeConfig({
      features: { ipc_enabled: false, workflows_enabled: true, agents_enabled: true, full_integration: true },
    });
    mocks.loadConfig.mockReturnValue(config);
    const pm = new ProcessManager(config, TEST_PROJECT_ROOT);
    await pm.startup();

    const expectedPointerFile = getSocketPointerPath(TEST_PROJECT_ROOT, config.persistence.state_dir);
    const writeCall = mocks.writeFileSync.mock.calls.find((call) => call[0] === expectedPointerFile);
    expect(writeCall).toBeUndefined();
  });
});

// ─── removeSocketPointerFile ──────────────────────────────────────────────────

describe('ProcessManager — removeSocketPointerFile', () => {
  it('removes the socket pointer file during shutdown when IPC was started', async () => {
    const config = makeConfig();
    const pm = new ProcessManager(config, TEST_PROJECT_ROOT);
    await pm.startup();
    vi.clearAllMocks();
    resetMocks();

    await pm.shutdown();

    const expectedPointerFile = getSocketPointerPath(TEST_PROJECT_ROOT, config.persistence.state_dir);
    const unlinkCalls = mocks.unlinkSync.mock.calls.map((c) => c[0]);
    expect(unlinkCalls).toContain(expectedPointerFile);
  });

  it('silently ignores ENOENT when socket pointer file already removed', async () => {
    const config = makeConfig();
    const pm = new ProcessManager(config, TEST_PROJECT_ROOT);
    await pm.startup();
    vi.clearAllMocks();
    resetMocks();

    mocks.unlinkSync.mockImplementation(() => {
      const err = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      throw err;
    });

    await expect(pm.shutdown()).resolves.toBeUndefined();
  });

  it('does not call removeSocketPointerFile when IPC was not started', async () => {
    const config = makeConfig({
      features: { ipc_enabled: false, workflows_enabled: true, agents_enabled: true, full_integration: true },
    });
    mocks.loadConfig.mockReturnValue(config);
    const pm = new ProcessManager(config, TEST_PROJECT_ROOT);
    await pm.startup();
    vi.clearAllMocks();
    resetMocks();

    await pm.shutdown();

    const expectedPointerFile = getSocketPointerPath(TEST_PROJECT_ROOT, config.persistence.state_dir);
    const unlinkCalls = mocks.unlinkSync.mock.calls.map((c) => c[0]);
    expect(unlinkCalls).not.toContain(expectedPointerFile);
  });
});

// ─── startup() ────────────────────────────────────────────────────────────────

describe('ProcessManager — startup()', () => {
  it('creates EventBus, EventLog, EventQueue subsystems', async () => {
    const pm = new ProcessManager(makeConfig(), TEST_PROJECT_ROOT);
    await pm.startup();

    expect(mocks.EventBus).toHaveBeenCalledOnce();
    expect(mocks.EventLog).toHaveBeenCalledOnce();
    expect(mocks.EventQueue).toHaveBeenCalledOnce();
  });

  it('initialises state store before using it', async () => {
    const pm = new ProcessManager(makeConfig(), TEST_PROJECT_ROOT);
    await pm.startup();

    expect(mocks.JsonStateStore).toHaveBeenCalledOnce();
    expect(mocks.stateStoreInitialize).toHaveBeenCalledOnce();
  });

  it('initialises event log and wires it to the event bus', async () => {
    const pm = new ProcessManager(makeConfig(), TEST_PROJECT_ROOT);
    await pm.startup();

    expect(mocks.eventLogInitialize).toHaveBeenCalledOnce();
    expect(mocks.eventBusSetEventLog).toHaveBeenCalledOnce();
  });

  it('starts the event queue', async () => {
    const pm = new ProcessManager(makeConfig(), TEST_PROJECT_ROOT);
    await pm.startup();

    expect(mocks.eventQueueStart).toHaveBeenCalledOnce();
  });

  it('creates WorkflowEngine and registers built-in workflow definitions when enabled', async () => {
    const pm = new ProcessManager(makeConfig(), TEST_PROJECT_ROOT);
    await pm.startup();

    expect(mocks.WorkflowEngine).toHaveBeenCalledOnce();
    expect(mocks.workflowEngineSetEventBus).toHaveBeenCalledOnce();
    expect(mocks.workflowEngineRegisterDefinition).toHaveBeenCalledTimes(4);
  });

  it('registers the checkReviewScore guard on the workflow engine', async () => {
    const pm = new ProcessManager(makeConfig(), TEST_PROJECT_ROOT);
    await pm.startup();

    expect(mocks.workflowEngineRegisterGuard).toHaveBeenCalledWith(
      'checkReviewScore',
      expect.any(Function),
    );
  });

  it('checkReviewScore guard returns true when review_score >= min_review_score (default 9.5)', async () => {
    let guardFn: ((ctx: Record<string, unknown>) => boolean) | undefined;
    mocks.workflowEngineRegisterGuard.mockImplementation(
      (_name: string, fn: (ctx: Record<string, unknown>) => boolean) => {
        guardFn = fn;
      },
    );

    const pm = new ProcessManager(makeConfig(), TEST_PROJECT_ROOT);
    await pm.startup();

    expect(guardFn).toBeDefined();
    expect(guardFn!({ review_score: 9.5 })).toBe(true);
    expect(guardFn!({ review_score: 10 })).toBe(true);
    expect(guardFn!({ review_score: 9.4 })).toBe(false);
  });

  it('checkReviewScore guard uses custom min_review_score from context', async () => {
    let guardFn: ((ctx: Record<string, unknown>) => boolean) | undefined;
    mocks.workflowEngineRegisterGuard.mockImplementation(
      (_name: string, fn: (ctx: Record<string, unknown>) => boolean) => {
        guardFn = fn;
      },
    );

    const pm = new ProcessManager(makeConfig(), TEST_PROJECT_ROOT);
    await pm.startup();

    expect(guardFn!({ review_score: 8, min_review_score: 7.5 })).toBe(true);
    expect(guardFn!({ review_score: 7, min_review_score: 7.5 })).toBe(false);
  });

  it('creates TriggerRegistry and calls setDependencies', async () => {
    const pm = new ProcessManager(makeConfig(), TEST_PROJECT_ROOT);
    await pm.startup();

    expect(mocks.TriggerRegistry).toHaveBeenCalledOnce();
    expect(mocks.triggerRegistrySetDependencies).toHaveBeenCalledOnce();
  });

  it('registers all built-in triggers', async () => {
    const pm = new ProcessManager(makeConfig(), TEST_PROJECT_ROOT);
    await pm.startup();

    expect(mocks.getBuiltinTriggers).toHaveBeenCalledOnce();
    expect(mocks.triggerRegistryRegister).toHaveBeenCalledTimes(2);
  });

  it('registers wildcard event bus listener for trigger evaluation', async () => {
    const pm = new ProcessManager(makeConfig(), TEST_PROJECT_ROOT);
    await pm.startup();

    const wildcardCall = mocks.eventBusOn.mock.calls.find((call) => call[0] === '*');
    expect(wildcardCall).toBeDefined();
    expect(typeof wildcardCall![1]).toBe('function');
  });

  it('wildcard listener skips hook events to avoid double-evaluation', async () => {
    let wildcardHandler: ((event: Record<string, unknown>) => Promise<void>) | undefined;
    mocks.eventBusOn.mockImplementation((pattern: string, fn: (e: Record<string, unknown>) => Promise<void>) => {
      if (pattern === '*') wildcardHandler = fn;
    });

    const pm = new ProcessManager(makeConfig(), TEST_PROJECT_ROOT);
    await pm.startup();

    expect(wildcardHandler).toBeDefined();

    const hookEvent = {
      id: 'ev-001',
      type: 'hook:session_start',
      source: { kind: 'hook', hook_name: 'session_start' },
      payload: {},
      timestamp: '2026-01-01T00:00:00.000Z',
    };

    // After startup is done, triggerRegistryEvaluate calls should be from the wildcard listener only
    vi.clearAllMocks();
    resetMocks();
    await wildcardHandler!(hookEvent);

    expect(mocks.triggerRegistryEvaluate).not.toHaveBeenCalled();
  });

  it('wildcard listener evaluates non-hook events against trigger registry', async () => {
    let wildcardHandler: ((event: Record<string, unknown>) => Promise<void>) | undefined;
    mocks.eventBusOn.mockImplementation((pattern: string, fn: (e: Record<string, unknown>) => Promise<void>) => {
      if (pattern === '*') wildcardHandler = fn;
    });

    const pm = new ProcessManager(makeConfig(), TEST_PROJECT_ROOT);
    await pm.startup();

    // Get the TriggerRegistry instance that was created during startup
    const registryInstance = mocks.TriggerRegistry.mock.results[0]?.value as {
      evaluate: ReturnType<typeof vi.fn>;
    };

    const systemEvent = {
      id: 'ev-002',
      type: 'system:startup',
      source: { kind: 'system' },
      payload: {},
      timestamp: '2026-01-01T00:00:00.000Z',
    };

    if (registryInstance) {
      registryInstance.evaluate = vi.fn().mockResolvedValue([]);
      await wildcardHandler!(systemEvent);
      expect(registryInstance.evaluate).toHaveBeenCalledWith(systemEvent);
    } else {
      // Fallback: check via mock call count
      vi.clearAllMocks();
      resetMocks();
      await wildcardHandler!(systemEvent);
      expect(mocks.triggerRegistryEvaluate).toHaveBeenCalled();
    }
  });

  it('creates AgentCoordinator and BudgetTracker when agents are enabled', async () => {
    const pm = new ProcessManager(makeConfig(), TEST_PROJECT_ROOT);
    await pm.startup();

    expect(mocks.BudgetTracker).toHaveBeenCalledOnce();
    expect(mocks.AgentCoordinator).toHaveBeenCalledOnce();
  });

  it('does NOT create AgentCoordinator when agents are disabled', async () => {
    const config = makeConfig({
      features: { ipc_enabled: true, workflows_enabled: true, agents_enabled: false, full_integration: false },
    });
    mocks.loadConfig.mockReturnValue(config);
    const pm = new ProcessManager(config, TEST_PROJECT_ROOT);
    await pm.startup();

    expect(mocks.AgentCoordinator).not.toHaveBeenCalled();
    expect(pm.getAgentCoordinator()).toBeNull();
  });

  it('registers WRFC handlers after subsystem init', async () => {
    const pm = new ProcessManager(makeConfig(), TEST_PROJECT_ROOT);
    await pm.startup();

    expect(mocks.registerWRFCHandlers).toHaveBeenCalledOnce();
    expect(mocks.registerWRFCHandlers).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      expect.any(Object),
      expect.any(Object),
      expect.any(Object),
    );
  });

  it('starts IPC server and calls listen() when ipc_enabled', async () => {
    const pm = new ProcessManager(makeConfig(), TEST_PROJECT_ROOT);
    await pm.startup();

    expect(mocks.IPCServer).toHaveBeenCalledOnce();
    expect(mocks.ipcServerListen).toHaveBeenCalledOnce();
  });

  it('does NOT start IPC server when ipc_enabled is false', async () => {
    const config = makeConfig({
      features: { ipc_enabled: false, workflows_enabled: true, agents_enabled: true, full_integration: false },
    });
    mocks.loadConfig.mockReturnValue(config);
    const pm = new ProcessManager(config, TEST_PROJECT_ROOT);
    await pm.startup();

    expect(mocks.IPCServer).not.toHaveBeenCalled();
    expect(pm.getIPCServer()).toBeNull();
  });

  it('emits system:startup event after all subsystems are initialised', async () => {
    const pm = new ProcessManager(makeConfig(), TEST_PROJECT_ROOT);
    await pm.startup();

    const startupEmitCall = mocks.eventBusEmit.mock.calls.find(
      (call) => call[0]?.type === 'system:startup',
    );
    expect(startupEmitCall).toBeDefined();
    expect(startupEmitCall![0].payload.data.pid).toBe(process.pid);
  });

  it('sets running = true after successful startup', async () => {
    const pm = new ProcessManager(makeConfig(), TEST_PROJECT_ROOT);
    expect(pm.isRunning()).toBe(false);
    await pm.startup();
    expect(pm.isRunning()).toBe(true);
  });

  it('does not create WorkflowEngine when workflows are disabled', async () => {
    const config = makeConfig({
      features: { ipc_enabled: true, workflows_enabled: false, agents_enabled: true, full_integration: false },
    });
    mocks.loadConfig.mockReturnValue(config);
    const pm = new ProcessManager(config, TEST_PROJECT_ROOT);
    await pm.startup();

    expect(mocks.WorkflowEngine).not.toHaveBeenCalled();
    expect(pm.getWorkflowEngine()).toBeNull();
  });

  it('startup completes when IPC server listen() fails — ipcServer is set to null', async () => {
    mocks.ipcServerListen.mockRejectedValueOnce(new Error('EADDRINUSE'));

    const pm = new ProcessManager(makeConfig(), TEST_PROJECT_ROOT);
    await expect(pm.startup()).resolves.toBeUndefined();
    expect(pm.isRunning()).toBe(true);
    expect(pm.getIPCServer()).toBeNull();
  });

  it('accessors throw before startup completes', () => {
    const pm = new ProcessManager(makeConfig(), TEST_PROJECT_ROOT);
    expect(() => pm.getStateStore()).toThrow('called before startup()');
    expect(() => pm.getEventBus()).toThrow('called before startup()');
    expect(() => pm.getEventLog()).toThrow('called before startup()');
    expect(() => pm.getEventQueue()).toThrow('called before startup()');
  });

  it('getUptime() returns a non-negative number after startup', async () => {
    const pm = new ProcessManager(makeConfig(), TEST_PROJECT_ROOT);
    await pm.startup();
    expect(pm.getUptime()).toBeGreaterThanOrEqual(0);
  });
});

// ─── shutdown() ───────────────────────────────────────────────────────────────

describe('ProcessManager — shutdown()', () => {
  it('cancels active workflows during shutdown', async () => {
    const pm = new ProcessManager(makeConfig(), TEST_PROJECT_ROOT);
    await pm.startup();
    vi.clearAllMocks();
    resetMocks();
    mocks.workflowEngineListActive.mockReturnValue([
      { id: 'wf-001', state: 'running' },
      { id: 'wf-002', state: 'running' },
    ]);

    await pm.shutdown();

    expect(mocks.workflowEngineCancel).toHaveBeenCalledTimes(2);
    expect(mocks.workflowEngineCancel).toHaveBeenCalledWith('wf-001', 'engine shutdown');
    expect(mocks.workflowEngineCancel).toHaveBeenCalledWith('wf-002', 'engine shutdown');
  });

  it('emits system:shutdown event', async () => {
    const pm = new ProcessManager(makeConfig(), TEST_PROJECT_ROOT);
    await pm.startup();
    vi.clearAllMocks();
    resetMocks();

    await pm.shutdown();

    const shutdownEmitCall = mocks.eventBusEmit.mock.calls.find(
      (call) => call[0]?.type === 'system:shutdown',
    );
    expect(shutdownEmitCall).toBeDefined();
  });

  it('closes IPC server during shutdown when it was started', async () => {
    const pm = new ProcessManager(makeConfig(), TEST_PROJECT_ROOT);
    await pm.startup();
    vi.clearAllMocks();
    resetMocks();

    await pm.shutdown();

    expect(mocks.ipcServerClose).toHaveBeenCalledOnce();
  });

  it('drains the event queue during shutdown', async () => {
    const pm = new ProcessManager(makeConfig(), TEST_PROJECT_ROOT);
    await pm.startup();
    vi.clearAllMocks();
    resetMocks();

    await pm.shutdown();

    expect(mocks.eventQueueDrain).toHaveBeenCalledWith(5_000);
    expect(mocks.eventQueueStop).toHaveBeenCalledOnce();
  });

  it('removes all event bus listeners during shutdown', async () => {
    const pm = new ProcessManager(makeConfig(), TEST_PROJECT_ROOT);
    await pm.startup();
    vi.clearAllMocks();
    resetMocks();

    await pm.shutdown();

    expect(mocks.eventBusRemoveAllListeners).toHaveBeenCalledOnce();
  });

  it('flushes and closes the event log during shutdown', async () => {
    const pm = new ProcessManager(makeConfig(), TEST_PROJECT_ROOT);
    await pm.startup();
    vi.clearAllMocks();
    resetMocks();

    await pm.shutdown();

    expect(mocks.eventLogFlush).toHaveBeenCalledOnce();
    expect(mocks.eventLogClose).toHaveBeenCalledOnce();
  });

  it('saves a final checkpoint during shutdown', async () => {
    const pm = new ProcessManager(makeConfig(), TEST_PROJECT_ROOT);
    await pm.startup();
    vi.clearAllMocks();
    resetMocks();

    await pm.shutdown();

    expect(mocks.stateStoreSet).toHaveBeenCalledWith(
      'runtime.checkpoint',
      expect.objectContaining({ pid: process.pid }),
    );
  });

  it('sets running = false after shutdown', async () => {
    const pm = new ProcessManager(makeConfig(), TEST_PROJECT_ROOT);
    await pm.startup();
    expect(pm.isRunning()).toBe(true);

    vi.clearAllMocks();
    resetMocks();
    await pm.shutdown();
    expect(pm.isRunning()).toBe(false);
  });

  it('continues shutdown even when workflow cancel throws', async () => {
    const pm = new ProcessManager(makeConfig(), TEST_PROJECT_ROOT);
    await pm.startup();
    vi.clearAllMocks();
    resetMocks();
    mocks.workflowEngineListActive.mockReturnValue([{ id: 'wf-bad', state: 'running' }]);
    mocks.workflowEngineCancel.mockImplementationOnce(() => {
      throw new Error('cancel failed');
    });

    await expect(pm.shutdown()).resolves.toBeUndefined();
    expect(pm.isRunning()).toBe(false);
  });

  it('continues shutdown even when IPC server close throws', async () => {
    const pm = new ProcessManager(makeConfig(), TEST_PROJECT_ROOT);
    await pm.startup();
    vi.clearAllMocks();
    resetMocks();
    mocks.ipcServerClose.mockRejectedValueOnce(new Error('close failed'));

    await expect(pm.shutdown()).resolves.toBeUndefined();
    expect(pm.isRunning()).toBe(false);
  });

  it('continues shutdown even when event queue drain throws', async () => {
    const pm = new ProcessManager(makeConfig(), TEST_PROJECT_ROOT);
    await pm.startup();
    vi.clearAllMocks();
    resetMocks();
    mocks.eventQueueDrain.mockRejectedValueOnce(new Error('drain timeout'));

    await expect(pm.shutdown()).resolves.toBeUndefined();
    expect(pm.isRunning()).toBe(false);
  });

  it('continues shutdown even when event log flush throws', async () => {
    const pm = new ProcessManager(makeConfig(), TEST_PROJECT_ROOT);
    await pm.startup();
    vi.clearAllMocks();
    resetMocks();
    mocks.eventLogFlush.mockRejectedValueOnce(new Error('flush failed'));

    await expect(pm.shutdown()).resolves.toBeUndefined();
    expect(pm.isRunning()).toBe(false);
  });

  it('continues shutdown even when event log close throws', async () => {
    const pm = new ProcessManager(makeConfig(), TEST_PROJECT_ROOT);
    await pm.startup();
    vi.clearAllMocks();
    resetMocks();
    mocks.eventLogClose.mockRejectedValueOnce(new Error('close failed'));

    await expect(pm.shutdown()).resolves.toBeUndefined();
    expect(pm.isRunning()).toBe(false);
  });
});

// ─── IPC handler wiring ───────────────────────────────────────────────────────

describe('ProcessManager — IPC handler wiring', () => {
  it('creates an IPCRouter with all subsystem dependencies injected', async () => {
    const pm = new ProcessManager(makeConfig(), TEST_PROJECT_ROOT);
    await pm.startup();

    expect(mocks.IPCRouter).toHaveBeenCalledOnce();
    const routerArgs = mocks.IPCRouter.mock.calls[0][0];
    expect(routerArgs).toMatchObject({
      eventBus: expect.any(Object),
      triggerRegistry: expect.any(Object),
      workflowEngine: expect.any(Object),
      agentCoordinator: expect.any(Object),
      directiveQueue: expect.any(Object),
    });
  });

  it('registers router.route as the IPC server message handler', async () => {
    const pm = new ProcessManager(makeConfig(), TEST_PROJECT_ROOT);
    await pm.startup();

    expect(mocks.ipcServerOnMessage).toHaveBeenCalledOnce();
    const handler = mocks.ipcServerOnMessage.mock.calls[0][0];
    expect(typeof handler).toBe('function');
  });

  it('passes null workflowEngine to IPCRouter when workflows are disabled', async () => {
    const config = makeConfig({
      features: { ipc_enabled: true, workflows_enabled: false, agents_enabled: true, full_integration: false },
    });
    mocks.loadConfig.mockReturnValue(config);
    const pm = new ProcessManager(config, TEST_PROJECT_ROOT);
    await pm.startup();

    const routerArgs = mocks.IPCRouter.mock.calls[0][0];
    expect(routerArgs.workflowEngine).toBeNull();
  });

  it('passes null agentCoordinator to IPCRouter when agents are disabled', async () => {
    const config = makeConfig({
      features: { ipc_enabled: true, workflows_enabled: true, agents_enabled: false, full_integration: false },
    });
    mocks.loadConfig.mockReturnValue(config);
    const pm = new ProcessManager(config, TEST_PROJECT_ROOT);
    await pm.startup();

    const routerArgs = mocks.IPCRouter.mock.calls[0][0];
    expect(routerArgs.agentCoordinator).toBeNull();
  });

  it('creates socket path in the configured socket_dir with hash suffix', async () => {
    const pm = new ProcessManager(makeConfig(), TEST_PROJECT_ROOT);
    await pm.startup();

    const socketPath = mocks.IPCServer.mock.calls[0][0] as string;
    expect(socketPath).toMatch(/\/tmp\/test-sockets\/goodvibes-runtime-[a-f0-9]{8}-\d+\.sock/);
  });

  it('socket path hash matches hash of project root', async () => {
    const pm = new ProcessManager(makeConfig(), TEST_PROJECT_ROOT);
    await pm.startup();

    const expectedHash = createHash('sha256').update(TEST_PROJECT_ROOT).digest('hex').slice(0, 8);
    const socketPath = mocks.IPCServer.mock.calls[0][0] as string;
    expect(socketPath).toContain(expectedHash);
  });
});

// ─── Accessors ────────────────────────────────────────────────────────────────

describe('ProcessManager — accessors', () => {
  it('getConfig() returns the current RuntimeConfig', async () => {
    const config = makeConfig();
    const pm = new ProcessManager(config, TEST_PROJECT_ROOT);
    await pm.startup();
    const result = pm.getConfig();
    expect(result).toMatchObject({ schema_version: '1.0.0' });
  });

  it('getProjectRoot() returns the project root path', () => {
    const pm = new ProcessManager(makeConfig(), TEST_PROJECT_ROOT);
    expect(pm.getProjectRoot()).toBe(TEST_PROJECT_ROOT);
  });

  it('getHealthChecker() returns the HealthChecker instance', async () => {
    const pm = new ProcessManager(makeConfig(), TEST_PROJECT_ROOT);
    await pm.startup();
    expect(pm.getHealthChecker()).toBeDefined();
  });

  it('getTriggerRegistry() returns the TriggerRegistry after startup', async () => {
    const pm = new ProcessManager(makeConfig(), TEST_PROJECT_ROOT);
    await pm.startup();
    expect(pm.getTriggerRegistry()).not.toBeNull();
  });

  it('getWorkflowEngine() returns the WorkflowEngine when enabled', async () => {
    const pm = new ProcessManager(makeConfig(), TEST_PROJECT_ROOT);
    await pm.startup();
    expect(pm.getWorkflowEngine()).not.toBeNull();
  });

  it('getIPCServer() returns the IPCServer when IPC is enabled', async () => {
    const pm = new ProcessManager(makeConfig(), TEST_PROJECT_ROOT);
    await pm.startup();
    expect(pm.getIPCServer()).not.toBeNull();
  });

  it('updateConfig() updates config and notifies healthChecker and agentCoordinator', async () => {
    const pm = new ProcessManager(makeConfig(), TEST_PROJECT_ROOT);
    await pm.startup();

    const newConfig = makeConfig({ schema_version: '2.0.0' });
    pm.updateConfig(newConfig);

    expect(pm.getConfig().schema_version).toBe('2.0.0');
    expect(mocks.healthUpdateConfig).toHaveBeenCalledWith(newConfig);
    expect(mocks.agentCoordinatorUpdateConfig).toHaveBeenCalledWith(newConfig.agents);
  });

  it('updateConfig() does not call agentCoordinator.updateConfig when agents are disabled', async () => {
    const config = makeConfig({
      features: { ipc_enabled: true, workflows_enabled: true, agents_enabled: false, full_integration: false },
    });
    mocks.loadConfig.mockReturnValue(config);
    const pm = new ProcessManager(config, TEST_PROJECT_ROOT);
    await pm.startup();
    vi.clearAllMocks();

    pm.updateConfig(makeConfig());
    expect(mocks.agentCoordinatorUpdateConfig).not.toHaveBeenCalled();
  });

  it('getStateStore() returns the state store after startup', async () => {
    const pm = new ProcessManager(makeConfig(), TEST_PROJECT_ROOT);
    await pm.startup();
    expect(pm.getStateStore()).toBeDefined();
  });

  it('getEventBus() returns the event bus after startup', async () => {
    const pm = new ProcessManager(makeConfig(), TEST_PROJECT_ROOT);
    await pm.startup();
    expect(pm.getEventBus()).toBeDefined();
  });

  it('getEventLog() returns the event log after startup', async () => {
    const pm = new ProcessManager(makeConfig(), TEST_PROJECT_ROOT);
    await pm.startup();
    expect(pm.getEventLog()).toBeDefined();
  });

  it('getEventQueue() returns the event queue after startup', async () => {
    const pm = new ProcessManager(makeConfig(), TEST_PROJECT_ROOT);
    await pm.startup();
    expect(pm.getEventQueue()).toBeDefined();
  });

  it('getDirectiveQueue() returns null before startup', () => {
    const pm = new ProcessManager(makeConfig(), TEST_PROJECT_ROOT);
    expect(pm.getDirectiveQueue()).toBeNull();
  });

  it('getDirectiveQueue() returns the DirectiveQueue instance after startup', async () => {
    const pm = new ProcessManager(makeConfig(), TEST_PROJECT_ROOT);
    await pm.startup();
    expect(pm.getDirectiveQueue()).not.toBeNull();
  });

  it('getExecutorMode() returns the ExecutorModeManager after startup', async () => {
    const pm = new ProcessManager(makeConfig(), TEST_PROJECT_ROOT);
    await pm.startup();
    expect(pm.getExecutorMode()).not.toBeNull();
  });

  it('getExecutorMode() returns null before startup', () => {
    const pm = new ProcessManager(makeConfig(), TEST_PROJECT_ROOT);
    expect(pm.getExecutorMode()).toBeNull();
  });

  it('getExecutorBudget() returns the ExecutorBudgetManager after startup', async () => {
    const pm = new ProcessManager(makeConfig(), TEST_PROJECT_ROOT);
    await pm.startup();
    expect(pm.getExecutorBudget()).not.toBeNull();
  });

  it('getExecutorBudget() returns null before startup', () => {
    const pm = new ProcessManager(makeConfig(), TEST_PROJECT_ROOT);
    expect(pm.getExecutorBudget()).toBeNull();
  });

  it('getDaemonTickHandler() returns the DaemonTickHandler after startup', async () => {
    const pm = new ProcessManager(makeConfig(), TEST_PROJECT_ROOT);
    await pm.startup();
    expect(pm.getDaemonTickHandler()).not.toBeNull();
  });

  it('getDaemonTickHandler() returns null before startup', () => {
    const pm = new ProcessManager(makeConfig(), TEST_PROJECT_ROOT);
    expect(pm.getDaemonTickHandler()).toBeNull();
  });

  it('executor mode defaults to engaged after startup', async () => {
    // Explicitly set GOODVIBES_EXECUTOR_MODE and clear TMUX to prevent
    // environment-based daemon inference in CI and TMUX developer sessions.
    const prevMode = process.env['GOODVIBES_EXECUTOR_MODE'];
    const prevTmux = process.env['TMUX'];
    process.env['GOODVIBES_EXECUTOR_MODE'] = 'engaged';
    delete process.env['TMUX'];
    try {
      const pm = new ProcessManager(makeConfig(), TEST_PROJECT_ROOT);
      await pm.startup();
      const executorMode = pm.getExecutorMode();
      expect(executorMode).not.toBeNull();
      expect(executorMode!.getMode()).toBe('engaged');
    } finally {
      if (prevMode === undefined) {
        delete process.env['GOODVIBES_EXECUTOR_MODE'];
      } else {
        process.env['GOODVIBES_EXECUTOR_MODE'] = prevMode;
      }
      if (prevTmux === undefined) {
        delete process.env['TMUX'];
      } else {
        process.env['TMUX'] = prevTmux;
      }
    }
  });
});
