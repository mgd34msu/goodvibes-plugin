/**
 * Snapshot Manager
 *
 * Captures point-in-time snapshots of all runtime subsystem state and
 * stores them via the StateStore. Snapshots are used by startup-recovery
 * to reduce the volume of events that must be replayed on restart.
 *
 * Snapshot storage key: `runtime_snapshot`
 * Snapshot format version: 1
 */

import type { StateStore } from './types.js';
import type { WorkflowEngine } from '../workflow/workflow-engine.js';
import type { TriggerRegistry } from '../triggers/trigger-registry.js';
import type { AgentCoordinator } from '../agents/agent-coordinator.js';
import type { AgentWorkflowMap } from '../directives/agent-workflow-map.js';
import type { WorkflowInstance } from '../workflow/types.js';
import type { CoordinatedAgent } from '../agents/types.js';
import { createLogger } from '../shared/logger.js';
import { toErrorMessage } from '../shared/utils.js';

const logger = createLogger('snapshot-manager');

/** Storage key used for the runtime snapshot in StateStore. */
const SNAPSHOT_KEY = 'runtime_snapshot';

/** Current snapshot schema version. Increment when making breaking changes. */
const SNAPSHOT_VERSION = 1;

/** Snapshot of trigger state for a single trigger. */
export interface TriggerStateSnapshot {
  triggerId: string;
  firesCount: number;
  lastFired?: number;
}

/** Agent state snapshot for recovery. */
export interface AgentStateSnapshot {
  id: string;
  type: string;
  task: string;
  status: CoordinatedAgent['status'];
  workflowId?: string;
  wrfcPhase?: CoordinatedAgent['wrfc_phase'];
  startedAt?: string;
  completedAt?: string;
}

/** Full runtime state snapshot. */
export interface RuntimeSnapshot {
  /** Schema version for forward-compatibility checks. */
  version: number;
  /** ISO-8601 timestamp when this snapshot was taken. */
  timestamp: string;
  /**
   * The event log sequence number at snapshot time.
   * Only events with sequence > this value need to be replayed.
   */
  lastEventSequence: number;
  /** All workflow instances (active and terminal) at snapshot time. */
  workflows: WorkflowInstance[];
  /** All agent-to-workflow bindings at snapshot time. */
  agentWorkflowBindings: Record<string, string>;
  /** Trigger fire counts and last-fired timestamps at snapshot time. */
  triggerState: TriggerStateSnapshot[];
  /** Agent state for recovery (active and recently completed agents). */
  agentState: AgentStateSnapshot[];
}

/** Dependencies required to take a snapshot. */
export interface SnapshotDeps {
  workflowEngine: WorkflowEngine | null;
  triggerRegistry: TriggerRegistry | null;
  agentCoordinator: AgentCoordinator | null;
  agentWorkflowMap: AgentWorkflowMap | null;
}

/**
 * Manages point-in-time snapshots of runtime state.
 *
 * Works alongside the EventLog: snapshots reduce the number of events
 * that need to be replayed during recovery by providing a known-good
 * starting point.
 *
 * @example
 * const manager = new SnapshotManager(stateStore);
 * await manager.takeSnapshot(deps, eventLog.getLatestSequence());
 * manager.startPeriodicSnapshots(deps, eventLog, 60_000);
 */
export class SnapshotManager {
  private readonly stateStore: StateStore;
  private periodicTimer: NodeJS.Timeout | null = null;

  constructor(stateStore: StateStore) {
    this.stateStore = stateStore;
  }

  /**
   * Captures a full snapshot of the current runtime state and persists it
   * to the StateStore.
   *
   * @param deps          - The subsystems to snapshot.
   * @param eventSequence - The current event log sequence number.
   */
  async takeSnapshot(deps: SnapshotDeps, eventSequence: number): Promise<void> {
    const startMs = Date.now();

    try {
      const snapshot: RuntimeSnapshot = {
        version: SNAPSHOT_VERSION,
        timestamp: new Date().toISOString(),
        lastEventSequence: eventSequence,
        workflows: captureWorkflowState(deps.workflowEngine),
        agentWorkflowBindings: captureAgentWorkflowBindings(deps.agentWorkflowMap),
        triggerState: captureTriggerState(deps.triggerRegistry),
        agentState: captureAgentState(deps.agentCoordinator),
      };

      await this.stateStore.set(SNAPSHOT_KEY, snapshot);

      logger.info('Runtime snapshot saved', {
        version: snapshot.version,
        lastEventSequence: snapshot.lastEventSequence,
        workflows: snapshot.workflows.length,
        agentBindings: Object.keys(snapshot.agentWorkflowBindings).length,
        triggers: snapshot.triggerState.length,
        durationMs: Date.now() - startMs,
      });
    } catch (err) {
      logger.error('Failed to take runtime snapshot', { error: toErrorMessage(err) });
      throw err;
    }
  }

  /**
   * Loads the most recent snapshot from the StateStore.
   *
   * Returns null if no snapshot exists or if the snapshot fails version
   * validation (allowing fallback to full event replay).
   *
   * @returns The snapshot, or null if not available / incompatible.
   */
  async loadSnapshot(): Promise<RuntimeSnapshot | null> {
    try {
      const raw = await this.stateStore.get<RuntimeSnapshot>(SNAPSHOT_KEY);
      if (!raw) {
        logger.debug('No snapshot found in state store');
        return null;
      }

      // Version check
      if (raw.version !== SNAPSHOT_VERSION) {
        logger.warn('Snapshot version mismatch — discarding', {
          stored: raw.version,
          expected: SNAPSHOT_VERSION,
        });
        return null;
      }

      // Basic structural validation
      if (
        typeof raw.lastEventSequence !== 'number' ||
        !Array.isArray(raw.workflows) ||
        typeof raw.agentWorkflowBindings !== 'object' ||
        !Array.isArray(raw.triggerState)
      ) {
        logger.warn('Snapshot failed structural validation — discarding');
        return null;
      }

      logger.info('Snapshot loaded', {
        timestamp: raw.timestamp,
        lastEventSequence: raw.lastEventSequence,
        workflows: raw.workflows.length,
        triggers: raw.triggerState.length,
      });

      return raw;
    } catch (err) {
      logger.warn('Failed to load snapshot — will fall back to full replay', {
        error: toErrorMessage(err),
      });
      return null;
    }
  }

