import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

// ─── Module mocks ─────────────────────────────────────────────────────────────────

vi.mock('../../../shared/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../../../shared/utils.js', () => ({
  toErrorMessage: (err: unknown) => String(err),
}));

// Define mock instances entirely inside mock factories.
// The mock modules export the instance via a getter so tests can access it.
let _stateStore: ReturnType<typeof makeStateStore>;
let _checkpointManager: ReturnType<typeof makeCheckpointManager>;
let _snapshotManager: ReturnType<typeof makeSnapshotManager>;

function makeStateStore() {
  return { initialize: vi.fn().mockResolvedValue(undefined) };
}
function makeCheckpointManager() {
  return { start: vi.fn(), stop: vi.fn(), saveCheckpoint: vi.fn().mockResolvedValue(undefined) };
}
function makeSnapshotManager() {
  return {
    startPeriodicSnapshots: vi.fn(),
    stopPeriodicSnapshots: vi.fn(),
    takeSnapshot: vi.fn().mockResolvedValue(undefined),
  };
}

vi.mock('../state-store.js', () => ({
  JsonStateStore: function JsonStateStore() {
    _stateStore = makeStateStore();
    return _stateStore;
  },
}));

vi.mock('../checkpoint-manager.js', () => ({
  CheckpointManager: function CheckpointManager() {
    _checkpointManager = makeCheckpointManager();
    return _checkpointManager;
  },
}));

vi.mock('../snapshot-manager.js', () => ({
  SnapshotManager: function SnapshotManager() {
    _snapshotManager = makeSnapshotManager();
    return _snapshotManager;
  },
}));

// recoverState mock via hoisted reference
const mockRecoverState = vi.fn().mockResolvedValue({
  method: 'snapshot',
  recoveryDurationMs: 5,
});

vi.mock('../startup-recovery.js', () => ({
  recoverState: (...args: unknown[]) => mockRecoverState(...args),
}));

// ─── Import after mocks ─────────────────────────────────────────────────────────────────

import { createPersistenceSubsystem } from '../subsystem.js';
import type { PersistenceSubsystemDeps } from '../subsystem.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────────────────

function makeConfig() {
  return {
    persistence: { state_dir: '.state', checkpoint_interval_ms: 30_000 },
    ipc: { socket_dir: '/tmp' },
  } as unknown as import('../../../shared/config.js').RuntimeConfig;
}

