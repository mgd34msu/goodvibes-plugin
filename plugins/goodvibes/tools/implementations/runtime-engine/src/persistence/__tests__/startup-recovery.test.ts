/**
 * startup-recovery.test.ts
 *
 * Tests for recoverState() — the startup recovery coordinator.
 *
 * Strategy:
 * - EventLog is mocked via a hand-rolled object (interface).
 * - SnapshotManager is mocked via vi.mock() on the module.
 * - replayEvents is mocked via vi.mock() on the replay-engine module.
 * - Logger is mocked via vi.mock() with vi.hoisted() variables.
 *
 * Recovery strategies tested:
 * 1. cold_start — no events, empty log
 * 2. cold_start warning path — sequence=0 but log file is non-empty
 * 3. full_replay — events exist but no snapshot available
 * 4. snapshot_plus_replay — snapshot available, delta events exist
 * 5. snapshot_plus_replay — snapshot is up-to-date (no delta needed)
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

  // SnapshotManager mock
  const loadSnapshot = vi.fn().mockResolvedValue(null);
  const restoreFromSnapshot = vi.fn();
  const MockSnapshotManager = vi.fn().mockImplementation(() => ({
    loadSnapshot,
    restoreFromSnapshot,
  }));

  // replayEvents mock
  const replayEvents = vi.fn().mockResolvedValue({
    eventsReplayed: 0,
    workflowsRestored: 0,
    agentBindingsRestored: 0,
    triggerCountsRestored: 0,
    lastSequence: 0,
    skippedEvents: 0,
    replayDurationMs: 5,
  });

  return { loggerInfo, loggerDebug, loggerWarn, loggerError, createLogger, loadSnapshot, restoreFromSnapshot, MockSnapshotManager, replayEvents };
});

vi.mock('../../shared/logger.js', () => ({ createLogger: mocks.createLogger }));
vi.mock('../../shared/utils.js', () => ({ toErrorMessage: (e: unknown) => String(e) }));
vi.mock('../snapshot-manager.js', () => ({
  SnapshotManager: mocks.MockSnapshotManager,
}));
vi.mock('../replay-engine.js', () => ({
  replayEvents: mocks.replayEvents,
}));

// ─── Subject under test ──────────────────────────────────────────────────────

import { recoverState } from '../startup-recovery.js';
import type { SnapshotManager } from '../snapshot-manager.js';
import type { SnapshotDeps, RuntimeSnapshot } from '../snapshot-manager.js';
import type { EventLog } from '../../events/event-log.js';

// ─── Test helpers ────────────────────────────────────────────────────────────

interface EventLogStats {
  total_events: number;
  file_size_bytes: number;
  oldest_event: string | null;
  newest_event: string | null;
  events_per_type: Record<string, number>;
}

function makeEventLog(latestSequence: number, fileSizeBytes = 0): EventLog {
  return {
    getLatestSequence: vi.fn().mockReturnValue(latestSequence),
    getStats: vi.fn().mockReturnValue({
      total_events: latestSequence,
      file_size_bytes: fileSizeBytes,
      oldest_event: null,
      newest_event: null,
      events_per_type: {},
    } satisfies EventLogStats),
  } as unknown as EventLog;
}

function makeDeps(): SnapshotDeps {
  return {
    workflowEngine: null,
    triggerRegistry: null,
    agentCoordinator: null,
    agentWorkflowMap: null,
  };
}

function makeSnapshot(overrides: Partial<RuntimeSnapshot> = {}): RuntimeSnapshot {
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

function makeSnapshotManager(): SnapshotManager {
  return {
    loadSnapshot: mocks.loadSnapshot,
    restoreFromSnapshot: mocks.restoreFromSnapshot,
  } as unknown as SnapshotManager;
}

// ─── Cold start ───────────────────────────────────────────────────────────────

describe('recoverState — cold_start', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns method=cold_start when sequence=0 and file is empty', async () => {
    const eventLog = makeEventLog(0, 0);
    const result = await recoverState(eventLog, makeSnapshotManager(), makeDeps());

    expect(result.method).toBe('cold_start');
  });

  it('cold_start result has no snapshot or replay fields', async () => {
    const eventLog = makeEventLog(0, 0);
    const result = await recoverState(eventLog, makeSnapshotManager(), makeDeps());

    expect(result.snapshot).toBeUndefined();
    expect(result.replay).toBeUndefined();
  });

  it('cold_start result has a non-negative recoveryDurationMs', async () => {
    const eventLog = makeEventLog(0, 0);
    const result = await recoverState(eventLog, makeSnapshotManager(), makeDeps());

    expect(result.recoveryDurationMs).toBeGreaterThanOrEqual(0);
  });

  it('logs info about cold start', async () => {
    const eventLog = makeEventLog(0, 0);
    await recoverState(eventLog, makeSnapshotManager(), makeDeps());

    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      'Cold start — no events to replay',
      expect.any(Object),
    );
  });

  it('does not call replayEvents for cold start', async () => {
    const eventLog = makeEventLog(0, 0);
    await recoverState(eventLog, makeSnapshotManager(), makeDeps());

    expect(mocks.replayEvents).not.toHaveBeenCalled();
  });

  it('does not call loadSnapshot for cold start', async () => {
    const eventLog = makeEventLog(0, 0);
    await recoverState(eventLog, makeSnapshotManager(), makeDeps());

    expect(mocks.loadSnapshot).not.toHaveBeenCalled();
  });
});

// ─── Cold start with non-empty file warning ──────────────────────────────

describe('recoverState — sequence=0 but non-empty log (uninitialized EventLog warning)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadSnapshot.mockResolvedValue(null);
    mocks.replayEvents.mockResolvedValue({
      eventsReplayed: 3,
      workflowsRestored: 0,
      agentBindingsRestored: 0,
      triggerCountsRestored: 0,
      lastSequence: 3,
      skippedEvents: 0,
      replayDurationMs: 10,
    });
  });

  it('warns when sequence=0 but file size is non-zero', async () => {
    const eventLog = makeEventLog(0, 1024);
    await recoverState(eventLog, makeSnapshotManager(), makeDeps());

    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.stringContaining('EventLog may not be initialized'),
      expect.objectContaining({ file_size_bytes: 1024 }),
    );
  });

  it('falls through to full replay when sequence=0 but file is non-empty', async () => {
    const eventLog = makeEventLog(0, 1024);
    const result = await recoverState(eventLog, makeSnapshotManager(), makeDeps());

    // Falls through to full_replay path
    expect(result.method).toBe('full_replay');
    expect(mocks.replayEvents).toHaveBeenCalledOnce();
  });

  it('records the warning in result.warnings when sequence=0 but file is non-empty', async () => {
    const eventLog = makeEventLog(0, 1024);
    const result = await recoverState(eventLog, makeSnapshotManager(), makeDeps());

    expect(result.warnings).toBeDefined();
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings?.[0]).toContain('EventLog may not be initialized');
  });
});

// ─── Full replay (no snapshot) ──────────────────────────────────────────

describe('recoverState — full_replay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadSnapshot.mockResolvedValue(null);
    mocks.replayEvents.mockResolvedValue({
      eventsReplayed: 10,
      workflowsRestored: 2,
      agentBindingsRestored: 1,
      triggerCountsRestored: 3,
      lastSequence: 10,
      skippedEvents: 0,
      replayDurationMs: 50,
    });
  });

  it('returns method=full_replay when snapshot is null', async () => {
    const eventLog = makeEventLog(10);
    const result = await recoverState(eventLog, makeSnapshotManager(), makeDeps());

    expect(result.method).toBe('full_replay');
  });

  it('full_replay result has no snapshot field', async () => {
    const eventLog = makeEventLog(10);
    const result = await recoverState(eventLog, makeSnapshotManager(), makeDeps());

    expect(result.snapshot).toBeUndefined();
  });

  it('full_replay result contains replay info', async () => {
    const eventLog = makeEventLog(10);
    const result = await recoverState(eventLog, makeSnapshotManager(), makeDeps());

    expect(result.replay).toMatchObject({
      eventsReplayed: 10,
      workflowsRestored: 2,
      agentBindingsRestored: 1,
      triggerCountsRestored: 3,
      lastSequence: 10,
      skippedEvents: 0,
    });
  });

  it('calls replayEvents with skipActions=true', async () => {
    const eventLog = makeEventLog(10);
    await recoverState(eventLog, makeSnapshotManager(), makeDeps());

    expect(mocks.replayEvents).toHaveBeenCalledWith(
      eventLog,
      expect.any(Object),
      expect.objectContaining({ skipActions: true }),
    );
  });

  it('calls replayEvents without afterSequence (full replay)', async () => {
    const eventLog = makeEventLog(10);
    await recoverState(eventLog, makeSnapshotManager(), makeDeps());

    const opts = mocks.replayEvents.mock.calls[0]?.[2];
    expect(opts?.afterSequence).toBeUndefined();
  });

  it('full_replay result has a non-negative recoveryDurationMs', async () => {
    const eventLog = makeEventLog(10);
    const result = await recoverState(eventLog, makeSnapshotManager(), makeDeps());

    expect(result.recoveryDurationMs).toBeGreaterThanOrEqual(0);
  });

  it('logs info about full replay completion', async () => {
    const eventLog = makeEventLog(10);
    await recoverState(eventLog, makeSnapshotManager(), makeDeps());

    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      'Recovery complete (full replay)',
      expect.objectContaining({ method: 'full_replay' }),
    );
  });

  it('full_replay result has undefined replay when replayEvents throws', async () => {
    mocks.replayEvents.mockRejectedValueOnce(new Error('replay failure'));
    const eventLog = makeEventLog(10);
    const result = await recoverState(eventLog, makeSnapshotManager(), makeDeps());

    expect(result.method).toBe('full_replay');
    expect(result.replay).toBeUndefined();
    expect(mocks.loggerError).toHaveBeenCalledWith(
      'Full event replay failed',
      expect.any(Object),
    );
  });

  it('snapshot load failure falls through to full replay', async () => {
    mocks.loadSnapshot.mockRejectedValueOnce(new Error('snapshot IO error'));
    const eventLog = makeEventLog(10);
    const result = await recoverState(eventLog, makeSnapshotManager(), makeDeps());

    expect(result.method).toBe('full_replay');
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      'Snapshot load failed — will attempt full replay',
      expect.any(Object),
    );
  });
});

// ─── Snapshot + delta replay ────────────────────────────────────────────

describe('recoverState — snapshot_plus_replay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const snapshot = makeSnapshot({ lastEventSequence: 5 });
    mocks.loadSnapshot.mockResolvedValue(snapshot);
    mocks.replayEvents.mockResolvedValue({
      eventsReplayed: 5,
      workflowsRestored: 1,
      agentBindingsRestored: 0,
      triggerCountsRestored: 0,
      lastSequence: 10,
      skippedEvents: 0,
      replayDurationMs: 15,
    });
  });

  it('returns method=snapshot_plus_replay when snapshot is available', async () => {
    const eventLog = makeEventLog(10);
    const result = await recoverState(eventLog, makeSnapshotManager(), makeDeps());

    expect(result.method).toBe('snapshot_plus_replay');
  });

  it('calls restoreFromSnapshot with the loaded snapshot', async () => {
    const eventLog = makeEventLog(10);
    const snapshot = makeSnapshot({ lastEventSequence: 5 });
    mocks.loadSnapshot.mockResolvedValue(snapshot);

    await recoverState(eventLog, makeSnapshotManager(), makeDeps());

    expect(mocks.restoreFromSnapshot).toHaveBeenCalledWith(snapshot, expect.any(Object));
  });

  it('snapshot info correctly reflects snapshot fields', async () => {
    const snapshot = makeSnapshot({
      lastEventSequence: 5,
      timestamp: '2025-01-01T00:00:00.000Z',
      workflows: [{ id: 'wf-1' } as any, { id: 'wf-2' } as any],
      agentWorkflowBindings: { 'a-1': 'wf-1' },
      triggerState: [{ triggerId: 't-1', firesCount: 1 }],
    });
    mocks.loadSnapshot.mockResolvedValue(snapshot);
    const eventLog = makeEventLog(10);

    const result = await recoverState(eventLog, makeSnapshotManager(), makeDeps());

    expect(result.snapshot).toMatchObject({
      timestamp: '2025-01-01T00:00:00.000Z',
      lastEventSequence: 5,
      workflowsRestored: 2,
      agentBindingsRestored: 1,
      triggerStatesRestored: 1,
    });
  });

  it('calls replayEvents with afterSequence=snapshot.lastEventSequence', async () => {
    const eventLog = makeEventLog(10);
    await recoverState(eventLog, makeSnapshotManager(), makeDeps());

    expect(mocks.replayEvents).toHaveBeenCalledWith(
      eventLog,
      expect.any(Object),
      expect.objectContaining({ skipActions: true, afterSequence: 5 }),
    );
  });

  it('result replay info reflects replayEvents return values', async () => {
    const eventLog = makeEventLog(10);
    const result = await recoverState(eventLog, makeSnapshotManager(), makeDeps());

    expect(result.replay).toMatchObject({
      eventsReplayed: 5,
      workflowsRestored: 1,
      lastSequence: 10,
      skippedEvents: 0,
    });
  });

  it('logs info about snapshot+replay completion', async () => {
    const eventLog = makeEventLog(10);
    await recoverState(eventLog, makeSnapshotManager(), makeDeps());

    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      'Recovery complete (snapshot + replay)',
      expect.objectContaining({ method: 'snapshot_plus_replay' }),
    );
  });

  it('has a non-negative recoveryDurationMs', async () => {
    const eventLog = makeEventLog(10);
    const result = await recoverState(eventLog, makeSnapshotManager(), makeDeps());

    expect(result.recoveryDurationMs).toBeGreaterThanOrEqual(0);
  });
});

// ─── Snapshot up-to-date (no delta) ───────────────────────────────────

describe('recoverState — snapshot up-to-date (no delta events)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Snapshot sequence equals latest sequence — no delta to replay
    const snapshot = makeSnapshot({ lastEventSequence: 10 });
    mocks.loadSnapshot.mockResolvedValue(snapshot);
  });

  it('returns method=snapshot_plus_replay even when no delta events exist', async () => {
    const eventLog = makeEventLog(10);
    const result = await recoverState(eventLog, makeSnapshotManager(), makeDeps());

    expect(result.method).toBe('snapshot_plus_replay');
  });

  it('does not call replayEvents when snapshot is up-to-date', async () => {
    const eventLog = makeEventLog(10);
    await recoverState(eventLog, makeSnapshotManager(), makeDeps());

    expect(mocks.replayEvents).not.toHaveBeenCalled();
  });

  it('result has no replay field when no delta events', async () => {
    const eventLog = makeEventLog(10);
    const result = await recoverState(eventLog, makeSnapshotManager(), makeDeps());

    expect(result.replay).toBeUndefined();
  });

  it('logs debug message when snapshot is up-to-date', async () => {
    const eventLog = makeEventLog(10);
    await recoverState(eventLog, makeSnapshotManager(), makeDeps());

    expect(mocks.loggerDebug).toHaveBeenCalledWith('Snapshot is up-to-date — no delta events to replay');
  });
});

// ─── Delta replay failure ───────────────────────────────────────────────

describe('recoverState — delta replay failure after snapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const snapshot = makeSnapshot({ lastEventSequence: 5 });
    mocks.loadSnapshot.mockResolvedValue(snapshot);
    mocks.replayEvents.mockRejectedValue(new Error('delta replay failed'));
  });

  it('still returns method=snapshot_plus_replay even when delta replay fails', async () => {
    const eventLog = makeEventLog(10);
    const result = await recoverState(eventLog, makeSnapshotManager(), makeDeps());

    expect(result.method).toBe('snapshot_plus_replay');
  });

  it('result has no replay field when delta replay throws', async () => {
    const eventLog = makeEventLog(10);
    const result = await recoverState(eventLog, makeSnapshotManager(), makeDeps());

    expect(result.replay).toBeUndefined();
  });

  it('warns about delta replay failure', async () => {
    const eventLog = makeEventLog(10);
    await recoverState(eventLog, makeSnapshotManager(), makeDeps());

    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      'Delta replay failed after snapshot restore',
      expect.any(Object),
    );
  });

  it('snapshot info is still populated even when delta replay fails', async () => {
    const snapshot = makeSnapshot({ lastEventSequence: 5, workflows: [{ id: 'wf-1' } as any] });
    mocks.loadSnapshot.mockResolvedValue(snapshot);
    const eventLog = makeEventLog(10);
    const result = await recoverState(eventLog, makeSnapshotManager(), makeDeps());

    expect(result.snapshot).toMatchObject({
      lastEventSequence: 5,
      workflowsRestored: 1,
    });
  });
});

// ─── General ─────────────────────────────────────────────────────────────────

describe('recoverState — general behaviour', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadSnapshot.mockResolvedValue(null);
    mocks.replayEvents.mockResolvedValue({
      eventsReplayed: 0,
      workflowsRestored: 0,
      agentBindingsRestored: 0,
      triggerCountsRestored: 0,
      lastSequence: 0,
      skippedEvents: 0,
      replayDurationMs: 0,
    });
  });

  it('always logs info at the start of recovery', async () => {
    const eventLog = makeEventLog(5);
    await recoverState(eventLog, makeSnapshotManager(), makeDeps());

    expect(mocks.loggerInfo).toHaveBeenCalledWith('Starting startup recovery');
  });

  it('recoveryDurationMs is always a number', async () => {
    const eventLog = makeEventLog(5);
    const result = await recoverState(eventLog, makeSnapshotManager(), makeDeps());

    expect(typeof result.recoveryDurationMs).toBe('number');
  });

  it('passes deps to replayEvents', async () => {
    const deps = makeDeps();
    const eventLog = makeEventLog(5);
    await recoverState(eventLog, makeSnapshotManager(), deps);

    expect(mocks.replayEvents).toHaveBeenCalledWith(eventLog, deps, expect.any(Object));
  });
});
