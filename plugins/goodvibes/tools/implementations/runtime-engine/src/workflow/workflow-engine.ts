/**
 * Workflow Engine
 *
 * A formal state machine executor that drives WorkflowInstances through
 * their defined states by processing RuntimeEvents. The engine is
 * EventBus-agnostic — the bus is injected via setEventBus() and is
 * optional; if absent, workflow events are simply not emitted externally.
 *
 * Design principles:
 * - No eval() or Function() for guard expressions — explicit string parsing only
 * - All state mutations are synchronous; action handlers are async but fire-and-forget
 * - Instances are kept in-memory; persistence is the caller's responsibility
 */

/**
 * Design Note: Synchronous Transitions, Async Actions
 *
 * sendEvent() transitions state synchronously but executes state actions
 * (on_enter, on_exit) asynchronously via fire-and-forget. This design choice
 * ensures transitions are fast and predictable while allowing actions to perform
 * I/O (emit events, update context). Action errors are logged but do not block
 * or revert transitions. See sendEvent() JSDoc for details.
 */

import { createLogger } from '../shared/logger.js';
import { generateEventId, generateWorkflowId, timestamp, toErrorMessage } from '../shared/utils.js';
import type { WorkflowsConfig } from '../shared/config.js';
import type { RuntimeEvent, EventType } from '../events/types.js';
import type {
  WorkflowDefinition,
  WorkflowInstance,
  WorkflowContext,
  WorkflowTransition,
  GuardCondition,
  ActionDefinition,
  GuardFunction,
  ActionHandler,
} from './types.js';

const log = createLogger('workflow-engine');

/**
 * Minimal interface for the EventBus dependency.
 *
 * The engine only calls `emit`; it never subscribes to events.
 * This keeps the coupling surface small and avoids circular imports.
 */
export interface EventBus {
  emit(
    event: Omit<RuntimeEvent, 'metadata'> & { metadata?: { session_id?: string; correlation_id?: string; causation_id?: string } }
  ): void;
}

/**
 * State machine execution engine for workflow definitions.
 *
 * @example
 * ```ts
 * const engine = new WorkflowEngine(config.workflows);
 * engine.registerDefinition(WRFC_LOOP_DEFINITION);
 * const instance = engine.create('wrfc_loop', { task: 'Implement auth' });
 * engine.sendEvent(instance.id, myEvent);
 * ```
 */
export class WorkflowEngine {
  private readonly definitions: Map<string, WorkflowDefinition> = new Map();
  private readonly instances: Map<string, WorkflowInstance> = new Map();
  private readonly guards: Map<string, GuardFunction> = new Map();
  private readonly actionHandlers: Map<string, ActionHandler> = new Map();
  private readonly maxActive: number;
  private readonly maxTransitions: number;
  private eventBus?: EventBus;

  /**
   * @param config - Workflow-specific configuration from the runtime config.
   */
  constructor(config: WorkflowsConfig) {
    this.maxActive = config.max_active;
    this.maxTransitions = config.max_transitions_per_workflow;
  }

  // ─── Public API ────────────────────────────────────────────────────────

  /**
   * Injects an EventBus for emitting workflow lifecycle events.
   *
   * This dependency is optional. When not set, no external events are emitted
   * but the engine functions correctly for state management.
   *
   * @param bus - The EventBus instance to use for event emission.
   */
  setEventBus(bus: EventBus): void {
    this.eventBus = bus;
  }

  /**
   * Registers a workflow definition so instances can be created from it.
   *
   * @param def - The WorkflowDefinition to register.
   * @throws {Error} If a definition with the same `id` is already registered.
   */
  registerDefinition(def: WorkflowDefinition): void {
    if (this.definitions.has(def.id)) {
      throw new Error(`WorkflowDefinition '${def.id}' is already registered`);
    }
    this.definitions.set(def.id, def);
    log.info('Registered workflow definition', { id: def.id, name: def.name, version: def.version });
  }

