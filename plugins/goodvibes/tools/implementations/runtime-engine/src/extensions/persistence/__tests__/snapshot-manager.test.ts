import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SnapshotManager } from '../snapshot-manager.js';
import type { RuntimeSnapshot, SnapshotDeps } from '../snapshot-manager.js';
import type { StateStore } from '../types.js';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('../../../shared/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../../../core/observability/timer.js', () => {
  const MockTimer = vi.fn(function(this: Record<string, unknown>, { callback, intervalMs }: { callback: () => void; intervalMs: number }) {
    this.start = vi.fn();
    this.stop = vi.fn();
    this._callback = callback;
    this._intervalMs = intervalMs;
  });
  return { Timer: MockTimer };
});

import { Timer } from '../../../core/observability/timer.js';
const MockTimer = vi.mocked(Timer);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SNAPSHOT_VERSION = 1;

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
    workflowEngine: {
      getAllInstances: vi.fn().mockReturnValue([]),
      restoreInstance: vi.fn(),
    } as unknown as SnapshotDeps['workflowEngine'],
    triggerRegistry: {
      getTriggerStates: vi.fn().mockReturnValue([]),
      restoreTriggerState: vi.fn(),
    } as unknown as SnapshotDeps['triggerRegistry'],
    agentCoordinator: {} as SnapshotDeps['agentCoordinator'],
    agentWorkflowMap: {
      snapshot: vi.fn().mockReturnValue({}),
      restoreBindings: vi.fn(),
    } as unknown as SnapshotDeps['agentWorkflowMap'],
    ...overrides,
  };
}

