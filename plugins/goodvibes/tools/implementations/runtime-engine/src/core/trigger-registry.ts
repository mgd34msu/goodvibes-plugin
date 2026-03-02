/**
 * Unified Trigger Registry — Layer 1 Core
 *
 * Merges L1 (core/types.ts Trigger + Condition + EventMatcher) and
 * L2 (extensions/triggers) capabilities into a single canonical registry.
 *
 * Capabilities:
 *  - L2 TriggerDefinition with priority, cooldown, max_fires lifecycle
 *  - L2 TriggerCondition union: EventCondition, CompositeCondition,
 *    ThresholdCondition, PatternCondition (sequence)
 *  - L2 TriggerAction union: emit_event, spawn_agent, invoke_handler,
 *    start_workflow, send_workflow_event, parallel, sequence
 *  - L2 ConditionEvaluator: O(1) ring-buffer for threshold/sequence evaluation
 *  - L2 TriggerActionExecutor: template resolution + action dispatch
 *  - L1 TriggerRegistryInterface: match(event, store) + recordFire() shims
 *
 * Phase 2B will migrate extensions/triggers/trigger-registry.ts to re-export
 * from here and become a thin compatibility shim.
 */

import { createLogger } from '../shared/logger.js';
import { QueueError } from '../shared/errors.js';
import type { RuntimeEvent } from '../shared/events.js';
import type { EventBus } from '../extensions/events/event-bus.js';
import type { TriggersConfig } from '../shared/config.js';
import type { DirectiveQueue } from '../extensions/directives/directive-queue.js';
import type { WRFCConfigStore } from '../extensions/directives/wrfc-config-store.js';
import type { WorkflowEngine } from '../extensions/workflow/workflow-engine.js';
import { ConditionEvaluator } from '../extensions/triggers/condition-evaluator.js';
import { TriggerActionExecutor } from '../extensions/triggers/trigger-action-executor.js';
import type {
  TriggerDefinition,
  TriggerResult,
  TriggerActionHandler,
} from '../extensions/triggers/types.js';
import type {
  Trigger,
  EventMatcher,
  StateStoreInterface,
} from './types.js';

// Re-export L2 types so consumers can import from core
export type {
  TriggerDefinition,
  TriggerCondition,
  TriggerAction,
  TriggerResult,
  TriggerActionHandler,
  EventCondition,
  CompositeCondition,
  ThresholdCondition,
  PatternCondition,
  EmitEventAction,
  SpawnAgentAction,
  InvokeHandlerAction,
  WorkflowAction,
  CompositeAction,
} from '../extensions/triggers/types.js';

const log = createLogger('trigger-registry');

/**
 * Unified Trigger Registry.
 *
 * Implements both the L2 full-featured interface (used by bootstrap and all
 * production code) and the L1 TriggerRegistryInterface (match + recordFire)
 * for backward compatibility with the core layer contract.
 *
 * @implements {TriggerRegistryInterface} — structural compatibility only.
 * The class provides a superset of the L1 interface. The `register()` and
 * `get()` methods use L2 `TriggerDefinition` instead of L1 `Trigger`.
 * L1 interface methods (match, recordFire, enable, disable, unregister)
 * are fully implemented as compatibility shims.
 *
 * Lifecycle:
 * 1. Construct with a {@link TriggersConfig}.
 * 2. Inject all dependencies via `setDependencies`.
 * 3. Register built-in and user-defined triggers via `register`.
 * 4. Call `evaluate(event)` for every event that flows through the engine.
 */
export class TriggerRegistry {
  /** All registered trigger definitions, keyed by trigger ID. */
  private readonly triggers: Map<string, TriggerDefinition> = new Map();
  /** Stateful condition evaluator with recent-event O(1) ring buffer. */
  private readonly evaluator: ConditionEvaluator;
  /** Action executor with handler registry. */
  private executor: TriggerActionExecutor;
  /** Named action handlers — mirrored here so they survive executor replacement. */
  private readonly actionHandlers: Map<string, TriggerActionHandler> = new Map();
  /** Resolved triggers configuration. */
  private readonly config: TriggersConfig;