function makeDeps(overrides: Partial<PersistenceSubsystemDeps> = {}): PersistenceSubsystemDeps {
  return {
    config: makeConfig(),
    projectRoot: '/project',
    eventLog: {
      getLatestSequence: vi.fn().mockReturnValue(42),
    } as unknown as import('../../events/event-log.js').EventLog,
    healthChecker: {} as unknown as import('../../../core/observability/health.js').HealthChecker,
    workflowEngine: null,
    agentCoordinator: null,
    getSnapshotDeps: vi.fn().mockReturnValue({}),
    ...overrides,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────────────────

describe('createPersistenceSubsystem', () => {
  beforeEach(() => {
    mockRecoverState.mockClear();
    mockRecoverState.mockResolvedValue({ method: 'snapshot', recoveryDurationMs: 5 });
    // _stateStore / _checkpointManager / _snapshotManager are created fresh per factory call.
    // No reset needed — each test calls createPersistenceSubsystem which re-invokes constructors.
  });

  // ─── Return shape ─────────────────────────────────────────────────────────────────────

  describe('return shape', () => {
    it('returns stateStore, checkpointManager, snapshotManager, shutdown', async () => {
      const subsystem = await createPersistenceSubsystem(makeDeps());
      expect(subsystem).toHaveProperty('stateStore');
      expect(subsystem).toHaveProperty('checkpointManager');
      expect(subsystem).toHaveProperty('snapshotManager');
      expect(subsystem).toHaveProperty('shutdown');
      expect(typeof subsystem.shutdown).toBe('function');
    });

    it('stateStore is the JsonStateStore instance', async () => {
      const subsystem = await createPersistenceSubsystem(makeDeps());
      expect(subsystem.stateStore).toBe(_stateStore);
    });

    it('checkpointManager is the CheckpointManager instance', async () => {
      const subsystem = await createPersistenceSubsystem(makeDeps());
      expect(subsystem.checkpointManager).toBe(_checkpointManager);
    });

    it('snapshotManager is the SnapshotManager instance', async () => {
      const subsystem = await createPersistenceSubsystem(makeDeps());
      expect(subsystem.snapshotManager).toBe(_snapshotManager);
    });
  });

  // ─── Initialisation sequence ──────────────────────────────────────────────────────────

  describe('initialisation sequence', () => {
    it('initialises the state store', async () => {
      await createPersistenceSubsystem(makeDeps());
      expect(_stateStore.initialize).toHaveBeenCalledTimes(1);
    });

    it('starts the checkpoint manager timer', async () => {
      await createPersistenceSubsystem(makeDeps());
      expect(_checkpointManager.start).toHaveBeenCalledTimes(1);
    });

    it('runs startup recovery via recoverState', async () => {
      await createPersistenceSubsystem(makeDeps());
      expect(mockRecoverState).toHaveBeenCalledTimes(1);
    });

    it('starts periodic snapshots after recovery', async () => {
      await createPersistenceSubsystem(makeDeps());
      expect(_snapshotManager.startPeriodicSnapshots).toHaveBeenCalledTimes(1);
      const args = (_snapshotManager.startPeriodicSnapshots as Mock).mock.calls[0];
      expect(args[2]).toBe(60_000);
    });

    it('passes getSnapshotDeps result to recoverState', async () => {
      const snapshotDeps = { foo: 'bar' };
      const deps = makeDeps({ getSnapshotDeps: vi.fn().mockReturnValue(snapshotDeps) });
      await createPersistenceSubsystem(deps);
      expect(mockRecoverState.mock.calls[0][2]).toBe(snapshotDeps);
    });
  });

  // ─── Startup recovery ─────────────────────────────────────────────────────────────────

  describe('startup recovery', () => {
    it('still resolves when recovery throws (continues with cold start)', async () => {
      mockRecoverState.mockRejectedValueOnce(new Error('Recovery failed'));
      await expect(createPersistenceSubsystem(makeDeps())).resolves.toBeDefined();
    });

    it('still starts periodic snapshots even when recovery fails', async () => {
      mockRecoverState.mockRejectedValueOnce(new Error('fail'));
      await createPersistenceSubsystem(makeDeps());
      expect(_snapshotManager.startPeriodicSnapshots).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Shutdown ─────────────────────────────────────────────────────────────────────────

  describe('shutdown', () => {
    it('stops the checkpoint timer', async () => {
      const subsystem = await createPersistenceSubsystem(makeDeps());
      await subsystem.shutdown();
      expect(_checkpointManager.stop).toHaveBeenCalledTimes(1);
    });

    it('stops periodic snapshots', async () => {
      const subsystem = await createPersistenceSubsystem(makeDeps());
      await subsystem.shutdown();
      expect(_snapshotManager.stopPeriodicSnapshots).toHaveBeenCalledTimes(1);
    });

    it('takes a final snapshot', async () => {
      const subsystem = await createPersistenceSubsystem(makeDeps());
      await subsystem.shutdown();
      expect(_snapshotManager.takeSnapshot).toHaveBeenCalledTimes(1);
    });

    it('saves a final checkpoint', async () => {
      const subsystem = await createPersistenceSubsystem(makeDeps());
      await subsystem.shutdown();
      expect(_checkpointManager.saveCheckpoint).toHaveBeenCalledTimes(1);
    });

    it('resolves even when final snapshot throws', async () => {
      const subsystem = await createPersistenceSubsystem(makeDeps());
      _snapshotManager.takeSnapshot.mockRejectedValueOnce(new Error('snapshot fail'));
      await expect(subsystem.shutdown()).resolves.toBeUndefined();
    });

    it('still saves checkpoint when final snapshot throws', async () => {
      const subsystem = await createPersistenceSubsystem(makeDeps());
      _snapshotManager.takeSnapshot.mockRejectedValueOnce(new Error('snapshot fail'));
      await subsystem.shutdown();
      expect(_checkpointManager.saveCheckpoint).toHaveBeenCalledTimes(1);
    });

    it('resolves even when final checkpoint throws', async () => {
      const subsystem = await createPersistenceSubsystem(makeDeps());
      _checkpointManager.saveCheckpoint.mockRejectedValueOnce(new Error('checkpoint fail'));
      await expect(subsystem.shutdown()).resolves.toBeUndefined();
    });

    it('resolves even when both snapshot and checkpoint throw', async () => {
      const subsystem = await createPersistenceSubsystem(makeDeps());
      _snapshotManager.takeSnapshot.mockRejectedValueOnce(new Error('snap fail'));
      _checkpointManager.saveCheckpoint.mockRejectedValueOnce(new Error('ckpt fail'));
      await expect(subsystem.shutdown()).resolves.toBeUndefined();
    });

    it('passes the latest sequence number from eventLog to takeSnapshot', async () => {
      const getLatestSequence = vi.fn().mockReturnValue(99);
      const deps = makeDeps({
        eventLog: { getLatestSequence } as unknown as import('../../events/event-log.js').EventLog,
      });
      const subsystem = await createPersistenceSubsystem(deps);
      await subsystem.shutdown();
      const takeSnapshotArgs = (_snapshotManager.takeSnapshot as Mock).mock.calls[0];
      expect(takeSnapshotArgs[1]).toBe(99);
    });
  });
});