function makeValidSnapshot(overrides: Partial<RuntimeSnapshot> = {}): RuntimeSnapshot {
  return {
    version: SNAPSHOT_VERSION,
    timestamp: new Date().toISOString(),
    lastEventSequence: 10,
    workflows: [],
    agentWorkflowBindings: {},
    triggerState: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// takeSnapshot()
// ---------------------------------------------------------------------------

describe('SnapshotManager — takeSnapshot()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    MockTimer.mockClear();
  });

  it('calls stateStore.set with the correct key', async () => {
    const store = makeStateStore();
    const manager = new SnapshotManager(store);
    await manager.takeSnapshot(makeDeps(), 42);
    expect(store.set).toHaveBeenCalledWith('runtime_snapshot', expect.any(Object));
  });

  it('snapshot contains the correct version and lastEventSequence', async () => {
    const store = makeStateStore();
    const manager = new SnapshotManager(store);
    await manager.takeSnapshot(makeDeps(), 99);
    const [, snapshot] = vi.mocked(store.set).mock.calls[0];
    expect((snapshot as RuntimeSnapshot).version).toBe(SNAPSHOT_VERSION);
    expect((snapshot as RuntimeSnapshot).lastEventSequence).toBe(99);
  });

  it('snapshot timestamp is an ISO-8601 string', async () => {
    const store = makeStateStore();
    const manager = new SnapshotManager(store);
    await manager.takeSnapshot(makeDeps(), 1);
    const [, snapshot] = vi.mocked(store.set).mock.calls[0];
    expect((snapshot as RuntimeSnapshot).timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('captures workflow instances from workflowEngine', async () => {
    const workflowInstance = { id: 'wf1', definition_id: 'def1', current_state: 'active', context: {}, history: [], created_at: '', updated_at: '', status: 'active' as const };
    const deps = makeDeps({
      workflowEngine: {
        getAllInstances: vi.fn().mockReturnValue([workflowInstance]),
        restoreInstance: vi.fn(),
      } as unknown as SnapshotDeps['workflowEngine'],
    });
    const store = makeStateStore();
    const manager = new SnapshotManager(store);
    await manager.takeSnapshot(deps, 1);
    const [, snapshot] = vi.mocked(store.set).mock.calls[0];
    expect((snapshot as RuntimeSnapshot).workflows).toHaveLength(1);
    expect((snapshot as RuntimeSnapshot).workflows[0].id).toBe('wf1');
  });

  it('captures trigger states from triggerRegistry', async () => {
    const triggerState = { triggerId: 'trig1', firesCount: 3, lastFired: Date.now() };
    const deps = makeDeps({
      triggerRegistry: {
        getTriggerStates: vi.fn().mockReturnValue([triggerState]),
        restoreTriggerState: vi.fn(),
      } as unknown as SnapshotDeps['triggerRegistry'],
    });
    const store = makeStateStore();
    const manager = new SnapshotManager(store);
    await manager.takeSnapshot(deps, 1);
    const [, snapshot] = vi.mocked(store.set).mock.calls[0];
    expect((snapshot as RuntimeSnapshot).triggerState).toHaveLength(1);
    expect((snapshot as RuntimeSnapshot).triggerState[0].triggerId).toBe('trig1');
  });

  it('captures agent-workflow bindings from agentWorkflowMap', async () => {
    const deps = makeDeps({
      agentWorkflowMap: {
        snapshot: vi.fn().mockReturnValue({ agent1: 'wf1' }),
        restoreBindings: vi.fn(),
      } as unknown as SnapshotDeps['agentWorkflowMap'],
    });
    const store = makeStateStore();
    const manager = new SnapshotManager(store);
    await manager.takeSnapshot(deps, 1);
    const [, snapshot] = vi.mocked(store.set).mock.calls[0];
    expect((snapshot as RuntimeSnapshot).agentWorkflowBindings).toEqual({ agent1: 'wf1' });
  });

  it('returns empty arrays when deps are null', async () => {
    const deps = makeDeps({ workflowEngine: null, triggerRegistry: null, agentWorkflowMap: null });
    const store = makeStateStore();
    const manager = new SnapshotManager(store);
    await manager.takeSnapshot(deps, 0);
    const [, snapshot] = vi.mocked(store.set).mock.calls[0];
    const snap = snapshot as RuntimeSnapshot;
    expect(snap.workflows).toEqual([]);
    expect(snap.triggerState).toEqual([]);
    expect(snap.agentWorkflowBindings).toEqual({});
  });

  it('re-throws when stateStore.set() fails', async () => {
    const store = makeStateStore({
      set: vi.fn().mockRejectedValue(new Error('disk full')),
    });
    const manager = new SnapshotManager(store);
    await expect(manager.takeSnapshot(makeDeps(), 1)).rejects.toThrow('disk full');
  });

  it('returns empty workflows when workflowEngine.getAllInstances() throws', async () => {
    const deps = makeDeps({
      workflowEngine: {
        getAllInstances: vi.fn().mockImplementation(() => { throw new Error('engine error'); }),
        restoreInstance: vi.fn(),
      } as unknown as SnapshotDeps['workflowEngine'],
    });
    const store = makeStateStore();
    const manager = new SnapshotManager(store);
    await manager.takeSnapshot(deps, 1);
    const [, snapshot] = vi.mocked(store.set).mock.calls[0];
    expect((snapshot as RuntimeSnapshot).workflows).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// loadSnapshot()
// ---------------------------------------------------------------------------

describe('SnapshotManager — loadSnapshot()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns null when no snapshot exists', async () => {
    const store = makeStateStore({ get: vi.fn().mockResolvedValue(null) });
    const manager = new SnapshotManager(store);
    const result = await manager.loadSnapshot();
    expect(result).toBeNull();
  });

  it('returns the snapshot when valid', async () => {
    const snapshot = makeValidSnapshot();
    const store = makeStateStore({ get: vi.fn().mockResolvedValue(snapshot) });
    const manager = new SnapshotManager(store);
    const result = await manager.loadSnapshot();
    expect(result).toEqual(snapshot);
  });

  it('returns null when snapshot version does not match', async () => {
    const snapshot = makeValidSnapshot({ version: 999 });
    const store = makeStateStore({ get: vi.fn().mockResolvedValue(snapshot) });
    const manager = new SnapshotManager(store);
    const result = await manager.loadSnapshot();
    expect(result).toBeNull();
  });

  it('returns null when lastEventSequence is not a number', async () => {
    const snapshot = makeValidSnapshot({ lastEventSequence: 'bad' as unknown as number });
    const store = makeStateStore({ get: vi.fn().mockResolvedValue(snapshot) });
    const manager = new SnapshotManager(store);
    const result = await manager.loadSnapshot();
    expect(result).toBeNull();
  });

  it('returns null when workflows is not an array', async () => {
    const snapshot = makeValidSnapshot({ workflows: 'bad' as unknown as RuntimeSnapshot['workflows'] });
    const store = makeStateStore({ get: vi.fn().mockResolvedValue(snapshot) });
    const manager = new SnapshotManager(store);
    const result = await manager.loadSnapshot();
    expect(result).toBeNull();
  });

  it('returns null when agentWorkflowBindings is null', async () => {
    const snapshot = makeValidSnapshot({ agentWorkflowBindings: null as unknown as Record<string, string> });
    const store = makeStateStore({ get: vi.fn().mockResolvedValue(snapshot) });
    const manager = new SnapshotManager(store);
    const result = await manager.loadSnapshot();
    expect(result).toBeNull();
  });

  it('returns null when triggerState is not an array', async () => {
    const snapshot = makeValidSnapshot({ triggerState: 'bad' as unknown as RuntimeSnapshot['triggerState'] });
    const store = makeStateStore({ get: vi.fn().mockResolvedValue(snapshot) });
    const manager = new SnapshotManager(store);
    const result = await manager.loadSnapshot();
    expect(result).toBeNull();
  });

  it('returns null (does not throw) when stateStore.get() throws', async () => {
    const store = makeStateStore({
      get: vi.fn().mockRejectedValue(new Error('corrupted store')),
    });
    const manager = new SnapshotManager(store);
    const result = await manager.loadSnapshot();
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// startPeriodicSnapshots() / stopPeriodicSnapshots()
// ---------------------------------------------------------------------------

describe('SnapshotManager — periodic snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    MockTimer.mockClear();
  });

  it('starts a timer with the provided interval', () => {
    const store = makeStateStore();
    const manager = new SnapshotManager(store);
    manager.startPeriodicSnapshots(makeDeps(), () => 0, 10_000);
    const instance = MockTimer.mock.results[0].value;
    expect(instance._intervalMs).toBe(10_000);
    expect(instance.start).toHaveBeenCalled();
  });

  it('enforces minimum 5000ms interval', () => {
    const store = makeStateStore();
    const manager = new SnapshotManager(store);
    manager.startPeriodicSnapshots(makeDeps(), () => 0, 100);
    const instance = MockTimer.mock.results[0].value;
    expect(instance._intervalMs).toBe(5_000);
  });

  it('does not start a second timer if already running', () => {
    const store = makeStateStore();
    const manager = new SnapshotManager(store);
    manager.startPeriodicSnapshots(makeDeps(), () => 0, 10_000);
    manager.startPeriodicSnapshots(makeDeps(), () => 0, 10_000);
    expect(MockTimer).toHaveBeenCalledTimes(1);
  });

  it('stopPeriodicSnapshots() calls stop on the timer', () => {
    const store = makeStateStore();
    const manager = new SnapshotManager(store);
    manager.startPeriodicSnapshots(makeDeps(), () => 0, 10_000);
    const instance = MockTimer.mock.results[0].value;
    manager.stopPeriodicSnapshots();
    expect(instance.stop).toHaveBeenCalledTimes(1);
  });

  it('stopPeriodicSnapshots() is a no-op when not started', () => {
    const store = makeStateStore();
    const manager = new SnapshotManager(store);
    expect(() => manager.stopPeriodicSnapshots()).not.toThrow();
  });

  it('timer callback calls takeSnapshot with the current sequence', async () => {
    const store = makeStateStore();
    const manager = new SnapshotManager(store);
    let seq = 7;
    manager.startPeriodicSnapshots(makeDeps(), () => seq, 10_000);
    const instance = MockTimer.mock.results[0].value;
    // Invoke the callback directly
    instance._callback();
    // Allow promise to settle
    await vi.waitFor(() => {
      expect(store.set).toHaveBeenCalledWith('runtime_snapshot', expect.objectContaining({ lastEventSequence: 7 }));
    });
  });
});

// ---------------------------------------------------------------------------
// restoreFromSnapshot()
// ---------------------------------------------------------------------------

describe('SnapshotManager — restoreFromSnapshot()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls workflowEngine.restoreInstance() for each workflow', () => {
    const store = makeStateStore();
    const manager = new SnapshotManager(store);
    const instance1 = { id: 'wf1', definition_id: 'd1', current_state: 's1', context: {}, history: [], created_at: 0, updated_at: 0, status: 'active' as const };
    const instance2 = { id: 'wf2', definition_id: 'd2', current_state: 's1', context: {}, history: [], created_at: 0, updated_at: 0, status: 'active' as const };
    const snapshot = makeValidSnapshot({ workflows: [instance1, instance2] });
    const deps = makeDeps();
    manager.restoreFromSnapshot(snapshot, deps);
    expect(vi.mocked(deps.workflowEngine!.restoreInstance)).toHaveBeenCalledTimes(2);
  });

  it('calls agentWorkflowMap.restoreBindings() with snapshot bindings', () => {
    const store = makeStateStore();
    const manager = new SnapshotManager(store);
    const snapshot = makeValidSnapshot({ agentWorkflowBindings: { agent1: 'wf1' } });
    const deps = makeDeps();
    manager.restoreFromSnapshot(snapshot, deps);
    expect(vi.mocked(deps.agentWorkflowMap!.restoreBindings)).toHaveBeenCalledWith({ agent1: 'wf1' });
  });

  it('calls triggerRegistry.restoreTriggerState() with trigger states', () => {
    const store = makeStateStore();
    const manager = new SnapshotManager(store);
    const triggerState = [{ triggerId: 't1', firesCount: 2 }];
    const snapshot = makeValidSnapshot({ triggerState });
    const deps = makeDeps();
    manager.restoreFromSnapshot(snapshot, deps);
    expect(vi.mocked(deps.triggerRegistry!.restoreTriggerState)).toHaveBeenCalledWith(triggerState);
  });

  it('does not throw when workflowEngine is null', () => {
    const store = makeStateStore();
    const manager = new SnapshotManager(store);
    const snapshot = makeValidSnapshot({ workflows: [{ id: 'wf1', definition_id: 'd1', current_state: 's1', context: {}, history: [], created_at: 0, updated_at: 0, status: 'active' as const }] });
    const deps = makeDeps({ workflowEngine: null });
    expect(() => manager.restoreFromSnapshot(snapshot, deps)).not.toThrow();
  });

  it('does not throw when restoreInstance() throws', () => {
    const store = makeStateStore();
    const manager = new SnapshotManager(store);
    const snapshot = makeValidSnapshot({ workflows: [{ id: 'wf1', definition_id: 'd1', current_state: 's1', context: {}, history: [], created_at: 0, updated_at: 0, status: 'active' as const }] });
    const deps = makeDeps({
      workflowEngine: {
        getAllInstances: vi.fn(),
        restoreInstance: vi.fn().mockImplementation(() => { throw new Error('restore failed'); }),
      } as unknown as SnapshotDeps['workflowEngine'],
    });
    expect(() => manager.restoreFromSnapshot(snapshot, deps)).not.toThrow();
  });

  it('does not call restoreBindings when bindings are empty', () => {
    const store = makeStateStore();
    const manager = new SnapshotManager(store);
    const snapshot = makeValidSnapshot({ agentWorkflowBindings: {} });
    const deps = makeDeps();
    manager.restoreFromSnapshot(snapshot, deps);
    expect(vi.mocked(deps.agentWorkflowMap!.restoreBindings)).not.toHaveBeenCalled();
  });

  it('does not call restoreTriggerState when trigger states are empty', () => {
    const store = makeStateStore();
    const manager = new SnapshotManager(store);
    const snapshot = makeValidSnapshot({ triggerState: [] });
    const deps = makeDeps();
    manager.restoreFromSnapshot(snapshot, deps);
    expect(vi.mocked(deps.triggerRegistry!.restoreTriggerState)).not.toHaveBeenCalled();
  });
});
