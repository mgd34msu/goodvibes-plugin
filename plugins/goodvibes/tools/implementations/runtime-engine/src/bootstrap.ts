/** Composition root — sole cross-layer wiring point for the runtime engine. */

import { join } from 'node:path';

import type { RuntimeConfig } from './shared/config.js';
import { loadConfig } from './shared/config.js';
import { ENGINE_VERSION } from './shared/constants.js';
import { createLogger } from './shared/logger.js';
import { generateEventId, timestamp, toErrorMessage } from './shared/utils.js';
import { ProcessingError } from './shared/errors.js';

import { writePidFile, removePidFile, checkCrashRecovery } from './core/utils/pid-file.js';
import { HealthChecker } from './core/observability/health.js';

import { createEventSubsystem, type EventSubsystem } from './extensions/events/subsystem.js';
import { createWorkflowSubsystem, type WorkflowSubsystem } from './extensions/workflow/subsystem.js';
import { createTriggerSubsystem, type TriggerSubsystem } from './extensions/triggers/subsystem.js';
import { createAgentSubsystem, type AgentSubsystem } from './extensions/agents/subsystem.js';
import { createDirectiveSubsystem, type DirectiveSubsystem } from './extensions/directives/subsystem.js';
import { createPersistenceSubsystem, type PersistenceSubsystem } from './extensions/persistence/subsystem.js';
import type { JsonStateStore } from './extensions/persistence/state-store.js';
import type { EventBus } from './extensions/events/event-bus.js';
import type { EventLog } from './extensions/events/event-log.js';
import type { WorkflowEngine } from './extensions/workflow/workflow-engine.js';
import type { TriggerRegistry } from './core/trigger-registry.js';
import type { AgentCoordinator } from './extensions/agents/agent-coordinator.js';
import type { DirectiveQueue } from './extensions/directives/directive-queue.js';
import { WRFCConfigStore } from './extensions/directives/index.js';
import { WatchdogCoordinator } from './extensions/workflow/watchdog.js';

import { createCoreRuntime, type CoreRuntime, type EventProcessor } from './core/index.js';
import {
  getDefaultWRFCConfig,
  WRFCPlugin,
  TimePlugin,
  ExternalPlugin,
  type ExternalPluginConfig,
  type HookProcessor,
} from './plugins/index.js';
import { createWRFCTrigger } from './extensions/triggers/factories.js';
import type { RuntimeServices } from './shared/plugin.js';
import { createHookSubsystem } from './plugins/hooks/index.js';
import type { ExecutorModeManager } from './core/processing/executor-mode.js';
import type { ExecutorBudgetManager } from './extensions/executor/executor-budget.js';
import type { DaemonTickHandler } from './extensions/executor/daemon-tick-handler.js';
import { createExecutorSubsystem, type ExecutorSubsystem, ActionExecutor, TickDriver } from './extensions/executor/index.js';
import { createTimeAdapter, createExternalAdapter } from './extensions/adapters/index.js';
import { createIPCSubsystem, teardownIPC } from './extensions/ipc/index.js';
import type { IPCSubsystem } from './extensions/ipc/index.js';

const logger = createLogger('bootstrap');

export class RuntimeEngine {
  private readonly startTime: number;
  private config: RuntimeConfig;
  private readonly healthChecker: HealthChecker;
  private running = false;
  private readonly projectRoot: string;

  // ─── Subsystems (non-null after startup) ───────────────────────────────────
  private events: EventSubsystem | null = null;
  private workflow: WorkflowSubsystem | null = null;
  private triggers: TriggerSubsystem | null = null;
  private agents: AgentSubsystem | null = null;
  private directives: DirectiveSubsystem | null = null;
  private persistence: PersistenceSubsystem | null = null;
  private coreRuntime: CoreRuntime | null = null;
  private executorSubsystem: ExecutorSubsystem | null = null;
  private tickDriver: TickDriver | null = null;
  private hookProcessor: HookProcessor | null = null;
  private ipcSubsystem: IPCSubsystem | null = null;
  private wrfcConfigStore: WRFCConfigStore | null = null;
  private watchdog: WatchdogCoordinator | null = null;
  private wrfcPlugin: WRFCPlugin | null = null;

