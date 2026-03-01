/**
 * PersistenceSubsystem factory — Layer 2 persistence extension.
 *
 * Creates and initialises the full persistence subsystem:
 * JsonStateStore, CheckpointManager, and SnapshotManager. Also runs
 * startup state recovery and starts periodic snapshots.
 *
 * The returned subsystem exposes a shutdown() method that performs the
 * correct teardown order: stop timers → final snapshot → final checkpoint.
 */

import { createLogger } from '../../shared/logger.js';
import { toErrorMessage } from '../../shared/utils.js';
import type { RuntimeConfig } from '../../shared/config.js';

import type { EventLog } from '../events/event-log.js';
import type { HealthChecker } from '../../core/observability/health.js';
import type { WorkflowEngine } from '../workflow/workflow-engine.js';
import type { AgentCoordinator } from '../agents/agent-coordinator.js';

import { JsonStateStore } from './state-store.js';
import { CheckpointManager } from './checkpoint-manager.js';
import { SnapshotManager } from './snapshot-manager.js';
import type { SnapshotDeps } from './snapshot-manager.js';
import { recoverState } from './startup-recovery.js';

export type { SnapshotDeps };

const logger = createLogger('persistence-subsystem');

/**
 * Dependencies required to create the persistence subsystem.
 */
export interface PersistenceSubsystemDeps {
  config: RuntimeConfig;
  projectRoot: string;
  eventLog: EventLog;
  healthChecker: HealthChecker;
  workflowEngine: WorkflowEngine | null;
  agentCoordinator: AgentCoordinator | null;
  getSnapshotDeps: () => SnapshotDeps;
}

/**
 * The persistence subsystem: state store, checkpoint, and snapshot management.
 */
export interface PersistenceSubsystem {
  stateStore: JsonStateStore;
  checkpointManager: CheckpointManager;
  snapshotManager: SnapshotManager;
  /** Stop timers, take final snapshot, save final checkpoint. */
  shutdown(): Promise<void>;
}

/**
 * Create and initialise the persistence subsystem.
 *
 * Steps:
 * 1. Create + initialise JsonStateStore.
 * 2. Create + start CheckpointManager.
 * 3. Create SnapshotManager.
 * 4. Run startup state recovery (recoverState).
 * 5. Start periodic snapshots (60 s interval).
 *
 * @param deps - All external deps the persistence subsystem requires.
 */
export async function createPersistenceSubsystem(
  deps: PersistenceSubsystemDeps,
): Promise<PersistenceSubsystem> {
  const { config, projectRoot, eventLog, healthChecker, workflowEngine, agentCoordinator, getSnapshotDeps } = deps;

  // 1. State store
  const stateStore = new JsonStateStore(config, projectRoot);
  await stateStore.initialize();
  logger.debug('State store initialised');

  // 2. Checkpoint manager
  const checkpointManager = new CheckpointManager({
    stateStore,
    eventLog,
    healthChecker,
    workflowEngine,
    agentCoordinator,
    config,
  });
  checkpointManager.start();
  logger.debug('Checkpoint timer started');

  // 3. Snapshot manager
  const snapshotManager = new SnapshotManager(stateStore);

  // 4. Startup state recovery
  try {
    const recoveryResult = await recoverState(
      eventLog,
      snapshotManager,
      getSnapshotDeps(),
    );
    logger.info('Startup recovery complete', {
      method: recoveryResult.method,
      durationMs: recoveryResult.recoveryDurationMs,
    });
  } catch (err) {
    logger.warn('Startup recovery failed — continuing with cold start', {
      err: toErrorMessage(err),
    });
  }

  // 5. Periodic snapshots
  snapshotManager.startPeriodicSnapshots(
    getSnapshotDeps(),
    () => eventLog.getLatestSequence(),
    60_000,
  );

  // Shutdown: stop timers, take final snapshot, save final checkpoint
  async function shutdown(): Promise<void> {
    checkpointManager.stop();
    snapshotManager.stopPeriodicSnapshots();

    try {
      await snapshotManager.takeSnapshot(
        getSnapshotDeps(),
        eventLog.getLatestSequence(),
      );
      logger.debug('Final snapshot saved');
    } catch (err) {
      logger.warn('Final snapshot failed', { err: toErrorMessage(err) });
    }

    try {
      await checkpointManager.saveCheckpoint();
      logger.debug('Final checkpoint saved');
    } catch (err) {
      logger.warn('Final checkpoint failed', { err: toErrorMessage(err) });
    }
  }

  return { stateStore, checkpointManager, snapshotManager, shutdown };
}
