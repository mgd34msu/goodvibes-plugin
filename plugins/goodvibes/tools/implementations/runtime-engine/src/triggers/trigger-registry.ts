/**
 * Trigger Registry
 *
 * Central store for trigger definitions. Evaluates all enabled triggers
 * against each incoming event, respects cooldown and max_fires limits,
 * and delegates action execution to the ActionExecutor.
 */

import { createLogger } from '../shared/logger.js';
import { timestamp } from '../shared/utils.js';
import type { RuntimeEvent } from '../events/types.js';
import type { EventBus } from '../events/event-bus.js';
import type { TriggersConfig } from '../shared/config.js';
import { ConditionEvaluator } from './condition-evaluator.js';
import { ActionExecutor } from './action-executor.js';
import type {
  TriggerDefinition,
  TriggerResult,
  TriggerActionHandler,
} from './types.js';

const log = createLogger('trigger-registry');

/**
 * Manages trigger definitions and evaluates them against incoming events.
 *
 * Lifecycle:
 * 1. Construct with a {@link TriggersConfig}.
 * 2. Inject the EventBus via `setEventBus`.
 * 3. Register built-in and user-defined triggers via `register`.
 * 4. Call `evaluate(event)` for every event that flows through the engine.
 */
export class TriggerRegistry {
  /** All registered trigger definitions, keyed by trigger ID. */
  private readonly triggers: Map<string, TriggerDefinition> = new Map();
  /** Stateful condition evaluator with recent-event ring buffer. */
  private readonly evaluator: ConditionEvaluator;
  /** Action executor with handler registry. */
  private readonly executor: ActionExecutor;
  /** Resolved triggers configuration. */
  private readonly config: TriggersConfig;

  /**
   * @param config - Triggers section of the resolved {@link RuntimeConfig}.
   */
  constructor(config: TriggersConfig) {
    this.config = config;
    this.evaluator = new ConditionEvaluator();
    this.executor = new ActionExecutor();
  }

  /**
   * Injects the shared EventBus so `emit_event` actions can emit events.
   *
   * @param bus - The shared EventBus instance.
   */
  setEventBus(bus: EventBus): void {
    this.executor.setEventBus(bus);
  }

  /**
   * Registers a trigger definition.
   *
   * Rejects the registration if the `max_triggers` limit would be exceeded.
   *
   * @param trigger - The trigger definition to register.
   * @throws {Error} If the trigger limit is reached.
   */
  register(trigger: TriggerDefinition): void {
    if (this.triggers.size >= this.config.max_triggers) {
      throw new Error(
        `TriggerRegistry: max_triggers limit reached (${this.config.max_triggers}). Cannot register '${trigger.id}'.`,
      );
    }
    this.triggers.set(trigger.id, trigger);
    log.debug('Trigger registered', { id: trigger.id, name: trigger.name, priority: trigger.priority });
  }

  /**
   * Removes a trigger by ID. No-op if the trigger does not exist.
   *
   * @param triggerId - ID of the trigger to remove.
   */
  unregister(triggerId: string): void {
    const existed = this.triggers.delete(triggerId);
    if (existed) {
      log.debug('Trigger unregistered', { id: triggerId });
    }
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
   * 1. Record the event in the condition evaluator.
   * 2. Sort enabled triggers by priority (ascending — lower = first).
   * 3. For each trigger, check cooldown and max_fires before evaluating.
   * 4. If condition met, execute action and record the fire.
   *
   * @param event - The event to evaluate against all triggers.
   * @returns Results for every trigger that was checked (fired or skipped).
   */
  async evaluate(event: RuntimeEvent): Promise<TriggerResult[]> {
    // Record for threshold/sequence evaluation
    this.evaluator.recordEvent(event);

    const results: TriggerResult[] = [];

    // Sort enabled triggers by priority (lower number = higher priority)
    const sorted = [...this.triggers.values()]
      .filter((t) => t.enabled)
      .sort((a, b) => a.priority - b.priority);

    for (const trigger of sorted) {
      const result = await this.evaluateTrigger(trigger, event);
      results.push(result);
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
   * Registers a named action handler delegate.
   *
   * @param name - The handler name used in `InvokeHandlerAction.handler`.
   * @param handler - The async handler function.
   */
  registerHandler(name: string, handler: TriggerActionHandler): void {
    this.executor.registerHandler(name, handler);
    log.debug('Action handler registered', { name });
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────────

  /**
   * Evaluates a single trigger against an event, applying guards and recording fires.
   */
  private async evaluateTrigger(
    trigger: TriggerDefinition,
    event: RuntimeEvent,
  ): Promise<TriggerResult> {
    // Guard: cooldown check
    if (trigger.last_fired && trigger.cooldown_ms !== undefined) {
      const lastFiredMs = new Date(trigger.last_fired).getTime();
      if (Date.now() - lastFiredMs < trigger.cooldown_ms) {
        return {
          trigger_id: trigger.id,
          trigger_name: trigger.name,
          fired: false,
          skipped_reason: 'cooldown',
        };
      }
    }

    // Guard: max_fires check (use config default if trigger has no max set)
    const effectiveMaxFires = trigger.max_fires ?? this.config.max_fires_per_session;
    if (trigger.fires_count >= effectiveMaxFires) {
      return {
        trigger_id: trigger.id,
        trigger_name: trigger.name,
        fired: false,
        skipped_reason: 'max_fires',
      };
    }

    // Evaluate condition
    const conditionMet = this.evaluator.evaluate(trigger.condition, event);
    if (!conditionMet) {
      // Not fired — condition simply not met, no result recorded
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

    // Execute action
    const actionResult = await this.executor.execute(trigger.action, event);

    // Record fire regardless of action success
    trigger.fires_count++;
    trigger.last_fired = timestamp();

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
}
