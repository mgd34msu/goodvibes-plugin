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
 * - All state mutations are awaited; action handlers are async with timeout + rollback
 * - Instances are kept in-memory; persistence is the caller's responsibility
 * - Per-workflow cooperative mutex prevents concurrent state mutations
 */

/**
 * Design Note: Async Transitions with Cooperative Mutex
 *
 * sendEvent() is async and serialises concurrent transition attempts for the
 * same workflow via a per-workflow promise chain (cooperative mutex). If a
 * transition is already in-flight for a workflow, the incoming request is
 * queued (up to max_transition_queue_depth). Requests beyond the depth cap
 * are dropped with a warning.
 *
 * Actions (on_enter, on_exit, transition actions) are awaited with a
 * configurable timeout (action_timeout_ms). If an action exceeds the timeout
 * or throws, the transition is rolled back to its pre-transition state and
 * the error is logged with full context.
 */

import { createLogger } from '../../shared/logger.js';
import { generateEventId, generateWorkflowId, timestamp, toErrorMessage } from '../../shared/utils.js';
import { WorkflowError, WorkflowTimeoutError } from '../../shared/errors.js';
import type { WorkflowsConfig } from '../../shared/config.js';
import type { RuntimeEvent, EventType } from '../../shared/events.js';
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
export interface WorkflowEventBusDep {
  emit(
    event: Omit<RuntimeEvent, 'metadata'> & { metadata?: { session_id?: string; correlation_id?: string; causation_id?: string } }
  ): void;
}

/**
 * Minimal interface for the DirectiveQueue dependency.
 *
 * The engine only calls `purge` when a workflow reaches a terminal state.
 * Using a named interface improves discoverability and type-checks callers.
 */
export interface PurgableQueue {
  purge(workflowId: string): number;
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
/** Internal type representing a queued transition request. */
interface QueuedTransition {
  event: RuntimeEvent;
  resolve: (result: WorkflowTransition | null) => void;
  reject: (err: unknown) => void;
}

export class WorkflowEngine {
  private readonly definitions: Map<string, WorkflowDefinition> = new Map();
  private readonly instances: Map<string, WorkflowInstance> = new Map();
  private readonly guards: Map<string, GuardFunction> = new Map();
  private readonly actionHandlers: Map<string, ActionHandler> = new Map();
  private readonly maxActive: number;
  private readonly maxTransitions: number;
  private readonly actionTimeoutMs: number;
  private readonly maxQueueDepth: number;
  /**
   * Per-workflow in-flight promise for the cooperative mutex.
   *
   * Keyed by workflow ID. The value is a Promise that resolves when the
   * current in-flight transition (and all previously queued transitions)
   * have completed. New callers chain onto this promise.
   */
  private readonly _inFlight: Map<string, Promise<void>> = new Map();
  /**
   * Per-workflow transition queue.
   *
   * Holds pending sendEvent() calls that arrived while a transition was
   * already in-flight for the same workflow. Drained in FIFO order after
   * each transition completes.
   */
  private readonly _queue: Map<string, QueuedTransition[]> = new Map();
  private eventBus?: WorkflowEventBusDep;
  private directiveQueue?: PurgableQueue;

