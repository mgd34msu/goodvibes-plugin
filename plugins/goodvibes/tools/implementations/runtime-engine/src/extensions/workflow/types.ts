/**
 * Workflow Type System
 *
 * Defines all types for the workflow state machine engine: definitions,
 * instances, transitions, guards, actions, and context. These types are
 * shared between the WorkflowEngine and built-in workflow definitions.
 */

import type { EventType, RuntimeEvent } from '../../shared/events.js';

// ─── Workflow Definition ──────────────────────────────────────────────────────

/**
 * A declarative state machine template that describes how a workflow
 * behaves. Multiple WorkflowInstances can be created from a single
 * WorkflowDefinition.
 */
export interface WorkflowDefinition {
  /** Unique identifier for this definition (e.g. 'wrfc_loop', 'fix_loop'). */
  id: string;
  /** Human-readable name for display and logging. */
  name: string;
  /** Schema version number. Increment when making breaking changes. */
  version: number;
  /** Map of state name to StateDefinition. Every state referenced in
   *  transitions must appear in this map. */
  states: Record<string, StateDefinition>;
  /** Name of the state where new instances begin. Must exist in `states`. */
  initial_state: string;
  /** Names of states that end the workflow. Instances reaching these states
   *  are automatically marked as completed. */
  terminal_states: string[];
  /** Optional wall-clock limit in milliseconds. Instances exceeding this
   *  duration are automatically cancelled with status 'timed_out'. */
  max_duration_ms?: number;
  /** Maximum number of state transitions allowed before the instance is
   *  halted to prevent infinite loops. */
  max_transitions?: number;
}

/**
 * Configuration for a single state within a WorkflowDefinition.
 */
export interface StateDefinition {
  /** Human-readable label for this state (typically matches the map key). */
  name: string;
  /** Actions executed immediately upon entering this state. */
  on_enter?: ActionDefinition[];
  /** Actions executed immediately before leaving this state. */
  on_exit?: ActionDefinition[];
  /** Ordered list of possible transitions out of this state. The first
   *  matching transition (event type + guard) is taken. */
  transitions: TransitionDefinition[];
  /** Timeout in milliseconds before the workflow auto-transitions.
   *  Requires `timeout_transition` to be set. */
  timeout_ms?: number;
  /** Target state to transition to when `timeout_ms` elapses. */
  timeout_transition?: string;
}

/**
 * Describes a single valid transition from one state to another.
 */
export interface TransitionDefinition {
  /** The EventType that can trigger this transition. */
  event: EventType;
  /** The name of the target state to move to when this transition fires. */
  target: string;
  /** Optional guard that must evaluate to true before the transition fires.
   *  When omitted, the transition fires unconditionally on event match. */
  guard?: GuardCondition;
  /** Optional actions to execute during the transition, after on_exit and
   *  before on_enter of the target state. */
  actions?: ActionDefinition[];
}

/**
 * A condition that must be satisfied for a transition to fire.
 *
 * Two evaluation modes are supported:
 * - `expression`: a simple DSL string evaluated without eval()
 * - `function`: a registered guard function looked up by name
 */
export interface GuardCondition {
  /** Evaluation strategy for this guard. */
  type: 'expression' | 'function';
  /**
   * Expression string in the form `context.field op value`.
   *
   * Supported operators: `>=`, `<=`, `>`, `<`, `===`, `!==`
   * Value types: number literals, boolean literals (`true`/`false`),
   * string literals (unquoted), and `null`.
   *
   * Examples:
   * - `"context.review_score >= 9.5"`
   * - `"context.fix_attempts < context.max_fix_attempts"`
   * - `"context.status === null"`
   */
  expression?: string;
  /** Name of a guard function registered via `WorkflowEngine.registerGuard`. */
  function?: string;
}

/**
 * Describes an action to be executed on state enter, exit, or transition.
 */
export interface ActionDefinition {
  /**
   * Action type controls how `config` is interpreted:
   * - `emit_event`    — emit a runtime event via the EventBus
   * - `update_context` — shallow-merge config into workflow context
   * - `invoke_handler` — call a registered action handler by name
   * - `spawn_agent`   — spawn a subagent (placeholder for Phase 5)
   */
  type: 'emit_event' | 'update_context' | 'invoke_handler' | 'spawn_agent';
  /** Type-specific configuration payload. */
  config: Record<string, unknown>;
}

