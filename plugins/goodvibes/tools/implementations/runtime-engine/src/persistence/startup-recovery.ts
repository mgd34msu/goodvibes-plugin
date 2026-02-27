/**
 * Startup Recovery
 *
 * Coordinates the startup recovery process using a snapshot-first strategy:
 *
 * 1. Try loading a snapshot from the StateStore.
 * 2. If found: restore from snapshot, then replay only delta events
 *    (sequence > snapshot.lastEventSequence) through subsystems.
 * 3. If no snapshot: full replay from the beginning of the EventLog.
 * 4. If no events at all: cold start (no recovery needed).
 *
 * This three-tier approach minimises recovery time for long-running sessions
 * by avoiding full event replay when a recent snapshot is available.
 */

import type { EventLog } from '../events/event-log.js';
import type { SnapshotDeps } from './snapshot-manager.js';
import { SnapshotManager } from './snapshot-manager.js';
import { replayEvents } from './replay-engine.js';
import { createLogger } from '../shared/logger.js';
import { toErrorMessage } from '../shared/utils.js';

const logger = createLogger('startup-recovery');

/** The method used to recover state. */
export type RecoveryMethod = 'snapshot_plus_replay' | 'full_replay' | 'cold_start';

/** Summary of a snapshot-phase result within a recovery. */
export interface SnapshotRecoveryInfo {
  /** ISO-8601 timestamp of the snapshot. */
  timestamp: string;
  /** Event sequence at snapshot time. */
  lastEventSequence: number;
  /** Number of workflow instances from the snapshot. */
  workflowsRestored: number;
  /** Number of agent bindings from the snapshot. */
  agentBindingsRestored: number;
  /** Number of trigger states from the snapshot. */
  triggerStatesRestored: number;
}

/** Summary of the replay phase within a recovery. */
export interface ReplayRecoveryInfo {
  /** Number of events replayed. */
  eventsReplayed: number;
  /** Number of workflow instances restored via replay. */
  workflowsRestored: number;
  /** Number of agent bindings restored via replay. */
  agentBindingsRestored: number;
  /** Number of trigger states restored via replay. */
  triggerCountsRestored: number;
  /** The last event sequence number seen during replay. */
  lastSequence: number;
  /** Events that could not be processed. */
  skippedEvents: number;
}

/** Complete result of a startup recovery operation. */
export interface RecoveryResult {
  /** Which recovery strategy was used. */
  method: RecoveryMethod;
  /** Snapshot info (if snapshot was available). */
  snapshot?: SnapshotRecoveryInfo;
  /** Replay info (if any events were replayed). */
  replay?: ReplayRecoveryInfo;
  /** Total time taken for the recovery operation in ms. */
  recoveryDurationMs: number;
  /**
   * Non-fatal warnings generated during recovery.
   *
   * Examples: EventLog sequence=0 with non-empty log file (possible
   * un-initialised EventLog), snapshot load failure with fallback to replay.
   * Empty when no warnings were produced.
   */
  warnings?: string[];
}

/**
 * Attempts to recover runtime state on startup.
 *
 * Strategy (in order):
 * 1. Load snapshot → restore from snapshot → replay delta events
 * 2. No snapshot → full event replay
 * 3. No events → cold start
 *
 * @param eventLog       - The event log to replay from.
 * @param snapshotManager - The snapshot manager to load snapshots from.
 * @param deps            - The runtime subsystems to populate.
 * @returns A summary of what was recovered.
 */
