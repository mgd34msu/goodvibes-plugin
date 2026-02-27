/**
 * bootstrap.ts — Composition root for the runtime engine.
 *
 * Responsibilities:
 * - Loading and merging runtime configuration from disk
 * - Initialising the JsonStateStore for persistent state
 * - Writing and cleaning up a PID lock file
 * - Running periodic state checkpoints via CheckpointManager
 * - Coordinating graceful startup and shutdown sequences
 * - Delegating watchdog to WatchdogCoordinator
 * - Wiring all subsystems together
 */

import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

import type { RuntimeConfig } from './shared/config.js';
import { loadConfig } from './shared/config.js';
import { ENGINE_VERSION } from './shared/constants.js';
import { createLogger } from './shared/logger.js';
import { generateEventId, timestamp, toErrorMessage } from './shared/utils.js';
import { IPCServer } from './shared/ipc/ipc-server.js';
import { IPCRouter } from './shared/ipc/ipc-router.js';

import { ensureDirSync } from './core/utils/fs-utils.js';
import { writePidFile, removePidFile, checkCrashRecovery } from './core/utils/pid-file.js';
import { HealthChecker } from './core/observability/health.js';
import { ExecutorModeManager } from './core/processing/executor-mode.js';

import { JsonStateStore } from './extensions/persistence/state-store.js';
import { SnapshotManager, recoverState } from './extensions/persistence/index.js';
import { CheckpointManager } from './extensions/persistence/checkpoint-manager.js';
import { EventBus } from './extensions/events/event-bus.js';
import { EventLog } from './extensions/events/event-log.js';
import { EventQueue } from './extensions/events/event-queue.js';
import {
  WRFC_LOOP_DEFINITION,
  FIX_LOOP_DEFINITION,
  TEST_THEN_FIX_DEFINITION,
  REVIEW_ONLY_DEFINITION,
  loadCustomWorkflows,
} from './extensions/workflow/index.js';
import { WorkflowEngine } from './extensions/workflow/workflow-engine.js';
import { WatchdogCoordinator } from './extensions/workflow/watchdog.js';
import { TriggerRegistry } from './extensions/triggers/trigger-registry.js';
import { getBuiltinTriggers } from './extensions/triggers/builtins.js';
import { AgentCoordinator } from './extensions/agents/agent-coordinator.js';
import { BudgetTracker } from './extensions/agents/budget-tracker.js';
import {
  DirectiveQueue,
  registerWRFCHandlers,
  registerTestFixHandlers,
  registerReviewOnlyHandlers,
  AgentWorkflowMap,
} from './extensions/directives/index.js';
import { ExecutorBudgetManager } from './extensions/executor/executor-budget.js';
import { DaemonTickHandler } from './extensions/executor/daemon-tick-handler.js';
import { TickDriver } from './extensions/executor/tick-driver.js';

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
} from './core/index.js';

// ─── v3 Plugin imports ─────────────────────────────────────────────────────────
import {
  registerWRFCPlugin,
  getDefaultWRFCConfig,
  HookProcessor,
  HookRegistry,
  registerDefaultHandlers,
  TimePlugin,
  ExternalPlugin,
} from './plugins/index.js';
import type { ExternalPluginConfig } from './plugins/index.js';

const logger = createLogger('bootstrap');

