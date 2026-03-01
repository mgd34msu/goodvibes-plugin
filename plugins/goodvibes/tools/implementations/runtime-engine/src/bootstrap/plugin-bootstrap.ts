/**
 * plugin-bootstrap.ts — Core components and plugin layer initialization.
 *
 * Responsibilities:
 * - Core EventQueue, TriggerRegistry, CoreStateStore initialization
 * - EventProcessor setup with ActionExecutor
 * - WRFC plugin registration
 * - EventBridge wiring (EventBus → core EventQueue)
 * - Hooks plugin (HookRegistry, HookProcessor, default handlers)
 * - Time plugin initialization
 * - External plugin (file watcher + HTTP listener) initialization
 * - TickDriver setup
 * - Cleanup on shutdown
 */

import { createLogger } from '../shared/logger.js';
import { toErrorMessage } from '../shared/utils.js';
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
import {
  registerWRFCPlugin,
  getDefaultWRFCConfig,
  HookProcessor,
  HookRegistry,
  registerDefaultHandlers,
  TimePlugin,
  ExternalPlugin,
} from '../plugins/index.js';
import type { ExternalPluginConfig } from '../plugins/index.js';
import { ActionExecutor } from '../extensions/executor/action-executor.js';
import { EventBridge } from '../extensions/events/event-bridge.js';
import { TickDriver } from '../extensions/executor/tick-driver.js';

import type { EventBus } from '../extensions/events/event-bus.js';
import type { DirectiveQueue } from '../extensions/directives/directive-queue.js';
import type { AgentWorkflowMap } from '../extensions/directives/agent-workflow-map.js';
import type { DaemonTickHandler } from '../extensions/executor/daemon-tick-handler.js';
import type { ExecutorModeManager } from '../core/processing/executor-mode.js';
import type { WatchdogCoordinator } from '../extensions/workflow/watchdog.js';
import type { RuntimeConfig } from '../shared/config.js';

const logger = createLogger('plugin-bootstrap');

export interface PluginSubsystem {
  coreEventQueue: CoreEventQueue;
  coreTriggerRegistry: CoreTriggerRegistry;
  coreStateStore: CoreStateStore;
  eventProcessor: EventProcessor;
  hookProcessor: HookProcessor;
  hookRegistry: HookRegistry;
  timePlugin: TimePlugin;
  externalPlugin: ExternalPlugin;
  eventBridge: EventBridge;
  tickDriver: TickDriver | null;
}

export interface PluginBootstrapDeps {
  config: RuntimeConfig;
  eventBus: EventBus;
  directiveQueue: DirectiveQueue | null;
  agentWorkflowMap: AgentWorkflowMap | null;
  daemonTickHandler: DaemonTickHandler | null;
  executorMode: ExecutorModeManager | null;
  watchdog: WatchdogCoordinator | null;
}

/**
 * Initialize all core components and the plugin layer.
 *
 * Returns the initialized subsystem on success, or null on failure.
 * Failure is logged and swallowed to preserve backward compatibility.
 */