  /**
   * @param config - Triggers section of the resolved {@link RuntimeConfig}.
   */
  constructor(config: TriggersConfig) {
    this.config = config;
    this.evaluator = new ConditionEvaluator();
    this.executor = new TriggerActionExecutor(null, null, null, config);
  }

  // ─── L1 TriggerRegistryInterface — Compatibility Shims ────────────────────

  /**
   * L1 compatibility: match an event against all enabled triggers, returning
   * triggers whose `EventCondition` fires (condition met, guards passed).
   *
   * This is a synchronous approximation — it evaluates EventCondition types
   * only (no threshold/sequence, no action execution). For full L2 evaluation
   * with action dispatch, use `evaluate(event)` instead.
   *
   * @param event - Incoming runtime event.
   * @param _store - State store (used by L1 `Condition` evaluation; not used
   *   by L2 TriggerDefinition — provided for interface compatibility).
   * @returns L1 `Trigger[]` stubs for each fired TriggerDefinition.
   */
  match(event: RuntimeEvent, _store: StateStoreInterface): Trigger[] {
    // NOTE: The `_store` parameter is intentionally unused.
    //
    // The L1 TriggerRegistryInterface contract specifies that state-store
    // conditions (L1 `Condition[]` with eq/neq/gt/lt/gte/lte/in/exists ops)
    // are evaluated against the store. However, `TriggerDefinition` (L2) does
    // NOT have a `conditions: Condition[]` field — it uses a `TriggerCondition`
    // union (EventCondition, CompositeCondition, ThresholdCondition,
    // PatternCondition) evaluated by ConditionEvaluator against event history.
    //
    // L2 TriggerCondition types subsume all L1 state-store conditions:
    //   - L1 `eq/neq/gt/lt/gte/lte` → L2 EventCondition with payload_match
    //   - L1 `in`                    → L2 CompositeCondition (or)
    //   - L1 `exists`                → L2 EventCondition
    //
    // Callers migrating from L1 should express state-store conditions as L2
    // EventCondition or PatternCondition rather than relying on `_store`.
    const now = Date.now();
    const matched: Trigger[] = [];

    for (const trigger of this.triggers.values()) {
      if (!trigger.enabled) continue;
      if (!this.passesGuards(trigger, now)) continue;

      // Use the condition evaluator synchronously for simple event conditions;
      // threshold/sequence require event history so we record first.
      const conditionMet = this.evaluator.evaluate(trigger.condition, event);
      if (!conditionMet) continue;

      // Convert TriggerDefinition → L1 Trigger stub
      matched.push(this.toL1Trigger(trigger));
    }

    return matched;
  }

  /**
   * L1 compatibility: record that a trigger has fired (increments fire count).
   *
   * @param trigger_id - ID of the trigger that fired.
   */
  recordFire(trigger_id: string): void {
    const trigger = this.triggers.get(trigger_id);
    if (trigger) {
      trigger.fires_count++;
      trigger.last_fired = Date.now();
    }
  }

  /**
   * L1 compatibility: enable a trigger by ID.
   *
   * @param id - Trigger ID to enable.
   */
  enable(id: string): void {
    this.setEnabled(id, true);
  }

  /**
   * L1 compatibility: disable a trigger without removing it.
   *
   * @param id - Trigger ID to disable.
   */
  disable(id: string): void {
    this.setEnabled(id, false);
  }

  // ─── L2 Full-Featured Interface ───────────────────────────────────────────

  /**
   * Injects all shared dependencies into the ActionExecutor.
   *
   * Replaces the internal TriggerActionExecutor with a new instance wired to
   * the provided dependencies. Any handlers registered before this call are
   * preserved on the new executor.
   *
   * @param bus - The shared EventBus instance.
   * @param directiveQueue - The shared DirectiveQueue instance, or null.
   * @param workflowEngine - The shared WorkflowEngine instance, or null.
   * @param wrfcConfigStore - The WRFC config store, or null.
   */
  setDependencies(
    bus: EventBus,
    directiveQueue: DirectiveQueue | null = null,
    workflowEngine: WorkflowEngine | null = null,
    wrfcConfigStore: WRFCConfigStore | null = null,
  ): void {
    this.executor = new TriggerActionExecutor(
      bus,
      directiveQueue,
      workflowEngine,
      this.config,
      wrfcConfigStore,
    );
    // Re-register any handlers registered before setDependencies was called
    for (const [name, handler] of this.actionHandlers) {
      this.executor.registerHandler(name, handler);
    }
  }