  /**
   * Retrieves a registered WorkflowDefinition by its ID.
   *
   * @param id - The definition ID to look up.
   * @returns The definition, or `undefined` if not registered.
   */
  getDefinition(id: string): WorkflowDefinition | undefined {
    return this.definitions.get(id);
  }

  /**
   * Creates a new workflow instance from a registered definition.
   *
   * The instance starts in `initial_state` and executes any `on_enter`
   * actions for that state. A `workflow:created` event is emitted via
   * the EventBus if one is set.
   *
   * @param definitionId    - ID of the WorkflowDefinition to instantiate.
   * @param initialContext  - Optional initial context values.
   * @param instanceId      - Optional custom instance ID (e.g. `wrfc_<agent_id>` for
   *                          deterministic WRFC chain binding). Defaults to a
   *                          randomly-generated `wf_<uuid>` when omitted.
   * @returns The new WorkflowInstance in its initial state.
   * @throws {Error} If the definition is not found or max active limit is reached.
   */
  create(
    definitionId: string,
    initialContext: Partial<WorkflowContext> = {},
    instanceId?: string,
  ): WorkflowInstance {
    const def = this.definitions.get(definitionId);
    if (!def) {
      throw new Error(`WorkflowDefinition '${definitionId}' is not registered`);
    }

    const activeCount = this.listActive().length;
    if (activeCount >= this.maxActive) {
      throw new Error(
        `Cannot create workflow: max_active limit (${this.maxActive}) reached`
      );
    }

    const now = timestamp();
    const instance: WorkflowInstance = {
      id: instanceId ?? generateWorkflowId(),
      definition_id: definitionId,
      current_state: def.initial_state,
      context: { ...initialContext },
      history: [],
      created_at: now,
      updated_at: now,
      status: 'active',
    };

    this.instances.set(instance.id, instance);
    log.info('Workflow instance created', {
      id: instance.id,
      definition_id: definitionId,
      initial_state: def.initial_state,
    });

    // Execute on_enter actions for the initial state
    const initialState = def.states[def.initial_state];
    if (initialState?.on_enter) {
      // Fire-and-forget: actions run async; errors logged, not propagated
      void this.executeActions(initialState.on_enter, instance.context);
    }

    // Emit workflow:created
    this.emitWorkflowEvent('workflow:created', instance, {});

    return instance;
  }

