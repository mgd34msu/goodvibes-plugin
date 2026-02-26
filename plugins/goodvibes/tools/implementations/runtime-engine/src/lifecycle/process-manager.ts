/**
 * ProcessManager — lifecycle orchestration for the runtime engine.
 *
 * Responsibilities:
 * - Loading and merging runtime configuration from disk
 * - Initialising the JsonStateStore for persistent state
 * - Writing and cleaning up a PID lock file
 * - Running periodic state checkpoints
 * - Coordinating graceful startup and shutdown sequences
 */

import { writeFileSync, readFileSync, unlinkSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import type { RuntimeConfig } from '../shared/config.js';
import { loadConfig } from '../shared/config.js';
import { ENGINE_VERSION } from '../shared/constants.js';
import { createLogger } from '../shared/logger.js';
import { JsonStateStore } from '../persistence/state-store.js';
import { HealthChecker } from './health.js';
import { EventBus } from '../events/event-bus.js';
import { EventLog } from '../events/event-log.js';
import { EventQueue } from '../events/event-queue.js';
import { generateEventId, timestamp, toErrorMessage } from '../shared/utils.js';
import { IPCServer } from '../ipc/ipc-server.js';
import { IPCRouter } from '../ipc/ipc-router.js';
import { WorkflowEngine } from '../workflow/workflow-engine.js';
import {
  WRFC_LOOP_DEFINITION,
  FIX_LOOP_DEFINITION,
  TEST_THEN_FIX_DEFINITION,
  REVIEW_ONLY_DEFINITION,
  loadCustomWorkflows,
} from '../workflow/index.js';
import { TriggerRegistry } from '../triggers/trigger-registry.js';
import { getBuiltinTriggers } from '../triggers/builtins.js';
import { AgentCoordinator } from '../agents/agent-coordinator.js';
import { BudgetTracker } from '../agents/budget-tracker.js';
import {
  DirectiveQueue,
  registerWRFCHandlers,
  registerTestFixHandlers,
  registerReviewOnlyHandlers,
  AgentWorkflowMap,
} from '../directives/index.js';
import { SnapshotManager, recoverState } from '../persistence/index.js';

// ─── v3 Core imports (aliased to avoid collision with v2 names) ────────────────
import {
  EventQueue as CoreEventQueue,
  TriggerRegistry as CoreTriggerRegistry,
  CoreStateStore,
  LoopLifecycleManager,
  EventMetrics,
  DeadLetterQueue,
  ErrorHandler,
  EventProcessor,
} from '../core/index.js';

// ─── v3 Plugin imports ─────────────────────────────────────────────────────────
// Imported from barrel (plugins/index.js) for a stable, unified public surface.
import {
  registerWRFCPlugin,
  getDefaultWRFCConfig,
  HookProcessor,
  HookRegistry,
  registerDefaultHandlers,
  TimePlugin,
  getDefaultTimeConfig,
  ExternalPlugin,
  createDefaultExternalPluginConfig,
} from '../plugins/index.js';

const logger = createLogger('process-manager');

/** How often to write a state checkpoint in milliseconds. */
const CHECKPOINT_INTERVAL_MS = 30_000;

/**
 * Returns a PID file path that is unique per project root.
 * Uses a short SHA-256 hash of the project root to avoid collisions
 * when multiple projects run the runtime-engine concurrently.
 *
 * @param projectRoot - Absolute path to the project root.
 * @returns Absolute path to the PID lock file.
 */
function getPidFilePath(projectRoot: string): string {
  const hash = createHash('sha256').update(projectRoot).digest('hex').slice(0, 8);
  return join(tmpdir(), `goodvibes-runtime-engine-${hash}-${process.pid}.pid`);
}

/**
 * ProcessManager orchestrates the full startup and shutdown lifecycle of the
 * runtime engine, managing configuration, state persistence, PID locking,
 * and periodic checkpointing.
 */
export class ProcessManager {
  /** Unix epoch millisecond timestamp recorded at startup. */
  private readonly startTime: number;

  /** Merged runtime configuration (defaults + disk overrides). */
  private config: RuntimeConfig;

  /** Persistent JSON state store. */
  private stateStore!: JsonStateStore;

  /** Health checker bound to this manager's config and start time. */
  private readonly healthChecker: HealthChecker;

  /** NodeJS timer handle for the periodic checkpoint. */
  private checkpointTimer?: NodeJS.Timeout;

  /** Whether startup() has successfully completed. */
  private running = false;

  /** Absolute path to the project root, used to locate config on disk. */
  private readonly projectRoot: string;

  /** Event bus for in-process pub/sub. */
  private eventBus!: EventBus;

  /** Persistent JSONL event log. */
  private eventLog!: EventLog;

  /** Priority event queue for deferred processing. */
  private eventQueue!: EventQueue;

  /** Unix domain socket IPC server (only active when ipc_enabled). */
  private ipcServer: IPCServer | null = null;

  /** IPC router instance (kept for session pointer cleanup on shutdown). */
  private ipcRouter: IPCRouter | null = null;

  /** Workflow state machine engine. */
  private workflowEngine: WorkflowEngine | null = null;

  /** Event trigger registry. */
  private triggerRegistry: TriggerRegistry | null = null;

  /** Agent coordinator for workflow-aware agent management. */
  private agentCoordinator: AgentCoordinator | null = null;

  /** Budget tracker for agent spending. */
  private budgetTracker: BudgetTracker | null = null;

  /** Directive queue for WRFC orchestration messages. */
  private directiveQueue: DirectiveQueue | null = null;

  /** Agent-to-workflow binding map for deterministic WRFC chain routing. */
  private agentWorkflowMap: AgentWorkflowMap | null = null;

  /** Snapshot manager for periodic state snapshots and recovery. */
  private snapshotManager: SnapshotManager | null = null;

  // ─── v3 Core components ──────────────────────────────────────────────────────

  /** v3 core event queue (priority-heap based, separate from v2 EventQueue). */
  private v3EventQueue: CoreEventQueue | null = null;

  /** v3 core trigger registry (interface-compatible v3 design). */
  private v3TriggerRegistry: CoreTriggerRegistry | null = null;

  /** v3 core state store (lightweight in-memory + file store). */
  private v3StateStore: CoreStateStore | null = null;

  /** v3 core event processor (drives trigger evaluation from the queue). */
  private v3EventProcessor: EventProcessor | null = null;

  // ─── v3 Plugin instances ─────────────────────────────────────────────────────

  /** v3 HookProcessor: bridges IPC hook events to the v3 plugin layer. */
  private v3HookProcessor: HookProcessor | null = null;

  /** v3 HookRegistry: holds registered hook handlers. */
  private v3HookRegistry: HookRegistry | null = null;

  /** v3 TimePlugin: emits heartbeat and scheduled events on each tick. */
  private v3TimePlugin: TimePlugin | null = null;

  /** v3 ExternalPlugin: ingests file-drop and HTTP webhook events. */
  private v3ExternalPlugin: ExternalPlugin | null = null;

  /** NodeJS timer handle for the v3 tick loop. */
  private v3TickTimer?: NodeJS.Timeout;

  /**
   * @param config - Initial runtime configuration (merged with disk values
   *   during startup()).
   * @param projectRoot - Absolute path to the project root directory. Defaults
   *   to process.cwd() when omitted.
   */
  constructor(config: RuntimeConfig, projectRoot: string = process.cwd()) {
    this.startTime = Date.now();
    this.config = config;
    this.projectRoot = projectRoot;
    this.healthChecker = new HealthChecker(this.config, this.startTime);
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  /**
   * Perform the full startup sequence:
   * 1. Load configuration from disk and merge with defaults.
   * 2. Initialise the persistent state store.
   * 3. Check for and handle any previous crash recovery state.
   * 4. Write the PID lock file.
   * 5. Start the periodic checkpoint timer.
   *
   * @throws If any critical startup step fails.
   */
  async startup(): Promise<void> {
    logger.info('Starting up');

    // 1. Load config from disk (merge with defaults already applied)
    try {
      const diskConfig = loadConfig(this.projectRoot);
      this.config = diskConfig;
      logger.debug('Configuration loaded', { version: ENGINE_VERSION });
    } catch (err) {
      logger.warn('Could not load config from disk — using defaults', {
        err: toErrorMessage(err),
      });
    }

    // 2. Initialise state store
    this.stateStore = new JsonStateStore(this.config, this.projectRoot);
    await this.stateStore.initialize();
    logger.debug('State store initialised');

    // 3. Initialise event system
    this.eventBus = new EventBus();
    const stateDir = join(this.projectRoot, this.config.persistence.state_dir);
    mkdirSync(stateDir, { recursive: true });
    this.eventLog = new EventLog(stateDir, this.config.persistence);
    await this.eventLog.initialize();
    this.eventBus.setEventLog(this.eventLog);
    this.eventQueue = new EventQueue(this.config.queue);
    this.eventQueue.start();
    logger.debug('Event system initialised');

    // 4. Check for crash recovery
    await this.checkCrashRecovery();

    // 5. Write PID lock file
    this.writePidFile();

    // 6. Start periodic checkpoint timer
    this.startCheckpointTimer();

    // 7. Initialise workflow engine and trigger registry
    if (this.config.features.workflows_enabled) {
      this.workflowEngine = new WorkflowEngine(this.config.workflows);
      this.workflowEngine.setEventBus(this.eventBus);
      this.workflowEngine.registerDefinition(WRFC_LOOP_DEFINITION);
      this.workflowEngine.registerDefinition(FIX_LOOP_DEFINITION);
      this.workflowEngine.registerDefinition(TEST_THEN_FIX_DEFINITION);
      this.workflowEngine.registerDefinition(REVIEW_ONLY_DEFINITION);
      this.workflowEngine.registerGuard('checkReviewScore', (context) => {
        const threshold = typeof context.min_review_score === 'number' && Number.isFinite(context.min_review_score as number) ? context.min_review_score as number : 9.5;
        return typeof context.review_score === 'number' && context.review_score >= threshold;
      });

      // Load and register user-defined custom workflows from goodvibes.json
      try {
        const customDefinitions = await loadCustomWorkflows(this.projectRoot);
        for (const def of customDefinitions) {
          this.workflowEngine.registerDefinition(def);
          logger.info('Custom workflow definition registered', { id: def.id, name: def.name });
        }
        logger.debug('Custom workflow definitions loaded', { count: customDefinitions.length });
      } catch (err) {
        logger.warn('Failed to load custom workflow definitions — continuing without them', {
          err: toErrorMessage(err),
        });
      }

      logger.debug('Workflow engine initialised');
    }

    this.triggerRegistry = new TriggerRegistry(this.config.triggers);
    this.directiveQueue = new DirectiveQueue();
    this.triggerRegistry.setDependencies(this.eventBus, this.directiveQueue, this.workflowEngine);
    for (const trigger of getBuiltinTriggers()) {
      this.triggerRegistry.register(trigger);
    }

    this.eventBus.on('*', async (event: import('../events/types.js').RuntimeEvent) => {
      // IPC hook events are evaluated explicitly in the IPC handler (awaited for timing)
      // Skip them here to prevent double evaluation
      if (event.source?.kind === 'hook') return;
      try {
        if (this.triggerRegistry) {
          await this.triggerRegistry.evaluate(event);
        }
      } catch (err) {
        logger.warn('Trigger evaluation error', { error: toErrorMessage(err) });
      }
    });
    logger.debug('Trigger registry initialised');

    // 8. Initialise agent coordinator if enabled
    if (this.config.features.agents_enabled) {
      this.budgetTracker = new BudgetTracker(this.eventBus, this.config.agents);
      this.agentCoordinator = new AgentCoordinator(
        this.eventBus,
        this.budgetTracker,
        this.config.agents
      );
      logger.debug('Agent coordinator initialised');
    }

    // Register WRFC automation handlers (must be after AgentCoordinator init)
    this.agentWorkflowMap = new AgentWorkflowMap();
    registerWRFCHandlers(
      this.triggerRegistry,
      this.directiveQueue,
      this.workflowEngine,
      this.agentCoordinator,
      this.agentWorkflowMap,
    );
    registerTestFixHandlers(
      this.triggerRegistry,
      this.directiveQueue,
      this.workflowEngine,
      this.agentWorkflowMap,
    );
    registerReviewOnlyHandlers(
      this.triggerRegistry,
      this.directiveQueue,
      this.workflowEngine,
      this.agentWorkflowMap,
    );

    // 9. Initialise snapshot manager and perform startup recovery
    this.snapshotManager = new SnapshotManager(this.stateStore);
    try {
      const recoveryResult = await recoverState(
        this.eventLog,
        this.snapshotManager,
        this.getSnapshotDeps(),
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

    // Start periodic snapshots (every 60s)
    this.snapshotManager.startPeriodicSnapshots(
      this.getSnapshotDeps(),
      () => this.eventLog.getLatestSequence(),
      60_000,
    );

    // 10. Initialize v3 plugins (additive — runs alongside v2 subsystems)
    // Must run before IPC server so HookProcessor is available for router wiring.
    await this.initializeV3Plugins();

    // 11. Start IPC server if enabled
    let ipcSocketPath: string | null = null;
    if (this.config.features.ipc_enabled) {
      ipcSocketPath = await this.startIPCServer();
    } else {
      logger.debug('IPC server disabled by feature flag');
    }

    // 12. Start v3 tick timer
    this.startV3TickTimer();

    // 13. Emit startup event
    this.eventBus.emit({
      id: generateEventId(),
      timestamp: timestamp(),
      type: 'system:startup',
      source: { kind: 'system' },
      payload: {
        type: 'system:startup',
        data: {
          pid: process.pid,
          uptime_ms: 0,
          ipc_enabled: this.config.features.ipc_enabled,
          ipc_socket: ipcSocketPath ?? undefined,
        },
      },
    });

    this.running = true;
    logger.info('Startup complete', {
      pid: process.pid,
      uptime_ms: this.getUptime(),
    });
  }

  /**
   * Perform a graceful shutdown sequence:
   * 1. Stop the checkpoint timer.
   * 2. Save a final state checkpoint.
   * 3. Remove the PID lock file.
   *
   * @param timeout_ms - Maximum time to allow for the full shutdown sequence
   *   before forcing process exit.
   */
  async shutdown(timeout_ms = 10_000): Promise<void> {
    logger.info('Shutting down', { timeout_ms });

    // Start a watchdog that force-exits if shutdown exceeds timeout_ms.
    const watchdog = setTimeout(() => {
      logger.error('Shutdown timed out — forcing exit', { timeout_ms });
      process.exit(1);
    }, timeout_ms);
    watchdog.unref();

    try {
      // 1. Cancel all active workflows
      if (this.workflowEngine) {
        for (const instance of this.workflowEngine.listActive()) {
          try {
            this.workflowEngine.cancel(instance.id, 'engine shutdown');
          } catch (err) {
            logger.warn('Failed to cancel workflow during shutdown', {
              id: instance.id,
              err: toErrorMessage(err),
            });
          }
        }
        logger.debug('Active workflows cancelled');
      }

      // 2. Stop checkpoint and v3 tick timers, and periodic snapshots
      this.stopCheckpointTimer();
      this.stopV3TickTimer();
      this.cleanupV3Plugins();
      if (this.snapshotManager) {
        this.snapshotManager.stopPeriodicSnapshots();
      }

      // 3. Emit shutdown event (before draining)
      if (this.eventBus) {
        try {
          this.eventBus.emit({
            id: generateEventId(),
            timestamp: timestamp(),
            type: 'system:shutdown',
            source: { kind: 'system' },
            payload: { type: 'system:shutdown', data: { uptime_ms: this.getUptime() } },
          });
        } catch (err) {
          logger.warn('Failed to emit shutdown event', {
            err: toErrorMessage(err),
          });
        }
      }

      // 4. Close IPC server
      if (this.ipcServer) {
        try {
          await this.ipcServer.close();
          this.removeSocketPointerFile();
          if (this.ipcRouter) {
            this.ipcRouter.removeSessionPointers();
            this.ipcRouter = null;
          }
          this.ipcServer = null;
          logger.debug('IPC server closed');
        } catch (err) {
          logger.warn('IPC server close failed', {
            err: toErrorMessage(err),
          });
        }
      }

      // 5. Drain and stop the event queue
      if (this.eventQueue) {
        try {
          await this.eventQueue.drain(5_000);
          this.eventQueue.stop();
          logger.debug('Event queue drained and stopped');
        } catch (err) {
          logger.warn('Event queue drain failed', {
            err: toErrorMessage(err),
          });
        }
      }

      // 6. Remove all event bus listeners
      if (this.eventBus) {
        this.eventBus.removeAllListeners();
      }

      // 7. Flush event log buffer before final checkpoint
      if (this.eventLog) {
        try {
          await this.eventLog.flush();
          logger.debug('Event log flushed');
        } catch (err) {
          logger.warn('Event log flush failed during shutdown', {
            err: toErrorMessage(err),
          });
        }
      }

      // 8. Save final snapshot + checkpoint
      if (this.snapshotManager && this.eventLog) {
        try {
          await this.snapshotManager.takeSnapshot(
            this.getSnapshotDeps(),
            this.eventLog.getLatestSequence(),
          );
          logger.debug('Final snapshot saved');
        } catch (err) {
          logger.warn('Final snapshot failed', { err: toErrorMessage(err) });
        }
      }
      try {
        await this.saveCheckpoint();
        logger.debug('Final checkpoint saved');
      } catch (err) {
        logger.warn('Final checkpoint failed', {
          err: toErrorMessage(err),
        });
      }

      // 9. Close event log write stream
      if (this.eventLog) {
        try {
          await this.eventLog.close();
          logger.debug('Event log closed');
        } catch (err) {
          logger.warn('Event log close failed during shutdown', {
            err: toErrorMessage(err),
          });
        }
      }

      // 10. Remove PID lock file
      this.removePidFile();

      this.running = false;
      logger.info('Shutdown complete');
    } finally {
      clearTimeout(watchdog);
    }
  }

  // ─── Accessors ──────────────────────────────────────────────────────────────

  /**
   * Return the number of milliseconds the engine has been running.
   *
   * @returns Uptime in milliseconds.
   */
  getUptime(): number {
    return Date.now() - this.startTime;
  }

  /**
   * Return the merged runtime configuration.
   *
   * @returns Current RuntimeConfig.
   */
  getConfig(): RuntimeConfig {
    return this.config;
  }

  /**
   * Return the persistent state store.
   *
   * @returns JsonStateStore instance.
   * @throws If called before startup() has completed.
   */
  getStateStore(): JsonStateStore {
    if (!this.stateStore) {
      throw new Error('ProcessManager.getStateStore() called before startup()');
    }
    return this.stateStore;
  }

  /**
   * Return the HealthChecker bound to this manager.
   *
   * @returns HealthChecker instance.
   */
  getHealthChecker(): HealthChecker {
    return this.healthChecker;
  }

  /**
   * Update the in-memory runtime configuration.
   *
   * Called after a config key is set or a reset is performed to keep
   * the in-memory state consistent with the persisted configuration.
   *
   * @param config - The new {@link RuntimeConfig} to apply.
   */
  updateConfig(config: RuntimeConfig): void {
    this.config = config;
    this.healthChecker.updateConfig(config);
    if (this.agentCoordinator) {
      this.agentCoordinator.updateConfig(config.agents);
    }
  }

  /**
   * Return the project root path used by this manager.
   *
   * @returns Absolute path to the project root.
   */
  getProjectRoot(): string {
    return this.projectRoot;
  }

  /**
   * Return whether the engine is in the running state.
   *
   * @returns True if startup() has completed and shutdown() has not started.
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Return the event bus.
   *
   * @throws If called before startup() has completed.
   */
  getEventBus(): EventBus {
    if (!this.eventBus) {
      throw new Error('ProcessManager.getEventBus() called before startup()');
    }
    return this.eventBus;
  }

  /**
   * Return the persistent event log.
   *
   * @throws If called before startup() has completed.
   */
  getEventLog(): EventLog {
    if (!this.eventLog) {
      throw new Error('ProcessManager.getEventLog() called before startup()');
    }
    return this.eventLog;
  }

  /**
   * Return the event queue.
   *
   * @throws If called before startup() has completed.
   */
  getEventQueue(): EventQueue {
    if (!this.eventQueue) {
      throw new Error('ProcessManager.getEventQueue() called before startup()');
    }
    return this.eventQueue;
  }

  /**
   * Return the IPC server if it was started, or null if IPC is disabled.
   */
  getIPCServer(): IPCServer | null {
    return this.ipcServer;
  }

  /**
   * Return the workflow engine, or null if workflows are disabled.
   *
   * @throws If called before startup() has completed.
   */
  getWorkflowEngine(): WorkflowEngine | null {
    return this.workflowEngine;
  }

  /**
   * Return the trigger registry.
   *
   * @throws If called before startup() has completed.
   */
  getTriggerRegistry(): TriggerRegistry | null {
    return this.triggerRegistry;
  }

  /**
   * Return the agent coordinator, or null if agents are disabled.
   */
  getAgentCoordinator(): AgentCoordinator | null {
    return this.agentCoordinator;
  }

  /**
   * Return the directive queue, or null if it has not been initialised.
   */
  getDirectiveQueue(): DirectiveQueue | null {
    return this.directiveQueue;
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  /**
   * Check whether a stale PID file exists from a previous crash and, if so,
   * log a recovery notice. The stale file is removed to allow clean startup.
   */
  private async checkCrashRecovery(): Promise<void> {
    const pidFilePath = getPidFilePath(this.projectRoot);
    if (!existsSync(pidFilePath)) return;

    try {
      const stalePid = readFileSync(pidFilePath, 'utf-8').trim();
      const currentPid = String(process.pid);

      if (stalePid !== currentPid) {
        const pid = Number(stalePid);
        if (Number.isNaN(pid) || pid <= 0 || !Number.isInteger(pid)) {
          logger.warn('Stale PID file contains invalid data — removing', {
            content: stalePid.slice(0, 20),
            pid_file: pidFilePath,
          });
          this.removePidFile();
          return;
        }

        let staleProcessAlive = false;
        try {
          process.kill(pid, 0); // Signal 0 = check existence without killing
          staleProcessAlive = true;
        } catch {
          // Process not running — safe to proceed
        }

        if (staleProcessAlive) {
          logger.warn('Stale PID file points to a running process — another instance may be active', {
            stale_pid: stalePid,
            pid_file: pidFilePath,
          });
        } else {
          logger.warn('Stale PID file detected — possible crash recovery', {
            stale_pid: stalePid,
          });
        }
        // Remove stale lock so writePidFile() starts fresh
        this.removePidFile();
      }
    } catch (err) {
      logger.warn('Could not read stale PID file', {
        err: toErrorMessage(err),
      });
    }
  }

  /**
   * Write the current process PID to the lock file.
   * Silently ignores write errors to prevent blocking startup.
   */
  private writePidFile(): void {
    const pidFilePath = getPidFilePath(this.projectRoot);
    try {
      writeFileSync(pidFilePath, String(process.pid), { encoding: 'utf-8', mode: 0o600 });
      logger.debug('PID file written', { path: pidFilePath, pid: process.pid });
    } catch (err) {
      logger.warn('Could not write PID file', {
        err: toErrorMessage(err),
      });
    }
  }

  /**
   * Remove the PID lock file.
   * Silently ignores errors (e.g. file already removed).
   */
  private removePidFile(): void {
    const pidFilePath = getPidFilePath(this.projectRoot);
    try {
      unlinkSync(pidFilePath);
      logger.debug('PID file removed', { path: pidFilePath });
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.warn('Could not remove PID file', { err: toErrorMessage(err) });
      }
    }
  }

  /**
   * Start the periodic checkpoint timer.
   * The timer is unref'd so it does not prevent natural process exit.
   */
  private startCheckpointTimer(): void {
    const interval = Math.max(this.config.persistence.checkpoint_interval_ms ?? CHECKPOINT_INTERVAL_MS, 1000);
    this.checkpointTimer = setInterval(() => {
      this.saveCheckpoint().catch((err) => {
        logger.warn('Periodic checkpoint failed', {
          err: toErrorMessage(err),
        });
      });
      try {
        this.workflowEngine?.prune();
        this.agentCoordinator?.prune();
      } catch (err) {
        logger.warn('Periodic prune failed', { err: toErrorMessage(err) });
      }
    }, interval);

    // Unref so the timer does not prevent graceful exit
    this.checkpointTimer.unref();
    logger.debug('Checkpoint timer started', { interval_ms: interval });
  }

  /**
   * Stop the periodic checkpoint timer, preventing any further automatic saves.
   */
  private stopCheckpointTimer(): void {
    if (this.checkpointTimer) {
      clearInterval(this.checkpointTimer);
      this.checkpointTimer = undefined;
      logger.debug('Checkpoint timer stopped');
    }
  }

  /**
   * Build the SnapshotDeps object from current subsystem state.
   *
   * Extracted to a helper to avoid duplicating the same literal object
   * in startup recovery, periodic snapshots, and shutdown snapshot paths.
   *
   * @returns SnapshotDeps with current subsystem references.
   */
  private getSnapshotDeps() {
    return {
      workflowEngine: this.workflowEngine,
      triggerRegistry: this.triggerRegistry,
      agentCoordinator: this.agentCoordinator,
      agentWorkflowMap: this.agentWorkflowMap,
    };
  }

  /**
   * Start the IPC server, bind it to a session-scoped socket path, and write
   * the socket path to the state directory so hooks can discover it.
   *
   * @returns The absolute socket path, or null if startup fails.
   */
  private async startIPCServer(): Promise<string | null> {
    const stateDir = join(this.projectRoot, this.config.persistence.state_dir);
    const socketDir = this.config.ipc.socket_dir;

    // Derive a session-scoped socket filename from a hash of the project root + PID
    // Including the PID ensures multiple concurrent sessions for the same project
    // each get a unique socket path.
    const hash = createHash('sha256').update(this.projectRoot).digest('hex').slice(0, 8);
    const socketPath = join(socketDir, `goodvibes-runtime-${hash}-${process.pid}.sock`);

    try {
      this.ipcServer = new IPCServer(socketPath);

      // Wire IPC message routing via dedicated IPCRouter
      this.ipcRouter = new IPCRouter({
        eventBus: this.eventBus,
        triggerRegistry: this.triggerRegistry,
        workflowEngine: this.workflowEngine,
        agentCoordinator: this.agentCoordinator,
        directiveQueue: this.directiveQueue,
        socketPath,
        stateDir,
        agentWorkflowMap: this.agentWorkflowMap,
        // Bridge v2→v3: route hook events through v3 HookProcessor when available
        hookProcessor: this.v3HookProcessor ?? null,
      });
      this.ipcServer.onMessage(this.ipcRouter.route.bind(this.ipcRouter));

      // Pre-create socket directory with owner-only permissions (belt-and-suspenders)
      mkdirSync(socketDir, { recursive: true, mode: 0o700 });
      await this.ipcServer.listen();

      // Write socket path to per-PID pointer file for hook discovery.
      // Using a per-PID file (rather than a single shared file) allows multiple
      // concurrent sessions for the same project to coexist.
      mkdirSync(stateDir, { recursive: true });
      const pointerFile = join(stateDir, `runtime-${process.pid}.socket`);
      writeFileSync(pointerFile, socketPath, 'utf-8');

      logger.info('IPC server started', { socket: socketPath });
      return socketPath;
    } catch (err) {
      logger.error('Failed to start IPC server', {
        socket: socketPath,
        err: toErrorMessage(err),
      });
      this.ipcServer = null;
      return null;
    }
  }

  /**
   * Remove the socket pointer file written during {@link startIPCServer}.
   * Silently ignores errors (e.g. file already removed).
   */
  private removeSocketPointerFile(): void {
    const pointerFile = join(
      this.projectRoot,
      this.config.persistence.state_dir,
      `runtime-${process.pid}.socket`
    );
    try {
      unlinkSync(pointerFile);
      logger.debug('Socket pointer file removed', { path: pointerFile });
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.warn('Could not remove socket pointer file', {
          path: pointerFile,
          err: toErrorMessage(err),
        });
      }
    }
  }

  /**
   * Save a state checkpoint to the persistent state store.
   *
   * Writes lightweight runtime metadata (pid, uptime, timestamp) so the
   * next startup can detect abnormal termination.
   */
  private async saveCheckpoint(): Promise<void> {
    if (!this.stateStore) return;

    const health = this.healthChecker.check();
    await this.stateStore.set('runtime.checkpoint', {
      pid: process.pid,
      uptime_ms: this.getUptime(),
      status: health.status,
      memory_usage_mb: health.memory_usage_mb,
      timestamp: new Date().toISOString(),
    });

    // Compact the event log if it is available
    if (this.eventLog) {
      try {
        await this.eventLog.compact();
      } catch (err) {
        logger.warn('Event log compaction failed during checkpoint', {
          err: toErrorMessage(err),
        });
      }
    }
  }

  // ─── v3 Initialization ─────────────────────────────────────────────────────────

  // TODO: Unit tests for v3 lifecycle methods (initializeV3Plugins, cleanupV3Plugins,
  // startV3TickTimer, tickV3) are not yet written. These methods depend on heavy
  // constructor dependencies (EventProcessor, TimePlugin, ExternalPlugin) that require
  // additional test scaffolding. Tracked for follow-up in the test coverage backlog.

  /**
   * Initialize all v3 core components and Layer 3 plugins.
   *
   * This runs alongside the v2 system — it is purely additive.
   * Failure of any v3 component is logged and swallowed to preserve
   * v2 backward compatibility; the engine degrades gracefully.
   *
   * Initialization order:
   *   1. v3 core: EventQueue
   *   2. v3 core: TriggerRegistry
   *   3. v3 core: CoreStateStore
   *   4. v3 core: LoopLifecycleManager, EventMetrics, DeadLetterQueue, ErrorHandler
   *   5. v3 core: EventProcessor (wires the above together)
   *   6. WRFC plugin: registers triggers and handlers with the v3 processor
   *   7. Hooks plugin: HookRegistry + HookProcessor + default handlers
   *   8. Time plugin: heartbeat + scheduler
   *   9. External plugin: file-drop ingestion (initialize dirs)
   */
  private async initializeV3Plugins(): Promise<void> {
    try {
      // 1. v3 core: EventQueue (priority-heap, separate from v2 EventQueue)
      this.v3EventQueue = new CoreEventQueue();

      // 2. v3 core: TriggerRegistry
      this.v3TriggerRegistry = new CoreTriggerRegistry();

      // 3. v3 core: CoreStateStore (lightweight in-memory + JSON file store)
      this.v3StateStore = new CoreStateStore();

      // 4. v3 core: supporting components
      // Intentionally kept as locals: they are wired into EventProcessor and do not
      // need to be addressed independently after construction. If future observability
      // work (metrics export, dead-letter inspection) requires direct access, promote
      // these to class fields at that point.
      const lifecycle = new LoopLifecycleManager();
      const metrics = new EventMetrics();
      const deadLetter = new DeadLetterQueue();
      const errorHandler = new ErrorHandler({ deadLetter });

      // 5. v3 core: EventProcessor (the central processing loop)
      this.v3EventProcessor = new EventProcessor(
        this.v3EventQueue,
        this.v3TriggerRegistry,
        this.v3StateStore,
        lifecycle,
        metrics,
        errorHandler,
        deadLetter,
      );

      logger.debug('v3 core components initialised');

      // 6. WRFC plugin
      registerWRFCPlugin({
        processor: this.v3EventProcessor,
        registry: this.v3TriggerRegistry,
        store: this.v3StateStore,
        config: getDefaultWRFCConfig(),
      });
      logger.debug('v3 WRFC plugin registered');

      // 7. Hooks plugin: HookRegistry + default handlers wired to v2 subsystems
      this.v3HookRegistry = new HookRegistry();
      this.v3HookProcessor = new HookProcessor({
        registry: this.v3HookRegistry,
        // sessionId is intentionally empty here: the HookProcessor is initialised once
        // at startup, before any session exists. Each hook invocation carries its own
        // session context in the input payload, so no session ID is needed at
        // construction time. An empty string is the required sentinel for "no session".
        sessionId: '',  // sentinel: no session at construction time
      });
      registerDefaultHandlers(this.v3HookRegistry, {
        eventBus: this.eventBus ?? null,
        directiveQueue: this.directiveQueue ?? null,
        agentWorkflowMap: this.agentWorkflowMap ?? null,
      });
      logger.debug('v3 hooks plugin registered', {
        handlerCount: this.v3HookRegistry.count(),
      });

      // 8. Time plugin
      this.v3TimePlugin = new TimePlugin({
        queue: this.v3EventQueue,
        store: this.v3StateStore,
        config: getDefaultTimeConfig(),
      });
      logger.debug('v3 time plugin initialised');

      // 9. External plugin (file-drop ingestion)
      this.v3ExternalPlugin = new ExternalPlugin(
        this.v3EventQueue,
        createDefaultExternalPluginConfig(),
      );
      // Ensure drop directories exist
      try {
        await this.v3ExternalPlugin.initialize();
      } catch (err) {
        logger.warn('v3 external plugin directory initialisation failed', {
          err: toErrorMessage(err),
        });
      }
      logger.debug('v3 external plugin initialised');

      logger.info('v3 plugins fully initialised');
    } catch (err) {
      logger.warn('v3 plugin initialisation failed — continuing without v3 layer', {
        err: toErrorMessage(err),
      });
      // Reset all v3 state to null so the engine degrades gracefully
      this.v3EventQueue = null;
      this.v3TriggerRegistry = null;
      this.v3StateStore = null;
      this.v3EventProcessor = null;
      this.v3HookProcessor = null;
      this.v3HookRegistry = null;
      this.v3TimePlugin = null;
      this.v3ExternalPlugin = null;
    }
  }

  /**
   * Start the v3 tick timer.
   *
   * On each tick:
   *   1. TimePlugin emits heartbeat and scheduled events into the v3 queue.
   *   2. ExternalPlugin scans the file-drop directory.
   *   3. EventProcessor drains a batch from the v3 queue through registered triggers.
   *
   * Default tick interval: 10 seconds.
   * The timer is unref'd so it does not prevent graceful process exit.
   */
  private startV3TickTimer(): void {
    // All three fields are set together in initializeV3Plugins (all-or-nothing).
    // Skip ticking if all three v3 components are null (v3 init failed or was not
    // attempted). Using || provides defensive safety so that a partial init — where
    // only some fields were set before failure — also skips ticking with incomplete
    // state, rather than proceeding with nulls.
    if (!this.v3EventProcessor || !this.v3TimePlugin || !this.v3ExternalPlugin) {
      // Nothing to tick — v3 failed to initialise
      return;
    }

    const TICK_INTERVAL_MS = 10_000;

    this.v3TickTimer = setInterval(() => {
      this.tickV3().catch((err) => {
        logger.warn('v3 tick error', { err: toErrorMessage(err) });
      });
    }, TICK_INTERVAL_MS);

    this.v3TickTimer.unref();
    logger.debug('v3 tick timer started', { interval_ms: TICK_INTERVAL_MS });
  }

  /**
   * Execute one v3 tick cycle.
   *
   * Order matters: produce events first (time + external), then process them.
   */
  private async tickV3(): Promise<void> {
    // 1. Emit time events (heartbeat, scheduled) into v3 queue
    if (this.v3TimePlugin) {
      try {
        this.v3TimePlugin.onTick();
      } catch (err) {
        logger.warn('v3 time plugin tick error', { err: toErrorMessage(err) });
      }
    }

    // 2. Scan file-drop directory for external events
    if (this.v3ExternalPlugin) {
      try {
        await this.v3ExternalPlugin.onTick();
      } catch (err) {
        logger.warn('v3 external plugin tick error', { err: toErrorMessage(err) });
      }
    }

    // 3. Process the next batch of queued events through registered triggers
    if (this.v3EventProcessor) {
      try {
        await this.v3EventProcessor.processBatch();
      } catch (err) {
        logger.warn('v3 event processor batch error', { err: toErrorMessage(err) });
      }
    }
  }

  /**
   * Stop the v3 tick timer.
   */
  private stopV3TickTimer(): void {
    if (this.v3TickTimer) {
      clearInterval(this.v3TickTimer);
      this.v3TickTimer = undefined;
      logger.debug('v3 tick timer stopped');
    }
  }

  /**
   * Nullify all v3 plugin fields after shutdown to release references
   * and prevent any post-shutdown access to disposed instances.
   */
  private cleanupV3Plugins(): void {
    this.v3EventQueue = null;
    this.v3TriggerRegistry = null;
    this.v3StateStore = null;
    this.v3EventProcessor = null;
    this.v3HookProcessor = null;
    this.v3HookRegistry = null;
    this.v3TimePlugin = null;
    this.v3ExternalPlugin = null;
  }

  /**
   * Return the v3 HookProcessor, or null if it has not been initialised.
   * Exposed for inspection and testing.
   */
  getV3HookProcessor(): HookProcessor | null {
    return this.v3HookProcessor;
  }

  /**
   * Return the v3 EventProcessor, or null if it has not been initialised.
   * Exposed for inspection and testing.
   */
  getV3EventProcessor(): EventProcessor | null {
    return this.v3EventProcessor;
  }
}
