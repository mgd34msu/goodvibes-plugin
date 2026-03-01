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

// JsonStateStore mock object — stable reference reused across all tests
const mockStateStore = {
  initialize: vi.fn().mockResolvedValue(undefined),
};

vi.mock('../state-store.js', () => ({
  JsonStateStore: vi.fn().mockImplementation(() => mockStateStore),
}));

// CheckpointManager mock
const mockCheckpointManager = {
  start: vi.fn(),
  stop: vi.fn(),
  saveCheckpoint: vi.fn().mockResolvedValue(undefined),
};

vi.mock('../checkpoint-manager.js', () => ({
  CheckpointManager: vi.fn().mockImplementation(() => mockCheckpointManager),
}));

// SnapshotManager mock
const mockSnapshotManager = {
  startPeriodicSnapshots: vi.fn(),
  stopPeriodicSnapshots: vi.fn(),
  takeSnapshot: vi.fn().mockResolvedValue(undefined),
};

vi.mock('../snapshot-manager.js', () => ({
  SnapshotManager: vi.fn().mockImplementation(() => mockSnapshotManager),
}));

// recoverState mock
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
  const mockSnapshotDeps = {};
  return {
    config: makeConfig(),
    projectRoot: '/project',
    eventLog: {
      getLatestSequence: vi.fn().mockReturnValue(42),
    } as unknown as import('../../events/event-log.js').EventLog,
    healthChecker: {} as unknown as import('../../../core/observability/health.js').HealthChecker,
    workflowEngine: null,
    agentCoordinator: null,
    getSnapshotDeps: vi.fn().mockReturnValue(mockSnapshotDeps),
    ...overrides,
  };
}

/**
 * Reset call history on all mock functions without touching implementations.
 * We avoid vi.clearAllMocks() because it wipes mockImplementation on constructor mocks.
 */
function resetMocks() {
  mockStateStore.initialize.mockClear();
  mockStateStore.initialize.mockResolvedValue(undefined);

  mockCheckpointManager.start.mockClear();
  mockCheckpointManager.stop.mockClear();
  mockCheckpointManager.saveCheckpoint.mockClear();
  mockCheckpointManager.saveCheckpoint.mockResolvedValue(undefined);

  mockSnapshotManager.startPeriodicSnapshots.mockClear();
  mockSnapshotManager.stopPeriodicSnapshots.mockClear();
  mockSnapshotManager.takeSnapshot.mockClear();
  mockSnapshotManager.takeSnapshot.mockResolvedValue(undefined);

  mockRecoverState.mockClear();
  mockRecoverState.mockResolvedValue({ method: 'snapshot', recoveryDurationMs: 5 });
}

// ─── Tests ─────────────────────────────────────────────────────────────────────────────