  /**
   * Sends a RuntimeEvent to a specific workflow instance, potentially
   * triggering a state transition.
   *
   * Transition selection:
   * 1. Find all transitions in the current state matching `event.type`
   * 2. For each, evaluate the guard condition (if any)
   * 3. Execute the first transition whose guard passes
   * 4. Run on_exit actions → transition actions → on_enter actions
   * 5. Update history and emit `workflow:state_changed`
   *
   * **Important: Action execution is fire-and-forget.**
   * State actions (on_enter, on_exit) and transition actions execute
   * asynchronously after the transition completes. This means:
   * - State transitions are synchronous — the new state is set before actions run.
   * - Action execution errors are logged but do not affect the transition.
   * - `on_exit` actions from the previous state may run concurrently with
   *   `on_enter` actions for the next state.
   * - `update_context` actions may not be visible in the returned `contextChanges`,
   *   since context is captured before the async actions resolve.
   *
   * For use cases requiring action completion before proceeding, consider awaiting
   * `executeActions` directly (v2 consideration).
   *
   * @param workflowId - ID of the workflow instance to send the event to.
   * @param event      - The RuntimeEvent that may trigger a transition.
   * @returns The WorkflowTransition that was applied, or `null` if no
   *          matching transition was found or the instance is not active.
   */
  sendEvent(workflowId: string, event: RuntimeEvent): WorkflowTransition | null {
    const instance = this.instances.get(workflowId);
    if (!instance) {
      log.warn('sendEvent: workflow instance not found', { workflowId });
      return null;
    }
    if (instance.status !== 'active') {
      log.warn('sendEvent: workflow is not active', { workflowId, status: instance.status });
      return null;
    }

    const def = this.definitions.get(instance.definition_id);
    if (!def) {
      log.error('sendEvent: definition not found for instance', {
        workflowId,
        definition_id: instance.definition_id,
      });
      return null;
    }

    // Check max_transitions safety limit
    const maxTransitions = def.max_transitions ?? this.maxTransitions;
    if (instance.history.length >= maxTransitions) {
      log.warn('Workflow exceeded max transitions; halting', {
        workflowId,
        transitions: instance.history.length,
        max: maxTransitions,
      });
      instance.status = 'failed';
      instance.error = `Exceeded max transitions (${maxTransitions})`;
      instance.updated_at = timestamp();
      this.emitWorkflowEvent('workflow:failed', instance, {});
      return null;
    }

    const currentStateDef = def.states[instance.current_state];
    if (!currentStateDef) {
      log.error('sendEvent: current state not found in definition', {
        workflowId,
        current_state: instance.current_state,
      });
      return null;
    }

    // Find the first matching, passing transition
    const matchingTransition = currentStateDef.transitions.find((t) => {
      if (t.event !== event.type) return false;
      if (!t.guard) return true;
      return this.evaluateGuard(t.guard, instance.context, event);
    });

    if (!matchingTransition) {
      log.debug('No matching transition found', {
        workflowId,
        state: instance.current_state,
        event: event.type,
      });
      return null;
    }

    const fromState = instance.current_state;
    const toState = matchingTransition.target;
    const transitionTimestamp = timestamp();

    // Capture context before changes for diff
    const contextBefore = { ...instance.context };

    // Execute on_exit actions for current state
    if (currentStateDef.on_exit) {
      // Fire-and-forget: actions run async after transition (see sendEvent JSDoc)
      void this.executeActions(currentStateDef.on_exit, instance.context);
    }

    // Execute transition actions
    if (matchingTransition.actions) {
      // Fire-and-forget: actions run async after transition (see sendEvent JSDoc)
      void this.executeActions(matchingTransition.actions, instance.context);
    }

    // Move to target state
    instance.current_state = toState;
    instance.updated_at = transitionTimestamp;

    // Execute on_enter actions for new state
    const targetStateDef = def.states[toState];
    if (targetStateDef?.on_enter) {
      // Fire-and-forget: actions run async after transition (see sendEvent JSDoc)
      void this.executeActions(targetStateDef.on_enter, instance.context);
    }

    // Compute context changes
    const contextChanges: Record<string, unknown> = {};
    for (const key of Object.keys(instance.context)) {
      if (instance.context[key] !== contextBefore[key]) {
        contextChanges[key] = instance.context[key];
      }
    }

    // Record transition in history
    const transition: WorkflowTransition = {
      from_state: fromState,
      to_state: toState,
      event: event.type,
      timestamp: transitionTimestamp,
      context_changes: contextChanges,
    };
    instance.history.push(transition);

    log.info('Workflow state transition', {
      id: workflowId,
      from: fromState,
      to: toState,
      event: event.type,
    });

    // Emit state_changed event
    this.emitWorkflowEvent('workflow:state_changed', instance, {
      previous_state: fromState,
      current_state: toState,
    });

    // Check if new state is terminal
    if (def.terminal_states.includes(toState)) {
      instance.status = 'completed';
      instance.completed_at = transitionTimestamp;
      log.info('Workflow completed', { id: workflowId, terminal_state: toState });
      this.emitWorkflowEvent('workflow:completed', instance, {});
    }

    return transition;
  }

  /**
   * Retrieves a workflow instance by its ID.
   *
   * @param workflowId - The instance ID to look up.
   * @returns The WorkflowInstance, or `undefined` if not found.
   */
  get(workflowId: string): WorkflowInstance | undefined {
    return this.instances.get(workflowId);
  }

  /**
   * Lists all currently active (non-terminal) workflow instances.
   *
   * @returns Array of WorkflowInstances with status 'active'.
   */
  listActive(): WorkflowInstance[] {
    return Array.from(this.instances.values()).filter((i) => i.status === 'active');
  }

