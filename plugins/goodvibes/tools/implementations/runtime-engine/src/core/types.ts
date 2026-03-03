/**
 * Core Type Definitions — Layer 1
 *
 * Shared type definitions for the runtime engine core layer.
 * Defines the base event schema (RuntimeEvent, EventContext, EventSource),
 * trigger and handler contracts (Trigger, HandlerResult, TriggerHandlerFn),
 * component interfaces (EventQueueInterface, StateStoreInterface, etc.),
 * conditions and actions, metrics, and factory helpers.
 *
 * Layer 2 (extensions) and Layer 3 (plugins) extend these interfaces.
 * This file NEVER changes after stabilisation.
 */

import type { RuntimeEvent, EventSource, EventContext } from '../shared/events.js';


// ─── Event Matcher ────────────────────────────────────────────────────────────

/**
 * Describes which events a trigger should match.
 * All fields are ANDed together.
 */
export interface EventMatcher {
  /** Filter by source. Single value or array (OR semantics). */
  source?: EventSource | EventSource[];
  /** Match event type exactly (string) or by pattern (RegExp). */
  type: string | RegExp;
  /** Deep partial equality check against the event payload. */
  payload_match?: Record<string, unknown>;
}

// ─── Conditions ───────────────────────────────────────────────────────────────

/**
 * Supported comparison operators for trigger conditions.
 */
export type ConditionOp = 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'in' | 'exists';

/**
 * A single condition evaluated against the current state store.
 * `field` is a dot-separated path into the state (e.g. 'sessions.active.phase').
 */
export interface Condition {
  /** Dot-separated state path to evaluate (e.g. 'session.active'). */
  field: string;
  /** Comparison operator. */
  op: ConditionOp;
  /**
   * Expected value.
   * For 'in': must be an array — field value must be one of the elements.
   * For 'exists': value is ignored (field presence is checked).
   */
  value: unknown;
}

// ─── Actions ──────────────────────────────────────────────────────────────────

/**
 * Supported action types that a trigger handler can produce.
 */
type ActionType =
  | 'spawn_agent'
  | 'emit_event'
  | 'send_message'
  | 'schedule'
  | 'update_state'
  | 'update_memory'
  | 'block'
  | 'notify_human'
  /**
   * Cancels a pending event or a set of events identified by context.ref.
   * This is an intentional extension beyond the base spec, required to support
   * the cancel/timeout pattern where a scheduled timeout event must be
   * cancelled when the primary action completes before the deadline.
   */
  | 'cancel_event';

/**
 * A single action to execute as part of a handler result.
 */
export interface Action {
  /** The action category. */
  type: ActionType;
  /** Action-specific parameters. */
  params: Record<string, unknown>;
}

/**
 * Interface for executing actions produced by handler results.
 * Implementations translate Action objects into concrete side effects
 * (e.g., enqueuing directives, spawning agents).
 */
export interface ActionExecutorInterface {
  execute(action: Action, context: Record<string, unknown>): Promise<void>;
}

// ─── Retry Policy ─────────────────────────────────────────────────────────────

/**
 * Retry configuration for a trigger's handler.
 */
export interface RetryPolicy {
  /** Maximum number of handler execution attempts (including the first). */
  max_attempts: number;
  /** Backoff strategy between attempts. */
  backoff: 'fixed' | 'exponential';
  /** Base delay in milliseconds between attempts. */
  delay_ms: number;
}

// ─── Trigger ──────────────────────────────────────────────────────────────────

/**
 * A complete trigger definition. Triggers are matched against incoming events
 * and fire their actions when all conditions are satisfied.
 */
