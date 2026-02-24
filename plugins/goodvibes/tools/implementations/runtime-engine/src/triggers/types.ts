/**
 * Trigger System Types
 *
 * Defines the complete type catalog for the declarative trigger system:
 * trigger definitions, condition variants, action variants, and results.
 */

import type { EventType, EventTypePattern, RuntimeEvent } from '../events/types.js';

// ─── Trigger Definition ────────────────────────────────────────────────────────

/**
 * A complete trigger definition stored in the registry.
 */
export interface TriggerDefinition {
  /** Unique identifier for this trigger. */
  id: string;
  /** Human-readable name. */
  name: string;
  /** Description of what this trigger does. */
  description: string;
  /** Whether this trigger is currently active. */
  enabled: boolean;
  /** Evaluation priority — lower number = higher priority. */
  priority: number;
  /** The condition that must be true for this trigger to fire. */
  condition: TriggerCondition;
  /** The action to execute when the condition is met. */
  action: TriggerAction;
  /** Minimum milliseconds between consecutive fires. */
  cooldown_ms?: number;
  /** Maximum number of times this trigger may fire in a session. */
  max_fires?: number;
  /** Number of times this trigger has fired in the current session. */
  fires_count: number;
  /** Epoch milliseconds of the last time this trigger fired (from `Date.now()`). */
  last_fired?: number;
}

// ─── Condition Types ───────────────────────────────────────────────────────────

/**
 * Discriminated union of all supported trigger condition types.
 */
export type TriggerCondition =
  | EventCondition
  | CompositeCondition
  | ThresholdCondition
  | PatternCondition;

/**
 * Matches a single event type, optionally filtering on payload fields.
 */
export interface EventCondition {
  type: 'event';
  /** Event type or pattern (e.g. 'build:failed', 'agent:*'). */
  event_type: EventTypePattern;
  /** Optional key-value pairs that must match the event payload data fields. */
  filter?: Record<string, unknown>;
}

/**
 * Logical combination of sub-conditions.
 * - `and`: all sub-conditions must be true
 * - `or`: at least one sub-condition must be true
 * - `not`: the single sub-condition must be false (unary)
 */
export interface CompositeCondition {
  type: 'and' | 'or' | 'not';
  /** Sub-conditions. For `not`, only the first element is used. */
  conditions: TriggerCondition[];
}

/**
 * Fires when a given event type has occurred at least `count` times
 * within a rolling `window_ms` millisecond window.
 */
export interface ThresholdCondition {
  type: 'threshold';
  /** Event type or pattern to count. */
  event_type: EventTypePattern;
  /** Minimum number of matching events required within the window. */
  count: number;
  /** Time window in milliseconds. */
  window_ms: number;
  /** Optional payload field to match across all counted events. */
  field?: string;
}

/**
 * Fires when a sequence of event types occurs in order within a time window.
 * The current event must match the last pattern in the sequence.
 */
export interface PatternCondition {
  type: 'sequence';
  /** Ordered list of event type patterns that must occur in sequence. */
  events: EventTypePattern[];
  /** Maximum time window in milliseconds within which all events must occur. */
  window_ms: number;
}

// ─── Action Types ──────────────────────────────────────────────────────────────

/**
 * Discriminated union of all supported trigger action types.
 */
export type TriggerAction =
  | EmitEventAction
  | SpawnAgentAction
  | InvokeHandlerAction
  | WorkflowAction
  | CompositeAction;

/**
 * Emits a new runtime event via the event bus.
 * Template values may reference `$event.type`, `$event.id`, `$event.payload.data.*`.
 */
export interface EmitEventAction {
  type: 'emit_event';
  /** The event type to emit. */
  event_type: EventType;
  /** Payload template with optional `$event.*` references. */
  payload_template: Record<string, unknown>;
}

/**
 * Spawns an agent. Placeholder until Phase 5 agent spawning.
 */
export interface SpawnAgentAction {
  type: 'spawn_agent';
  /** Type of agent to spawn (e.g. 'engineer', 'reviewer'). */
  agent_type: string;
  /** Task description template with optional `$event.*` references. */
  task_template: string;
  /** Resource budget for the spawned agent. */
  budget: {
    /** Maximum tokens the agent may consume. */
    max_tokens: number;
    /** Maximum conversation turns. */
    max_turns: number;
  };
}

/**
 * Invokes a registered named handler function.
 */
export interface InvokeHandlerAction {
  type: 'invoke_handler';
  /** Name of a handler registered via `TriggerRegistry.registerHandler`. */
  handler: string;
  /** Arguments template with optional `$event.*` references. */
  args_template: Record<string, unknown>;
}

/**
 * Workflow integration action — starts a new workflow or sends an event to one.
 * Placeholder until WorkflowEngine integration step.
 */
export interface WorkflowAction {
  type: 'start_workflow' | 'send_workflow_event';
  /** Workflow definition name (for start_workflow). */
  workflow_definition?: string;
  /** Target workflow ID (for send_workflow_event). */
  workflow_id?: string;
  /** Context template with optional `$event.*` references. */
  context_template?: Record<string, unknown>;
}

/**
 * Executes multiple actions in parallel or in sequence.
 */
export interface CompositeAction {
  type: 'parallel' | 'sequence';
  /** Actions to execute. */
  actions: TriggerAction[];
}

// ─── Result Types ──────────────────────────────────────────────────────────────

/**
 * The outcome of evaluating a single trigger against an event.
 */
export interface TriggerResult {
  /** ID of the evaluated trigger. */
  trigger_id: string;
  /** Name of the evaluated trigger. */
  trigger_name: string;
  /** Whether the trigger fired (condition met and action executed). */
  fired: boolean;
  /** Result of the action execution, present if fired is true. */
  action_result?: {
    success: boolean;
    error?: string;
  };
  /** Why the trigger was skipped, if it was not fired. */
  skipped_reason?: 'cooldown' | 'max_fires' | 'disabled' | 'guard_failed';
}

/**
 * A named action handler function registered with the ActionExecutor.
 * Receives resolved arguments and the triggering event.
 */
export type TriggerActionHandler = (
  args: Record<string, unknown>,
  event: RuntimeEvent,
) => Promise<void>;