  /**
   * Registers a trigger definition.
   *
   * Rejects registration if the `max_triggers` limit would be exceeded.
   *
   * @param trigger - The trigger definition to register.
   * @throws {QueueError} If the trigger limit is reached.
   */
  register(trigger: TriggerDefinition): void {
    if (this.triggers.size >= this.config.max_triggers) {
      throw new QueueError(
        `TriggerRegistry: max_triggers limit reached (${this.config.max_triggers}). Cannot register '${trigger.id}'.`,
      );
    }
    this.triggers.set(trigger.id, trigger);
    log.debug('Trigger registered', {
      id: trigger.id,
      name: trigger.name,
      priority: trigger.priority,
    });
  }

  /**
   * Atomically replaces an existing trigger definition, preserving runtime state.
   *
   * Unlike `unregister` + `register`, this is a single Map operation with no gap
   * during which the trigger is absent.
   *
   * @param trigger - The replacement definition. Must share the same `id`.
   * @throws {QueueError} If no trigger with the given ID is currently registered.
   */
  replace(trigger: TriggerDefinition): void {
    const existing = this.triggers.get(trigger.id);
    if (!existing) {
      throw new QueueError(`Cannot replace trigger '${trigger.id}': not registered`);
    }
    // Unconditionally preserve runtime state from the old trigger.
    // fires_count is a required number field on TriggerDefinition — it is
    // never undefined, so the old conditional guard was dead code that always
    // skipped the assignment, causing fire counts to reset on replace().
    trigger.fires_count = existing.fires_count;
    trigger.last_fired = existing.last_fired ?? trigger.last_fired;
    this.triggers.set(trigger.id, trigger);
    log.info('Trigger replaced', { trigger_id: trigger.id });
  }

  /**
   * Removes a trigger by ID. No-op if the trigger does not exist.
   *
   * @param triggerId - ID of the trigger to remove.
   * @returns `true` if the trigger existed, `false` otherwise.
   */
  unregister(triggerId: string): boolean {
    const existed = this.triggers.delete(triggerId);
    if (existed) {
      log.debug('Trigger unregistered', { id: triggerId });
    }
    return existed;
  }

  /**
   * Enables or disables a trigger.
   *
   * @param triggerId - ID of the trigger to update.
   * @param enabled - `true` to enable, `false` to disable.
   */
  setEnabled(triggerId: string, enabled: boolean): void {
    const trigger = this.triggers.get(triggerId);
    if (!trigger) {
      log.warn('setEnabled: trigger not found', { id: triggerId });
      return;
    }
    trigger.enabled = enabled;
    log.debug('Trigger enabled state updated', { id: triggerId, enabled });
  }

  /**
   * Evaluates all enabled triggers against the incoming event.
   *
   * Processing order:
   * 1. Record the event in the condition evaluator (needed for threshold/sequence).
   * 2. Sort enabled triggers by priority (ascending — lower number = first).
   * 3. Evaluate all enabled triggers in parallel (guards + condition + action).
   * 4. Collect results; log any unexpected rejections.
   *
   * @param event - The event to evaluate against all triggers.
   * @returns Results for every trigger that was checked (fired or skipped).
   */
  async evaluate(event: RuntimeEvent): Promise<TriggerResult[]> {
    // Must be recorded before evaluate so threshold/sequence see the full history
    this.evaluator.recordEvent(event);

    const results: TriggerResult[] = [];

    // Sort enabled triggers by priority (lower number = higher priority)
    const sorted = [...this.triggers.values()]
      .filter((t) => t.enabled)
      .sort((a, b) => a.priority - b.priority);

    const settled = await Promise.allSettled(
      sorted.map((trigger) => this.evaluateTrigger(trigger, event)),
    );

    for (const outcome of settled) {
      if (outcome.status === 'fulfilled') {
        results.push(outcome.value);
      } else {
        log.error('Unexpected error evaluating trigger', { error: outcome.reason });
      }
    }

    return results;
  }

