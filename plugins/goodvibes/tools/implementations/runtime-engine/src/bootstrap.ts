/** Composition root — sole cross-layer wiring point for the runtime engine. */

import { join } from 'node:path';
import { readFileSync } from 'node:fs';

import type { RuntimeConfig } from './shared/config.js';
import { loadConfig } from './shared/config.js';
import { ENGINE_VERSION } from './shared/constants.js';
import { createLogger } from './shared/logger.js';
import type { Logger } from './shared/logger.js';
import { generateEventId, timestamp, toErrorMessage } from './shared/utils.js';
import { ProcessingError } from './shared/errors.js';

import { writePidFile, removePidFile, checkCrashRecovery } from './core/utils/pid-file.js';
import { HealthChecker } from './core/observability/health.js';

import { createEventSubsystem, type EventSubsystem } from './extensions/events/subsystem.js';
import { createWorkflowSubsystem, type WorkflowSubsystem } from './extensions/workflow/subsystem.js';
import { createTriggerSubsystem, type TriggerSubsystem, type TriggerSubsystemDeps } from './extensions/triggers/subsystem.js';
import type { WorkflowContextProvider } from './extensions/triggers/types.js';
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
  AgentTrackerPlugin,
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
import type { RuntimeEvent, EventTypePattern, EventSource, EventType } from './shared/events.js';
import type { PluginLogger } from './shared/plugin.js';
import type { EventQueue } from './core/queues/event-queue.js';
import type { IPCServer } from './shared/ipc/ipc-server.js';
import type { TriggerDefinitionBase, Trigger } from './core/types.js';

const logger = createLogger('bootstrap');

/**
 * Converts an L1 EventMatcher to an L2 TriggerCondition (EventCondition).
 *
 * The EventCondition type only supports event_type matching and optional
 * payload.data field filters. Source filtering is not representable in
 * TriggerCondition — callers relying on source discrimination should
 * handle that at the handler level if needed.
 *
 * When the EventMatcher.type is a RegExp (e.g. from the L1 compat shim),
 * falls back to the wildcard '*' pattern so all events reach registered
 * handlers (which can apply their own filtering).
 */
function eventMatcherToCondition(eventMatch: import('./core/types.js').EventMatcher): import('./extensions/triggers/types.js').EventCondition {
  const eventType = eventMatch.type;
  // EventTypePattern is: EventType | `${string}:*` | '*'
  // Cast through unknown to satisfy the type checker — at runtime the string
  // value is always a valid EventType literal (set by createWRFCTrigger callers).
  const pattern = (typeof eventType === 'string' ? eventType : '*') as import('./shared/events.js').EventTypePattern;
  return {
    type: 'event' as const,
    event_type: pattern,
  };
}

/**
 * Adapts a L1 Trigger to the TriggerDefinition interface required by the
 * TriggerRegistry. Maps trigger fields to the L2 shape so L3 plugin
 * triggers can be registered via the L1 interface.
 *
 * Key difference from a naive cast: converts `event_match` (EventMatcher)
 * to a proper `condition` (EventCondition) so the ConditionEvaluator can
 * evaluate it correctly. Without this conversion, trigger.condition.type
 * would be the event type string (e.g. 'agent:spawned') which does not
 * match any TriggerCondition discriminant, causing all triggers to never fire.
 */
function toTriggerDefinitionBase(trigger: Trigger): import('./extensions/triggers/types.js').TriggerDefinition {
  // No-op composite action: WRFC triggers have actions: [] because handlers
  // are registered directly with EventProcessor via registerHandler(), not
  // via TriggerActionExecutor. The action field must be a valid TriggerAction
  // to satisfy the type, so we use an empty sequence (no-op).
  const noopAction: import('./extensions/triggers/types.js').CompositeAction = {
    type: 'sequence',
    actions: [],
  };
  return {
    id: trigger.id,
    name: trigger.id,
    description: 'Plugin trigger',
    enabled: trigger.enabled,
    priority: trigger.priority ?? 0,
    condition: eventMatcherToCondition(trigger.event_match),
    action: noopAction,
    cooldown_ms: trigger.cooldown_ms,
    max_fires: trigger.max_fires,
    fires_count: 0,
  };
}

/**
 * Wraps a shared Logger as a PluginLogger so L3 plugins receive the
 * minimal logging interface defined in shared/plugin.ts without a double-cast.
 */
