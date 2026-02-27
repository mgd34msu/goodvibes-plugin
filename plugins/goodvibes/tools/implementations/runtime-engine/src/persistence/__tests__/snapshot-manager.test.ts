/**
 * snapshot-manager.test.ts
 *
 * Tests for SnapshotManager — point-in-time snapshot capture, storage,
 * restoration, and periodic snapshot scheduling.
 *
 * Strategy:
 * - StateStore is mocked via a hand-rolled mock object (it's an interface, not a module).
 * - Timer from ../core/timer.js is mocked via vi.mock().
 * - Logger is mocked via vi.mock() with vi.hoisted() variables.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mock variables ──────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  const loggerInfo = vi.fn();
  const loggerDebug = vi.fn();
  const loggerWarn = vi.fn();
  const loggerError = vi.fn();
  const createLogger = vi.fn().mockReturnValue({
    info: loggerInfo,
    debug: loggerDebug,
    warn: loggerWarn,
    error: loggerError,
  });

  const timerStart = vi.fn();
  const timerStop = vi.fn();
  const TimerCtor = vi.fn().mockImplementation(function () {
    return { start: timerStart, stop: timerStop };
  });

  return { loggerInfo, loggerDebug, loggerWarn, loggerError, createLogger, timerStart, timerStop, TimerCtor };
});

vi.mock('../../shared/logger.js', () => ({ createLogger: mocks.createLogger }));
vi.mock('../../core/timer.js', () => ({ Timer: mocks.TimerCtor }));
vi.mock('../../shared/utils.js', () => ({ toErrorMessage: (e: unknown) => String(e) }));

// ─── Subject under test ──────────────────────────────────────────────────────

import { SnapshotManager } from '../snapshot-manager.js';
import type { RuntimeSnapshot, SnapshotDeps } from '../snapshot-manager.js';
import type { StateStore } from '../types.js';

// ─── Test helpers ────────────────────────────────────────────────────────────

function makeStateStore(overrides: Partial<StateStore> = {}): StateStore {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(null),
    delete: vi.fn().mockResolvedValue(undefined),
    keys: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeDeps(overrides: Partial<SnapshotDeps> = {}): SnapshotDeps {
  return {
    workflowEngine: null,
    triggerRegistry: null,
    agentCoordinator: null,
    agentWorkflowMap: null,
    ...overrides,
  };
}

function makeValidSnapshot(overrides: Partial<RuntimeSnapshot> = {}): RuntimeSnapshot {
  return {
    version: 1,
    timestamp: new Date().toISOString(),
    lastEventSequence: 5,
    workflows: [],
    agentWorkflowBindings: {},
    triggerState: [],
    ...overrides,
  };
}

// ─── takeSnapshot ────────────────────────────────────────────────────────────

describe('SnapshotManager.takeSnapshot', () => {
  let stateStore: StateStore;
  let manager: SnapshotManager;

  beforeEach(() => {
    vi.clearAllMocks();
    stateStore = makeStateStore();
    manager = new SnapshotManager(stateStore);
  });

  it('calls stateStore.set with a snapshot keyed by runtime_snapshot', async () => {
    await manager.takeSnapshot(makeDeps(), 10);

    expect(stateStore.set).toHaveBeenCalledOnce();
    const [key] = (stateStore.set as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(key).toBe('runtime_snapshot');
  });

  it('stores snapshot with version=1 and the given event sequence', async () => {
    await manager.takeSnapshot(makeDeps(), 42);

    const [, snapshot] = (stateStore.set as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(snapshot).toMatchObject({
      version: 1,
      lastEventSequence: 42,
    });
  });

  it('snapshot has a valid ISO-8601 timestamp', async () => {
    await manager.takeSnapshot(makeDeps(), 0);

    const [, snapshot] = (stateStore.set as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(() => new Date(snapshot.timestamp)).not.toThrow();
    expect(new Date(snapshot.timestamp).toISOString()).toBe(snapshot.timestamp);
  });

  it('snapshot contains empty workflows when workflowEngine is null', async () => {
    await manager.takeSnapshot(makeDeps({ workflowEngine: null }), 0);

    const [, snapshot] = (stateStore.set as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(snapshot.workflows).toEqual([]);
  });

  it('snapshot contains workflows from workflowEngine.getAllInstances()', async () => {
    const instances = [{ id: 'wf-1' }, { id: 'wf-2' }];
    const workflowEngine = { getAllInstances: vi.fn().mockReturnValue(instances) };
    await manager.takeSnapshot(makeDeps({ workflowEngine: workflowEngine as any }), 0);

    const [, snapshot] = (stateStore.set as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(snapshot.workflows).toEqual(instances);
  });

  it('snapshot contains empty bindings when agentWorkflowMap is null', async () => {
    await manager.takeSnapshot(makeDeps({ agentWorkflowMap: null }), 0);

    const [, snapshot] = (stateStore.set as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(snapshot.agentWorkflowBindings).toEqual({});
  });

  it('snapshot contains bindings from agentWorkflowMap.snapshot()', async () => {
    const bindings = { 'agent-1': 'wf-1', 'agent-2': 'wf-2' };
    const agentWorkflowMap = { snapshot: vi.fn().mockReturnValue(bindings) };
    await manager.takeSnapshot(makeDeps({ agentWorkflowMap: agentWorkflowMap as any }), 0);

    const [, snapshot] = (stateStore.set as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(snapshot.agentWorkflowBindings).toEqual(bindings);
  });

  it('snapshot contains empty triggerState when triggerRegistry is null', async () => {
    await manager.takeSnapshot(makeDeps({ triggerRegistry: null }), 0);

    const [, snapshot] = (stateStore.set as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(snapshot.triggerState).toEqual([]);
  });

  it('snapshot contains trigger states from triggerRegistry.getTriggerStates()', async () => {
    const states = [{ triggerId: 't-1', firesCount: 3 }];
    const triggerRegistry = { getTriggerStates: vi.fn().mockReturnValue(states) };
    await manager.takeSnapshot(makeDeps({ triggerRegistry: triggerRegistry as any }), 0);

    const [, snapshot] = (stateStore.set as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(snapshot.triggerState).toEqual(states);
  });

  it('logs info after successfully saving snapshot', async () => {
    await manager.takeSnapshot(makeDeps(), 7);
    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      'Runtime snapshot saved',
      expect.objectContaining({ lastEventSequence: 7 }),
    );
  });

  it('throws and logs error when stateStore.set rejects', async () => {
    const storeError = new Error('disk full');
    stateStore = makeStateStore({ set: vi.fn().mockRejectedValue(storeError) });
    manager = new SnapshotManager(stateStore);

    await expect(manager.takeSnapshot(makeDeps(), 0)).rejects.toThrow(storeError);
    expect(mocks.loggerError).toHaveBeenCalledWith(
      'Failed to take runtime snapshot',
      expect.objectContaining({ error: expect.any(String) }),
    );
  });

  it('returns empty workflows when workflowEngine.getAllInstances() throws', async () => {
    const workflowEngine = { getAllInstances: vi.fn().mockImplementation(() => { throw new Error('engine failure'); }) };
    await manager.takeSnapshot(makeDeps({ workflowEngine: workflowEngine as any }), 0);

    const [, snapshot] = (stateStore.set as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(snapshot.workflows).toEqual([]);
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      'Failed to capture workflow state',
      expect.any(Object),
    );
  });

  it('returns empty bindings when agentWorkflowMap.snapshot() throws', async () => {
    const agentWorkflowMap = { snapshot: vi.fn().mockImplementation(() => { throw new Error('map failure'); }) };
    await manager.takeSnapshot(makeDeps({ agentWorkflowMap: agentWorkflowMap as any }), 0);

    const [, snapshot] = (stateStore.set as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(snapshot.agentWorkflowBindings).toEqual({});
  });

  it('returns empty triggerState when triggerRegistry.getTriggerStates() throws', async () => {
    const triggerRegistry = { getTriggerStates: vi.fn().mockImplementation(() => { throw new Error('registry failure'); }) };
    await manager.takeSnapshot(makeDeps({ triggerRegistry: triggerRegistry as any }), 0);

    const [, snapshot] = (stateStore.set as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(snapshot.triggerState).toEqual([]);
  });
});

// ─── loadSnapshot ────────────────────────────────────────────────────────────

describe('SnapshotManager.loadSnapshot', () => {
  let stateStore: StateStore;
  let manager: SnapshotManager;

  beforeEach(() => {
    vi.clearAllMocks();
    stateStore = makeStateStore();
    manager = new SnapshotManager(stateStore);
  });

  it('returns null when stateStore.get returns null (no snapshot exists)', async () => {
    stateStore = makeStateStore({ get: vi.fn().mockResolvedValue(null) });
    manager = new SnapshotManager(stateStore);

    const result = await manager.loadSnapshot();
    expect(result).toBeNull();
    expect(mocks.loggerDebug).toHaveBeenCalledWith('No snapshot found in state store');
  });

  it('returns null and warns when snapshot version does not match', async () => {
    const staleSnapshot = makeValidSnapshot({ version: 99 });
    stateStore = makeStateStore({ get: vi.fn().mockResolvedValue(staleSnapshot) });
    manager = new SnapshotManager(stateStore);

    const result = await manager.loadSnapshot();
    expect(result).toBeNull();
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      'Snapshot version mismatch — discarding',
      expect.objectContaining({ stored: 99, expected: 1 }),
    );
  });

  it('returns null and warns when snapshot fails structural validation — missing lastEventSequence', async () => {
    const corrupt = { version: 1, timestamp: new Date().toISOString(), workflows: [], agentWorkflowBindings: {}, triggerState: [] };
    stateStore = makeStateStore({ get: vi.fn().mockResolvedValue(corrupt) });
    manager = new SnapshotManager(stateStore);

    const result = await manager.loadSnapshot();
    expect(result).toBeNull();
    expect(mocks.loggerWarn).toHaveBeenCalledWith('Snapshot failed structural validation — discarding');
  });

  it('returns null and warns when snapshot workflows is not an array', async () => {
    const corrupt = { version: 1, timestamp: '', lastEventSequence: 0, workflows: 'bad', agentWorkflowBindings: {}, triggerState: [] };
    stateStore = makeStateStore({ get: vi.fn().mockResolvedValue(corrupt) });
    manager = new SnapshotManager(stateStore);

    const result = await manager.loadSnapshot();
    expect(result).toBeNull();
  });

  it('returns null and warns when agentWorkflowBindings is null', async () => {
    const corrupt = { version: 1, timestamp: '', lastEventSequence: 0, workflows: [], agentWorkflowBindings: null, triggerState: [] };
    stateStore = makeStateStore({ get: vi.fn().mockResolvedValue(corrupt) });
    manager = new SnapshotManager(stateStore);

    const result = await manager.loadSnapshot();
    expect(result).toBeNull();
  });

  it('returns null and warns when triggerState is not an array', async () => {
    const corrupt = { version: 1, timestamp: '', lastEventSequence: 0, workflows: [], agentWorkflowBindings: {}, triggerState: 'bad' };
    stateStore = makeStateStore({ get: vi.fn().mockResolvedValue(corrupt) });
    manager = new SnapshotManager(stateStore);

    const result = await manager.loadSnapshot();
    expect(result).toBeNull();
  });

  it('returns a valid snapshot and logs info', async () => {
    const snapshot = makeValidSnapshot({ lastEventSequence: 10, workflows: [{ id: 'wf-1' } as any] });
    stateStore = makeStateStore({ get: vi.fn().mockResolvedValue(snapshot) });
    manager = new SnapshotManager(stateStore);

    const result = await manager.loadSnapshot();
    expect(result).toEqual(snapshot);
    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      'Snapshot loaded',
      expect.objectContaining({ lastEventSequence: 10, workflows: 1 }),
    );
  });

  it('loads snapshot using the runtime_snapshot key', async () => {
    await manager.loadSnapshot();
    expect(stateStore.get).toHaveBeenCalledWith('runtime_snapshot');
  });

  it('returns null and warns when stateStore.get throws', async () => {
    stateStore = makeStateStore({ get: vi.fn().mockRejectedValue(new Error('IO error')) });
    manager = new SnapshotManager(stateStore);

    const result = await manager.loadSnapshot();
    expect(result).toBeNull();
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      'Failed to load snapshot — will fall back to full replay',
      expect.objectContaining({ error: expect.any(String) }),
    );
  });
});

// ─── startPeriodicSnapshots ──────────────────────────────────────────────────

describe('SnapshotManager.startPeriodicSnapshots', () => {
  let stateStore: StateStore;
  let manager: SnapshotManager;

  beforeEach(() => {
    vi.clearAllMocks();
    stateStore = makeStateStore();
    manager = new SnapshotManager(stateStore);
  });

  it('creates a Timer and calls start()', () => {
    manager.startPeriodicSnapshots(makeDeps(), () => 0, 10_000);

    expect(mocks.TimerCtor).toHaveBeenCalledOnce();
    expect(mocks.timerStart).toHaveBeenCalledOnce();
  });

  it('passes the given intervalMs to Timer constructor', () => {
    manager.startPeriodicSnapshots(makeDeps(), () => 0, 30_000);

    const ctorCall = mocks.TimerCtor.mock.calls[0]![0];
    expect(ctorCall.intervalMs).toBe(30_000);
  });

  it('enforces a minimum interval of 5000ms', () => {
    manager.startPeriodicSnapshots(makeDeps(), () => 0, 100);

    const ctorCall = mocks.TimerCtor.mock.calls[0]![0];
    expect(ctorCall.intervalMs).toBe(5_000);
  });

  it('uses a default interval of 60000ms when none provided', () => {
    manager.startPeriodicSnapshots(makeDeps(), () => 0);

    const ctorCall = mocks.TimerCtor.mock.calls[0]![0];
    expect(ctorCall.intervalMs).toBe(60_000);
  });

  it('labels the timer as "snapshot"', () => {
    manager.startPeriodicSnapshots(makeDeps(), () => 0);

    const ctorCall = mocks.TimerCtor.mock.calls[0]![0];
    expect(ctorCall.label).toBe('snapshot');
  });

  it('warns and returns early if periodic snapshots are already running', () => {
    manager.startPeriodicSnapshots(makeDeps(), () => 0);
    vi.clearAllMocks();
    manager.startPeriodicSnapshots(makeDeps(), () => 0);

    // No second Timer created
    expect(mocks.TimerCtor).not.toHaveBeenCalled();
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      'Periodic snapshots already running — call stopPeriodicSnapshots() first',
    );
  });

  it('timer callback calls takeSnapshot with the sequence returned by getSequence', async () => {
    let capturedCallback!: () => void;
    mocks.TimerCtor.mockImplementationOnce(function (opts: { callback: () => void }) {
      capturedCallback = opts.callback;
      return { start: mocks.timerStart, stop: mocks.timerStop };
    });

    const getSequence = vi.fn().mockReturnValue(99);
    manager.startPeriodicSnapshots(makeDeps(), getSequence);

    // Trigger the callback manually
    capturedCallback();

    // Allow the async takeSnapshot to complete
    await Promise.resolve();

    expect(stateStore.set).toHaveBeenCalledOnce();
    const [, snapshot] = (stateStore.set as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(snapshot.lastEventSequence).toBe(99);
  });

  it('periodic snapshot failure is swallowed (warns, does not throw)', async () => {
    let capturedCallback!: () => void;
    mocks.TimerCtor.mockImplementationOnce(function (opts: { callback: () => void }) {
      capturedCallback = opts.callback;
      return { start: mocks.timerStart, stop: mocks.timerStop };
    });

    stateStore = makeStateStore({ set: vi.fn().mockRejectedValue(new Error('disk full')) });
    manager = new SnapshotManager(stateStore);
    manager.startPeriodicSnapshots(makeDeps(), () => 0);

    capturedCallback();

    // Allow async to settle
    await new Promise((r) => setTimeout(r, 0));

    // Should not propagate — the catch in callback swallows it
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      'Periodic snapshot failed',
      expect.any(Object),
    );
  });
});

// ─── stopPeriodicSnapshots ───────────────────────────────────────────────────

describe('SnapshotManager.stopPeriodicSnapshots', () => {
  let manager: SnapshotManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new SnapshotManager(makeStateStore());
  });

  it('calls stop() on the timer when running', () => {
    manager.startPeriodicSnapshots(makeDeps(), () => 0);
    manager.stopPeriodicSnapshots();

    expect(mocks.timerStop).toHaveBeenCalledOnce();
  });

  it('logs debug message when stopping', () => {
    manager.startPeriodicSnapshots(makeDeps(), () => 0);
    manager.stopPeriodicSnapshots();

    expect(mocks.loggerDebug).toHaveBeenCalledWith('Periodic snapshots stopped');
  });

  it('is a no-op when periodic snapshots are not running', () => {
    expect(() => manager.stopPeriodicSnapshots()).not.toThrow();
    expect(mocks.timerStop).not.toHaveBeenCalled();
  });

  it('allows startPeriodicSnapshots to be called again after stopping', () => {
    manager.startPeriodicSnapshots(makeDeps(), () => 0);
    manager.stopPeriodicSnapshots();
    vi.clearAllMocks();

    manager.startPeriodicSnapshots(makeDeps(), () => 0);
    expect(mocks.TimerCtor).toHaveBeenCalledOnce();
    expect(mocks.timerStart).toHaveBeenCalledOnce();
  });
});

// ─── restoreFromSnapshot ─────────────────────────────────────────────────────

describe('SnapshotManager.restoreFromSnapshot', () => {
  let manager: SnapshotManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new SnapshotManager(makeStateStore());
  });

  it('restores workflow instances by calling workflowEngine.restoreInstance for each', () => {
    const restoreInstance = vi.fn();
    const workflowEngine = { restoreInstance };
    const snapshot = makeValidSnapshot({
      workflows: [{ id: 'wf-1' } as any, { id: 'wf-2' } as any],
    });

    manager.restoreFromSnapshot(snapshot, makeDeps({ workflowEngine: workflowEngine as any }));

    expect(restoreInstance).toHaveBeenCalledTimes(2);
    expect(restoreInstance).toHaveBeenCalledWith({ id: 'wf-1' });
    expect(restoreInstance).toHaveBeenCalledWith({ id: 'wf-2' });
  });

  it('skips workflow restoration when workflowEngine is null', () => {
    const snapshot = makeValidSnapshot({ workflows: [{ id: 'wf-1' } as any] });
    // Should not throw
    expect(() => manager.restoreFromSnapshot(snapshot, makeDeps({ workflowEngine: null }))).not.toThrow();
  });

  it('skips workflow restoration when snapshot has no workflows', () => {
    const workflowEngine = { restoreInstance: vi.fn() };
    const snapshot = makeValidSnapshot({ workflows: [] });

    manager.restoreFromSnapshot(snapshot, makeDeps({ workflowEngine: workflowEngine as any }));
    expect(workflowEngine.restoreInstance).not.toHaveBeenCalled();
  });

  it('warns and continues when a single restoreInstance call throws', () => {
    const restoreInstance = vi.fn()
      .mockImplementationOnce(() => { throw new Error('bad instance'); })
      .mockReturnValue(undefined);
    const workflowEngine = { restoreInstance };
    const snapshot = makeValidSnapshot({
      workflows: [{ id: 'wf-bad' } as any, { id: 'wf-ok' } as any],
    });

    manager.restoreFromSnapshot(snapshot, makeDeps({ workflowEngine: workflowEngine as any }));

    // Second instance still attempted
    expect(restoreInstance).toHaveBeenCalledTimes(2);
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      'Failed to restore workflow instance from snapshot',
      expect.objectContaining({ id: 'wf-bad' }),
    );
  });

  it('restores agent-workflow bindings by calling agentWorkflowMap.restoreBindings', () => {
    const restoreBindings = vi.fn();
    const agentWorkflowMap = { restoreBindings };
    const bindings = { 'agent-1': 'wf-1' };
    const snapshot = makeValidSnapshot({ agentWorkflowBindings: bindings });

    manager.restoreFromSnapshot(snapshot, makeDeps({ agentWorkflowMap: agentWorkflowMap as any }));

    expect(restoreBindings).toHaveBeenCalledWith(bindings);
  });

  it('skips binding restoration when agentWorkflowMap is null', () => {
    const snapshot = makeValidSnapshot({ agentWorkflowBindings: { 'agent-1': 'wf-1' } });
    expect(() => manager.restoreFromSnapshot(snapshot, makeDeps({ agentWorkflowMap: null }))).not.toThrow();
  });

  it('skips binding restoration when snapshot has no bindings', () => {
    const restoreBindings = vi.fn();
    const agentWorkflowMap = { restoreBindings };
    const snapshot = makeValidSnapshot({ agentWorkflowBindings: {} });

    manager.restoreFromSnapshot(snapshot, makeDeps({ agentWorkflowMap: agentWorkflowMap as any }));
    expect(restoreBindings).not.toHaveBeenCalled();
  });

  it('restores trigger states by calling triggerRegistry.restoreTriggerState', () => {
    const restoreTriggerState = vi.fn();
    const triggerRegistry = { restoreTriggerState };
    const states = [{ triggerId: 't-1', firesCount: 2 }];
    const snapshot = makeValidSnapshot({ triggerState: states });

    manager.restoreFromSnapshot(snapshot, makeDeps({ triggerRegistry: triggerRegistry as any }));

    expect(restoreTriggerState).toHaveBeenCalledWith(states);
  });

  it('skips trigger restoration when triggerRegistry is null', () => {
    const snapshot = makeValidSnapshot({ triggerState: [{ triggerId: 't-1', firesCount: 1 }] });
    expect(() => manager.restoreFromSnapshot(snapshot, makeDeps({ triggerRegistry: null }))).not.toThrow();
  });

  it('skips trigger restoration when snapshot has no trigger state', () => {
    const restoreTriggerState = vi.fn();
    const triggerRegistry = { restoreTriggerState };
    const snapshot = makeValidSnapshot({ triggerState: [] });

    manager.restoreFromSnapshot(snapshot, makeDeps({ triggerRegistry: triggerRegistry as any }));
    expect(restoreTriggerState).not.toHaveBeenCalled();
  });

  it('warns but does not throw when restoreTriggerState throws', () => {
    const triggerRegistry = {
      restoreTriggerState: vi.fn().mockImplementation(() => { throw new Error('registry failure'); }),
    };
    const snapshot = makeValidSnapshot({ triggerState: [{ triggerId: 't-1', firesCount: 1 }] });

    expect(() =>
      manager.restoreFromSnapshot(snapshot, makeDeps({ triggerRegistry: triggerRegistry as any }))
    ).not.toThrow();
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      'Failed to restore trigger states from snapshot',
      expect.any(Object),
    );
  });

  it('logs info at start and completion of restoration', () => {
    const snapshot = makeValidSnapshot();
    manager.restoreFromSnapshot(snapshot, makeDeps());

    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      'Restoring from snapshot',
      expect.objectContaining({ lastEventSequence: snapshot.lastEventSequence }),
    );
    expect(mocks.loggerInfo).toHaveBeenCalledWith('Snapshot restoration complete');
  });

  it('handles all null deps gracefully without throwing', () => {
    const snapshot = makeValidSnapshot({
      workflows: [{ id: 'wf-1' } as any],
      agentWorkflowBindings: { 'a': 'b' },
      triggerState: [{ triggerId: 't-1', firesCount: 1 }],
    });
    expect(() => manager.restoreFromSnapshot(snapshot, makeDeps())).not.toThrow();
  });
});
