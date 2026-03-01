/**
 * CheckpointManager — Layer 2 persistence extension.
 *
 * Manages periodic state checkpointing and event log compaction.
 * Extracted from RuntimeEngine to isolate checkpoint concerns.
 */

import type { RuntimeConfig } from '../../shared/config.js';
import { createLogger } from '../../shared/logger.js';
import { toErrorMessage } from '../../shared/utils.js';
import { Timer } from '../../core/observability/timer.js';
import type { JsonStateStore } from './state-store.js';
import type { EventLog } from '../events/event-log.js';
import type { WorkflowEngine } from '../workflow/workflow-engine.js';
import type { AgentCoordinator } from '../agents/agent-coordinator.js';
import type { HealthChecker } from '../../core/observability/health.js';

const logger = createLogger('checkpoint-manager');

/** How often to write a state checkpoint in milliseconds. */
const CHECKPOINT_INTERVAL_MS = 30_000;

/** Minimum acceptable checkpoint interval in milliseconds (floor guard). */
const MIN_CHECKPOINT_INTERVAL_MS = 1_000;

/**
 * Dependencies required by CheckpointManager.
 * All fields are optional to support partial startup states.
 */
export interface CheckpointManagerDeps {
  stateStore: JsonStateStore;
  eventLog: EventLog;
  healthChecker: HealthChecker;
  workflowEngine?: WorkflowEngine | null;
  agentCoordinator?: AgentCoordinator | null;
  config: RuntimeConfig;
}

/**
 * CheckpointManager handles periodic state snapshots and event log compaction.
 *
 * It writes a lightweight checkpoint to the state store on each interval
 * (pid, uptime, status, memory) and compacts the event log to prevent
 * unbounded growth. It also prunes completed workflows and agents.
 */
export class CheckpointManager {
  private checkpointTimer: Timer | null = null;
  private readonly deps: CheckpointManagerDeps;

  constructor(deps: CheckpointManagerDeps) {
    this.deps = deps;
  }

  /**
   * Start the periodic checkpoint timer.
   * The timer is unref'd so it does not prevent natural process exit.
   */
  start(): void {
    const interval = Math.max(
      this.deps.config.persistence.checkpoint_interval_ms ?? CHECKPOINT_INTERVAL_MS,
      MIN_CHECKPOINT_INTERVAL_MS,
    );
    this.checkpointTimer = new Timer({
      callback: () => {
        this.saveCheckpoint().catch((err) => {
          logger.warn('Periodic checkpoint failed', {
            err: toErrorMessage(err),
          });
        });
        try {
          this.deps.workflowEngine?.prune();
          this.deps.agentCoordinator?.prune();
        } catch (err) {
          logger.warn('Periodic prune failed', { err: toErrorMessage(err) });
        }
      },
      intervalMs: interval,
      label: 'checkpoint',
    });
    this.checkpointTimer.start();
    logger.debug('Checkpoint timer started', { interval_ms: interval });
  }

  /**
   * Stop the periodic checkpoint timer, preventing any further automatic saves.
   */
  stop(): void {
    if (this.checkpointTimer) {
      this.checkpointTimer.stop();
      this.checkpointTimer = null;
      logger.debug('Checkpoint timer stopped');
    }
  }

  /**
   * Save a state checkpoint to the persistent state store.
   *
   * Writes lightweight runtime metadata (pid, uptime, timestamp) so the
   * next startup can detect abnormal termination. Also compacts the event log.
   */
  async saveCheckpoint(): Promise<void> {
    const { stateStore, eventLog, healthChecker } = this.deps;
    if (!stateStore) return;

    const health = healthChecker.check();
    await stateStore.set('runtime.checkpoint', {
      pid: process.pid,
      uptime_ms: health.uptime_ms,
      status: health.status,
      memory_usage_mb: health.memory_usage_mb,
      timestamp: new Date().toISOString(),
    });

    // Compact the event log if it is available
    if (eventLog) {
      try {
        await eventLog.compact();
      } catch (err) {
        logger.warn('Event log compaction failed during checkpoint', {
          err: toErrorMessage(err),
        });
      }
    }
  }
}
