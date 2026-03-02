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
 * Usage:
 *   import { registerWRFCPlugin, getDefaultWRFCConfig } from './wrfc-plugin.js';
 *   registerWRFCPlugin({ processor, registry, config: getDefaultWRFCConfig() });
 *
 * Or use the RuntimePlugin class API:
 *   import { WRFCPlugin } from './wrfc-plugin.js';
 *   const plugin = new WRFCPlugin(config);
 *   await plugin.register(services);
 *   await plugin.start();
 */

import { createLogger } from '../../shared/logger.js';
import type { EventProcessor } from '../../core/processing/event-processor.js';
import type { TriggerRegistry } from '../../core/trigger-registry.js';
import type { StateStoreInterface, TriggerHandlerFn, HandlerResult } from '../../core/types.js';
import { createWRFCTrigger } from '../../extensions/triggers/factories.js';
import type {
  RuntimePlugin,
  PluginState,
  PluginWorkflowDefinition,
  PluginTriggerDefinition,
  PluginEventHandler,
  RuntimeServices,
} from '../../shared/plugin.js';
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

// ─── Plugin Config ────────────────────────────────────────────────────────────

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

// ─── Plugin Context ──────────────────────────────────────────────────────────

/**
 * Dependencies required by the WRFC plugin.
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

// ─── Plugin Registration ───────────────────────────────────────────────────────

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
        source: ['agent', 'internal'],
        type: 'agent:spawned',
      },
      actions: [],
      max_fires: 500,
      priority: 10,
    }),
  );

  // Trigger: agent:completed → route to review / fix / complete
  registry.register(
    createWRFCTrigger({
      id: TRIGGER_IDS.AGENT_COMPLETED,
      event_match: {
        source: ['agent', 'internal'],
        type: 'agent:completed',
      },
      actions: [],
      max_fires: 500,
      score_threshold: config.score_threshold,
      max_fix_attempts: config.max_fix_attempts,
      priority: 10,
    }),
  );

  // Trigger: wrfc:review_completed → quality gate evaluation (event-driven path)
  registry.register(
    createWRFCTrigger({
      id: TRIGGER_IDS.REVIEW_COMPLETED,
      event_match: {
        source: 'internal',
        type: 'wrfc:review_completed',
      },
      actions: [],
      max_fires: 500,
      score_threshold: config.score_threshold,
      max_fix_attempts: config.max_fix_attempts,
      priority: 10,
    }),
  );

  // 3. Register handler functions with the processor
  //
  // TriggerHandlerFn signature: (event: RuntimeEvent) => Promise<HandlerResult>
  // We wrap each handler to pass the store from closure, since the
  // TriggerHandlerFn does not receive the store parameter directly.
  // The trigger is retrieved from the registry for callers that need it.

  const spawned_trigger = registry.get(TRIGGER_IDS.AGENT_SPAWNED);
  const spawnedHandler: TriggerHandlerFn = async (event): Promise<HandlerResult> => {
    if (!spawned_trigger) return {};
    return handleWorkflowCreated(event, spawned_trigger, store);
  };
  processor.registerHandler(TRIGGER_IDS.AGENT_SPAWNED, spawnedHandler);

  const completed_trigger = registry.get(TRIGGER_IDS.AGENT_COMPLETED);
  const completedHandler: TriggerHandlerFn = async (event): Promise<HandlerResult> => {
    if (!completed_trigger) return {};
    return handleAgentCompleted(event, completed_trigger, store);
  };
  processor.registerHandler(TRIGGER_IDS.AGENT_COMPLETED, completedHandler);

  const quality_gate_trigger = registry.get(TRIGGER_IDS.REVIEW_COMPLETED);
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

// ─── RuntimePlugin Class ──────────────────────────────────────────────────────

/**
 * WRFCPlugin — RuntimePlugin implementation for the WRFC quality loop.
 *
 * Implements the RuntimePlugin interface, providing the plugin lifecycle
 * contract alongside the existing registerWRFCPlugin() function API.
 *
 * The class-based API is designed for use with a future plugin registry;
 * the function-based API (registerWRFCPlugin) remains for backward compat.
 */
export class WRFCPlugin implements RuntimePlugin {
  readonly name = 'wrfc';
  readonly version = '1.0.0';
  state: PluginState = 'registered';

  private config: WRFCPluginConfig;
  private _services: RuntimeServices | null = null;

  constructor(config?: Partial<WRFCPluginConfig>) {
    this.config = { ...getDefaultWRFCConfig(), ...config };
  }

  /**
   * Register plugin with runtime services.
   * Stores services reference for use during start().
   */
  register(services: RuntimeServices): void {
    this._services = services;
    this.state = 'starting';
    log.debug('WRFCPlugin registered with runtime services');
  }

  /**
   * Start the plugin.
   * Seeds config into state store via RuntimeServices.
   */
  start(): void {
    if (!this._services) {
      throw new Error('WRFCPlugin: register() must be called before start()');
    }
    const { setState } = this._services;
    setState('wrfc.config.min_review_score', this.config.score_threshold);
    setState('wrfc.config.max_fix_attempts', this.config.max_fix_attempts);
    setState('wrfc.config.enable_quality_gates', this.config.enable_quality_gates);
    if (this.config.require_review_types && this.config.require_review_types.length > 0) {
      setState('wrfc.config.require_review_types', this.config.require_review_types);
    }
    this.state = 'running';
    log.info('WRFCPlugin started', { config: this.config });
  }

  /** Stop the plugin and clean up. */
  stop(): void {
    this.state = 'stopped';
    this._services = null;
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
   * Returns WRFC event handler registrations.
   *
   * Note: The full handler wiring (including TriggerRegistry and EventProcessor
   * integration) is performed by registerWRFCPlugin(). This method provides
   * the handler metadata summary for the RuntimePlugin interface.
   */
  getHandlers(): PluginEventHandler[] {
    return [
      {
        event_type: 'agent:spawned',
        handler: () => { /* handled via registerWRFCPlugin wiring */ },
        priority: 10,
      },
      {
        event_type: 'agent:completed',
        handler: () => { /* handled via registerWRFCPlugin wiring */ },
        priority: 10,
      },
      {
        event_type: 'wrfc:review_completed',
        handler: () => { /* handled via registerWRFCPlugin wiring */ },
        priority: 10,
      },
    ];
  }
}