export interface Trigger {
  /** Unique identifier. */
  id: string;
  /** Which events activate this trigger. */
  event_match: EventMatcher;
  /** Additional state conditions (all must be satisfied). */
  conditions?: Condition[];
  /** Actions to return when the trigger fires. */
  actions: Action[];
  /** Circuit breaker: max times this trigger may fire (total). 0 = unlimited. */
  max_fires?: number;
  /** Circuit breaker: minimum ms between consecutive fires. */
  cooldown_ms?: number;
  /** Circuit breaker: do not fire if event chain depth exceeds this value. */
  chain_depth_limit?: number;
  /** Retry policy for handler failures. */
  retry?: RetryPolicy;
  /** Whether this trigger is active. */
  enabled: boolean;
  /** Handler priority — higher = evaluated first. Default 0. */
  priority?: number;
}

// ─── Handler Result ───────────────────────────────────────────────────────────

/**
 * What a trigger handler returns after processing an event.
 */
export interface HandlerResult {
  /** Additional actions to execute (supplements trigger.actions). */
  actions?: Action[];
  /** State key/value pairs to persist. */
  state_updates?: StateUpdate[];
  /** New events to enqueue (causal chaining). */
  events?: RuntimeEvent[];
  /** Non-fatal error encountered during processing. */
  error?: Error;
}

/**
 * A single state update operation.
 */
export interface StateUpdate {
  /** Dot-separated state path to update (e.g. 'sessions.active.phase'). */
  key: string;
  /** New value (for 'set'/'merge') or unused (for 'delete'). */
  value: unknown;
  /** How to apply the update. */
  op: 'set' | 'delete' | 'merge';
}

// ─── Queue Interface ──────────────────────────────────────────────────────────

/**
 * Contract for the event queue implementation.
 */
export interface EventQueueInterface {
  /** Add an event. Throws if max depth exceeded and backpressure is active. */
  enqueue(event: RuntimeEvent): void;
  /** Remove and return all pending events in processing order. */
  drain(): RuntimeEvent[];
  /** Peek at the next event without removing it. */
  peek(): RuntimeEvent | null;
  /** Current queue depth. */
  depth(): number;
  /** Returns true if the event is a duplicate (and was not enqueued). */
  deduplicate(event: RuntimeEvent): boolean;
  /** Cancel a single event by ID. Returns true if found and removed. */
  cancel(event_id: string): boolean;
  /** Cancel all events with matching context.ref. Returns count removed. */
  cancelByRef(ref: string): number;
  /** Re-enqueue events bypassing deduplication (for cut-down batches). */
  requeue(events: RuntimeEvent[]): void;
}

// ─── State Store Interface ────────────────────────────────────────────────────

/**
 * Contract for the state store implementation.
 * Implementations must be synchronous (or provide sync facades).
 */
export interface StateStoreInterface {
  /** Get a value by dot-separated key path. Returns null if not found. */
  get<T>(key: string): T | null;
  /** Set a value at a dot-separated key path. */
  set<T>(key: string, value: T): void;
  /** Delete a key. No-op if not found. */
  delete(key: string): void;
  /** Deep-merge a plain object at the given key path. */
  merge(key: string, value: Record<string, unknown>): void;
  /** Take a full snapshot of the store. */
  snapshot(): Record<string, unknown>;
  /** Restore from a snapshot (replaces all current state). */
  restore(snapshot: Record<string, unknown>): void;
}

// ─── Component Interfaces ─────────────────────────────────────────────────────

/**
 * Minimal trigger definition shape for the L1 registry interface.
 * Captures the fields used by TriggerRegistry without coupling L1 to L2 types.
 * The L2 `TriggerDefinition` extends this base.
 */
export interface TriggerDefinitionBase {
  /** Unique identifier for this trigger. */
  id: string;
  /** Human-readable name. */
  name: string;
  /** Description of what this trigger does. */
  description?: string;
  /** Whether this trigger is currently active. */
  enabled: boolean;
  /** Evaluation priority — lower number = higher priority. */
  priority: number;
  /** The condition that must be true for this trigger to fire. */
  condition: unknown;
  /** The action to execute when the condition is met. */
  action: unknown;
  /** Minimum milliseconds between consecutive fires. */
  cooldown_ms?: number;
  /** Maximum number of times this trigger may fire in a session. */
  max_fires?: number;
  /** Number of times this trigger has fired in the current session. */
  fires_count?: number;
  /** Epoch milliseconds of the last time this trigger fired. */
  last_fired?: number;
}