  /**
   * Lists all workflow instances, including completed and cancelled ones.
   *
   * @returns Array of all WorkflowInstances sorted by creation time (oldest first).
   */
  listAll(): WorkflowInstance[] {
    return Array.from(this.instances.values()).sort(
      (a, b) => a.created_at.localeCompare(b.created_at)
    );
  }

  /**
   * Directly restores a workflow instance into the instances map.
   *
   * Used during startup recovery to re-populate engine state without
   * triggering on_enter actions or emitting events. If an instance with the
   * same ID already exists it is silently overwritten (last-write wins).
   *
   * @param instance - The WorkflowInstance to restore.
   */
  restoreInstance(instance: WorkflowInstance): void {
    this.instances.set(instance.id, instance);
    log.debug('Workflow instance restored', {
      id: instance.id,
      definition_id: instance.definition_id,
      current_state: instance.current_state,
      status: instance.status,
    });
  }

  /**
   * Returns all active (non-terminal) workflow instances.
   *
   * Alias for `listActive()` with a more descriptive name for use in
   * snapshotting and recovery code.
   *
   * @returns Array of WorkflowInstances with status 'active'.
   */
  getActiveInstances(): WorkflowInstance[] {
    return this.listActive();
  }

  /**
   * Returns all workflow instances regardless of status.
   *
   * Alias for `listAll()` with a more descriptive name for use in
   * snapshotting and recovery code.
   *
   * @returns Array of all WorkflowInstances.
   */
  getAllInstances(): WorkflowInstance[] {
    return this.listAll();
  }

  /**
   * Cancels an active workflow instance.
   *
   * The instance status is set to 'cancelled' and a `workflow:cancelled`
   * event is emitted via the EventBus if one is set.
   *
   * @param workflowId - ID of the workflow instance to cancel.
   * @param reason     - Human-readable reason for cancellation.
   */
  cancel(workflowId: string, reason: string): void {
    const instance = this.instances.get(workflowId);
    if (!instance) {
      log.warn('cancel: workflow instance not found', { workflowId });
      return;
    }
    if (instance.status !== 'active') {
      log.warn('cancel: workflow is not active', { workflowId, status: instance.status });
      return;
    }
    instance.status = 'cancelled';
    instance.error = reason;
    instance.updated_at = timestamp();
    log.info('Workflow cancelled', { id: workflowId, reason });
    this.emitWorkflowEvent('workflow:cancelled', instance, { reason });
  }

  /**
   * Removes completed workflow instances older than `maxAge` ms.
   *
   * Only instances with status `'completed'` are eligible for removal.
   * Active, failed, or cancelled instances are retained regardless of age.
   *
   * @param maxAge - Maximum age in milliseconds for completed instances
   *   before they are pruned. Defaults to 3 600 000 ms (1 hour).
   * @returns The number of instances removed.
   */
  prune(maxAge = 3_600_000): number {
    const cutoff = Date.now() - maxAge;
    let pruned = 0;
    for (const [id, instance] of this.instances) {
      if (instance.status === 'completed') {
        const completedAt = instance.completed_at
          ? new Date(instance.completed_at).getTime()
          : new Date(instance.updated_at).getTime();
        if (completedAt < cutoff) {
          this.instances.delete(id);
          pruned++;
        }
      }
    }
    if (pruned > 0) {
      log.debug('Pruned completed workflow instances', { pruned });
    }
    return pruned;
  }

  /**
   * Registers a named guard function for use in workflow definitions.
   *
   * @param name - The function name referenced in GuardCondition.function.
   * @param fn   - The guard implementation.
   */
  registerGuard(name: string, fn: GuardFunction): void {
    this.guards.set(name, fn);
    log.debug('Registered guard function', { name });
  }

  /**
   * Registers a named action handler for use in workflow definitions.
   *
   * @param name - The handler name referenced in ActionDefinition.config.
   * @param fn   - The async action implementation.
   */
  registerAction(name: string, fn: ActionHandler): void {
    this.actionHandlers.set(name, fn);
    log.debug('Registered action handler', { name });
  }

