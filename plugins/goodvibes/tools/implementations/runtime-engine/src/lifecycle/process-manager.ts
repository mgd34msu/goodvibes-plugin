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

import { writeFileSync, readFileSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import { createHash } from 'crypto';
import { join } from 'path';
import { tmpdir } from 'os';

import type { RuntimeConfig } from '../shared/config.js';
import { loadConfig } from '../shared/config.js';
import { ENGINE_VERSION } from '../shared/constants.js';
import { createLogger } from '../shared/logger.js';
import { JsonStateStore } from '../persistence/state-store.js';
import { HealthChecker } from './health.js';
import { EventBus } from '../events/event-bus.js';
import { EventLog } from '../events/event-log.js';
import { EventQueue } from '../events/event-queue.js';
import { generateEventId, timestamp } from '../shared/utils.js';
import { IPCServer } from '../ipc/ipc-server.js';
import type { IPCMessage, IPCResponse } from '../ipc/protocol.js';
import { WorkflowEngine } from '../workflow/workflow-engine.js';
import { WRFC_LOOP_DEFINITION, FIX_LOOP_DEFINITION } from '../workflow/index.js';
import { TriggerRegistry } from '../triggers/trigger-registry.js';
import { getBuiltinTriggers } from '../triggers/builtins.js';
import { AgentCoordinator } from '../agents/agent-coordinator.js';
import { BudgetTracker } from '../agents/budget-tracker.js';
import { DirectiveQueue, registerWRFCHandlers } from '../directives/index.js';

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
  return join(tmpdir(), `goodvibes-runtime-engine-${hash}.pid`);
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
        err: err instanceof Error ? err.message : String(err),
      });
    }

    // 2. Initialise state store
    this.stateStore = new JsonStateStore(this.config, this.projectRoot);
    await this.stateStore.initialize();
    logger.debug('State store initialised');

    // 3. Initialise event system
    this.eventBus = new EventBus();
    const stateDir = join(this.projectRoot, this.config.persistence.state_dir);
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
      this.workflowEngine.registerGuard('checkReviewScore', (context) => {
        return typeof context.review_score === 'number' && context.review_score >= 10;
      });
      logger.debug('Workflow engine initialised');
    }

    this.triggerRegistry = new TriggerRegistry(this.config.triggers);
    this.triggerRegistry.setEventBus(this.eventBus);
    for (const trigger of getBuiltinTriggers()) {
      this.triggerRegistry.register(trigger);
    }

    // Wire DirectiveQueue into the ActionExecutor
    this.directiveQueue = new DirectiveQueue();
    this.triggerRegistry.getActionExecutor().setDirectiveQueue(this.directiveQueue);
    if (this.workflowEngine) {
      this.triggerRegistry.getActionExecutor().setWorkflowEngine(this.workflowEngine);
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
        logger.warn('Trigger evaluation error', { error: err instanceof Error ? err.message : String(err) });
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
    registerWRFCHandlers(
      this.triggerRegistry,
      this.directiveQueue,
      this.workflowEngine,
      this.agentCoordinator,
    );

    // 9. Start IPC server if enabled
    let ipcSocketPath: string | null = null;
    if (this.config.features.ipc_enabled) {
      ipcSocketPath = await this.startIPCServer();
    } else {
      logger.debug('IPC server disabled by feature flag');
    }

    // 10. Emit startup event
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
      process.stderr.write(
        `[runtime-engine] Shutdown timed out after ${timeout_ms} ms — forcing exit\n`
      );
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
              err: err instanceof Error ? err.message : String(err),
            });
          }
        }
        logger.debug('Active workflows cancelled');
      }

      // 2. Stop checkpoint timer
      this.stopCheckpointTimer();

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
            err: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // 4. Close IPC server
      if (this.ipcServer) {
        try {
          await this.ipcServer.close();
          this.removeSocketPointerFile();
          this.ipcServer = null;
          logger.debug('IPC server closed');
        } catch (err) {
          logger.warn('IPC server close failed', {
            err: err instanceof Error ? err.message : String(err),
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
            err: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // 6. Remove all event bus listeners
      if (this.eventBus) {
        this.eventBus.removeAllListeners();
      }

      // 7. Save final checkpoint
      try {
        await this.saveCheckpoint();
        logger.debug('Final checkpoint saved');
      } catch (err) {
        logger.warn('Final checkpoint failed', {
          err: err instanceof Error ? err.message : String(err),
        });
      }

      // 8. Remove PID lock file
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
        logger.warn('Stale PID file detected — possible crash recovery', {
          stale_pid: stalePid,
        });
        // Remove stale lock so writePidFile() starts fresh
        this.removePidFile();
      }
    } catch (err) {
      logger.warn('Could not read stale PID file', {
        err: err instanceof Error ? err.message : String(err),
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
      writeFileSync(pidFilePath, String(process.pid), 'utf-8');
      logger.debug('PID file written', { path: pidFilePath, pid: process.pid });
    } catch (err) {
      logger.warn('Could not write PID file', {
        err: err instanceof Error ? err.message : String(err),
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
      if (existsSync(pidFilePath)) {
        unlinkSync(pidFilePath);
        logger.debug('PID file removed', { path: pidFilePath });
      }
    } catch (err) {
      logger.warn('Could not remove PID file', {
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Start the periodic checkpoint timer.
   * The timer is unref'd so it does not prevent natural process exit.
   */
  private startCheckpointTimer(): void {
    this.checkpointTimer = setInterval(() => {
      this.saveCheckpoint().catch((err) => {
        logger.warn('Periodic checkpoint failed', {
          err: err instanceof Error ? err.message : String(err),
        });
      });
    }, CHECKPOINT_INTERVAL_MS);

    // Unref so the timer does not prevent graceful exit
    this.checkpointTimer.unref();
    logger.debug('Checkpoint timer started', { interval_ms: CHECKPOINT_INTERVAL_MS });
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
   * Start the IPC server, bind it to a session-scoped socket path, and write
   * the socket path to the state directory so hooks can discover it.
   *
   * @returns The absolute socket path, or null if startup fails.
   */
  private async startIPCServer(): Promise<string | null> {
    const stateDir = join(this.projectRoot, this.config.persistence.state_dir);
    const socketDir = this.config.ipc.socket_dir;

    // Derive a session-scoped socket filename from a hash of the project root
    const hash = createHash('sha256').update(this.projectRoot).digest('hex').slice(0, 8);
    const socketPath = join(socketDir, `goodvibes-runtime-${hash}.sock`);

    try {
      this.ipcServer = new IPCServer(socketPath);

      // Wire IPC message handler
      this.ipcServer.onMessage(async (msg: IPCMessage): Promise<IPCResponse> => {
        logger.debug('IPC message received', { id: msg.id, type: msg.type });

        if (msg.type === 'hook_event') {
          // Emit as a hook:* event on the EventBus
          const emittedEvent: import('../events/types.js').RuntimeEvent = {
            id: msg.id,
            timestamp: msg.timestamp,
            type: `hook:${msg.hook_name}` as import('../events/types.js').EventType,
            source: { kind: 'hook', hook_name: msg.hook_name } as import('../events/types.js').EventSource,
            payload: {
              type: `hook:${msg.hook_name}` as import('../events/types.js').EventType,
              data: msg.hook_input,
            } as import('../events/types.js').EventPayload,
            metadata: {
              sequence: 0,
              version: 1,
            },
          };
          this.eventBus.emit(emittedEvent);
          // Await trigger evaluation so directives are enqueued before the hook's follow-up query
          if (this.triggerRegistry) {
            try {
              await this.triggerRegistry.evaluate(emittedEvent);
            } catch (err) {
              logger.warn('IPC hook_event: trigger evaluation error', {
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }
          return { id: msg.id, status: 'ok', data: { kind: 'ack' } };
        }

        if (msg.type === 'query') {
          const q = msg.query;
          if (q.kind === 'get_directives') {
            const directives = this.directiveQueue?.drain('subagent_stop') ?? [];
            const message = directives
              .filter((d) => d.type === 'inject_system_message')
              .sort((a, b) => b.priority - a.priority)
              .map((d) => d.content)
              .join('\n\n');
            return {
              id: msg.id,
              status: 'ok',
              data: { kind: 'system_message', message, directives },
            };
          }
          if (q.kind === 'get_system_message') {
            // Also drain directives for system_message queries
            const directives = this.directiveQueue?.drain('subagent_stop') ?? [];
            const directiveMessage = directives
              .filter((d) => d.type === 'inject_system_message')
              .sort((a, b) => b.priority - a.priority)
              .map((d) => d.content)
              .join('\n\n');
            return {
              id: msg.id,
              status: 'ok',
              data: { kind: 'system_message', message: directiveMessage, directives },
            };
          }
          if (q.kind === 'get_workflow_state') {
            const instance = this.workflowEngine?.get(q.workflow_id);
            return {
              id: msg.id,
              status: 'ok',
              data: { kind: 'workflow_state', instance: (instance ?? {}) as Record<string, unknown> },
            };
          }
          if (q.kind === 'should_block_tool') {
            return {
              id: msg.id,
              status: 'ok',
              data: { kind: 'tool_decision', allow: true },
            };
          }
          // Default: ack unknown queries
          return { id: msg.id, status: 'ok', data: { kind: 'ack' } };
        }

        if (msg.type === 'heartbeat') {
          return { id: msg.id, status: 'ok', data: { kind: 'ack' } };
        }

        if (msg.type === 'state_update') {
          return { id: msg.id, status: 'ok', data: { kind: 'ack' } };
        }

        return { id: msg.id, status: 'ok', data: { kind: 'ack' } };
      });

      await this.ipcServer.listen();

      // Write socket path to state file for hook discovery
      mkdirSync(stateDir, { recursive: true });
      const pointerFile = join(stateDir, 'runtime.socket');
      writeFileSync(pointerFile, socketPath, 'utf-8');

      logger.info('IPC server started', { socket: socketPath });
      return socketPath;
    } catch (err) {
      logger.error('Failed to start IPC server', {
        socket: socketPath,
        err: err instanceof Error ? err.message : String(err),
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
      'runtime.socket'
    );
    try {
      if (existsSync(pointerFile)) {
        unlinkSync(pointerFile);
        logger.debug('Socket pointer file removed', { path: pointerFile });
      }
    } catch (err) {
      logger.warn('Could not remove socket pointer file', {
        path: pointerFile,
        err: err instanceof Error ? err.message : String(err),
      });
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
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
}