// ─── Workflow Instance ────────────────────────────────────────────────────────

/**
 * A running (or completed) instance of a WorkflowDefinition.
 * Created by `WorkflowEngine.create()` and mutated by `sendEvent()`.
 */
export interface WorkflowInstance {
  /** Unique identifier in the form `wf_<uuid>`. */
  id: string;
  /** ID of the WorkflowDefinition this instance was created from. */
  definition_id: string;
  /** Name of the state this instance is currently in. */
  current_state: string;
  /** Mutable context object that accumulates data across transitions. */
  context: WorkflowContext;
  /** Ordered list of all transitions this instance has executed. */
  history: WorkflowTransition[];
  /** Epoch milliseconds when this instance was created. */
  created_at: number;
  /** Epoch milliseconds of the last state change. */
  updated_at: number;
  /** Epoch milliseconds when the instance reached a terminal state. */
  completed_at?: number;
  /** Lifecycle status of this instance. */
  status: 'active' | 'completed' | 'failed' | 'cancelled' | 'timed_out';
  /** Human-readable error message when status is 'failed' or 'timed_out'. */
  error?: string;
}

/**
 * Mutable context that flows through a workflow, accumulating data as
 * the instance progresses through states.
 */
export interface WorkflowContext {
  // ── WRFC-specific context ──────────────────────────────────────────────
  /** Human-readable task description for the WRFC loop. */
  task?: string;
  /** IDs of agent instances involved in this workflow. */
  agents?: string[];
  /** Numeric review score from the most recent review (0–10). */
  review_score?: number;
  /** Issues flagged by the most recent review. */
  review_issues?: Array<{
    /** The review dimension the issue was found in. */
    dimension: string;
    /** Severity level of the issue. */
    severity: string;
    /** Human-readable description of the issue. */
    description: string;
  }>;
  /** Minimum review score required to pass (0–10). Defaults to 9.5. */
  min_review_score?: number;
  /** Number of fix iterations completed so far in this WRFC cycle. */
  fix_attempts?: number;
  /** Maximum fix iterations allowed before escalating. */
  max_fix_attempts?: number;
  /** Paths of files modified during the write or fix phase. */
  files_modified?: string[];

  // ── Fix-loop-specific context ─────────────────────────────────────────
  /** Issues identified during the diagnosis phase. */
  diagnosed_issues?: Array<{
    /** Unique identifier for the diagnosed issue. */
    id: string;
    /** Human-readable description of the problem. */
    description: string;
    /** Severity of the issue (e.g. 'critical', 'major', 'minor'). */
    severity: string;
  }>;
  /** Changes applied during the fix phase. */
  fix_changes?: Array<{
    /** Path of the modified file. */
    file: string;
    /** Description of the change applied. */
    description: string;
  }>;
  /** Result of the most recent verification run. */
  verification_result?: {
    /** Whether verification passed. */
    passed: boolean;
    /** List of error messages if verification failed. */
    errors: string[];
  };

  /** Allows arbitrary additional context data. */
  [key: string]: unknown;
}

/**
 * A record of a single state transition that occurred in a workflow instance.
 */
export interface WorkflowTransition {
  /** State the instance was in before the transition. */
  from_state: string;
  /** State the instance moved to after the transition. */
  to_state: string;
  /** EventType that triggered the transition. */
  event: EventType;
  /** Epoch milliseconds when the transition occurred. */
  timestamp: number;
  /** Keys in WorkflowContext that changed as a result of this transition. */
  context_changes: Record<string, unknown>;
}

// ─── Guard and Action Function Types ─────────────────────────────────────────

/**
 * A guard function registered with WorkflowEngine.registerGuard().
 *
 * @param context - Current workflow context at the time of evaluation.
 * @param event   - The runtime event that triggered the transition check.
 * @returns `true` if the transition should fire; `false` to skip it.
 */
export type GuardFunction = (
  context: WorkflowContext,
  event: RuntimeEvent
) => boolean;

/**
 * An action handler registered with WorkflowEngine.registerAction().
 *
 * @param context - Current workflow context (may be mutated in-place).
 * @param config  - Type-specific configuration from the ActionDefinition.
 */
export type ActionHandler = (
  context: WorkflowContext,
  config: Record<string, unknown>
) => Promise<void>;