  // ─── Private Helpers ───────────────────────────────────────────────────

  /**
   * Evaluates a guard condition against the current context and triggering event.
   *
   * @param guard   - The guard condition to evaluate.
   * @param context - Current workflow context.
   * @param event   - The event that triggered the transition check.
   * @returns `true` if the guard passes; `false` otherwise.
   */
  private evaluateGuard(
    guard: GuardCondition,
    context: WorkflowContext,
    event: RuntimeEvent
  ): boolean {
    try {
      if (guard.type === 'function') {
        const fn = this.guards.get(guard.function ?? '');
        if (!fn) {
          log.warn('Guard function not registered', { name: guard.function });
          return false;
        }
        return fn(context, event);
      }

      if (guard.type === 'expression' && guard.expression) {
        return this.evaluateExpression(guard.expression, context);
      }

      log.warn('Guard has no valid evaluation strategy', { guard });
      return false;
    } catch (err) {
      log.error('Guard evaluation error', {
        guard,
        error: toErrorMessage(err),
      });
      return false;
    }
  }

  /**
   * Executes a list of ActionDefinitions against the current context.
   *
   * Actions run sequentially. Failures are logged but do not abort
   * subsequent actions or the enclosing transition.
   *
   * Supported action types:
   * - `emit_event`     — emits a runtime event via the injected EventBus
   * - `update_context` — shallow-merges config into the workflow context
   * - `invoke_handler` — calls a registered action handler by name
   * - `spawn_agent`    — placeholder; logs a warning (Phase 5)
   *
   * @param actions - Ordered list of ActionDefinitions to execute.
   * @param context - Workflow context (mutated in-place by update_context).
   */
  private async executeActions(
    actions: ActionDefinition[],
    context: WorkflowContext
  ): Promise<void> {
    for (const action of actions) {
      try {
        switch (action.type) {
          case 'emit_event': {
            const eventType = action.config['event_type'] as EventType | undefined;
            if (eventType && this.eventBus) {
              this.eventBus.emit({
                id: generateEventId(),
                timestamp: timestamp(),
                type: eventType,
                source: { kind: 'system' },
                payload: { type: eventType, data: { ...action.config } } as RuntimeEvent['payload'],
              });
            }
            break;
          }
          case 'update_context': {
            const { type: _type, ...values } = action.config as Record<string, unknown>;
            Object.assign(context, values);
            break;
          }
          case 'invoke_handler': {
            const handlerName = action.config['handler'] as string | undefined;
            if (!handlerName) {
              log.warn('invoke_handler action missing handler name', { config: action.config });
              break;
            }
            const handler = this.actionHandlers.get(handlerName);
            if (!handler) {
              log.warn('Action handler not registered', { name: handlerName });
              break;
            }
            await handler(context, action.config);
            break;
          }
          case 'spawn_agent': {
            // Placeholder for Phase 5 — agent spawning not yet implemented
            log.error('spawn_agent action type is not yet implemented (Phase 5 stub)', {
              action_type: action.type,
              workflow_id: (context.workflow_id as string | undefined) ?? 'unknown',
            });
            break;
          }
          default: {
            log.warn('Unknown action type', { type: (action as ActionDefinition).type });
          }
        }
      } catch (err) {
        log.error('Action execution error', {
          action_type: action.type,
          error: toErrorMessage(err),
        });
      }
    }
  }