describe('createPersistenceSubsystem', () => {
  beforeEach(() => {
    resetMocks();
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
      expect(subsystem.stateStore).toBe(mockStateStore);
    });

    it('checkpointManager is the CheckpointManager instance', async () => {
      const subsystem = await createPersistenceSubsystem(makeDeps());
      expect(subsystem.checkpointManager).toBe(mockCheckpointManager);
    });

    it('snapshotManager is the SnapshotManager instance', async () => {
      const subsystem = await createPersistenceSubsystem(makeDeps());
      expect(subsystem.snapshotManager).toBe(mockSnapshotManager);
    });
  });

  // ─── Initialisation sequence ──────────────────────────────────────────────────────────

  describe('initialisation sequence', () => {
    it('initialises the state store', async () => {
      await createPersistenceSubsystem(makeDeps());
      expect(mockStateStore.initialize).toHaveBeenCalledTimes(1);
    });

    it('starts the checkpoint manager timer', async () => {
      await createPersistenceSubsystem(makeDeps());
      expect(mockCheckpointManager.start).toHaveBeenCalledTimes(1);
    });

    it('runs startup recovery via recoverState', async () => {
      await createPersistenceSubsystem(makeDeps());
      expect(mockRecoverState).toHaveBeenCalledTimes(1);
    });

    it('starts periodic snapshots after recovery', async () => {
      await createPersistenceSubsystem(makeDeps());
      expect(mockSnapshotManager.startPeriodicSnapshots).toHaveBeenCalledTimes(1);
      // Interval should be 60 000 ms
      const args = (mockSnapshotManager.startPeriodicSnapshots as Mock).mock.calls[0];
      expect(args[2]).toBe(60_000);
    });

    it('passes getSnapshotDeps result to recoverState', async () => {
      const snapshotDeps = { foo: 'bar' };
      const deps = makeDeps({ getSnapshotDeps: vi.fn().mockReturnValue(snapshotDeps) });
      await createPersistenceSubsystem(deps);
      // recoverState receives (eventLog, snapshotManager, snapshotDeps)
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
      expect(mockSnapshotManager.startPeriodicSnapshots).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Shutdown ─────────────────────────────────────────────────────────────────────────

  describe('shutdown', () => {
    it('stops the checkpoint timer', async () => {
      const subsystem = await createPersistenceSubsystem(makeDeps());
      await subsystem.shutdown();
      expect(mockCheckpointManager.stop).toHaveBeenCalledTimes(1);
    });

    it('stops periodic snapshots', async () => {
      const subsystem = await createPersistenceSubsystem(makeDeps());
      await subsystem.shutdown();
      expect(mockSnapshotManager.stopPeriodicSnapshots).toHaveBeenCalledTimes(1);
    });

    it('takes a final snapshot', async () => {
      const subsystem = await createPersistenceSubsystem(makeDeps());
      await subsystem.shutdown();
      // takeSnapshot called once during shutdown (startPeriodicSnapshots also calls it,
      // but that’s a timer — only the direct shutdown call matters here)
      expect(mockSnapshotManager.takeSnapshot).toHaveBeenCalledTimes(1);
    });

    it('saves a final checkpoint', async () => {
      const subsystem = await createPersistenceSubsystem(makeDeps());
      await subsystem.shutdown();
      expect(mockCheckpointManager.saveCheckpoint).toHaveBeenCalledTimes(1);
    });

    it('resolves even when final snapshot throws', async () => {
      const subsystem = await createPersistenceSubsystem(makeDeps());
      mockSnapshotManager.takeSnapshot.mockRejectedValueOnce(new Error('snapshot fail'));
      await expect(subsystem.shutdown()).resolves.toBeUndefined();
    });

    it('still saves checkpoint when final snapshot throws', async () => {
      const subsystem = await createPersistenceSubsystem(makeDeps());
      mockSnapshotManager.takeSnapshot.mockRejectedValueOnce(new Error('snapshot fail'));
      await subsystem.shutdown();
      expect(mockCheckpointManager.saveCheckpoint).toHaveBeenCalledTimes(1);
    });

    it('resolves even when final checkpoint throws', async () => {
      const subsystem = await createPersistenceSubsystem(makeDeps());
      mockCheckpointManager.saveCheckpoint.mockRejectedValueOnce(new Error('checkpoint fail'));
      await expect(subsystem.shutdown()).resolves.toBeUndefined();
    });

    it('resolves even when both snapshot and checkpoint throw', async () => {
      const subsystem = await createPersistenceSubsystem(makeDeps());
      mockSnapshotManager.takeSnapshot.mockRejectedValueOnce(new Error('snap fail'));
      mockCheckpointManager.saveCheckpoint.mockRejectedValueOnce(new Error('ckpt fail'));
      await expect(subsystem.shutdown()).resolves.toBeUndefined();
    });

    it('passes the latest sequence number from eventLog to takeSnapshot', async () => {
      const getLatestSequence = vi.fn().mockReturnValue(99);
      const deps = makeDeps({
        eventLog: { getLatestSequence } as unknown as import('../../events/event-log.js').EventLog,
      });
      const subsystem = await createPersistenceSubsystem(deps);
      await subsystem.shutdown();
      const takeSnapshotArgs = (mockSnapshotManager.takeSnapshot as Mock).mock.calls[0];
      expect(takeSnapshotArgs[1]).toBe(99);
    });
  });
});