  /**
   * Retrieves a trigger definition by ID.
   *
   * @param triggerId - The trigger ID to look up.
   * @returns The trigger definition, or `undefined` if not found.
   */
  get(triggerId: string): TriggerDefinition | undefined {
    return this.triggers.get(triggerId);
  }

  /**
   * Lists all registered triggers in registration order.
   *
   * @returns An array of all trigger definitions.
   */
  list(): TriggerDefinition[] {
    return [...this.triggers.values()];
  }

  /**
   * Returns the TriggerActionExecutor instance.
   *
   * Exposed for external handler registration. Dependency injection is handled
   * via {@link setDependencies}.
   *
   * @returns The internal TriggerActionExecutor.
   */
  getActionExecutor(): TriggerActionExecutor {
    return this.executor;
  }

  /**
   * Registers a named action handler delegate.
   *
   * Handlers survive executor replacement (setDependencies) because they are
   * mirrored in `actionHandlers` and re-registered on each replacement.
   *
   * @param name - The handler name used in `InvokeHandlerAction.handler`.
   * @param handler - The async handler function.
   */
  registerHandler(name: string, handler: TriggerActionHandler): void {
    this.actionHandlers.set(name, handler);
    this.executor.registerHandler(name, handler);
    log.debug('Action handler registered', { name });
  }

  /**
   * Restores trigger fire counts and last-fired timestamps from a previous
   * session. Only updates triggers that are already registered; unknown
   * trigger IDs are silently ignored.
   *
   * @param state - Array of trigger state entries to restore.
   */
  restoreTriggerState(
    state: Array<{ triggerId: string; firesCount: number; lastFired?: number }>,
  ): void {
    let restored = 0;
    for (const entry of state) {
      const trigger = this.triggers.get(entry.triggerId);
      if (trigger) {
        trigger.fires_count = entry.firesCount;
        if (entry.lastFired !== undefined) {
          trigger.last_fired = entry.lastFired;
        }
        restored++;
      } else {
        log.debug('restoreTriggerState: trigger not found, skipping', {
          id: entry.triggerId,
        });
      }
    }
    log.info('Trigger states restored', { restored, total: state.length });
  }

  /**
   * Returns a snapshot of the current fire counts and last-fired timestamps
   * for all registered triggers. Used by the snapshot/persistence subsystem.
   *
   * @returns Array of trigger state snapshots.
   */
  getTriggerStates(): Array<{ triggerId: string; firesCount: number; lastFired?: number }> {
    return Array.from(this.triggers.values()).map((trigger) => ({
      triggerId: trigger.id,
      firesCount: trigger.fires_count,
      lastFired: trigger.last_fired,
    }));
  }

  /**
   * Resets fire counts and last-fired timestamps for all registered triggers.
   *
   * Called at session start to ensure trigger budgets are per-session, not
   * accumulated across snapshot recoveries.
   */
  resetAllFireCounts(): void {
    let reset = 0;
    for (const trigger of this.triggers.values()) {
      trigger.fires_count = 0;
      trigger.last_fired = undefined;
      reset++;
    }
    log.info('All trigger fire counts reset', { count: reset });
  }