/**
 * Contract for the trigger registry.
 * Enables Layer 2/3 to provide alternative registry implementations.
 *
 * The `register()` and `get()` methods accept/return `Trigger | TriggerDefinitionBase`
 * so that the unified L2 TriggerRegistry (which operates on `TriggerDefinition`)
 * can implement this interface without down-casting.
 */
export interface TriggerRegistryInterface {
  /** Match an event against all registered triggers, returning those that fire. */
  match(event: RuntimeEvent, store: StateStoreInterface): Trigger[];
  /** Record that a trigger has fired. */
  recordFire(trigger_id: string): void;
  /** Register a new trigger or trigger definition. */
  register(trigger: Trigger | TriggerDefinitionBase): void;
  /** Unregister a trigger by ID. Returns true if it existed. */
  unregister(id: string): boolean;
  /** Enable a trigger. */
  enable(id: string): void;
  /** Disable a trigger without removing it. */
  disable(id: string): void;
  /** Get a registered trigger by ID. */
  get(id: string): Trigger | TriggerDefinitionBase | undefined;
}

/**
 * Contract for the dead-letter queue.
 * Enables Layer 2/3 to provide alternative DLQ implementations.
 */
export interface DeadLetterQueueInterface {
  /** Add a failed event entry to the queue. */
  add(entry: DeadLetterEntry): void;
  /** Current number of entries in the queue. */
  size(): number;
}

/**
 * A dead-letter entry (referenced by DeadLetterQueueInterface).
 * Full definition lives in dead-letter.ts; this is a forward-compatible subset.
 */
export interface DeadLetterEntry {
  event: RuntimeEvent;
  error: string;
  dead_lettered_at: number;
  attempt_count: number;
  trigger_id: string;
}

/**
 * Contract for the error handler.
 * Enables Layer 2/3 to provide alternative execution strategies.
 */
export interface ErrorHandlerInterface {
  /** Execute a trigger handler with retry logic. Never throws. */
  execute(
    trigger_id: string,
    handler: TriggerHandlerFn,
    event: RuntimeEvent,
    retry?: RetryPolicy,
  ): Promise<ErrorHandlerResult>;
}

/** A handler function: takes an event and returns a HandlerResult. */
export type TriggerHandlerFn = (event: RuntimeEvent) => Promise<HandlerResult>;

