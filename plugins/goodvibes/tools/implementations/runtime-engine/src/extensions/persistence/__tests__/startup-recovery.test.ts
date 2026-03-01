import { describe, it, expect, vi, beforeEach } from 'vitest';
import { recoverState } from '../startup-recovery.js';
import type { RecoveryResult } from '../startup-recovery.js';

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

// Mock replay-engine so we don't need a real EventLog
vi.mock('../replay-engine.js', () => ({
  replayEvents: vi.fn(),
}));

import { replayEvents } from '../replay-engine.js';
const mockReplayEvents = vi.mocked(replayEvents);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_REPLAY_RESULT = {
  eventsReplayed: 5,
  workflowsRestored: 2,
  agentBindingsRestored: 1,
  triggerCountsRestored: 3,
  replayDurationMs: 10,
  lastSequence: 5,
  skippedEvents: 0,
  aborted: false,
  errors: [],
};

function makeEventLog(overrides: Record<string, unknown> = {}) {
  return {
    getLatestSequence: vi.fn().mockReturnValue(10),
    getStats: vi.fn().mockReturnValue({ file_size_bytes: 0, total_events: 0 }),
    since: vi.fn().mockResolvedValue([]),
    query: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as Parameters<typeof recoverState>[0];
}

function makeSnapshotManager(overrides: Record<string, unknown> = {}) {
  return {
    loadSnapshot: vi.fn().mockResolvedValue(null),
    restoreFromSnapshot: vi.fn(),
    ...overrides,
  } as unknown as Parameters<typeof recoverState>[1];
}

function makeDeps() {
  return {
    workflowEngine: null,
    triggerRegistry: null,
    agentCoordinator: null,
    agentWorkflowMap: null,
  } as Parameters<typeof recoverState>[2];
}

function makeValidSnapshot() {
  return {
    version: 1,
    timestamp: new Date().toISOString(),
    lastEventSequence: 5,
    workflows: [{ id: 'wf1' }],
    agentWorkflowBindings: { agent1: 'wf1' },
    triggerState: [{ triggerId: 't1', firesCount: 1 }],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('recoverState — cold_start', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns method="cold_start" when sequence=0 and file is empty', async () => {
    const eventLog = makeEventLog({
      getLatestSequence: vi.fn().mockReturnValue(0),
      getStats: vi.fn().mockReturnValue({ file_size_bytes: 0, total_events: 0 }),
    });
    const snapshotManager = makeSnapshotManager();
    const result = await recoverState(eventLog, snapshotManager, makeDeps());
    expect(result.method).toBe('cold_start');
    expect(result.recoveryDurationMs).toBeGreaterThanOrEqual(0);
    expect(mockReplayEvents).not.toHaveBeenCalled();
  });

  it('cold_start result has no snapshot or replay info', async () => {
    const eventLog = makeEventLog({
      getLatestSequence: vi.fn().mockReturnValue(0),
      getStats: vi.fn().mockReturnValue({ file_size_bytes: 0, total_events: 0 }),
    });
    const result = await recoverState(eventLog, makeSnapshotManager(), makeDeps());
    expect(result.snapshot).toBeUndefined();
    expect(result.replay).toBeUndefined();
  });
});

describe('recoverState — sequence=0 but non-empty file (warning path)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('performs full_replay and includes a warning', async () => {
    mockReplayEvents.mockResolvedValueOnce(DEFAULT_REPLAY_RESULT);
    const eventLog = makeEventLog({
      getLatestSequence: vi.fn().mockReturnValue(0),
      getStats: vi.fn().mockReturnValue({ file_size_bytes: 1024, total_events: 5 }),
    });
    const result = await recoverState(eventLog, makeSnapshotManager(), makeDeps());
    expect(result.method).toBe('full_replay');
    expect(result.warnings).toBeDefined();
    expect(result.warnings!.length).toBeGreaterThan(0);
    expect(mockReplayEvents).toHaveBeenCalledTimes(1);
  });
});

describe('recoverState — full_replay (no snapshot)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns method="full_replay" when no snapshot is available', async () => {
    mockReplayEvents.mockResolvedValueOnce(DEFAULT_REPLAY_RESULT);
    const eventLog = makeEventLog();
    const snapshotManager = makeSnapshotManager({ loadSnapshot: vi.fn().mockResolvedValue(null) });
    const result = await recoverState(eventLog, snapshotManager, makeDeps());
    expect(result.method).toBe('full_replay');
  });

  it('includes replay info in the result', async () => {
    mockReplayEvents.mockResolvedValueOnce(DEFAULT_REPLAY_RESULT);
    const eventLog = makeEventLog();
    const snapshotManager = makeSnapshotManager();
    const result = await recoverState(eventLog, snapshotManager, makeDeps());
    expect(result.replay).toBeDefined();
    expect(result.replay!.eventsReplayed).toBe(5);
    expect(result.replay!.workflowsRestored).toBe(2);
  });

  it('still returns full_replay result when replayEvents throws', async () => {
    mockReplayEvents.mockRejectedValueOnce(new Error('replay failed'));
    const eventLog = makeEventLog();
    const snapshotManager = makeSnapshotManager();
    const result = await recoverState(eventLog, snapshotManager, makeDeps());
    expect(result.method).toBe('full_replay');
    expect(result.replay).toBeUndefined();
  });

  it('falls back to full_replay when snapshot load throws', async () => {
    mockReplayEvents.mockResolvedValueOnce(DEFAULT_REPLAY_RESULT);
    const eventLog = makeEventLog();
    const snapshotManager = makeSnapshotManager({
      loadSnapshot: vi.fn().mockRejectedValue(new Error('snapshot corrupted')),
    });
    const result = await recoverState(eventLog, snapshotManager, makeDeps());
    expect(result.method).toBe('full_replay');
    expect(mockReplayEvents).toHaveBeenCalledTimes(1);
  });
});

