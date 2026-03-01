/**
 * bootstrap.ts — Composition root for the runtime engine.
 *
 * This file is the thin coordinator / facade. It:
 * 1. Creates and wires all runtime subsystems via focused sub-bootstrap modules.
 * 2. Provides the public RuntimeEngine class (the sole export consumed externally).
 * 3. Delegates executor, plugin, and IPC initialization to dedicated modules.
 *
 * Sub-bootstrap modules:
 * - bootstrap/executor-bootstrap.ts  — ExecutorModeManager, ExecutorBudgetManager, DaemonTickHandler
 * - bootstrap/plugin-bootstrap.ts    — Core event queue, plugins, hooks, event bridge, tick driver
 * - bootstrap/ipc-bootstrap.ts       — IPC server, router, socket pointer file
 */

import { join } from 'node:path';

import type { RuntimeConfig } from './shared/config.js';
import { loadConfig } from './shared/config.js';
import { ENGINE_VERSION } from './shared/constants.js';
import { createLogger } from './shared/logger.js';
import { generateEventId, timestamp, toErrorMessage } from './shared/utils.js';

import { ensureDirSync } from './core/utils/fs-utils.js';
import { writePidFile, removePidFile, checkCrashRecovery } from './core/utils/pid-file.js';
import { HealthChecker } from './core/observability/health.js';

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
  WRFCConfigStore,
  registerTestFixHandlers,
  registerReviewOnlyHandlers,
  AgentWorkflowMap,
} from './extensions/directives/index.js';

import type { EventProcessor } from './core/index.js';
import type { HookProcessor } from './plugins/index.js';
import type { ExecutorModeManager } from './core/processing/executor-mode.js';
import type { ExecutorBudgetManager } from './extensions/executor/executor-budget.js';
import type { DaemonTickHandler } from './extensions/executor/daemon-tick-handler.js';

// Sub-bootstrap modules
import {
  initializeExecutor,
  type ExecutorSubsystem,
} from './bootstrap/executor-bootstrap.js';
import {
  initializePlugins,
  cleanupPlugins,
  type PluginSubsystem,
} from './bootstrap/plugin-bootstrap.js';
import {
  startIPCServer,
  teardownIPCServer,
  type IPCSubsystem,
} from './bootstrap/ipc-bootstrap.js';

const logger = createLogger('bootstrap');

/**
 * RuntimeEngine orchestrates the full startup and shutdown lifecycle of the
 * runtime engine, managing configuration, state persistence, PID locking,
 * and periodic checkpointing.
 *
 * Initialization is delegated to focused sub-bootstrap modules:
 * - executor-bootstrap: ExecutorModeManager, ExecutorBudgetManager, DaemonTickHandler
 * - plugin-bootstrap: core event queue, hooks, plugins, event bridge, tick driver
 * - ipc-bootstrap: IPC server, router, and socket pointer file
 */
export class RuntimeEngine {
  /** Unix epoch millisecond timestamp recorded at startup. */
  private readonly startTime: number;

  /** Merged runtime configuration (defaults + disk overrides). */
  private config: RuntimeConfig;

  /** Persistent JSON state store. Initialized during startup(). */
  private stateStore: JsonStateStore | null = null;

  /** Health checker bound to this manager's config and start time. */
  private readonly healthChecker: HealthChecker;

  /** Checkpoint manager for periodic state saves. */
  private checkpointManager: CheckpointManager | null = null;

  /** Whether startup() has successfully completed. */
  private running = false;

  /** Absolute path to the project root, used to locate config on disk. */
  private readonly projectRoot: string;

  /** Event bus for in-process pub/sub. */
  private eventBus: EventBus | null = null;

  /** Persistent JSONL event log. */
  private eventLog: EventLog | null = null;

  /** Priority event queue for deferred processing. */
  private eventQueue: EventQueue | null = null;

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
  private wrfcConfigStore: WRFCConfigStore | null = null;

  /** Agent-to-workflow binding map for deterministic WRFC chain routing. */
  private agentWorkflowMap: AgentWorkflowMap | null = null;

  /** Watchdog coordinator for stale workflow recovery. */
  private watchdog: WatchdogCoordinator | null = null;

  /** Snapshot manager for periodic state snapshots and recovery. */
  private snapshotManager: SnapshotManager | null = null;

  // ─── Sub-bootstrap subsystems ─────────────────────────────────────────────

  /** Executor subsystem (mode, budget, daemon tick handler). */
  private executorSubsystem: ExecutorSubsystem | null = null;

  /** Plugin subsystem (core queue, hooks, plugins, event bridge, tick driver). */
  private pluginSubsystem: PluginSubsystem | null = null;

  /** IPC subsystem (server, router). */
  private ipcSubsystem: IPCSubsystem | null = null;

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

    // 6. Initialise workflow engine and trigger registry
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
    this.wrfcConfigStore = new WRFCConfigStore();
    if (this.workflowEngine) {
      this.workflowEngine.setDirectiveQueue(this.directiveQueue);
    }
    this.triggerRegistry.setDependencies(this.eventBus, this.directiveQueue, this.workflowEngine, this.wrfcConfigStore);
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

    // 7. Initialise agent coordinator if enabled
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