/** Result from the error handler wrapping a trigger execution. */
export interface ErrorHandlerResult {
  success: boolean;
  result?: HandlerResult;
  error?: Error;
  attempts: number;
  error_events: RuntimeEvent[];
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

/** Valid loop states. */
export type LoopStatus = 'running' | 'paused' | 'draining' | 'stopped';

/**
 * Contract for loop lifecycle management.
 */
export interface LoopLifecycle {
  /** Transition to 'running'. */
  start(): void;
  /** Transition to 'paused' (events still accepted, not processed). */
  pause(): void;
  /** Resume from 'paused' → 'running'. */
  resume(): void;
  /** Process all remaining events then transition to 'stopped'. */
  drain(): Promise<void>;
  /** Gracefully shut down: persist state then stop. */
  shutdown(): Promise<void>;
  /** Current loop status. */
  status(): LoopStatus;
  /** Returns true if events should be processed (only 'running'). */
  isProcessing(): boolean;
  /** Returns true if events should be accepted (any state except stopped). */
  acceptsEvents(): boolean;
}

// ─── Metrics ──────────────────────────────────────────────────────────────────

/**
 * Point-in-time snapshot of loop metrics.
 */
export interface MetricsSnapshot {
  events_processed: number;
  events_failed: number;
  events_dead_lettered: number;
  avg_latency_ms: number;
  queue_depth: number;
  active_chains: number;
  active_workflows: number;
  triggers_fired: number;
}

/**
 * Contract for the metrics collector.
 */
export interface MetricsCollector {
  /** Record a successfully processed event. */
  onEventProcessed(event: RuntimeEvent, duration_ms: number): void;
  /** Record a handler execution error. */
  onHandlerError(trigger_id: string, error: Error, event: RuntimeEvent): void;
  /** Record a change in queue depth. */
  onQueueDepthChange(depth: number): void;
  /** Record a trigger fire. */
  onTriggerFired(trigger_id: string, event: RuntimeEvent): void;
  /** Record an event moved to the dead-letter queue. */
  onEventDeadLettered(event: RuntimeEvent, reason: string): void;
  /** Generate a current snapshot. */
  getStats(): MetricsSnapshot;
  /** Reset all counters and rolling windows. */
  reset(): void;
  /** Update the count of active event chains. */
  setActiveChains(count: number): void;
  /** Update the count of active workflows. */
  setActiveWorkflows(count: number): void;
}

// ─── Trigger Action Interfaces ───────────────────────────────────────────────

/**
 * Result of executing a trigger action.
 */
export interface TriggerActionResult {
  success: boolean;
  error?: string;
}

/**
 * A named action handler function registered with the TriggerActionExecutor.
 * Receives resolved arguments and the triggering event.
 */
export type TriggerActionHandler = (
  args: Record<string, unknown>,
  event: RuntimeEvent,
) => Promise<void>;

/** L1 interface for event emission — implemented by EventBus in L2 */
export interface EventEmitter {
  emit(event: RuntimeEvent): void;
}

/** L1 interface for condition evaluation — implemented by ConditionEvaluator in L2 */
export interface ConditionEvaluatorInterface {
  evaluate(condition: unknown, event: RuntimeEvent): boolean;
  recordEvent(event: RuntimeEvent): void;
  pruneOldEvents(maxAgeMs: number): void;
}

/** L1 interface for trigger action execution — implemented by TriggerActionExecutor in L2 */
export interface TriggerActionExecutorInterface {
  execute(action: unknown, event: RuntimeEvent): Promise<TriggerActionResult>;
  registerHandler(name: string, handler: TriggerActionHandler): void;
}

// ─── Type Guards ──────────────────────────────────────────────────────────────

/**
 * Narrows an unknown value to RuntimeEvent.
 */
function isRuntimeEvent(value: unknown): value is RuntimeEvent {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v['id'] === 'string' &&
    typeof v['source'] === 'object' && v['source'] !== null &&
    typeof (v['source'] as Record<string, unknown>)['kind'] === 'string' &&
    typeof v['type'] === 'string' &&
    typeof v['timestamp'] === 'number' &&
    typeof v['priority'] === 'number' &&
    'payload' in v
  );
}

/**
 * Narrows an unknown value to Trigger.
 */
function isTrigger(value: unknown): value is Trigger {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v['id'] === 'string' &&
    typeof v['event_match'] === 'object' &&
    v['event_match'] !== null &&
    Array.isArray(v['actions']) &&
    typeof v['enabled'] === 'boolean'
  );
}

/**
 * Narrows an unknown value to EventContext.
 */
function isEventContext(value: unknown): value is EventContext {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    (v['workflow_id'] === undefined || typeof v['workflow_id'] === 'string') &&
    (v['agent_id'] === undefined || typeof v['agent_id'] === 'string') &&
    (v['parent_event_id'] === undefined || typeof v['parent_event_id'] === 'string') &&
    (v['chain_depth'] === undefined || typeof v['chain_depth'] === 'number')
  );
}

// ─── Factory Helpers ──────────────────────────────────────────────────────────

/**
 * Creates a Trigger with sensible defaults.
 * The caller must supply `id`, `event_match`, and `actions`;
 * `enabled` defaults to true.
 */
export function createTrigger(
  overrides: Pick<Trigger, 'id' | 'event_match' | 'actions'> & Partial<Omit<Trigger, 'id' | 'event_match' | 'actions'>>,
): Trigger {
  return {
    enabled: true,
    priority: 0,
    ...overrides,
  };
}

