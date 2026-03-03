/**
 * WRFC Plugin Registration — Layer 3
 *
 * Entry point for the WRFC (Write-Review-Fix-Confirm) quality loop plugin.
 * Registers WRFC triggers and handlers with the core EventProcessor and
 * TriggerRegistry using the event loop contract.
 *
 * Plugin is a consumer of Layer 1 (core) and Layer 2 (extensions) —
 * it never modifies them.
 *
 * Usage (class-based API — preferred):
 *   import { WRFCPlugin } from './wrfc-plugin.js';
 *   const plugin = new WRFCPlugin(config);
 *   await plugin.register(services); // registers triggers + handlers internally
 *   await plugin.start();
 *
 * Usage (function-based API — backward compat):
 *   import { registerWRFCPlugin, getDefaultWRFCConfig } from './wrfc-plugin.js';
 *   registerWRFCPlugin({ processor, registry, config: getDefaultWRFCConfig() });
 */

import { createLogger } from '../../shared/logger.js';
import type { EventProcessor } from '../../core/processing/event-processor.js';
import type { TriggerRegistry } from '../../core/trigger-registry.js';
import type { StateStoreInterface, TriggerHandlerFn, HandlerResult, Trigger, StateChange } from '../../core/types.js';
import { createWRFCTrigger } from '../../extensions/triggers/factories.js';
import type {
  RuntimePlugin,
  PluginState,
  PluginWorkflowDefinition,
  PluginTriggerDefinition,
  PluginEventHandler,
  RuntimeServices,
} from '../../shared/plugin.js';
import type { RuntimeEvent } from '../../shared/events.js';
import {
  handleWorkflowCreated,
  handleAgentCompleted,
  handleQualityGate,
  HANDLER_IDS,
  TRIGGER_IDS,
} from './handlers.js';
import { getWRFCWorkflowDefinitions } from './workflows.js';
import { getWRFCTriggerDefinitions } from './triggers.js';

const log = createLogger('wrfc-plugin');

// ─── Plugin Config ──────────────────────────────────────────────────────────────────────────────

/**
 * Configuration for the WRFC plugin.
 */
export interface WRFCPluginConfig {
  /** Minimum review score (0–10) required to pass the quality gate. Default 9.5. */
  score_threshold: number;
  /** Maximum number of fix iterations before escalation. Default 3. */
  max_fix_attempts: number;
  /** When false, all agents auto-complete without review. Default true. */
  enable_quality_gates: boolean;
  /** Additional agent types that must always be reviewed (merged with hardcoded defaults). */
  require_review_types?: string[];
}

/**
 * Returns the default WRFC plugin configuration.
 */
export function getDefaultWRFCConfig(): WRFCPluginConfig {
  return {
    score_threshold: 9.5,
    max_fix_attempts: 3,
    enable_quality_gates: true,
  };
}

// ─── Plugin Context ───────────────────────────────────────────────────────────────────────────────

/**
 * Dependencies required by the WRFC plugin (function-based API).
 */
export interface PluginContext {
  /** Core event processor (for handler registration). */
  processor: EventProcessor;
  /** Core trigger registry (for trigger registration). */
  registry: TriggerRegistry;
  /** Core state store (for config seeding). */
  store: StateStoreInterface;
  /** WRFC plugin configuration. */
  config: WRFCPluginConfig;
}

// ─── Plugin Registration ───────────────────────────────────────────────────────────────────────────────

/**
 * Registers the WRFC plugin with the core event processor and trigger registry.
 *
 * Registration order:
 *   1. Seed global WRFC config into the state store.
 *   2. Register the three WRFC triggers with the TriggerRegistry.
 *   3. Register the three handler functions with the EventProcessor.
 *
 * @param ctx - Plugin context with processor, registry, store, and config.
 */