export async function recoverState(
  eventLog: EventLog,
  snapshotManager: SnapshotManager,
  deps: SnapshotDeps,
): Promise<RecoveryResult> {
  const startMs = Date.now();

  logger.info('Starting startup recovery');

  // Invariant: EventLog must be initialized (via eventLog.initialize()) before
  // recoverState() is called. If getLatestSequence() returns 0, it may mean
  // either (a) truly no events exist (legitimate cold start) or (b) EventLog
  // was not initialized. Check the event log stats as a secondary signal.
  const latestSequence = eventLog.getLatestSequence();
  if (latestSequence === 0) {
    // Secondary check: if the event log file exists and has non-zero size,
    // getLatestSequence() returning 0 likely means EventLog was not initialized.
    // Warn and attempt a full replay anyway so we don't silently skip recovery.
    const stats = eventLog.getStats();
    if (stats.file_size_bytes > 0) {
      const warnMsg =
        'EventLog reports sequence=0 but log file is non-empty — EventLog may not be initialized. ' +
        'Attempting full replay to avoid skipping recovery.';
      logger.warn(warnMsg, { file_size_bytes: stats.file_size_bytes });
      // Fall through to full-replay path below, carrying the warning
      const replayResultWithWarning = await _doFullReplay(eventLog, deps, startMs);
      return { ...replayResultWithWarning, warnings: [warnMsg] };
    } else {
      const result: RecoveryResult = {
        method: 'cold_start',
        recoveryDurationMs: Date.now() - startMs,
      };
      logger.info('Cold start — no events to replay', { recoveryDurationMs: result.recoveryDurationMs });
      return result;
    }
  }

  // Try to load a snapshot
  let snapshot: Awaited<ReturnType<typeof snapshotManager.loadSnapshot>> = null;
  try {
    snapshot = await snapshotManager.loadSnapshot();
  } catch (err) {
    logger.warn('Snapshot load failed — will attempt full replay', { error: toErrorMessage(err) });
  }

  if (snapshot) {
    // Strategy 1: Snapshot + delta replay
    logger.info('Recovering from snapshot + delta replay', {
      snapshotTimestamp: snapshot.timestamp,
      snapshotSequence: snapshot.lastEventSequence,
      currentSequence: latestSequence,
    });

    // Restore from snapshot first
    snapshotManager.restoreFromSnapshot(snapshot, deps);

    const snapshotInfo: SnapshotRecoveryInfo = {
      timestamp: snapshot.timestamp,
      lastEventSequence: snapshot.lastEventSequence,
      workflowsRestored: snapshot.workflows.length,
      agentBindingsRestored: Object.keys(snapshot.agentWorkflowBindings).length,
      triggerStatesRestored: snapshot.triggerState.length,
    };

    // Replay delta events (only events after the snapshot)
    let replayInfo: ReplayRecoveryInfo | undefined;
    if (snapshot.lastEventSequence < latestSequence) {
      try {
        const replayResult = await replayEvents(eventLog, deps, {
          skipActions: true,
          afterSequence: snapshot.lastEventSequence,
        });
        replayInfo = {
          eventsReplayed: replayResult.eventsReplayed,
          workflowsRestored: replayResult.workflowsRestored,
          agentBindingsRestored: replayResult.agentBindingsRestored,
          triggerCountsRestored: replayResult.triggerCountsRestored,
          lastSequence: replayResult.lastSequence,
          skippedEvents: replayResult.skippedEvents,
        };
      } catch (err) {
        logger.warn('Delta replay failed after snapshot restore', { error: toErrorMessage(err) });
      }
    } else {
      logger.debug('Snapshot is up-to-date — no delta events to replay');
    }

    const result: RecoveryResult = {
      method: 'snapshot_plus_replay',
      snapshot: snapshotInfo,
      replay: replayInfo,
      recoveryDurationMs: Date.now() - startMs,
    };

    logger.info('Recovery complete (snapshot + replay)', {
      method: result.method,
      snapshotWorkflows: snapshotInfo.workflowsRestored,
      deltaEventsReplayed: replayInfo?.eventsReplayed ?? 0,
      recoveryDurationMs: result.recoveryDurationMs,
    });

    return result;
  }

  // Strategy 2: Full replay (no snapshot available)
  logger.info('No snapshot available — performing full event replay', {
    totalEvents: latestSequence,
  });

  return _doFullReplay(eventLog, deps, startMs);
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Executes a full event replay and returns a RecoveryResult with
 * method='full_replay'. Shared by the normal full-replay path and the
 * sequence=0/non-empty-file warning path.
 */
async function _doFullReplay(
  eventLog: EventLog,
  deps: SnapshotDeps,
  startMs: number,
): Promise<RecoveryResult> {
  let replayInfo: ReplayRecoveryInfo | undefined;
  try {
    const replayResult = await replayEvents(eventLog, deps, { skipActions: true });
    replayInfo = {
      eventsReplayed: replayResult.eventsReplayed,
      workflowsRestored: replayResult.workflowsRestored,
      agentBindingsRestored: replayResult.agentBindingsRestored,
      triggerCountsRestored: replayResult.triggerCountsRestored,
      lastSequence: replayResult.lastSequence,
      skippedEvents: replayResult.skippedEvents,
    };
  } catch (err) {
    logger.error('Full event replay failed', { error: toErrorMessage(err) });
    // Fall through to cold start result
  }

  const result: RecoveryResult = {
    method: 'full_replay',
    replay: replayInfo,
    recoveryDurationMs: Date.now() - startMs,
  };

  logger.info('Recovery complete (full replay)', {
    method: result.method,
    eventsReplayed: replayInfo?.eventsReplayed ?? 0,
    workflowsRestored: replayInfo?.workflowsRestored ?? 0,
    recoveryDurationMs: result.recoveryDurationMs,
  });

  return result;
}