describe('recoverState — snapshot_plus_replay', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns method="snapshot_plus_replay" when a valid snapshot exists', async () => {
    mockReplayEvents.mockResolvedValueOnce(DEFAULT_REPLAY_RESULT);
    const snapshot = makeValidSnapshot();
    const eventLog = makeEventLog({ getLatestSequence: vi.fn().mockReturnValue(10) });
    const snapshotManager = makeSnapshotManager({
      loadSnapshot: vi.fn().mockResolvedValue(snapshot),
    });
    const result = await recoverState(eventLog, snapshotManager, makeDeps());
    expect(result.method).toBe('snapshot_plus_replay');
  });

  it('restores from snapshot before replay', async () => {
    mockReplayEvents.mockResolvedValueOnce(DEFAULT_REPLAY_RESULT);
    const snapshot = makeValidSnapshot();
    const eventLog = makeEventLog({ getLatestSequence: vi.fn().mockReturnValue(10) });
    const snapshotManager = makeSnapshotManager({
      loadSnapshot: vi.fn().mockResolvedValue(snapshot),
    });
    await recoverState(eventLog, snapshotManager, makeDeps());
    expect(snapshotManager.restoreFromSnapshot).toHaveBeenCalledWith(snapshot, makeDeps());
  });

  it('includes snapshot info with correct counts', async () => {
    mockReplayEvents.mockResolvedValueOnce(DEFAULT_REPLAY_RESULT);
    const snapshot = makeValidSnapshot();
    const eventLog = makeEventLog({ getLatestSequence: vi.fn().mockReturnValue(10) });
    const snapshotManager = makeSnapshotManager({
      loadSnapshot: vi.fn().mockResolvedValue(snapshot),
    });
    const result = await recoverState(eventLog, snapshotManager, makeDeps());
    expect(result.snapshot).toBeDefined();
    expect(result.snapshot!.workflowsRestored).toBe(1);
    expect(result.snapshot!.agentBindingsRestored).toBe(1);
    expect(result.snapshot!.triggerStatesRestored).toBe(1);
    expect(result.snapshot!.lastEventSequence).toBe(5);
  });

  it('calls replayEvents with afterSequence set to snapshot.lastEventSequence', async () => {
    mockReplayEvents.mockResolvedValueOnce(DEFAULT_REPLAY_RESULT);
    const snapshot = makeValidSnapshot(); // lastEventSequence = 5
    const eventLog = makeEventLog({ getLatestSequence: vi.fn().mockReturnValue(10) });
    const snapshotManager = makeSnapshotManager({
      loadSnapshot: vi.fn().mockResolvedValue(snapshot),
    });
    await recoverState(eventLog, snapshotManager, makeDeps());
    expect(mockReplayEvents).toHaveBeenCalledWith(
      eventLog,
      makeDeps(),
      expect.objectContaining({ afterSequence: 5, skipActions: true }),
    );
  });

  it('skips delta replay when snapshot is up-to-date', async () => {
    const snapshot = makeValidSnapshot(); // lastEventSequence = 5, latestSequence = 5
    const eventLog = makeEventLog({ getLatestSequence: vi.fn().mockReturnValue(5) });
    const snapshotManager = makeSnapshotManager({
      loadSnapshot: vi.fn().mockResolvedValue(snapshot),
    });
    const result = await recoverState(eventLog, snapshotManager, makeDeps());
    expect(result.method).toBe('snapshot_plus_replay');
    expect(result.replay).toBeUndefined();
    expect(mockReplayEvents).not.toHaveBeenCalled();
  });

  it('still returns snapshot_plus_replay when delta replay throws', async () => {
    mockReplayEvents.mockRejectedValueOnce(new Error('delta replay error'));
    const snapshot = makeValidSnapshot(); // lastEventSequence = 5
    const eventLog = makeEventLog({ getLatestSequence: vi.fn().mockReturnValue(10) });
    const snapshotManager = makeSnapshotManager({
      loadSnapshot: vi.fn().mockResolvedValue(snapshot),
    });
    const result = await recoverState(eventLog, snapshotManager, makeDeps());
    expect(result.method).toBe('snapshot_plus_replay');
    expect(result.replay).toBeUndefined();
  });

  it('result includes recoveryDurationMs', async () => {
    mockReplayEvents.mockResolvedValueOnce(DEFAULT_REPLAY_RESULT);
    const snapshot = makeValidSnapshot();
    const eventLog = makeEventLog({ getLatestSequence: vi.fn().mockReturnValue(10) });
    const snapshotManager = makeSnapshotManager({
      loadSnapshot: vi.fn().mockResolvedValue(snapshot),
    });
    const result: RecoveryResult = await recoverState(eventLog, snapshotManager, makeDeps());
    expect(typeof result.recoveryDurationMs).toBe('number');
    expect(result.recoveryDurationMs).toBeGreaterThanOrEqual(0);
  });
});