/**
 * ProcessManager orchestrates the full startup and shutdown lifecycle of the
 * runtime engine, managing configuration, state persistence, PID locking,
 * and periodic checkpointing.
 *
 * @deprecated Use named exports from bootstrap.ts for new code.
 *   This class is retained for backward compatibility with mcp-server.ts.
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

  /** Checkpoint manager for periodic state saves. */
  private checkpointManager: CheckpointManager | null = null;

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

  /** Watchdog coordinator for stale workflow recovery. */
  private watchdog: WatchdogCoordinator | null = null;

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

  // ─── Executor subsystem fields ───────────────────────────────────────────────

  /** Executor mode manager — determines engaged/daemon/hybrid mode. */
  private executorMode: ExecutorModeManager | null = null;

  /** Executor budget manager — enforces flat and daily USD caps. */
  private executorBudget: ExecutorBudgetManager | null = null;

  /** Daemon tick handler — processes daemon tick cycles. */
  private daemonTickHandler: DaemonTickHandler | null = null;
  private tickDriver: TickDriver | null = null;

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
   * Perform the full startup sequence.
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
    ensureDirSync(stateDir);
    this.eventLog = new EventLog(stateDir, this.config.persistence);
    await this.eventLog.initialize();
    this.eventBus.setEventLog(this.eventLog);
    this.eventQueue = new EventQueue(this.config.queue);
    this.eventQueue.start();
    logger.debug('Event system initialised');

    // 4. Check for crash recovery
    await checkCrashRecovery(this.projectRoot);

    // 5. Write PID lock file
    writePidFile(this.projectRoot);

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
    if (this.workflowEngine) {
      this.workflowEngine.setDirectiveQueue(this.directiveQueue);
    }
    this.triggerRegistry.setDependencies(this.eventBus, this.directiveQueue, this.workflowEngine);
    for (const trigger of getBuiltinTriggers()) {
      this.triggerRegistry.register(trigger);
    }

    this.eventBus.on('*', async (event: import('./extensions/events/types.js').RuntimeEvent) => {
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

    // Initialize watchdog coordinator (requires directiveQueue + workflowEngine)
    if (this.workflowEngine && this.directiveQueue) {
      this.watchdog = new WatchdogCoordinator({
        workflowEngine: this.workflowEngine,
        directiveQueue: this.directiveQueue,
        agentWorkflowMap: this.agentWorkflowMap,
        stateDir,
      });
    }

    // 6. Start periodic checkpoint timer (after all subsystems wired)
    this.checkpointManager = new CheckpointManager({
      stateStore: this.stateStore,
      eventLog: this.eventLog,
      healthChecker: this.healthChecker,
      workflowEngine: this.workflowEngine,
      agentCoordinator: this.agentCoordinator,
      config: this.config,
    });
    this.checkpointManager.start();
    logger.debug('Checkpoint timer started');

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

    // 10. Initialize executor subsystem before v3 plugins so that
    // registerDefaultHandlers() receives live executor deps.
    this.initializeExecutor();

    // 10b. Initialize v3 plugins (additive — runs alongside v2 subsystems)
    await this.initializeV3Plugins();

    // 10c. Restore executor budget from v3StateStore now that it has been created.
    if (this.executorBudget && this.v3StateStore) {
      this.executorBudget.restore(this.v3StateStore);
    }

    // 11. Start IPC server if enabled
    let ipcSocketPath: string | null = null;
    if (this.config.features.ipc_enabled) {
      ipcSocketPath = await this.startIPCServer();
    } else {
      logger.debug('IPC server disabled by feature flag');
    }

    // 12. Start v3 tick driver
    this.tickDriver?.start();

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
   * Perform a graceful shutdown sequence.
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

      // 2. Stop checkpoint timer, tick driver, and periodic snapshots
      this.checkpointManager?.stop();
      this.tickDriver?.stop();
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

      // 7b. Persist executor budget spending before final checkpoint
      if (this.executorBudget && this.v3StateStore) {
        try {
          this.executorBudget.persist(this.v3StateStore);
          logger.debug('Executor budget state persisted');
        } catch (err) {
          logger.warn('Executor budget persistence failed', { err: toErrorMessage(err) });
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
        if (this.checkpointManager) {
          await this.checkpointManager.saveCheckpoint();
        }
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
      removePidFile(this.projectRoot);

      this.running = false;
      logger.info('Shutdown complete');
    } finally {
      clearTimeout(watchdog);
    }
  }

  // ─── Accessors ──────────────────────────────────────────────────────────────

  /**
   * Return the number of milliseconds the engine has been running.
   */
  getUptime(): number {
    return Date.now() - this.startTime;
  }

  /**
   * Return the merged runtime configuration.
   */
  getConfig(): RuntimeConfig {
    return this.config;
  }

  /**
   * Return the persistent state store.
   *
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
   */
  getHealthChecker(): HealthChecker {
    return this.healthChecker;
  }

  /**
   * Update the in-memory runtime configuration.
   */
  updateConfig(config: RuntimeConfig): void {
    this.config = config;
    this.healthChecker.updateConfig(config);
    if (this.agentCoordinator) {
      this.agentCoordinator.updateConfig(config.agents);
    }
    if (this.executorMode) {
      this.executorMode.updateConfig(config.executor);
    }
    if (this.tickDriver) {
      this.tickDriver.reconfigure(config.executor);
    }
    // Note: time and external plugin configs are applied at construction time only.
  }

  /**
   * Return the project root path used by this manager.
   */
  getProjectRoot(): string {
    return this.projectRoot;
  }

  /**
   * Return whether the engine is in the running state.
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
   */
  getWorkflowEngine(): WorkflowEngine | null {
    return this.workflowEngine;
  }

  /**
   * Return the trigger registry.
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

  /**
   * Return the v3 HookProcessor, or null if it has not been initialised.
   */
  getV3HookProcessor(): HookProcessor | null {
    return this.v3HookProcessor;
  }

  /**
   * Return the v3 EventProcessor, or null if it has not been initialised.
   */
  getV3EventProcessor(): EventProcessor | null {
    return this.v3EventProcessor;
  }

  /**
   * Return the ExecutorModeManager, or null if not initialised.
   */
  getExecutorMode(): ExecutorModeManager | null {
    return this.executorMode;
  }

  /**
   * Return the ExecutorBudgetManager, or null if not initialised.
   */
  getExecutorBudget(): ExecutorBudgetManager | null {
    return this.executorBudget;
  }

  /**
   * Return the DaemonTickHandler, or null if not initialised.
   */
  getDaemonTickHandler(): DaemonTickHandler | null {
    return this.daemonTickHandler;
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  /**
   * Build the SnapshotDeps object from current subsystem state.
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
   */
  private async startIPCServer(): Promise<string | null> {
    const stateDir = join(this.projectRoot, this.config.persistence.state_dir);
    const socketDir = this.config.ipc.socket_dir;

    const hash = createHash('sha256').update(this.projectRoot).digest('hex').slice(0, 8);
    const socketPath = join(socketDir, `goodvibes-runtime-${hash}-${process.pid}.sock`);

    try {
      this.ipcServer = new IPCServer(socketPath);

      this.ipcRouter = new IPCRouter({
        eventBus: this.eventBus,
        triggerRegistry: this.triggerRegistry,
        workflowEngine: this.workflowEngine,
        agentCoordinator: this.agentCoordinator,
        directiveQueue: this.directiveQueue,
        socketPath,
        stateDir,
        agentWorkflowMap: this.agentWorkflowMap,
        hookProcessor: this.v3HookProcessor ?? null,
        executorMode: this.executorMode ?? null,
        executorBudget: this.executorBudget ?? null,
        daemonTickHandler: this.daemonTickHandler ?? null,
      });
      this.ipcServer.onMessage(this.ipcRouter.route.bind(this.ipcRouter));

      // Inject agent→workflow resolver so get_directives queries can scope
      // drains by workflow_id, preventing cross-workflow directive delivery.
      if (this.agentWorkflowMap) {
        const awm = this.agentWorkflowMap;
        this.ipcRouter.setAgentWorkflowResolver((agentId: string) => {
          return awm.lookup(agentId) ?? null;
        });
      }

      mkdirSync(socketDir, { recursive: true, mode: 0o700 });
      await this.ipcServer.listen();

      ensureDirSync(stateDir);
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
   * Remove the socket pointer file written during startIPCServer.
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

  // ─── v3 Initialization ─────────────────────────────────────────────────────

  /**
   * Initialize all v3 core components and Layer 3 plugins.
   * Failure is logged and swallowed to preserve v2 backward compatibility.
   */
  private async initializeV3Plugins(): Promise<void> {
    try {
      // 1. v3 core: EventQueue
      this.v3EventQueue = new CoreEventQueue();

      // 2. v3 core: TriggerRegistry
      this.v3TriggerRegistry = new CoreTriggerRegistry();

      // 3. v3 core: CoreStateStore
      this.v3StateStore = new CoreStateStore();

      // 4. v3 core: supporting components
      const lifecycle = new LoopLifecycleManager();
      const metrics = new EventMetrics();
      const deadLetter = new DeadLetterQueue();
      const errorHandler = new ErrorHandler({ deadLetter });

      // 5. v3 core: EventProcessor
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

      // 7. Hooks plugin
      this.v3HookRegistry = new HookRegistry();
      this.v3HookProcessor = new HookProcessor({
        registry: this.v3HookRegistry,
        sessionId: '',  // sentinel: no session at construction time
      });
      registerDefaultHandlers(this.v3HookRegistry, {
        eventBus: this.eventBus ?? null,
        directiveQueue: this.directiveQueue ?? null,
        agentWorkflowMap: this.agentWorkflowMap ?? null,
        daemonTickHandler: this.daemonTickHandler ?? null,
        executorMode: this.executorMode ?? null,
      });
      logger.debug('v3 hooks plugin registered', {
        handlerCount: this.v3HookRegistry.count(),
      });

      // 8. Time plugin
      this.v3TimePlugin = new TimePlugin({
        queue: this.v3EventQueue,
        store: this.v3StateStore,
        config: this.config.time,
      });
      logger.debug('v3 time plugin initialised');

      // 9. External plugin
      const { enabled: httpEnabled, ...httpListenerConfig } = this.config.external.http_listener;
      const externalPluginConfig: ExternalPluginConfig = {
        file_watcher: this.config.external.file_watcher,
        ...(httpEnabled ? { http_listener: httpListenerConfig } : {}),
      };
      this.v3ExternalPlugin = new ExternalPlugin(
        this.v3EventQueue,
        externalPluginConfig,
      );
      try {
        await this.v3ExternalPlugin.initialize();
      } catch (err) {
        logger.warn('v3 external plugin directory initialisation failed', {
          err: toErrorMessage(err),
        });
      }
      if (httpEnabled) {
        try {
          await this.v3ExternalPlugin.startHttpListener();
          logger.info('HTTP webhook listener started', {
            port: this.config.external.http_listener.port,
            host: this.config.external.http_listener.address,
          });
        } catch (err) {
          logger.warn('Failed to start HTTP webhook listener', {
            err: toErrorMessage(err),
          });
        }
      }
      logger.debug('v3 external plugin initialised');

      // 9a. TickDriver
      if (!this.executorMode) {
        logger.warn('skipping tick driver — executorMode not available');
      } else {
        this.tickDriver = new TickDriver({
          config: this.config.executor,
          executorMode: this.executorMode,
          timePlugin: this.v3TimePlugin,
          externalPlugin: this.v3ExternalPlugin ?? undefined,
          eventProcessor: this.v3EventProcessor ?? undefined,
          staleWorkflowChecker: () => this.watchdog?.checkStaleWorkflows(),
        });
        logger.debug('tick driver created');
      }

      logger.info('v3 plugins fully initialised');
    } catch (err) {
      logger.warn('v3 plugin initialisation failed — continuing without v3 layer', {
        err: toErrorMessage(err),
      });
      this.v3EventQueue = null;
      this.v3TriggerRegistry = null;
      this.v3StateStore = null;
      this.v3EventProcessor = null;
      this.v3HookProcessor = null;
      this.v3HookRegistry = null;
      this.v3TimePlugin = null;
      this.v3ExternalPlugin = null;
      this.tickDriver = null;
    }
  }

  /**
   * Nullify all v3 plugin fields after shutdown.
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
    this.tickDriver = null;
  }

  // ─── Executor Initialization ─────────────────────────────────────────────────

  /**
   * Initialize the executor subsystem (mode, budget, daemon tick handler).
   */
  private initializeExecutor(): void {
    try {
      this.executorMode = new ExecutorModeManager(this.config.executor, this.eventBus);
      const mode = this.executorMode.getMode();

      this.executorBudget = new ExecutorBudgetManager(
        this.config.executor.budget,
        this.eventBus,
      );

      this.daemonTickHandler = new DaemonTickHandler({
        executorMode: this.executorMode,
        budgetManager: this.executorBudget,
        eventBus: this.eventBus,
        config: this.config.executor,
      });

      this.eventBus.emit({
        id: generateEventId(),
        timestamp: timestamp(),
        type: 'executor:mode_set',
        source: { kind: 'system' },
        payload: {
          type: 'executor:mode_set',
          data: {
            mode,
            previous_mode: mode,
            detection_method: this.executorMode.getDetectionMethod(),
          },
        },
      });

      logger.info('Executor subsystem initialised', {
        mode,
        detection_method: this.executorMode.getDetectionMethod(),
      });
    } catch (err) {
      logger.warn('Executor subsystem initialisation failed — continuing without executor', {
        err: toErrorMessage(err),
      });
      this.executorMode = null;
      this.executorBudget = null;
      this.daemonTickHandler = null;
    }
  }
}