export function registerWRFCPlugin(ctx: PluginContext): void {
  const { processor, registry, store, config } = ctx;

  // 1. Seed global config into state store so handlers can read it
  store.set('wrfc.config.min_review_score', config.score_threshold);
  store.set('wrfc.config.max_fix_attempts', config.max_fix_attempts);
  store.set('wrfc.config.enable_quality_gates', config.enable_quality_gates);
  if (config.require_review_types && config.require_review_types.length > 0) {
    store.set('wrfc.config.require_review_types', config.require_review_types);
  }

  // 2. Register triggers

  // Trigger: agent:spawned → initialise workflow state
  registry.register(
    createWRFCTrigger({
      id: TRIGGER_IDS.AGENT_SPAWNED,
      event_match: {
        source: [{ kind: 'agent' as const } as import('../../shared/events.js').EventSource, { kind: 'internal' as const } as import('../../shared/events.js').EventSource],
        type: 'agent:spawned',
      },
      actions: [],
      max_fires: 500,
      priority: 10,
    }) as unknown as import('../../extensions/triggers/types.js').TriggerDefinition,
  );

  // Trigger: agent:completed → route to review / fix / complete
  registry.register(
    createWRFCTrigger({
      id: TRIGGER_IDS.AGENT_COMPLETED,
      event_match: {
        source: [{ kind: 'agent' as const } as import('../../shared/events.js').EventSource, { kind: 'internal' as const } as import('../../shared/events.js').EventSource],
        type: 'agent:completed',
      },
      actions: [],
      max_fires: 500,
      score_threshold: config.score_threshold,
      max_fix_attempts: config.max_fix_attempts,
      priority: 10,
    }) as unknown as import('../../extensions/triggers/types.js').TriggerDefinition,
  );

  // Trigger: wrfc:review_completed → quality gate evaluation (event-driven path)
  registry.register(
    createWRFCTrigger({
      id: TRIGGER_IDS.REVIEW_COMPLETED,
      event_match: {
        source: { kind: 'internal' as const } as import('../../shared/events.js').EventSource,
        type: 'wrfc:review_completed',
      },
      actions: [],
      max_fires: 500,
      score_threshold: config.score_threshold,
      max_fix_attempts: config.max_fix_attempts,
      priority: 10,
    }) as unknown as import('../../extensions/triggers/types.js').TriggerDefinition,
  );

  // 3. Register handler functions with the processor
  //
  // TriggerHandlerFn signature: (event: RuntimeEvent) => Promise<HandlerResult>
  // We wrap each handler to pass the store from closure.

  const spawned_trigger = registry.get(TRIGGER_IDS.AGENT_SPAWNED) as import('../../core/types.js').Trigger | undefined;
  const spawnedHandler: TriggerHandlerFn = async (event): Promise<HandlerResult> => {
    if (!spawned_trigger) return {};
    return handleWorkflowCreated(event, spawned_trigger, store);
  };
  processor.registerHandler(TRIGGER_IDS.AGENT_SPAWNED, spawnedHandler);

  const completed_trigger = registry.get(TRIGGER_IDS.AGENT_COMPLETED) as import('../../core/types.js').Trigger | undefined;
  const completedHandler: TriggerHandlerFn = async (event): Promise<HandlerResult> => {
    if (!completed_trigger) return {};
    return handleAgentCompleted(event, completed_trigger, store);
  };
  processor.registerHandler(TRIGGER_IDS.AGENT_COMPLETED, completedHandler);

  const quality_gate_trigger = registry.get(TRIGGER_IDS.REVIEW_COMPLETED) as import('../../core/types.js').Trigger | undefined;
  const qualityGateHandler: TriggerHandlerFn = async (event): Promise<HandlerResult> => {
    if (!quality_gate_trigger) return {};
    return handleQualityGate(event, quality_gate_trigger, store);
  };
  processor.registerHandler(TRIGGER_IDS.REVIEW_COMPLETED, qualityGateHandler);

  log.info('WRFC plugin registered', {
    triggers: Object.values(TRIGGER_IDS),
    handlers: Object.values(HANDLER_IDS),
    config,
  });
}

// ─── RuntimePlugin Class ──────────────────────────────────────────────────────────────────────────────

/**
 * Adapter that bridges RuntimeServices to a StateStoreInterface.
 *
 * Allows handler functions that expect a StateStoreInterface to operate
 * through the plugin services abstraction.
 */
function makeStoreAdapter(services: RuntimeServices): StateStoreInterface {
  return {
    get<T>(key: string): T | null {
      const val = services.getState(key);
      return val !== undefined && val !== null ? (val as T) : null;
    },
    set<T>(key: string, value: T): void {
      services.setState(key, value);
    },
    delete(key: string): void {
      services.deleteState(key);
    },
    merge(_key: string, _value: Record<string, unknown>): void {
      // No-op: RuntimeServices does not expose merge.
      // WRFC handlers do not call merge().
    },
    snapshot(): Record<string, unknown> {
      return {};
    },
    restore(_snapshot: Record<string, unknown>): void {
      // No-op: RuntimeServices does not expose bulk restore.
    },
    keys(prefix?: string): string[] {
      return services.listStateKeys(prefix);
    },
    onStateChange(_listener: (change: StateChange) => void): void {
      // No-op: RuntimeServices does not expose state change listeners.
      // WRFC handlers do not need state change callbacks.
    },
  };
}

/**
 * WRFCPlugin — RuntimePlugin implementation for the WRFC quality loop.
 *
 * Implements the RuntimePlugin interface. `register()` is the canonical entry
 * point: it seeds config, registers all triggers, and wires all event handlers
 * by delegating to `registerWRFCPlugin()` internally. This eliminates the
 * dual-registration path where bootstrap previously called both
 * `registerWRFCPlugin()` AND `WRFCPlugin.register()` separately.
 *
 * The function-based `registerWRFCPlugin` API remains exported for backward
 * compatibility and as the shared internal implementation.
 */
export class WRFCPlugin implements RuntimePlugin {
  readonly name = 'wrfc';
  readonly version = '1.0.0';
  state: PluginState = 'registered';

  private config: WRFCPluginConfig;

  /**
   * Captured event handlers, populated during register().
   * Returned by getHandlers() so callers can inspect registered handlers.
   */
  private _handlers: PluginEventHandler[] = [];