  /**
   * Starts a periodic snapshot timer that takes a snapshot every `intervalMs`.
   *
   * The timer is unref'd so it does not prevent natural process exit.
   * Call stopPeriodicSnapshots() to cancel.
   *
   * @param deps        - Subsystem dependencies for snapshotting.
   * @param getSequence - Callback that returns the current event sequence number.
   * @param intervalMs  - Interval between snapshots in ms. Defaults to 60,000 (1 min).
   */
  startPeriodicSnapshots(
    deps: SnapshotDeps,
    getSequence: () => number,
    intervalMs = 60_000,
  ): void {
    if (this.periodicTimer) {
      logger.warn('Periodic snapshots already running — call stopPeriodicSnapshots() first');
      return;
    }

    const safeInterval = Math.max(intervalMs, 5_000);
    this.periodicTimer = setInterval(() => {
      const seq = getSequence();
      this.takeSnapshot(deps, seq).catch((err) => {
        logger.warn('Periodic snapshot failed', { error: toErrorMessage(err) });
      });
    }, safeInterval);

    // Unref so the timer does not prevent graceful exit
    this.periodicTimer.unref();
    logger.debug('Periodic snapshots started', { intervalMs: safeInterval });
  }

  /**
   * Stops the periodic snapshot timer.
   */
  stopPeriodicSnapshots(): void {
    if (this.periodicTimer) {
      clearInterval(this.periodicTimer);
      this.periodicTimer = null;
      logger.debug('Periodic snapshots stopped');
    }
  }

  /**
   * Restores runtime subsystem state from a snapshot.
   *
   * This populates WorkflowEngine, AgentWorkflowMap, TriggerRegistry, and
   * AgentCoordinator from the snapshot data without replaying any events.
   *
   * @param snapshot - The snapshot to restore from.
   * @param deps     - The subsystems to populate.
   */
  restoreFromSnapshot(snapshot: RuntimeSnapshot, deps: SnapshotDeps): void {
    logger.info('Restoring from snapshot', {
      timestamp: snapshot.timestamp,
      lastEventSequence: snapshot.lastEventSequence,
    });

    // Restore workflow instances
    if (deps.workflowEngine && snapshot.workflows.length > 0) {
      let restoredCount = 0;
      for (const instance of snapshot.workflows) {
        try {
          deps.workflowEngine.restoreInstance(instance);
          restoredCount++;
        } catch (err) {
          logger.warn('Failed to restore workflow instance from snapshot', {
            id: instance.id,
            error: toErrorMessage(err),
          });
        }
      }
      logger.debug('Workflow instances restored from snapshot', { count: restoredCount });
    }

    // Restore agent-workflow bindings
    if (deps.agentWorkflowMap) {
      const bindingEntries = Object.entries(snapshot.agentWorkflowBindings);
      if (bindingEntries.length > 0) {
        deps.agentWorkflowMap.restoreBindings(snapshot.agentWorkflowBindings);
        logger.debug('Agent-workflow bindings restored from snapshot', { count: bindingEntries.length });
      }
    }

    // Restore trigger state
    if (deps.triggerRegistry && snapshot.triggerState.length > 0) {
      try {
        deps.triggerRegistry.restoreTriggerState(snapshot.triggerState);
        logger.debug('Trigger states restored from snapshot', { count: snapshot.triggerState.length });
      } catch (err) {
        logger.warn('Failed to restore trigger states from snapshot', { error: toErrorMessage(err) });
      }
    }

    logger.info('Snapshot restoration complete');
  }
}

// ---------------------------------------------------------------------------
// Private capture helpers
// ---------------------------------------------------------------------------

function captureWorkflowState(engine: WorkflowEngine | null): WorkflowInstance[] {
  if (!engine) return [];
  try {
    return engine.getAllInstances();
  } catch (err) {
    logger.warn('Failed to capture workflow state', { error: toErrorMessage(err) });
    return [];
  }
}

function captureAgentWorkflowBindings(map: AgentWorkflowMap | null): Record<string, string> {
  if (!map) return {};
  try {
    return map.snapshot();
  } catch (err) {
    logger.warn('Failed to capture agent-workflow bindings', { error: toErrorMessage(err) });
    return {};
  }
}

function captureTriggerState(registry: TriggerRegistry | null): TriggerStateSnapshot[] {
  if (!registry) return [];
  try {
    return registry.getTriggerStates();
  } catch (err) {
    logger.warn('Failed to capture trigger state', { error: toErrorMessage(err) });
    return [];
  }
}

function captureAgentState(coordinator: AgentCoordinator | null): AgentStateSnapshot[] {
  if (!coordinator) return [];
  try {
    return coordinator.getAllAgents().map((agent) => ({
      id: agent.id,
      type: agent.type,
      task: agent.task,
      status: agent.status,
      workflowId: agent.workflow_id,
      wrfcPhase: agent.wrfc_phase,
      startedAt: agent.started_at,
      completedAt: agent.completed_at,
    }));
  } catch (err) {
    logger.warn('Failed to capture agent state', { error: toErrorMessage(err) });
    return [];
  }
}