    // 8. Start periodic checkpoint timer (after all subsystems wired)
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
      () => this.eventLog?.getLatestSequence() ?? 0,
      60_000,
    );

    // 10. Initialize executor subsystem before plugins so that
    // registerDefaultHandlers() receives live executor deps.
    this.executorSubsystem = initializeExecutor({
      config: this.config,
      eventBus: this.eventBus,
    });

    // 10b. Initialize plugins
    this.pluginSubsystem = await initializePlugins({
      config: this.config,
      eventBus: this.eventBus,
      directiveQueue: this.directiveQueue,
      agentWorkflowMap: this.agentWorkflowMap,
      daemonTickHandler: this.executorSubsystem?.daemonTickHandler ?? null,
      executorMode: this.executorSubsystem?.executorMode ?? null,
      watchdog: this.watchdog,
    });

    // 10c. Restore executor budget from coreStateStore now that it has been created.
    if (this.executorSubsystem?.executorBudget && this.pluginSubsystem?.coreStateStore) {
      this.executorSubsystem.executorBudget.restore(this.pluginSubsystem.coreStateStore);
    }

    // 10d. Wire live queue depth into DaemonTickHandler now that coreEventQueue exists.
    if (this.executorSubsystem?.daemonTickHandler && this.pluginSubsystem?.coreEventQueue) {
      const queue = this.pluginSubsystem.coreEventQueue;
      this.executorSubsystem.daemonTickHandler.setQueueDepthGetter(() => queue.depth());
    }

    // 11. Start IPC server if enabled
    let ipcSocketPath: string | null = null;
    if (this.config.features.ipc_enabled) {
      const ipcResult = await startIPCServer({
        config: this.config,
        projectRoot: this.projectRoot,
        eventBus: this.eventBus,
        triggerRegistry: this.triggerRegistry,
        workflowEngine: this.workflowEngine,
        agentCoordinator: this.agentCoordinator,
        directiveQueue: this.directiveQueue,
        wrfcConfigStore: this.wrfcConfigStore,
        agentWorkflowMap: this.agentWorkflowMap,
        hookProcessor: this.pluginSubsystem?.hookProcessor ?? null,
        executorMode: this.executorSubsystem?.executorMode ?? null,
        executorBudget: this.executorSubsystem?.executorBudget ?? null,
        daemonTickHandler: this.executorSubsystem?.daemonTickHandler ?? null,
      });
      if (ipcResult) {
        this.ipcSubsystem = ipcResult.subsystem;
        ipcSocketPath = ipcResult.socketPath;
      }
    } else {
      logger.debug('IPC server disabled by feature flag');
    }

    // 12. Start tick driver
    this.pluginSubsystem?.tickDriver?.start();

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
      this.pluginSubsystem?.tickDriver?.stop();
      // Save coreStateStore reference before cleanup (needed for budget persistence in step 7b)
      const coreStateStoreForShutdown = this.pluginSubsystem?.coreStateStore ?? null;
      cleanupPlugins(this.pluginSubsystem);
      this.pluginSubsystem = null;
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
      if (this.ipcSubsystem) {
        await teardownIPCServer(this.ipcSubsystem, this.projectRoot, this.config);
        this.ipcSubsystem = null;
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
      if (this.executorSubsystem?.executorBudget && coreStateStoreForShutdown) {
        try {
          this.executorSubsystem.executorBudget.persist(coreStateStoreForShutdown);
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
      throw new Error('RuntimeEngine.getStateStore() called before startup()');
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
    if (this.executorSubsystem?.executorMode) {
      this.executorSubsystem.executorMode.updateConfig(config.executor);
    }
    if (this.pluginSubsystem?.tickDriver) {
      this.pluginSubsystem.tickDriver.reconfigure(config.executor);
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
      throw new Error('RuntimeEngine.getEventBus() called before startup()');
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
      throw new Error('RuntimeEngine.getEventLog() called before startup()');
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
      throw new Error('RuntimeEngine.getEventQueue() called before startup()');
    }
    return this.eventQueue;
  }

  /**
   * Return the IPC server if it was started, or null if IPC is disabled.
   */
  getIPCServer(): import('./shared/ipc/ipc-server.js').IPCServer | null {
    return this.ipcSubsystem?.ipcServer ?? null;
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
   * Return the HookProcessor, or null if it has not been initialised.
   */
  getHookProcessor(): HookProcessor | null {
    return this.pluginSubsystem?.hookProcessor ?? null;
  }

  /**
   * Return the EventProcessor, or null if it has not been initialised.
   */
  getEventProcessor(): EventProcessor | null {
    return this.pluginSubsystem?.eventProcessor ?? null;
  }

  /**
   * Return the ExecutorModeManager, or null if not initialised.
   */
  getExecutorMode(): ExecutorModeManager | null {
    return this.executorSubsystem?.executorMode ?? null;
  }

  /**
   * Return the ExecutorBudgetManager, or null if not initialised.
   */
  getExecutorBudget(): ExecutorBudgetManager | null {
    return this.executorSubsystem?.executorBudget ?? null;
  }

  /**
   * Return the DaemonTickHandler, or null if not initialised.
   */
  getDaemonTickHandler(): DaemonTickHandler | null {
    return this.executorSubsystem?.daemonTickHandler ?? null;
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
}