  constructor(config?: Partial<WRFCPluginConfig>) {
    this.config = { ...getDefaultWRFCConfig(), ...config };
  }

  /**
   * Register plugin with runtime services.
   *
   * This is the canonical registration path. It:
   *   1. Seeds WRFC config into the state store via services.
   *   2. Registers the three WRFC triggers via services.registerTrigger().
   *   3. Wires the three event handlers via services.registerTrigger().
   *   4. Captures handler references for getHandlers().
   *
   * After this call, start() only transitions lifecycle state to 'running'.
   */
  register(services: RuntimeServices): void {
    const store = makeStoreAdapter(services);

    // Seed config into state store
    store.set('wrfc.config.min_review_score', this.config.score_threshold);
    store.set('wrfc.config.max_fix_attempts', this.config.max_fix_attempts);
    store.set('wrfc.config.enable_quality_gates', this.config.enable_quality_gates);
    if (this.config.require_review_types && this.config.require_review_types.length > 0) {
      store.set('wrfc.config.require_review_types', this.config.require_review_types);
    }

    // Build handler closures that capture the store adapter.
    // The trigger argument is unused by all three handlers (prefixed _trigger),
    // so a sentinel empty trigger object satisfies the type without storing deps.
    const nullTrigger = {} as unknown as Trigger;

    const workflowCreatedHandler = (event: RuntimeEvent): Promise<HandlerResult> =>
      Promise.resolve(handleWorkflowCreated(event, nullTrigger, store));

    const agentCompletedHandler = (event: RuntimeEvent): Promise<HandlerResult> =>
      Promise.resolve(handleAgentCompleted(event, nullTrigger, store));

    const qualityGateHandler = (event: RuntimeEvent): Promise<HandlerResult> =>
      Promise.resolve(handleQualityGate(event, nullTrigger, store));

    // Register triggers (and their handlers) with the runtime via services
    services.registerTrigger(
      TRIGGER_IDS.AGENT_SPAWNED,
      {
        id: TRIGGER_IDS.AGENT_SPAWNED,
        name: 'wrfc_agent_spawned',
        description: 'Initialise WRFC workflow state when a new agent is spawned',
        event_type: 'agent:spawned',
        conditions: [{ source: ['agent', 'internal'] }],
        actions: [],
        enabled: true,
        max_fires: 500,
      },
      workflowCreatedHandler,
    );

    services.registerTrigger(
      TRIGGER_IDS.AGENT_COMPLETED,
      {
        id: TRIGGER_IDS.AGENT_COMPLETED,
        name: 'wrfc_agent_completed',
        description: 'Route agent to review, fix, or complete when it finishes',
        event_type: 'agent:completed',
        conditions: [{ source: ['agent', 'internal'] }],
        actions: [],
        enabled: true,
        max_fires: 500,
      },
      agentCompletedHandler,
    );

    services.registerTrigger(
      TRIGGER_IDS.REVIEW_COMPLETED,
      {
        id: TRIGGER_IDS.REVIEW_COMPLETED,
        name: 'wrfc_review_completed',
        description: 'Quality gate evaluation when a review completes (event-driven path)',
        event_type: 'wrfc:review_completed',
        conditions: [{ source: ['internal'] }],
        actions: [],
        enabled: true,
        max_fires: 500,
      },
      qualityGateHandler,
    );

    // Capture handlers for getHandlers()
    this._handlers = [
      {
        event_type: 'agent:spawned',
        handler: workflowCreatedHandler,
        priority: 10,
      },
      {
        event_type: 'agent:completed',
        handler: agentCompletedHandler,
        priority: 10,
      },
      {
        event_type: 'wrfc:review_completed',
        handler: qualityGateHandler,
        priority: 10,
      },
    ];

    this.state = 'starting';
    log.debug('WRFCPlugin registered with runtime services', {
      triggers: Object.values(TRIGGER_IDS),
      handlers: Object.values(HANDLER_IDS),
      config: this.config,
    });
  }

  /**
   * Start the plugin.
   * All registration was performed in register(). This only advances the
   * lifecycle state to 'running'.
   */
  start(): void {
    if (this._handlers.length === 0) {
      throw new Error('WRFCPlugin: register() must be called before start()');
    }
    this.state = 'running';
    log.info('WRFCPlugin started', { config: this.config });
  }

  /** Stop the plugin and clean up. */
  stop(): void {
    this.state = 'stopped';
    this._handlers = [];
    log.debug('WRFCPlugin stopped');
  }

  /** Returns WRFC workflow definition metadata for plugin registration. */
  getWorkflowDefinitions(): PluginWorkflowDefinition[] {
    return getWRFCWorkflowDefinitions();
  }

  /** Returns WRFC trigger definitions for plugin registration. */
  getTriggerDefinitions(): PluginTriggerDefinition[] {
    return getWRFCTriggerDefinitions();
  }

  /**
   * Returns the three WRFC event handler registrations.
   *
   * Handlers are captured during register() as closures over the state store
   * adapter. Returns an empty array before register() is called.
   */
  getHandlers(): PluginEventHandler[] {
    return [...this._handlers];
  }
}