  /**
   * Safe expression evaluator for guard conditions.
   *
   * Supports the pattern: `context.field op value` or
   * `context.field op context.otherField`.
   *
   * Operators: `>=`, `<=`, `>`, `<`, `===`, `!==`
   *
   * Value types recognized on the right-hand side:
   * - Numeric literals: `9.5`, `0`, `-1`
   * - Boolean literals: `true`, `false`
   * - Null literal: `null`
   * - Context references: `context.someField`
   * - Unquoted strings (fallback)
   *
   * NO eval(), NO Function() — all parsing is explicit string manipulation.
   *
   * @param expr    - Expression string to evaluate.
   * @param context - Workflow context to read values from.
   * @returns Boolean result of the expression.
   * @throws {Error} If the expression format is not recognized.
   */
  private evaluateExpression(expr: string, context: WorkflowContext): boolean {
    const trimmed = expr.trim();

    // Match: context.field op rhs (where rhs is value or context.field)
    // Operators sorted longest-first to avoid partial matching (>= before >).
    // NOTE: Operators are matched only when surrounded by whitespace, so operator
    // characters inside field names (e.g. context.gt_value) are not misidentified.
    const operatorRegex = /\s+(>=|<=|===|!==|>|<)\s+/;
    const opMatch = trimmed.match(operatorRegex);

    if (!opMatch || opMatch.index === undefined) {
      log.warn('Guard expression has no recognized operator', { expression: trimmed });
      return false;
    }

    const operator = opMatch[1] as '>=' | '<=' | '===' | '!==' | '>' | '<';
    const lhsRaw = trimmed.slice(0, opMatch.index).trim();
    const rhsRaw = trimmed.slice(opMatch.index + opMatch[0].length).trim();
    const op = operator;

    if (!lhsRaw || !rhsRaw) {
      throw new Error(`Unrecognised guard expression format: "${expr}"`);
    }

    const lhsValue = this.resolveValue(lhsRaw, context);
    const rhsValue = this.resolveValue(rhsRaw, context);

    switch (op) {
      case '>=':
        return (lhsValue as number) >= (rhsValue as number);
      case '<=':
        return (lhsValue as number) <= (rhsValue as number);
      case '>':
        return (lhsValue as number) > (rhsValue as number);
      case '<':
        return (lhsValue as number) < (rhsValue as number);
      case '===':
        return lhsValue === rhsValue;
      case '!==':
        return lhsValue !== rhsValue;
    }
  }

  /**
   * Resolves a raw expression token to its runtime value.
   *
   * Handles:
   * - `context.field` — reads from the workflow context
   * - `true` / `false` — boolean literals
   * - `null` — null literal
   * - Numeric strings — parsed as float
   * - Everything else — returned as-is (string)
   *
   * @param raw     - Raw string token from the expression.
   * @param context - Workflow context for context.field lookups.
   * @returns The resolved value.
   */
  private resolveValue(raw: string, context: WorkflowContext): unknown {
    if (raw.startsWith('context.')) {
      const fieldPath = raw.slice('context.'.length);
      // Support simple nested access: context.a.b.c
      const parts = fieldPath.split('.');
      let value: unknown = context;
      for (const part of parts) {
        if (value === null || value === undefined) return undefined;
        value = (value as Record<string, unknown>)[part];
      }
      return value;
    }
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    if (raw === 'null') return null;
    const asNumber = Number(raw);
    if (!isNaN(asNumber) && raw !== '') return asNumber;
    return raw;
  }

  /**
   * Emits a workflow lifecycle event via the injected EventBus.
   *
   * If no EventBus has been set, this is a no-op.
   *
   * @param type     - The workflow EventType to emit.
   * @param instance - The workflow instance the event relates to.
   * @param extra    - Additional data to include in the event payload.
   */
  private emitWorkflowEvent(
    type: EventType,
    instance: WorkflowInstance,
    extra: Record<string, unknown>
  ): void {
    if (!this.eventBus) return;
    try {
      this.eventBus.emit({
        id: generateEventId(),
        timestamp: timestamp(),
        type,
        source: { kind: 'workflow', workflow_id: instance.id },
        payload: {
          type,
          data: {
            workflow_id: instance.id,
            workflow_type: instance.definition_id,
            current_state: instance.current_state,
            status: instance.status,
            ...extra,
          },
        } as RuntimeEvent['payload'],
      });
    } catch (err) {
      log.error('Failed to emit workflow event', {
        type,
        workflowId: instance.id,
        error: toErrorMessage(err),
      });
    }
  }
}