function loggerToPluginLogger(log: Logger): PluginLogger {
  return {
    debug: (...args: unknown[]) => log.debug(String(args[0]), args[1] as Record<string, unknown> | undefined),
    info: (...args: unknown[]) => log.info(String(args[0]), args[1] as Record<string, unknown> | undefined),
    warn: (...args: unknown[]) => log.warn(String(args[0]), args[1] as Record<string, unknown> | undefined),
    error: (...args: unknown[]) => log.error(String(args[0]), args[1] as Record<string, unknown> | undefined),
  };
}


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
  private externalPlugin: import('./plugins/index.js').ExternalPlugin | null = null;

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

    // 5. Directive subsystem
    this.directives = createDirectiveSubsystem();

    // 6. Trigger subsystem (created after events, workflow, and directives so all deps are available)
    this.wrfcConfigStore = new WRFCConfigStore();
    const wrfcContextProvider: WorkflowContextProvider = (type) => {
      if (type !== 'wrfc') return {};
      const wrfcStore = this.wrfcConfigStore;
      if (!wrfcStore) return {};
      const config = wrfcStore.get();
      const defaults: Record<string, unknown> = {};
      if (typeof config.min_review_score === 'number' && Number.isFinite(config.min_review_score)) {
        defaults.min_review_score = config.min_review_score;
      }
      if (typeof config.max_fix_attempts === 'number' && Number.isFinite(config.max_fix_attempts)) {
        defaults.max_fix_attempts = config.max_fix_attempts;
      }
      return defaults;
    };
    const triggerDeps: TriggerSubsystemDeps = {
      eventBus: this.events.eventBus,
      directiveQueue: this.directives.directiveQueue,
      workflowEngine: this.workflow?.workflowEngine ?? null,
      contextProvider: wrfcContextProvider,
    };
    this.triggers = createTriggerSubsystem(this.config, triggerDeps);

    // 7. Cross-layer wiring: workflow directive queue + wildcard event listener
    if (this.workflow) {
      this.workflow.workflowEngine.setDirectiveQueue(this.directives.directiveQueue);
    }
    this.events.eventBus.on('*', async (event: RuntimeEvent) => {
      if (event.source?.kind === 'internal' && event.source.hook_name) {
        // Hook events (identified by hook_name in source) are processed
        // synchronously by the IPC router (via processHookEvent callback)
        // before the ack returns. Skip here to avoid double-processing
        // through the fire-and-forget path.
        return;
      }
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
      ? new ActionExecutor(this.directives.directiveQueue, this.directives.agentWorkflowMap)
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

    // Override WRFC config from .goodvibes/goodvibes.json if present
    try {
      const raw = readFileSync(join(this.projectRoot, '.goodvibes', 'goodvibes.json'), 'utf-8');
      const parsed = JSON.parse(raw);
      const wrfcOverrides = parsed?.runtime?.wrfc;
      if (wrfcOverrides && typeof wrfcOverrides === 'object') {
        if (typeof wrfcOverrides.score_threshold === 'number') {
          wrfcConfig.score_threshold = Math.max(0, Math.min(10, wrfcOverrides.score_threshold));
        }
        if (typeof wrfcOverrides.max_fix_attempts === 'number') {
          wrfcConfig.max_fix_attempts = Math.max(1, wrfcOverrides.max_fix_attempts);
        }
        if (typeof wrfcOverrides.enable_quality_gates === 'boolean') {
          wrfcConfig.enable_quality_gates = wrfcOverrides.enable_quality_gates;
        }
        if (Array.isArray(wrfcOverrides.require_review_types)) {
          wrfcConfig.require_review_types = wrfcOverrides.require_review_types;
        }
        logger.info('WRFC config overrides applied from goodvibes.json', {
          score_threshold: wrfcConfig.score_threshold,
          max_fix_attempts: wrfcConfig.max_fix_attempts,
        });
      }
    } catch {
      // No goodvibes.json or no runtime.wrfc section — use defaults
    }
    const coreStore = this.coreRuntime.stateStore;
    const coreEventProcessor = this.coreRuntime.eventProcessor;
    const coreTriggerRegistry = this.triggers?.triggerRegistry;
    const eventBusRef = this.events.eventBus;

    // Wire state change notifications → event bus
    coreStore.onStateChange((change) => {
      eventBusRef.emit({
        id: generateEventId(),
        timestamp: timestamp(),
        type: 'state:changed' as const,
        source: { kind: 'system' as const },
        payload: {
          type: 'state:changed' as const,
          data: {
            key: change.key,
            operation: change.operation,
            namespace: change.namespace,
            old_value: change.oldValue,
            new_value: change.newValue,
          },
        },
      });
    });

    const runtimeServices: RuntimeServices = {
      emit: (event) => eventBusRef.emit(event),
      subscribe: (eventType, handler) => {
        return eventBusRef.on(
          eventType as EventTypePattern,
          handler,
        );
      },
      getConfig: () => this.config as RuntimeConfig & Record<string, unknown>,
      getState: (key) => coreStore.get(key),
      setState: (key, value) => coreStore.set(key, value),
      deleteState: (key) => coreStore.delete(key),
      listStateKeys: (prefix) => coreStore.keys(prefix),
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
                | EventSource
                | EventSource[]
                | undefined
            ) ?? { kind: 'internal' as const },
            type: definition.event_type as EventType,
          },
          actions: [],
          max_fires: definition.max_fires,
          priority: 10,
        });
        coreTriggerRegistry.register(toTriggerDefinitionBase(trigger));
        const registeredTrigger = coreTriggerRegistry.get(id);
        coreEventProcessor.registerHandler(id, async (event) => {
          if (!registeredTrigger) return {};
          return (await Promise.resolve(handler(event))) ?? {};
        });
      },
      unregisterTrigger: (id) => {
        coreTriggerRegistry?.unregister(id);
      },
      getLogger: (name) => loggerToPluginLogger(createLogger(name)),
    };
    this.wrfcPlugin = new WRFCPlugin(wrfcConfig);
    this.wrfcPlugin.register(runtimeServices);
    this.wrfcPlugin.start();
    logger.debug('WRFC plugin registered via RuntimePlugin interface', {
      name: this.wrfcPlugin.name,
      version: this.wrfcPlugin.version,
      state: this.wrfcPlugin.state,
    });

    // 14b. Agent Tracker plugin (L3) — tracks agent lifecycle via hook events
    const agentTrackerPlugin = new AgentTrackerPlugin();
    agentTrackerPlugin.register(runtimeServices);
    agentTrackerPlugin.start();
    logger.debug('AgentTracker plugin registered', {
      name: agentTrackerPlugin.name,
      version: agentTrackerPlugin.version,
      state: agentTrackerPlugin.state,
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
    const externalPluginConfig = this.buildExternalConfig(this.config);
    const httpEnabled = this.config.external.http_listener.enabled;
    this.externalPlugin = new ExternalPlugin(this.coreRuntime.eventQueue, externalPluginConfig);
    try {
      await this.externalPlugin.initialize();
    } catch (err) {
      logger.warn('External plugin initialisation failed', { err: toErrorMessage(err) });
    }
    if (httpEnabled) {
      try {
        await this.externalPlugin.startHttpListener();
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
        externalPlugin: createExternalAdapter(this.externalPlugin),
        eventProcessor: this.coreRuntime.eventProcessor,
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
        stateStore: this.coreRuntime?.stateStore ?? null,
        hookProcessor: this.hookProcessor,
        executorMode: this.executorSubsystem?.executorMode ?? null,
        executorBudget: this.executorSubsystem?.executorBudget ?? null,
        daemonTickHandler: this.executorSubsystem?.daemonTickHandler ?? null,
        processHookEvent: async (event) => {
          const processor = this.coreRuntime?.eventProcessor;
          if (processor) {
            try {
              await processor.processImmediate(event);
            } catch (err) {
              logger.warn('Failed to process hook event immediately', { error: toErrorMessage(err) });
            }
          }
        },
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
    const oldConfig = this.config;
    this.config = config;
    this.healthChecker.updateConfig(config);
    this.agents?.agentCoordinator?.updateConfig(config.agents);
    this.executorSubsystem?.executorMode?.updateConfig(config.executor);
    this.tickDriver?.reconfigure(config.executor);

    // Reconfigure external plugins if they changed
    if (this.externalPlugin) {
      this.reconfigureExternalPlugins(oldConfig, config).catch((err) => {
        logger.error('Failed to reconfigure external plugins', { error: toErrorMessage(err) });
        this.events?.eventBus.emit({
          id: generateEventId(),
          timestamp: timestamp(),
          type: 'system:error',
          source: { kind: 'system' },
          payload: {
            type: 'system:error',
            data: {
              error: toErrorMessage(err),
              component: 'RuntimeEngine.reconfigureExternalPlugins',
              severity: 'error',
            },
          },
        });
      });
    }
  }

  /**
   * Reconfigure running external plugins based on config changes.
   * Handles HTTP listener enable/disable and port changes without a full restart.
   */
  private async reconfigureExternalPlugins(
    oldConfig: RuntimeConfig,
    newConfig: RuntimeConfig,
  ): Promise<void> {
    if (!this.externalPlugin) return;

    const oldHttp = oldConfig.external.http_listener;
    const newHttp = newConfig.external.http_listener;

    const wasEnabled = oldHttp.enabled;
    const nowEnabled = newHttp.enabled;
    const portChanged = oldHttp.port !== newHttp.port;

    if (wasEnabled && !nowEnabled) {
      // Disable: stop the listener, then clear http_listener from config
      try {
        await this.externalPlugin.stopHttpListener();
        this.externalPlugin.updateConfig({ file_watcher: newConfig.external.file_watcher });
        logger.info('HTTP webhook listener stopped (disabled by config change)');
      } catch (err) {
        logger.warn('Failed to stop HTTP webhook listener', { error: toErrorMessage(err) });
      }
    } else if (!wasEnabled && nowEnabled) {
      // Enable: push new config with http_listener first, then start
      try {
        const newExternalConfig = this.buildExternalConfig(newConfig);
        this.externalPlugin.updateConfig(newExternalConfig);
        await this.externalPlugin.startHttpListener();
        logger.info('HTTP webhook listener started (enabled by config change)', {
          port: newHttp.port,
          host: newHttp.address,
        });
      } catch (err) {
        logger.warn('Failed to start HTTP webhook listener', { error: toErrorMessage(err) });
      }
    } else if (wasEnabled && nowEnabled && portChanged) {
      // Port changed: restart the listener
      const newExternalConfig = this.buildExternalConfig(newConfig);
      const oldExternalConfig = this.buildExternalConfig(oldConfig);
      try {
        await this.externalPlugin.stopHttpListener();
        this.externalPlugin.updateConfig(newExternalConfig);
        await this.externalPlugin.startHttpListener();
        logger.info('HTTP webhook listener restarted (port change)', {
          oldPort: oldHttp.port,
          newPort: newHttp.port,
        });
      } catch (err) {
        logger.error('Failed to restart HTTP webhook listener on port change — attempting rollback', {
          error: toErrorMessage(err),
          oldPort: oldHttp.port,
          newPort: newHttp.port,
        });
        // Attempt rollback to old config so the listener is not permanently down
        try {
          this.externalPlugin.updateConfig(oldExternalConfig);
          await this.externalPlugin.startHttpListener();
          logger.warn('HTTP webhook listener rolled back to previous port', { port: oldHttp.port });
        } catch (rollbackErr) {
          logger.error('Rollback failed — HTTP webhook listener is permanently down', {
            error: toErrorMessage(rollbackErr),
          });
          this.events?.eventBus.emit({
            id: generateEventId(),
            timestamp: timestamp(),
            type: 'system:error',
            source: { kind: 'system' },
            payload: {
              type: 'system:error',
              data: {
                error: `HTTP listener permanently down after failed port change rollback: ${toErrorMessage(rollbackErr)}`,
                component: 'RuntimeEngine.reconfigureExternalPlugins',
                severity: 'fatal',
              },
            },
          });
        }
      }
    }
  }

  /**
   * Build an ExternalPluginConfig from a RuntimeConfig, stripping the `enabled` flag
   * from http_listener. If http_listener is absent or disabled, omits it entirely.
   */
  private buildExternalConfig(config: RuntimeConfig): ExternalPluginConfig {
    const http = config.external.http_listener;
    if (http.enabled) {
      const { enabled: _, ...httpListenerConfig } = http;
      return { file_watcher: config.external.file_watcher, http_listener: httpListenerConfig };
    }
    return { file_watcher: config.external.file_watcher };
  }

  getEventBus(): EventBus {
    if (!this.events?.eventBus) throw new ProcessingError('getEventBus() called before startup()');
    return this.events.eventBus;
  }
  getEventLog(): EventLog {
    if (!this.events?.eventLog) throw new ProcessingError('getEventLog() called before startup()');
    return this.events.eventLog;
  }
  getEventQueue(): EventQueue {
    if (!this.coreRuntime?.eventQueue) throw new ProcessingError('getEventQueue() called before startup()');
    return this.coreRuntime.eventQueue;
  }
  getIPCServer(): IPCServer | null { return this.ipcSubsystem?.ipcServer ?? null; }
  getWorkflowEngine(): WorkflowEngine | null { return this.workflow?.workflowEngine ?? null; }
  getTriggerRegistry(): TriggerRegistry | null { return this.triggers?.triggerRegistry ?? null; }
  getAgentCoordinator(): AgentCoordinator | null { return this.agents?.agentCoordinator ?? null; }
  getDirectiveQueue(): DirectiveQueue | null { return this.directives?.directiveQueue ?? null; }
  getCoreStateStore(): import('./core/state/state-store.js').CoreStateStore {
    if (!this.coreRuntime?.stateStore) throw new ProcessingError('getCoreStateStore() called before startup()');
    return this.coreRuntime.stateStore;
  }
  getHookProcessor(): HookProcessor | null { return this.hookProcessor; }
  getEventProcessor(): EventProcessor | null { return this.coreRuntime?.eventProcessor ?? null; }
  getExecutorMode(): ExecutorModeManager | null { return this.executorSubsystem?.executorMode ?? null; }
  getExecutorBudget(): ExecutorBudgetManager | null { return this.executorSubsystem?.executorBudget ?? null; }
  getDaemonTickHandler(): DaemonTickHandler | null { return this.executorSubsystem?.daemonTickHandler ?? null; }
}