  /**
   * Removes events older than `maxAgeMs` from the evaluator's ring buffer.
   *
   * Delegates to the ConditionEvaluator's pruneOldEvents method. Call
   * periodically on low-traffic triggers to prevent unbounded buffer growth.
   *
   * @param maxAgeMs - Maximum event age to retain in milliseconds.
   */
  pruneOldEvents(maxAgeMs: number): void {
    this.evaluator.pruneOldEvents(maxAgeMs);
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  /**
   * Evaluates a single trigger against an event, applying guards and
   * recording fires.
   *
   * Re-entrant safe: all mutations to trigger state happen AFTER the
   * condition/action results are known (no Map mutations during evaluation).
   */
  /**
   * Returns true if the trigger passes all guard checks (cooldown + max_fires).
   *
   * Extracted from both `match()` and `evaluateTrigger()` to eliminate the
   * duplicate guard logic. Guards are stateless checks against trigger fields
   * only — no event context needed.
   *
   * @param trigger - The trigger to check.
   * @param now - Current epoch ms (pass Date.now() from the caller to avoid
   *   multiple clock reads per evaluation batch).
   */
  private passesGuards(trigger: TriggerDefinition, now: number): boolean {
    // Guard: cooldown
    if (trigger.last_fired !== undefined && trigger.cooldown_ms !== undefined) {
      if (now - trigger.last_fired < trigger.cooldown_ms) return false;
    }
    // Guard: max_fires (use config default if trigger has no max set)
    const effectiveMax = trigger.max_fires ?? this.config.max_fires_per_session;
    if (trigger.fires_count >= effectiveMax) return false;
    return true;
  }

  private async evaluateTrigger(
    trigger: TriggerDefinition,
    event: RuntimeEvent,
  ): Promise<TriggerResult> {
    const now = Date.now();

    if (!this.passesGuards(trigger, now)) {
      const skippedReason =
        trigger.last_fired !== undefined &&
        trigger.cooldown_ms !== undefined &&
        now - trigger.last_fired < trigger.cooldown_ms
          ? 'cooldown'
          : 'max_fires';
      return {
        trigger_id: trigger.id,
        trigger_name: trigger.name,
        fired: false,
        skipped_reason: skippedReason,
      };
    }

    // Evaluate condition (supports: event, and, or, not, threshold, sequence)
    const conditionMet = this.evaluator.evaluate(trigger.condition, event);
    if (!conditionMet) {
      return {
        trigger_id: trigger.id,
        trigger_name: trigger.name,
        fired: false,
      };
    }

    log.info('Trigger condition met, executing action', {
      trigger_id: trigger.id,
      trigger_name: trigger.name,
      event_type: event.type,
      event_id: event.id,
    });

    // Execute action (supports all TriggerAction variants)
    const actionResult = await this.executor.execute(trigger.action, event);

    // Record fire regardless of action success.
    // Node.js is single-threaded — no concurrent mutation possible.
    trigger.fires_count++;
    trigger.last_fired = Date.now();

    if (!actionResult.success) {
      log.warn('Trigger action failed', {
        trigger_id: trigger.id,
        error: actionResult.error,
      });
    }

    return {
      trigger_id: trigger.id,
      trigger_name: trigger.name,
      fired: true,
      action_result: actionResult,
    };
  }

  /**
   * Converts a TriggerDefinition (L2) to a minimal L1 Trigger stub.
   *
   * Used by the `match()` compatibility shim. Only the fields that L1
   * consumers actually use are populated; others use safe defaults.
   */
  private toL1Trigger(trigger: TriggerDefinition): Trigger {
    return {
      id: trigger.id,
      enabled: trigger.enabled,
      priority: trigger.priority,
      max_fires: trigger.max_fires,
      cooldown_ms: trigger.cooldown_ms,
      // L2 uses TriggerCondition; L1 uses EventMatcher. Bridge:
      // Synthesise an EventMatcher from EventCondition if possible,
      // otherwise use a catch-all that matches any event.
      event_match: this.toEventMatcher(trigger),
      // L2 uses TriggerAction union; L1 uses Action[]. Bridge:
      // Synthesise a single emit_event Action as a stub.
      actions: [{
        type: 'emit_event',
        params: { trigger_id: trigger.id, source: 'trigger-registry' },
      }],
    };
  }

  /**
   * Derives an L1 EventMatcher from a TriggerDefinition's condition.
   *
   * For EventCondition: uses event_type directly.
   * For all others: returns a wildcard matcher (any event).
   */
  private toEventMatcher(trigger: TriggerDefinition): EventMatcher {
    const cond = trigger.condition;
    if (cond.type === 'event') {
      const pattern = cond.event_type;
      // Convert EventTypePattern ('*', 'ns:*', or exact) to L1 EventMatcher
      if (pattern === '*') {
        return { type: /.*/ };
      }
      if (typeof pattern === 'string' && pattern.endsWith(':*')) {
        const prefix = pattern.slice(0, -1);
        return { type: new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) };
      }
      return { type: pattern };
    }
    // Non-event conditions (composite, threshold, sequence) — wildcard
    return { type: /.*/ };
  }
}