export async function initializePlugins(deps: PluginBootstrapDeps): Promise<PluginSubsystem | null> {
  const { config, eventBus, directiveQueue, agentWorkflowMap, daemonTickHandler, executorMode, watchdog } = deps;
  try {
    // 1. Core: EventQueue
    const coreEventQueue = new CoreEventQueue();

    // 2. Core: TriggerRegistry
    const coreTriggerRegistry = new CoreTriggerRegistry();

    // 3. Core: CoreStateStore
    const coreStateStore = new CoreStateStore();

    // 4. Core: supporting components
    const lifecycle = new LoopLifecycleManager();
    const metrics = new EventMetrics();
    const deadLetter = new DeadLetterQueue();
    const errorHandler = new ErrorHandler({ deadLetter });

    // 5. Core: EventProcessor
    // Create action executor — translates handler actions into directive queue enqueues
    const actionExecutor = directiveQueue
      ? new ActionExecutor(directiveQueue)
      : undefined;

    const eventProcessor = new EventProcessor(
      coreEventQueue,
      coreTriggerRegistry,
      coreStateStore,
      lifecycle,
      metrics,
      errorHandler,
      deadLetter,
      { action_executor: actionExecutor },
    );

    logger.debug('Core components initialised');

    // 6. WRFC plugin
    registerWRFCPlugin({
      processor: eventProcessor,
      registry: coreTriggerRegistry,
      store: coreStateStore,
      config: getDefaultWRFCConfig(),
    });
    logger.debug('WRFC plugin registered');

    // 6a. Bridge EventBus events to core EventQueue
    const eventBridge = new EventBridge(eventBus, coreEventQueue);
    eventBridge.start();
    logger.debug('Event bridge started');

    // 7. Hooks plugin
    /** Empty session ID sentinel — no active session at plugin construction time. */
    const NO_SESSION_ID = '';
    const hookRegistry = new HookRegistry();
    const hookProcessor = new HookProcessor({
      registry: hookRegistry,
      sessionId: NO_SESSION_ID,  // sentinel: no session at construction time
    });
    registerDefaultHandlers(hookRegistry, {
      eventBus,
      directiveQueue,
      agentWorkflowMap,
      daemonTickHandler,
      executorMode,
    });
    logger.debug('Hooks plugin registered', {
      handlerCount: hookRegistry.count(),
    });

    // 8. Time plugin
    const timePlugin = new TimePlugin({
      queue: coreEventQueue,
      store: coreStateStore,
      config: config.time,
    });
    logger.debug('Time plugin initialised');

    // 9. External plugin
    const { enabled: httpEnabled, ...httpListenerConfig } = config.external.http_listener;
    const externalPluginConfig: ExternalPluginConfig = {
      file_watcher: config.external.file_watcher,
      ...(httpEnabled ? { http_listener: httpListenerConfig } : {}),
    };
    const externalPlugin = new ExternalPlugin(
      coreEventQueue,
      externalPluginConfig,
    );
    try {
      await externalPlugin.initialize();
    } catch (err) {
      logger.warn('External plugin directory initialisation failed', {
        err: toErrorMessage(err),
      });
    }
    if (httpEnabled) {
      try {
        await externalPlugin.startHttpListener();
        logger.info('HTTP webhook listener started', {
          port: config.external.http_listener.port,
          host: config.external.http_listener.address,
        });
      } catch (err) {
        logger.warn('Failed to start HTTP webhook listener', {
          err: toErrorMessage(err),
        });
      }
    }
    logger.debug('External plugin initialised');

    // 9a. TickDriver
    let tickDriver: TickDriver | null = null;
    if (!executorMode) {
      logger.warn('skipping tick driver — executorMode not available');
    } else {
      tickDriver = new TickDriver({
        config: config.executor,
        executorMode,
        timePlugin,
        externalPlugin: externalPlugin ?? undefined,
        eventProcessor: eventProcessor ?? undefined,
        staleWorkflowChecker: () => watchdog?.checkStaleWorkflows(),
      });
      logger.debug('tick driver created');
    }

    logger.info('Plugins fully initialised');
    return {
      coreEventQueue,
      coreTriggerRegistry,
      coreStateStore,
      eventProcessor,
      hookProcessor,
      hookRegistry,
      timePlugin,
      externalPlugin,
      eventBridge,
      tickDriver,
    };
  } catch (err) {
    logger.warn('Plugin initialisation failed — continuing without plugin layer', {
      err: toErrorMessage(err),
    });
    return null;
  }
}

/**
 * Stop and nullify all plugin subsystem components.
 */
export function cleanupPlugins(subsystem: PluginSubsystem | null): void {
  if (!subsystem) return;
  subsystem.eventBridge?.stop();
}