  constructor(config: RuntimeConfig, projectRoot: string = process.cwd()) {
    this.startTime = Date.now();
    this.config = config;
    this.projectRoot = projectRoot;
    this.healthChecker = new HealthChecker(this.config, this.startTime);
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  async startup(): Promise<void> {
    logger.info('Starting up');

    // 1. Load config from disk
    try {
      this.config = loadConfig(this.projectRoot);
      logger.debug('Configuration loaded', { version: ENGINE_VERSION });
    } catch (err) {
      logger.warn('Could not load config from disk — using defaults', { err: toErrorMessage(err) });
    }

    // 2. Event subsystem
    this.events = await createEventSubsystem(this.config, this.projectRoot);

    // 3. Crash recovery + PID lock
    await checkCrashRecovery(this.projectRoot);
    writePidFile(this.projectRoot);

    // 4. Workflow subsystem (if enabled)
    if (this.config.features.workflows_enabled) {
      this.workflow = await createWorkflowSubsystem(this.config, this.projectRoot);
      this.workflow.workflowEngine.setEventBus(this.events.eventBus);
    }

    // 5. Trigger subsystem
    this.triggers = createTriggerSubsystem(this.config);

    // 6. Directive subsystem
    this.directives = createDirectiveSubsystem();

    // 7. Cross-layer wiring: trigger dependencies + wildcard listener
    this.wrfcConfigStore = new WRFCConfigStore();
    if (this.workflow) {
      this.workflow.workflowEngine.setDirectiveQueue(this.directives.directiveQueue);
    }
    this.triggers.triggerRegistry.setDependencies(
      this.events.eventBus,
      this.directives.directiveQueue,
      this.workflow?.workflowEngine ?? null,
      this.wrfcConfigStore,
    );
    this.events.eventBus.on('*', async (event: import('./shared/events.js').RuntimeEvent) => {
      if (event.source?.kind === 'hook') return;
      try {
        if (this.triggers) await this.triggers.triggerRegistry.evaluate(event);
      } catch (err) {
        logger.warn('Trigger evaluation error', { error: toErrorMessage(err) });
      }
    });

    // 8. Agent subsystem (if enabled)
    if (this.config.features.agents_enabled) {
      this.agents = createAgentSubsystem(this.config, this.events.eventBus);
    }

    // 9. (L2 WRFC handlers removed — WRFC routes through L3 plugin pipeline only)

    // 10. Watchdog coordinator
    if (this.workflow && this.directives) {
      this.watchdog = new WatchdogCoordinator({
        workflowEngine: this.workflow.workflowEngine,
        directiveQueue: this.directives.directiveQueue,
        agentWorkflowMap: this.directives.agentWorkflowMap,
        stateDir: join(this.projectRoot, this.config.persistence.state_dir),
      });
    }

    // 11. Persistence subsystem
    this.persistence = await createPersistenceSubsystem({
      config: this.config,
      projectRoot: this.projectRoot,
      eventLog: this.events.eventLog,
      healthChecker: this.healthChecker,
      workflowEngine: this.workflow?.workflowEngine ?? null,
      agentCoordinator: this.agents?.agentCoordinator ?? null,
      getSnapshotDeps: () => ({
        workflowEngine: this.workflow?.workflowEngine ?? null,
        triggerRegistry: this.triggers?.triggerRegistry ?? null,
        agentCoordinator: this.agents?.agentCoordinator ?? null,
        agentWorkflowMap: this.directives?.agentWorkflowMap ?? null,
      }),
    });

    // 12. Executor subsystem
    this.executorSubsystem = createExecutorSubsystem(this.config, this.events.eventBus);

    // 13. Core runtime (L1)
    // Pass the unified TriggerRegistry from step 5 so that EventProcessor
    // and all extension subsystems share a SINGLE registry instance.
    const actionExecutor = this.directives
      ? new ActionExecutor(this.directives.directiveQueue)
      : undefined;
    this.coreRuntime = createCoreRuntime(
      actionExecutor,
      this.triggers?.triggerRegistry,
    );

    // 14. WRFC plugin (L3) — class-based registration via RuntimePlugin interface.
    // WRFCPlugin.register() is the single canonical entry point: it seeds config,
    // registers all triggers, and wires all event handlers via RuntimeServices.
    // No separate registerWRFCPlugin() call is needed.
    const wrfcConfig = getDefaultWRFCConfig();
    const coreStore = this.coreRuntime.stateStore;
    const coreEventProcessor = this.coreRuntime.eventProcessor;
    const coreTriggerRegistry = this.triggers?.triggerRegistry;
    const eventBusRef = this.events.eventBus;
    const runtimeServices: RuntimeServices = {
      emit: (event) => eventBusRef.emit(event),
      subscribe: (eventType, handler) => {
        return eventBusRef.on(
          eventType as import('./shared/events.js').EventTypePattern,
          handler,
        );
      },
      getConfig: () => this.config as unknown as Record<string, unknown>,
      getState: (key) => coreStore.get(key),
      setState: (key, value) => coreStore.set(key, value),
      registerTrigger: (id, definition, handler) => {
        if (!coreTriggerRegistry) {
          logger.warn('registerTrigger: trigger subsystem not available', { id });
          return;
        }
        const trigger = createWRFCTrigger({
          id: definition.id,
          event_match: {
            source: (
              definition.conditions[0]?.['source'] as
                | import('./shared/events.js').EventSource
                | import('./shared/events.js').EventSource[]
                | undefined
            ) ?? { kind: 'internal' as const },
            type: definition.event_type as import('./shared/events.js').EventType,
          },
          actions: [],
          max_fires: definition.max_fires,
          priority: 10,
        });
        coreTriggerRegistry.register(trigger as unknown as import('./core/trigger-registry.js').TriggerDefinition);
        const registeredTrigger = coreTriggerRegistry.get(id);
        coreEventProcessor.registerHandler(id, async (event) => {
          if (!registeredTrigger) return {};
          return (await Promise.resolve(handler(event))) ?? {};
        });
      },
      unregisterTrigger: (id) => {
        coreTriggerRegistry?.unregister(id);
      },
      getLogger: (name) => createLogger(name) as unknown as import('./shared/plugin.js').PluginLogger,
    };
    this.wrfcPlugin = new WRFCPlugin(wrfcConfig);
    this.wrfcPlugin.register(runtimeServices);
    this.wrfcPlugin.start();
    logger.debug('WRFC plugin registered via RuntimePlugin interface', {
      name: this.wrfcPlugin.name,
      version: this.wrfcPlugin.version,
      state: this.wrfcPlugin.state,
    });

    // 14.5 Start core event processor lifecycle
    this.coreRuntime.eventProcessor.start();

    // 15. (EventBridge removed — event processing handled directly by L1 core event processor)

    // 16. Hook subsystem (L3)
    const hookSubsystem = createHookSubsystem({
      eventBus: this.events.eventBus,
      directiveQueue: this.directives.directiveQueue,
      agentWorkflowMap: this.directives.agentWorkflowMap,
      daemonTickHandler: this.executorSubsystem?.daemonTickHandler ?? null,
      executorMode: this.executorSubsystem?.executorMode ?? null,
    });
    this.hookProcessor = hookSubsystem.hookProcessor;
    logger.debug('Hook subsystem created', { handlerCount: hookSubsystem.hookRegistry.count() });

    // 17. Time plugin (L3)
    const timePlugin = new TimePlugin({
      queue: this.coreRuntime.eventQueue,
      store: this.coreRuntime.stateStore,
      config: this.config.time,
    });

    // 18. External plugin (L3)
    const { enabled: httpEnabled, ...httpListenerConfig } = this.config.external.http_listener;
    const externalPluginConfig: ExternalPluginConfig = {
      file_watcher: this.config.external.file_watcher,
      ...(httpEnabled ? { http_listener: httpListenerConfig } : {}),
    };
    const externalPlugin = new ExternalPlugin(this.coreRuntime.eventQueue, externalPluginConfig);
    try {
      await externalPlugin.initialize();
    } catch (err) {
      logger.warn('External plugin initialisation failed', { err: toErrorMessage(err) });
    }
    if (httpEnabled) {
      try {
        await externalPlugin.startHttpListener();
        logger.info('HTTP webhook listener started', {
          port: this.config.external.http_listener.port,
          host: this.config.external.http_listener.address,
        });
      } catch (err) {
        logger.warn('Failed to start HTTP webhook listener', { err: toErrorMessage(err) });
      }
    }

    // 19. Tick driver (L2)
    if (!this.executorSubsystem?.executorMode) {
      logger.warn('Skipping tick driver — executorMode not available');
    } else {
      this.tickDriver = new TickDriver({
        config: this.config.executor,
        executorMode: this.executorSubsystem.executorMode,
        timePlugin: createTimeAdapter(timePlugin),
        externalPlugin: createExternalAdapter(externalPlugin),
        eventProcessor: this.coreRuntime.eventProcessor ?? undefined,
        staleWorkflowChecker: () => this.watchdog?.checkStaleWorkflows(),
      });
    }

    // 20. Restore executor budget from core state store
    if (this.executorSubsystem?.executorBudget && this.coreRuntime.stateStore) {
      this.executorSubsystem.executorBudget.restore(this.coreRuntime.stateStore);
    }

    // 21. Wire queue depth into DaemonTickHandler
    if (this.executorSubsystem?.daemonTickHandler && this.coreRuntime.eventQueue) {
      const queue = this.coreRuntime.eventQueue;
      this.executorSubsystem.daemonTickHandler.setQueueDepthGetter(() => queue.depth());
    }

    // 22. IPC server (if enabled)
    let ipcSocketPath: string | null = null;
    if (this.config.features.ipc_enabled) {
      const ipcResult = await createIPCSubsystem({
        config: this.config,
        projectRoot: this.projectRoot,
        eventBus: this.events.eventBus,
        triggerRegistry: this.triggers.triggerRegistry,
        workflowEngine: this.workflow?.workflowEngine ?? null,
        agentCoordinator: this.agents?.agentCoordinator ?? null,
        directiveQueue: this.directives.directiveQueue,
        wrfcConfigStore: this.wrfcConfigStore,
        agentWorkflowMap: this.directives.agentWorkflowMap,
        hookProcessor: this.hookProcessor,
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

    // 23. Start tick driver
    this.tickDriver?.start();

    // 24. Emit startup event
    this.events.eventBus.emit({
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
    logger.info('Startup complete', { pid: process.pid, uptime_ms: this.getUptime() });
  }

  async shutdown(timeout_ms = 10_000): Promise<void> {
    logger.info('Shutting down', { timeout_ms });

    const shutdownTimer = setTimeout(() => {
      logger.error('Shutdown timed out — forcing exit', { timeout_ms });
      process.exit(1);
    }, timeout_ms);
    shutdownTimer.unref();

    try {
      // Stop active workflows
      this.workflow?.shutdown();

      // Stop WRFC plugin lifecycle
      this.wrfcPlugin?.stop();
      this.wrfcPlugin = null;

      // Stop tick driver
      this.tickDriver?.stop();
      const coreStateStoreForShutdown = this.coreRuntime?.stateStore ?? null;

      // Emit shutdown event
      if (this.events) {
        try {
          this.events.eventBus.emit({
            id: generateEventId(),
            timestamp: timestamp(),
            type: 'system:shutdown',
            source: { kind: 'system' },
            payload: { type: 'system:shutdown', data: { uptime_ms: this.getUptime() } },
          });
        } catch (err) {
          logger.warn('Failed to emit shutdown event', { err: toErrorMessage(err) });
        }
      }

      // Close IPC server
      if (this.ipcSubsystem) {
        await teardownIPC(this.ipcSubsystem, this.projectRoot, this.config);
        this.ipcSubsystem = null;
      }

      // Persist executor budget
      if (this.executorSubsystem?.executorBudget && coreStateStoreForShutdown) {
        try {
          this.executorSubsystem.executorBudget.persist(coreStateStoreForShutdown);
        } catch (err) {
          logger.warn('Executor budget persistence failed', { err: toErrorMessage(err) });
        }
      }

      // Persistence shutdown (final snapshot + checkpoint)
      if (this.persistence) await this.persistence.shutdown();

      // Event subsystem shutdown (drain + flush + close)
      if (this.events) await this.events.shutdown();

      // Remove PID lock
      removePidFile(this.projectRoot);

      this.running = false;
      logger.info('Shutdown complete');
    } finally {
      clearTimeout(shutdownTimer);
    }
  }

  // ─── Accessors ──────────────────────────────────────────────────────────────

  getUptime(): number { return Date.now() - this.startTime; }
  getConfig(): RuntimeConfig { return this.config; }
  getHealthChecker(): HealthChecker { return this.healthChecker; }
  getProjectRoot(): string { return this.projectRoot; }
  isRunning(): boolean { return this.running; }

  getStateStore(): JsonStateStore {
    if (!this.persistence?.stateStore) throw new ProcessingError('getStateStore() called before startup()');
    return this.persistence.stateStore;
  }

  updateConfig(config: RuntimeConfig): void {
    this.config = config;
    this.healthChecker.updateConfig(config);
    this.agents?.agentCoordinator?.updateConfig(config.agents);
    this.executorSubsystem?.executorMode?.updateConfig(config.executor);
    this.tickDriver?.reconfigure(config.executor);
  }

  getEventBus(): EventBus {
    if (!this.events?.eventBus) throw new ProcessingError('getEventBus() called before startup()');
    return this.events.eventBus;
  }
  getEventLog(): EventLog {
    if (!this.events?.eventLog) throw new ProcessingError('getEventLog() called before startup()');
    return this.events.eventLog;
  }
  getEventQueue(): import('./core/queues/event-queue.js').EventQueue {
    if (!this.coreRuntime?.eventQueue) throw new ProcessingError('getEventQueue() called before startup()');
    return this.coreRuntime.eventQueue;
  }
  getIPCServer(): import('./shared/ipc/ipc-server.js').IPCServer | null { return this.ipcSubsystem?.ipcServer ?? null; }
  getWorkflowEngine(): WorkflowEngine | null { return this.workflow?.workflowEngine ?? null; }
  getTriggerRegistry(): TriggerRegistry | null { return this.triggers?.triggerRegistry ?? null; }
  getAgentCoordinator(): AgentCoordinator | null { return this.agents?.agentCoordinator ?? null; }
  getDirectiveQueue(): DirectiveQueue | null { return this.directives?.directiveQueue ?? null; }
  getHookProcessor(): HookProcessor | null { return this.hookProcessor; }
  getEventProcessor(): EventProcessor | null { return this.coreRuntime?.eventProcessor ?? null; }
  getExecutorMode(): ExecutorModeManager | null { return this.executorSubsystem?.executorMode ?? null; }
  getExecutorBudget(): ExecutorBudgetManager | null { return this.executorSubsystem?.executorBudget ?? null; }
  getDaemonTickHandler(): DaemonTickHandler | null { return this.executorSubsystem?.daemonTickHandler ?? null; }
}