  /**
   * @param config - Workflow-specific configuration from the runtime config.
   */
  constructor(config: WorkflowsConfig) {
    this.maxActive = config.max_active;
    this.maxTransitions = config.max_transitions_per_workflow;
    this.actionTimeoutMs = config.action_timeout_ms ?? 30_000;
    this.maxQueueDepth = config.max_transition_queue_depth ?? 10;
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
  setEventBus(bus: WorkflowEventBusDep): void {
    this.eventBus = bus;
  }

  /**
   * Injects a DirectiveQueue for purging stale directives when a workflow
   * reaches a terminal state (completed, cancelled, failed).
   *
   * This dependency is optional. When not set, purge calls are no-ops.
   *
   * @param queue - Object with a `purge(workflowId)` method.
   */
  setDirectiveQueue(queue: PurgableQueue): void {
    this.directiveQueue = queue;
  }

  /**
   * Registers a workflow definition so instances can be created from it.
   *
   * @param def - The WorkflowDefinition to register.
   * @throws {Error} If a definition with the same `id` is already registered.
   */
  registerDefinition(def: WorkflowDefinition): void {
    if (this.definitions.has(def.id)) {
      throw new WorkflowError(`WorkflowDefinition '${def.id}' is already registered`);
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
      throw new WorkflowError(`WorkflowDefinition '${definitionId}' is not registered`);
    }

    const activeCount = this.listActive().length;
    if (activeCount >= this.maxActive) {
      throw new WorkflowError(
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
    this.emitWorkflowEvent('workflow:created', instance, { initial_state: def.initial_state, context: { ...instance.context } });

    return instance;
  }

  /**
   * Sends a RuntimeEvent to a specific workflow instance, potentially
   * triggering a state transition.
   *
   * **Concurrency:** `sendEvent()` is async and serialises concurrent
   * transition requests for the same workflow via a cooperative per-workflow
   * mutex (promise chain). If a transition is already in-flight, the new
   * request is queued. If the queue is full (max_transition_queue_depth), the
   * request is dropped and `null` is returned.
   *
   * **Action execution:** All actions (on_exit, transition, on_enter) are
   * awaited in sequence. If any action exceeds `action_timeout_ms`, a
   * WorkflowTimeoutError is thrown. If any action throws, the transition is
   * rolled back to its pre-transition state.
   *
   * Transition selection:
   * 1. Find all transitions in the current state matching `event.type`
   * 2. For each, evaluate the guard condition (if any)
   * 3. Execute the first transition whose guard passes
   * 4. Await on_exit actions → transition actions → on_enter actions
   * 5. Update history and emit `workflow:state_changed`
   *
   * @param workflowId - ID of the workflow instance to send the event to.
   * @param event      - The RuntimeEvent that may trigger a transition.
   * @returns A Promise resolving to the WorkflowTransition that was applied,
   *          or `null` if no matching transition was found, the instance is
   *          not active, or the queue is full.
   */
  async sendEvent(workflowId: string, event: RuntimeEvent): Promise<WorkflowTransition | null> {
    // Fast-path: reject immediately if instance is unknown or inactive
    // (no need to queue)
    const instanceCheck = this.instances.get(workflowId);
    if (!instanceCheck) {
      log.warn('sendEvent: workflow instance not found', { workflowId });
      return null;
    }
    if (instanceCheck.status !== 'active') {
      log.warn('sendEvent: workflow is not active', { workflowId, status: instanceCheck.status });
      return null;
    }

    // ── Cooperative mutex ──────────────────────────────────────────────────
    // If a transition is already in-flight for this workflow, queue this one.
    if (this._inFlight.has(workflowId)) {
      const queue = this._queue.get(workflowId) ?? [];
      if (queue.length >= this.maxQueueDepth) {
        log.warn('sendEvent: transition queue full; dropping event', {
          workflowId,
          event: event.type,
          queue_depth: queue.length,
          max_queue_depth: this.maxQueueDepth,
        });
        return null;
      }
      // Enqueue and return a promise that resolves when the queued transition runs
      return new Promise<WorkflowTransition | null>((resolve, reject) => {
        queue.push({ event, resolve, reject });
        this._queue.set(workflowId, queue);
      });
    }

    // No in-flight: acquire the mutex and run
    return this._acquireAndRun(workflowId, event);
  }

  /**
   * Acquires the per-workflow mutex, executes the transition, then drains
   * the queue for this workflow.
   *
   * @param workflowId - The workflow to run.
   * @param event      - The event to process.
   * @returns The result of the transition.
   */
  private _acquireAndRun(
    workflowId: string,
    event: RuntimeEvent,
  ): Promise<WorkflowTransition | null> {
    let resolveInFlight!: () => void;
    const inFlight = new Promise<void>((res) => { resolveInFlight = res; });
    this._inFlight.set(workflowId, inFlight);

    const runAndDrain = async (): Promise<WorkflowTransition | null> => {
      let result: WorkflowTransition | null = null;
      try {
        result = await this._executeTransition(workflowId, event);
      } finally {
        // Drain the next queued item (if any) before releasing the mutex
        const queue = this._queue.get(workflowId);
        if (queue && queue.length > 0) {
          const next = queue.shift()!;
          if (queue.length === 0) this._queue.delete(workflowId);
          // Keep the mutex held for the next transition
          const nextResult = this._executeTransition(workflowId, next.event)
            .then(next.resolve, next.reject)
            .finally(() => {
              // After the queued item finishes, drain any further queued items
              this._drainQueue(workflowId);
              resolveInFlight();
              this._inFlight.delete(workflowId);
            });
          void nextResult;
          // Don't release the mutex here — the queued item's finally() does it
          return result;
        } else {
          // No queued items — release the mutex
          resolveInFlight();
          this._inFlight.delete(workflowId);
        }
      }
      return result;
    };

    return runAndDrain();
  }

  /**
   * Recursively drains the per-workflow transition queue after a queued
   * transition completes. Each drained item runs as a chained promise,
   * serialised in FIFO order.
   *
   * @param workflowId - The workflow whose queue to drain.
   */
  private _drainQueue(workflowId: string): void {
    const queue = this._queue.get(workflowId);
    if (!queue || queue.length === 0) return;

    const next = queue.shift()!;
    if (queue.length === 0) this._queue.delete(workflowId);

    this._executeTransition(workflowId, next.event)
      .then(next.resolve, next.reject)
      .finally(() => this._drainQueue(workflowId));
  }

  /**
   * Executes a single state transition for the given workflow instance.
   *
   * This method performs the full transition sequence:
   * 1. Guard evaluation and transition matching
   * 2. Context snapshot (for rollback)
   * 3. Await on_exit actions (with timeout)
   * 4. Update state
   * 5. Await transition actions (with timeout)
   * 6. Await on_enter actions for the new state (with timeout)
   * 7. Record history and emit events
   *
   * On action failure or timeout, the transition is rolled back by restoring
   * the pre-transition state, updated_at, and removing the history entry.
   *
   * **Must be called only while holding the per-workflow mutex** (`_inFlight`).
   *
   * @param workflowId - ID of the workflow instance.
   * @param event      - The RuntimeEvent being processed.
   * @returns The recorded WorkflowTransition, or `null` if no matching
   *          transition was found or preconditions failed.
   */
  private async _executeTransition(
    workflowId: string,
    event: RuntimeEvent,
  ): Promise<WorkflowTransition | null> {
    const instance = this.instances.get(workflowId);
    if (!instance) {
      log.warn('_executeTransition: workflow instance not found', { workflowId });
      return null;
    }
    if (instance.status !== 'active') {
      log.warn('_executeTransition: workflow is not active', { workflowId, status: instance.status });
      return null;
    }

    const def = this.definitions.get(instance.definition_id);
    if (!def) {
      log.error('_executeTransition: definition not found for instance', {
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
      this.emitWorkflowEvent('workflow:failed', instance, { error: instance.error });
      this.directiveQueue?.purge(workflowId);
      return null;
    }

    const currentStateDef = def.states[instance.current_state];
    if (!currentStateDef) {
      log.error('_executeTransition: current state not found in definition', {
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

    // Snapshot pre-transition state for rollback on action failure
    const preTransitionState = instance.current_state;
    const preTransitionUpdatedAt = instance.updated_at;
    // Snapshot context for diff computation (captured before actions mutate it)
    const contextBefore = { ...instance.context };

    // ── Action execution with rollback ─────────────────────────────────────
    try {
      // on_exit actions for the current state
      if (currentStateDef.on_exit) {
        await this.executeActionsWithTimeout(
          currentStateDef.on_exit,
          instance.context,
          { workflowId, fromState, toState, phase: 'on_exit' },
        );
      }

      // Move to target state (committed only after all actions succeed)
      instance.current_state = toState;
      instance.updated_at = transitionTimestamp;

      // Transition-level actions
      if (matchingTransition.actions) {
        await this.executeActionsWithTimeout(
          matchingTransition.actions,
          instance.context,
          { workflowId, fromState, toState, phase: 'transition' },
        );
      }

      // on_enter actions for the new state
      const targetStateDef = def.states[toState];
      if (targetStateDef?.on_enter) {
        await this.executeActionsWithTimeout(
          targetStateDef.on_enter,
          instance.context,
          { workflowId, fromState, toState, phase: 'on_enter' },
        );
      }
    } catch (err) {
      // ── Rollback ───────────────────────────────────────────────────────────
      const isTimeout = err instanceof WorkflowTimeoutError;
      log.error(isTimeout ? 'Action timeout — rolling back transition' : 'Action failure — rolling back transition', {
        workflow_id: workflowId,
        from_state: fromState,
        to_state: toState,
        error: toErrorMessage(err),
      });
      instance.current_state = preTransitionState;
      instance.updated_at = preTransitionUpdatedAt;
      return null;
    }

    // Compute context changes (after all actions have run)
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

    // Emit state_changed event.
    // `context` is included so replay-engine can reconstruct context state
    // during recovery (replay reads data.context to merge into the instance).
    this.emitWorkflowEvent('workflow:state_changed', instance, {
      previous_state: fromState,
      current_state: toState,
      context: { ...instance.context },
    });

    // Check if new state is terminal
    if (def.terminal_states.includes(toState)) {
      instance.status = 'completed';
      instance.completed_at = transitionTimestamp;
      log.info('Workflow completed', { id: workflowId, terminal_state: toState });
      this.emitWorkflowEvent('workflow:completed', instance, {});
      this.directiveQueue?.purge(workflowId);
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
    this.directiveQueue?.purge(workflowId);
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
   * Wraps a list of ActionDefinitions in a timeout and delegates to
   * `executeActions`. If the actions exceed `actionTimeoutMs`, a
   * `WorkflowTimeoutError` is thrown, which causes the caller to roll back
   * the transition.
   *
   * @param actions  - Ordered list of ActionDefinitions to execute.
   * @param context  - Workflow context (mutated in-place by update_context).
   * @param logCtx   - Contextual information for rollback/warning log messages.
   * @throws {WorkflowTimeoutError} When actions exceed the configured timeout.
   * @throws {Error} When an individual action throws.
   */
  private async executeActionsWithTimeout(
    actions: ActionDefinition[],
    context: WorkflowContext,
    logCtx: { workflowId: string; fromState: string; toState: string; phase: string },
  ): Promise<void> {
    const timeout = this.actionTimeoutMs;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new WorkflowTimeoutError(
          `Action phase '${logCtx.phase}' exceeded ${timeout} ms timeout`,
          timeout,
        ));
      }, timeout);
    });

    try {
      await Promise.race([this.executeActions(actions, context), timeoutPromise]);
    } catch (err) {
      if (err instanceof WorkflowTimeoutError) {
        log.warn('Action execution timeout', {
          ...logCtx,
          timeout_ms: timeout,
        });
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Executes a list of ActionDefinitions against the current context.
   *
   * Actions run sequentially. Failures are propagated to the caller
   * (which handles rollback).
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
            log.warn('spawn_agent action type is not yet implemented (Phase 5 stub)', {
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
        // Rethrow so executeActionsWithTimeout can propagate to the rollback handler
        log.error('Action execution error', {
          action_type: action.type,
          error: toErrorMessage(err),
        });
        throw err;
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

    if (!lhsRaw || !rhsRaw) {
      throw new WorkflowError(`Unrecognised guard expression format: "${expr}"`);
    }

    const lhsValue = this.resolveValue(lhsRaw, context);
    const rhsValue = this.resolveValue(rhsRaw, context);

    switch (operator) {
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
      default: {
        // This branch is unreachable with valid TypeScript types, but guards
        // against misconfigured operator strings at runtime (e.g., from YAML/JSON).
        log.warn('Unrecognized guard expression operator', { operator, expression: expr });
        return false;
      }
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
