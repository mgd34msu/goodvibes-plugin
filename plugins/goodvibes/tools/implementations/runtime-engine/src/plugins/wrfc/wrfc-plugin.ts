/**
 * WRFC Plugin Registration — Layer 3
 *
 * Entry point for the WRFC (Write-Review-Fix-Confirm) quality loop plugin.
 * Registers WRFC triggers and handlers with the core EventProcessor and
 * TriggerRegistry using the v3 event loop contract.
 *
 * Plugin is a consumer of Layer 1 (core) and Layer 2 (extensions) —
 * it never modifies them.
 *
 * Usage:
 *   import { registerWRFCPlugin, getDefaultWRFCConfig } from './wrfc-plugin.js';
 *   registerWRFCPlugin({ processor, registry, config: getDefaultWRFCConfig() });
 */

import { createLogger } from '../../shared/logger.js';
import type { EventProcessor } from '../../core/processing/event-processor.js';
import type { TriggerRegistry } from '../../core/matching/trigger-registry.js';
import type { StateStoreInterface, TriggerHandlerFn, HandlerResult } from '../../core/types.js';
import { createWRFCTrigger } from '../../extensions/triggers/factories.js';
import {
  handleWorkflowCreated,
  handleAgentCompleted,
  handleQualityGate,
  HANDLER_IDS,
  TRIGGER_IDS,
} from './handlers.js';

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

  // 2. Register triggers

  // Trigger: agent:spawned → initialise workflow state
  registry.register(
    createWRFCTrigger({
      id: TRIGGER_IDS.AGENT_SPAWNED,
      event_match: {
        source: 'agent',
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
        source: 'agent',
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
  // We wrap each handler to pass the store from closure, since the v3
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
