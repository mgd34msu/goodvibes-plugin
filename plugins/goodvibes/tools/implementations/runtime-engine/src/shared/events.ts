/**
 * Unified Runtime Event Type System — Shared Layer
 *
 * Single source of truth for all event types in the runtime engine.
 * Merges L1 (core/types.ts) and L2 (extensions/events/types.ts) into one
 * coherent, backward-compatible type surface.
 *
 * Merge strategy:
 * - EventSource:  L2 discriminated union (richer, enables structural narrowing)
 * - EventType:    L2 literal union (~90 typed strings)
 * - EventPayload: L2 discriminated union (typed per event type)
 * - EventMetadata:L2 (session_id, correlation_id, sequence)
 * - EventContext:  L1 (workflow_id, agent_id, chain_depth, ref — causal routing)
 * - priority:     L1 (number — missing from L2)
 * - timestamp:    L1 epoch ms (number — better for math than L2 ISO string)
 * - id:           Both have it; UUID string
 *
 * Consumers should import from this file, NOT from core/types.ts or
 * extensions/events/types.ts directly.
 */

import { generateEventId } from './utils.js';
export { generateEventId };

// ─── Event Source ─────────────────────────────────────────────────────────────

/**
 * Discriminated union describing which subsystem emitted an event.
 *
 * Every variant carries a `kind` discriminant that enables structural narrowing:
 * ```ts
 * if (event.source.kind === 'hook') {
 *   console.log(event.source.hook_name);
 * }
 * ```
 */
export type EventSource =
  /** Emitted from a hook script (pre_tool_use, post_tool_use, etc.). */
  | { kind: 'hook'; hook_name: string }
  /** Emitted from a workflow instance. */
  | { kind: 'workflow'; workflow_id: string }
  /** Emitted from an agent instance. */
  | { kind: 'agent'; agent_id: string }
  /** Emitted from an event trigger. */
  | { kind: 'trigger'; trigger_id: string }
  /** Emitted from core engine internals. */
  | { kind: 'system' }
  /** Emitted via an MCP tool call. */
  | { kind: 'mcp_tool'; tool_name: string }
  /** Emitted from an IPC client. */
  | { kind: 'ipc'; client_id: string }
  /** Emitted by a scheduled timer or cron job. */
  | { kind: 'time'; schedule_id?: string }
  /** Emitted from an external system or webhook. */
  | { kind: 'external'; origin: string }
  /** Emitted from an internal engine subsystem (non-hook). */
  | { kind: 'internal' }
  /** Emitted directly by the user (e.g. via a UI or CLI). */
  | { kind: 'user' };

// ─── Event Context ────────────────────────────────────────────────────────────

/**
 * Causal and routing context attached to an event.
 * Optional on root events; populated when events are chained.
 *
 * Taken from L1 core/types.ts — L2 lacked this entirely.
 */
export interface EventContext {
  /** Workflow this event belongs to (enables workflow-level locking). */
  workflow_id?: string;
  /** Agent that produced this event. */
  agent_id?: string;
  /** ID of the event that directly caused this one. */
  parent_event_id?: string;
  /** Depth of the causal chain (0 for root events). */
  chain_depth?: number;
  /** Cancellation reference tag — cancel all events sharing this ref. */
  ref?: string;
}

// ─── Event Metadata ───────────────────────────────────────────────────────────

/**
 * Cross-cutting metadata assigned by the EventBus to every event.
 *
 * Taken from L2 extensions/events/types.ts.
 */
export interface EventMetadata {
  /** Session identifier — matches the outer Claude session. */
  session_id: string;
  /** Optional correlation identifier linking a chain of related events. */
  correlation_id?: string;
  /** ID of the event that directly caused this one to be emitted. */
  causation_id?: string;
  /** Monotonically increasing sequence number assigned by the EventBus. */
  sequence: number;
  /** Schema version; always 1. */
  version: 1;
}

// ─── Event Type ───────────────────────────────────────────────────────────────

/**
 * The complete catalog of event types supported by the runtime engine.
 *
 * Namespaced with `namespace:action` convention:
 * - `session:*`    — Claude session lifecycle
 * - `hook:*`       — Hook script invocations
 * - `workflow:*`   — Workflow state machine transitions
 * - `wrfc:*`       — Write-Review-Fix-Check loop phases
 * - `fix:*`        — Fix loop sub-phases
 * - `test_fix:*`   — Test-then-fix loop phases
 * - `review_only:*`— Review-only workflow phases
 * - `review:*`     — Generic review events
 * - `agent:*`      — Agent spawning and execution
 * - `trigger:*`    — Event trigger evaluations
 * - `file:*`       — File system changes
 * - `build:*`      — Build command results
 * - `test:*`       — Test run results
 * - `devserver:*`  — Dev server lifecycle
 * - `engine:*`     — Inter-engine communication
 * - `system:*`     — Internal engine health and lifecycle
 * - `executor:*`   — Executor mode and budget events
 */
export type EventType =
  // ── Session lifecycle ─────────────────────────────────────────────────────
  /** A new Claude session has started. */
  | 'session:started'
  /** The session is in the process of ending (pre-shutdown). */
  | 'session:ending'
  /** The session has fully ended. */
  | 'session:ended'
  /** A context-compaction cycle has run. */
  | 'session:compact'

  // ── Hook events ──────────────────────────────────────────────────────────
  /** Fired before a tool is invoked. */
  | 'hook:pre_tool_use'
  /** Fired after a tool returns successfully. */
  | 'hook:post_tool_use'
  /** Fired after a tool returns with a failure. */
  | 'hook:post_tool_use_failure'
  /** Fired at the start of a session (hook script entry). */
  | 'hook:session_start'
  /** Fired at the end of a session (hook script entry). */
  | 'hook:session_end'
  /** Fired when a subagent starts. */
  | 'hook:subagent_start'
  /** Fired when a subagent stops. */
  | 'hook:subagent_stop'
  /** Fired before a context compaction. */
  | 'hook:pre_compact'
  /** Fired when the agent stops responding. */
  | 'hook:stop'
  /** Fired when a notification is dispatched to the user. */
  | 'hook:notification'
  /** Fired when the user submits a prompt. */
  | 'hook:user_prompt_submit'

  // ── Workflow events ───────────────────────────────────────────────────────
  /** A new workflow instance has been created. */
  | 'workflow:created'
  /** A workflow transitioned from one state to another. */
  | 'workflow:state_changed'
  /** A workflow completed successfully. */
  | 'workflow:completed'
  /** A workflow failed and will not retry. */
  | 'workflow:failed'
  /** A workflow was cancelled by external request. */
  | 'workflow:cancelled'

  // ── WRFC-specific events ──────────────────────────────────────────────────
  /** The Gather phase of a WRFC loop has started. */
  | 'wrfc:gathering_started'
  /** A plan has been submitted for the Write phase. */
  | 'wrfc:plan_submitted'
  /** The Write phase has started. */
  | 'wrfc:writing_started'
  /** The Review phase has started. */
  | 'wrfc:review_started'
  /** The Review phase has completed; result available in payload. */
  | 'wrfc:review_completed'
  /** The Fix phase has started. */
  | 'wrfc:fix_started'
  /** The Fix phase has completed. */
  | 'wrfc:fix_completed'
  /** The WRFC loop escalated due to too many fix iterations. */
  | 'wrfc:escalated'
  /** The WRFC loop completed successfully. */
  | 'wrfc:completed'
  /** The active phase of a WRFC chain changed. */
  | 'workflow:phase_changed'
  /** Review score could not be parsed from reviewer output. */
  | 'wrfc:review_parse_failed'

  // ── Test-then-fix events ──────────────────────────────────────────────────
  /** The test-then-fix workflow has started its initial test run. */
  | 'test_fix:testing_started'
  /** The initial test run passed. */
  | 'test_fix:tests_passed'
  /** The initial test run failed. */
  | 'test_fix:tests_failed'
  /** The fix phase has started. */
  | 'test_fix:fix_started'
  /** The fix phase has completed. */
  | 'test_fix:fix_completed'
  /** The re-test phase has started after a fix. */
  | 'test_fix:retesting_started'
  /** The test-then-fix loop completed successfully. */
  | 'test_fix:completed'
  /** The test-then-fix loop escalated due to too many fix iterations. */
  | 'test_fix:escalated'

  // ── Review-only events ────────────────────────────────────────────────────
  /** The review-only workflow review phase has started. */
  | 'review_only:review_started'
  /** The review-only workflow review phase has completed. */
  | 'review_only:review_completed'
  /** The review-only workflow completed. */
  | 'review_only:completed'

  // ── Generic trigger events ────────────────────────────────────────────────
  /** A review was requested externally. */
  | 'review:requested'

  // ── Fix loop events ───────────────────────────────────────────────────────
  /** The fix loop is diagnosing the problem. */
  | 'fix:diagnosing'
  /** The fix loop is applying a patch. */
  | 'fix:applying'
  /** The fix loop is verifying the patch. */
  | 'fix:verifying'
  /** The fix was successfully resolved. */
  | 'fix:resolved'
  /** The fix loop is retrying after a failed attempt. */
  | 'fix:retrying'
  /** The fix loop has failed after exhausting all attempts. */
  | 'fix:failed'

  // ── Agent events ──────────────────────────────────────────────────────────
  /** An agent has been spawned and is waiting for dependencies. */
  | 'agent:spawned'
  /** An agent has started executing. */
  | 'agent:started'
  /** An agent reported incremental progress. */
  | 'agent:progress'
  /** An agent completed successfully. */
  | 'agent:completed'
  /** An agent failed. */
  | 'agent:failed'
  /** An agent is approaching its token or turn budget. */
  | 'agent:budget_warning'
  /** An agent has exhausted its budget and stopped. */
  | 'agent:budget_exhausted'
  /** An agent was cancelled. */
  | 'agent:cancelled'
  /** A dependency of this agent has been resolved. */
  | 'agent:dependency_resolved'

  // ── Trigger events ────────────────────────────────────────────────────────
  /** A trigger has fired (condition evaluated as true). */
  | 'trigger:fired'
  /** A trigger condition has been met but the action hasn't run yet. */
  | 'trigger:condition_met'
  /** A trigger action executed successfully. */
  | 'trigger:action_executed'
  /** A trigger action failed to execute. */
  | 'trigger:action_failed'

  // ── File events ───────────────────────────────────────────────────────────
  /** A file was created. */
  | 'file:created'
  /** A file was modified. */
  | 'file:modified'
  /** A file was deleted. */
  | 'file:deleted'
  /** A file has been locked for exclusive write access. */
  | 'file:locked'
  /** A file lock has been released. */
  | 'file:unlocked'

  // ── Build events ──────────────────────────────────────────────────────────
  /** A build command has started. */
  | 'build:started'
  /** A build command completed successfully. */
  | 'build:succeeded'
  /** A build command failed. */
  | 'build:failed'

  // ── Test events ───────────────────────────────────────────────────────────
  /** A test run has started. */
  | 'test:started'
  /** A test run passed. */
  | 'test:passed'
  /** A test run failed. */
  | 'test:failed'

  // ── Dev server events ─────────────────────────────────────────────────────
  /** A dev server process has started. */
  | 'devserver:started'
  /** A dev server process has stopped. */
  | 'devserver:stopped'
  /** A dev server reported an error. */
  | 'devserver:error'
  /** A dev server is ready to accept connections. */
  | 'devserver:ready'

  // ── Engine events ─────────────────────────────────────────────────────────
  /** A remote engine connected. */
  | 'engine:connected'
  /** A remote engine disconnected. */
  | 'engine:disconnected'
  /** An inter-engine request was sent. */
  | 'engine:request'
  /** An inter-engine response was received. */
  | 'engine:response'

  // ── System events ─────────────────────────────────────────────────────────
  /** The runtime engine has started up. */
  | 'system:startup'
  /** The runtime engine is shutting down. */
  | 'system:shutdown'
  /** A periodic health check was performed. */
  | 'system:health_check'
  /** An internal engine error occurred. */
  | 'system:error'
  /** A garbage collection cycle ran. */
  | 'system:gc'

  // ── Executor events ───────────────────────────────────────────────────────
  /** Executor mode was determined or changed. */
  | 'executor:mode_set'
  /** A daemon tick was received and processing started. */
  | 'executor:tick_received'
  /** A daemon tick batch completed processing. */
  | 'executor:tick_completed'
  /** Context clearing was initiated (daemon/hybrid mode). */
  | 'executor:context_clearing'
  /** Executor budget warning threshold reached. */
  | 'executor:budget_warning'
  /** Executor budget cap reached; processing paused. */
  | 'executor:budget_exceeded'
  /** Executor daily budget reset occurred. */
  | 'executor:budget_reset'
  /** Executor processing was paused due to budget. */
  | 'executor:paused'
  /** Executor processing was resumed (budget increased or reset). */
  | 'executor:resumed'

  // ── Core internal events ──────────────────────────────────────────────────
  /** A trigger handler threw an error while processing an event. */
  | 'core:handler_error'
  /** An event's causal chain exceeded the maximum allowed depth. */
  | 'core:chain_depth_exceeded'
  /** The event queue depth exceeded the configured warning threshold. */
  | 'core:queue_depth_warning';

// ─── Payload Interfaces ───────────────────────────────────────────────────────

/**
 * Payload for `session:started` — describes the new session context.
 */
export interface SessionStartedPayload {
  /** Claude session identifier. */
  session_id: string;
  /** Working directory when the session started. */
  cwd: string;
  /** Resolved project root path. */
  project_root: string;
  /** Interaction mode — 'vibecoding' (rich) or 'justvibes' (lean). */
  mode: 'vibecoding' | 'justvibes';
}

/**
 * Payload for `hook:*` events — captures hook script context.
 */
export interface HookEventPayload {
  /** Name of the hook that fired (e.g. 'pre_tool_use'). */
  hook_name: string;
  /** Name of the tool being invoked, if applicable. */
  tool_name?: string;
  /** Input arguments passed to the tool, if applicable. */
  tool_input?: Record<string, unknown>;
  /** Serialized tool output, if applicable. */
  tool_output?: string;
  /** Error message if the hook fired on a failure path. */
  error?: string;
  /** Duration of the hook script execution in milliseconds. */
  duration_ms: number;
}

/**
 * Payload for `workflow:state_changed` — captures a state machine transition.
 */
export interface WorkflowStateChangedPayload {
  /** Identifier of the workflow instance. */
  workflow_id: string;
  /** Type/name of the workflow (e.g. 'wrfc', 'fix-loop'). */
  workflow_type: string;
  /** State before the transition. */
  previous_state: string;
  /** State after the transition. */
  current_state: string;
  /** Arbitrary context data associated with the transition. */
  context: Record<string, unknown>;
}

/**
 * Payload for `agent:spawned` — describes a newly created agent.
 */
export interface AgentSpawnedPayload {
  /** Unique identifier for this agent instance. */
  agent_id: string;
  /** Type of agent (e.g. 'engineer', 'reviewer'). */
  agent_type: string;
  /** Human-readable task description. */
  task: string;
  /** Resource budget for this agent. */
  budget: {
    /** Maximum total tokens the agent may consume. */
    max_tokens: number;
    /** Maximum number of conversation turns. */
    max_turns: number;
  };
  /** IDs of agents that must complete before this one starts. */
  depends_on: string[];
}

/**
 * Payload for `agent:progress` — periodic progress report from a running agent.
 */
export interface AgentProgressPayload {
  /** Identifier of the reporting agent. */
  agent_id: string;
  /** Cumulative token usage so far. */
  tokens_used: {
    /** Input tokens consumed. */
    input: number;
    /** Output tokens generated. */
    output: number;
    /** Cache hit tokens. */
    cache: number;
  };
  /** Estimated cost in USD at the time of this progress report. */
  cost_usd: number;
  /** Total number of tool calls made so far. */
  tools_called: number;
  /** List of file paths modified during this agent's execution. */
  files_modified: string[];
}

/**
 * Payload for `trigger:fired` — describes a trigger that has activated.
 */
export interface TriggerFiredPayload {
  /** Identifier of the trigger definition. */
  trigger_id: string;
  /** Human-readable name of the trigger. */
  trigger_name: string;
  /** The condition expression that evaluated to true. */
  condition: string;
  /** ID of the event that caused this trigger to fire. */
  matched_event_id: string;
  /** The action expression that will be / was executed. */
  action: string;
}

/**
 * Payload for `file:*` events — describes a file system change.
 */
export interface FileModifiedPayload {
  /** Absolute or project-relative path of the affected file. */
  path: string;
  /** ID of the agent that made the change, if known. */
  agent_id?: string;
  /** Type of change: file was created, modified, or deleted. */
  change_type: 'create' | 'modify' | 'delete';
  /** File size in bytes after the change, if known. */
  size_bytes?: number;
}

/**
 * Payload for `build:succeeded` and `build:failed` events.
 */
export interface BuildResultPayload {
  /** The build command that was executed. */
  command: string;
  /** Process exit code. */
  exit_code: number;
  /** Wall-clock duration in milliseconds. */
  duration_ms: number;
  /** List of error messages from the build output. */
  errors: string[];
  /** List of warning messages from the build output. */
  warnings: string[];
}

/**
 * Payload for `test:passed` and `test:failed` events.
 */
export interface TestResultPayload {
  /** The test command that was executed. */
  command: string;
  /** Number of passing tests. */
  passed: number;
  /** Number of failing tests. */
  failed: number;
  /** Number of skipped tests. */
  skipped: number;
  /** Wall-clock duration in milliseconds. */
  duration_ms: number;
  /** Details of each failing test case. */
  failures: Array<{
    /** Test name or description. */
    test: string;
    /** Error message or stack trace. */
    error: string;
  }>;
}

/**
 * Payload for `devserver:*` events — dev server process information.
 */
export interface DevServerPayload {
  /** OS process ID of the dev server. */
  pid: number;
  /** Port the server is (or was) listening on. */
  port: number;
  /** The command used to start the dev server. */
  command: string;
  /** URL the server is reachable at, if available. */
  url?: string;
  /** Error message if the event represents a failure. */
  error?: string;
}

/**
 * Payload for `engine:*` events — inter-engine communication.
 */
export interface EngineEventPayload {
  /** Name of the remote engine (e.g. 'precision-engine'). */
  engine_name: string;
  /** Tool name involved in the request/response, if applicable. */
  tool_name?: string;
  /** Correlation identifier for matching requests to responses. */
  request_id?: string;
  /** Round-trip duration in milliseconds, if applicable. */
  duration_ms?: number;
}

/**
 * Payload for `system:error` — an internal engine error.
 */
export interface SystemErrorPayload {
  /** Error message. */
  error: string;
  /** Stack trace, if available. */
  stack?: string;
  /** Component that raised the error (e.g. 'EventBus', 'RuntimeEngine'). */
  component: string;
  /** Error severity level. */
  severity: 'warning' | 'error' | 'fatal';
}

// ─── EventPayload Discriminated Union ────────────────────────────────────────

/**
 * Discriminated union mapping every EventType to its strongly-typed payload.
 *
 * Narrow on `payload.type` to access the specific `data` shape:
 * ```ts
 * if (event.payload.type === 'agent:spawned') {
 *   const { agent_id } = event.payload.data; // AgentSpawnedPayload
 * }
 * ```
 *
 * Event types without dedicated payload interfaces carry
 * `Record<string, unknown>` as a flexible generic payload.
 */
export type EventPayload =
  | { type: 'session:started'; data: SessionStartedPayload }
  | { type: 'hook:pre_tool_use'; data: HookEventPayload }
  | { type: 'hook:post_tool_use'; data: HookEventPayload }
  | { type: 'hook:post_tool_use_failure'; data: HookEventPayload }
  | { type: 'hook:session_start'; data: HookEventPayload }
  | { type: 'hook:session_end'; data: HookEventPayload }
  | { type: 'hook:subagent_start'; data: HookEventPayload }
  | { type: 'hook:subagent_stop'; data: HookEventPayload }
  | { type: 'hook:pre_compact'; data: HookEventPayload }
  | { type: 'hook:stop'; data: HookEventPayload }
  | { type: 'hook:notification'; data: HookEventPayload }
  | { type: 'hook:user_prompt_submit'; data: HookEventPayload }
  | { type: 'workflow:state_changed'; data: WorkflowStateChangedPayload }
  | { type: 'agent:spawned'; data: AgentSpawnedPayload }
  | { type: 'agent:progress'; data: AgentProgressPayload }
  | { type: 'trigger:fired'; data: TriggerFiredPayload }
  | { type: 'trigger:condition_met'; data: TriggerFiredPayload }
  | { type: 'trigger:action_executed'; data: TriggerFiredPayload }
  | { type: 'trigger:action_failed'; data: TriggerFiredPayload }
  | { type: 'file:created'; data: FileModifiedPayload }
  | { type: 'file:modified'; data: FileModifiedPayload }
  | { type: 'file:deleted'; data: FileModifiedPayload }
  | { type: 'file:locked'; data: FileModifiedPayload }
  | { type: 'file:unlocked'; data: FileModifiedPayload }
  | { type: 'build:started'; data: Record<string, unknown> }
  | { type: 'build:succeeded'; data: BuildResultPayload }
  | { type: 'build:failed'; data: BuildResultPayload }
  | { type: 'test:started'; data: Record<string, unknown> }
  | { type: 'test:passed'; data: TestResultPayload }
  | { type: 'test:failed'; data: TestResultPayload }
  | { type: 'devserver:started'; data: DevServerPayload }
  | { type: 'devserver:stopped'; data: DevServerPayload }
  | { type: 'devserver:error'; data: DevServerPayload }
  | { type: 'devserver:ready'; data: DevServerPayload }
  | { type: 'engine:connected'; data: EngineEventPayload }
  | { type: 'engine:disconnected'; data: EngineEventPayload }
  | { type: 'engine:request'; data: EngineEventPayload }
  | { type: 'engine:response'; data: EngineEventPayload }
  | { type: 'system:error'; data: SystemErrorPayload }
  // Session lifecycle events without dedicated payloads
  | { type: 'session:ending' | 'session:ended' | 'session:compact'; data: Record<string, unknown> }
  // Workflow events without dedicated payloads
  | { type: 'workflow:created' | 'workflow:completed' | 'workflow:failed' | 'workflow:cancelled'; data: Record<string, unknown> }
  // WRFC events
  | { type: 'wrfc:gathering_started' | 'wrfc:plan_submitted' | 'wrfc:writing_started' | 'wrfc:review_started' | 'wrfc:review_completed' | 'wrfc:fix_started' | 'wrfc:fix_completed' | 'wrfc:escalated' | 'wrfc:completed'; data: Record<string, unknown> }
  // Fix loop events
  | { type: 'fix:diagnosing' | 'fix:applying' | 'fix:verifying' | 'fix:resolved' | 'fix:retrying' | 'fix:failed'; data: Record<string, unknown> }
  // Test-then-fix events
  | { type: 'test_fix:testing_started' | 'test_fix:tests_passed' | 'test_fix:tests_failed' | 'test_fix:fix_started' | 'test_fix:fix_completed' | 'test_fix:retesting_started' | 'test_fix:completed' | 'test_fix:escalated'; data: Record<string, unknown> }
  // Review-only events
  | { type: 'review_only:review_started' | 'review_only:review_completed' | 'review_only:completed'; data: Record<string, unknown> }
  // Generic trigger events
  | { type: 'review:requested'; data: Record<string, unknown> }
  // Agent events without dedicated payloads
  | { type: 'agent:started' | 'agent:completed' | 'agent:failed' | 'agent:cancelled' | 'agent:budget_warning' | 'agent:budget_exhausted' | 'agent:dependency_resolved'; data: Record<string, unknown> }
  // WRFC phase change event
  | { type: 'workflow:phase_changed'; data: Record<string, unknown> }
  // WRFC review parse failed event
  | { type: 'wrfc:review_parse_failed'; data: Record<string, unknown> }
  // System events without dedicated payloads
  | { type: 'system:startup' | 'system:shutdown' | 'system:health_check' | 'system:gc'; data: Record<string, unknown> }
  // Executor events with inline typed payloads
  | { type: 'executor:mode_set'; data: { mode: 'engaged' | 'daemon' | 'hybrid'; previous_mode?: 'engaged' | 'daemon' | 'hybrid'; detection_method: 'explicit' | 'inferred' | 'default' } }
  | { type: 'executor:tick_received'; data: { tick_number: number; pending_events: number } }
  | { type: 'executor:tick_completed'; data: { tick_number: number; events_processed: number; duration_ms: number } }
  | { type: 'executor:context_clearing'; data: { method: 'tmux' | 'queue_injection'; success: boolean } }
  | { type: 'executor:budget_warning'; data: { cap_type: 'flat' | 'daily'; spent_usd: number; cap_usd: number; threshold: number } }
  // Core internal events
  | { type: 'core:handler_error'; data: { trigger_id: string; error_message: string; original_event_id: string; original_event_type: string } }
  | { type: 'core:chain_depth_exceeded'; data: { original_event_id: string; original_event_type: string; depth: number; max_depth: number } }
  | { type: 'core:queue_depth_warning'; data: { depth: number; threshold: number } }
  | { type: 'executor:budget_exceeded'; data: { cap_type: 'flat' | 'daily'; spent_usd: number; cap_usd: number } }
  | { type: 'executor:budget_reset'; data: { previous_daily_spent: number; reset_hour: number } }
  | { type: 'executor:paused' | 'executor:resumed'; data: { reason: string } };

// ─── Unified RuntimeEvent Interface ──────────────────────────────────────────

/**
 * The canonical runtime event structure — single source of truth.
 *
 * Merges the best of L1 (core/types.ts) and L2 (extensions/events/types.ts):
 * - `id`:        UUID string (both had this)
 * - `source`:    Discriminated union (L2 — enables structural narrowing)
 * - `type`:      Typed literal union (L2 — ~90 string literals)
 * - `payload`:   Typed discriminated union (L2 — typed per event type)
 * - `timestamp`: Epoch ms number (L1 — better for math than ISO string)
 * - `priority`:  Number (L1 — missing from L2; 0 = normal, higher = more urgent)
 * - `context`:   Causal/routing context (L1 — missing from L2)
 * - `metadata`:  Session/correlation/sequence (L2 — missing from L1)
 *
 * @example
 * ```ts
 * const event = createEvent({
 *   source: { kind: 'hook', hook_name: 'pre_tool_use' },
 *   type: 'hook:pre_tool_use',
 *   payload: { type: 'hook:pre_tool_use', data: { hook_name: 'pre_tool_use', duration_ms: 0 } },
 *   metadata: { session_id: 'sess_123', sequence: 1, version: 1 },
 * });
 * ```
 */
export interface RuntimeEvent {
  /** Globally unique event identifier (UUID). */
  id: string;
  /** Subsystem that produced this event. */
  source: EventSource;
  /** Namespaced event type string. */
  type: EventType;
  /** Typed payload; narrow on `payload.type` to get the specific data shape. */
  payload: EventPayload;
  /** Unix epoch milliseconds. Use Date.now() for arithmetic comparisons. */
  timestamp: number;
  /** Processing priority. Higher numbers processed first. Default: 0. */
  priority: number;
  /** Optional causal and routing context. Populated for chained events. */
  context?: EventContext;
  /** Cross-cutting metadata assigned by the EventBus. */
  metadata: EventMetadata;
}

// ─── Factory Helper ───────────────────────────────────────────────────────────

/**
 * Partial EventMetadata for factory use — session_id and sequence are
 * required for a complete EventMetadata, but the factory sets version
 * automatically.
 */
type EventMetadataInput = Omit<EventMetadata, 'version'> & { version?: 1 };

/**
 * Creates a RuntimeEvent with sensible defaults.
 *
 * Required fields: `source`, `type`, `payload`, `metadata` (session_id + sequence).
 * Defaults: `id` = new UUID, `timestamp` = Date.now(), `priority` = 0,
 *           `context` = undefined, `metadata.version` = 1.
 *
 * @example
 * ```ts
 * const event = createEvent({
 *   source: { kind: 'system' },
 *   type: 'system:startup',
 *   payload: { type: 'system:startup', data: {} },
 *   metadata: { session_id: 'sess_abc', sequence: 1 },
 * });
 * ```
 */
export function createEvent(
  overrides: Pick<RuntimeEvent, 'source' | 'type' | 'payload'> & {
    metadata?: Partial<EventMetadataInput>;
  } & Partial<Omit<RuntimeEvent, 'source' | 'type' | 'payload' | 'metadata'>>,
): RuntimeEvent {
  return {
    id: generateEventId(),
    timestamp: Date.now(),
    priority: 0,
    ...overrides,
    metadata: {
      version: 1,
      session_id: '',
      sequence: 0,
      ...overrides.metadata,
    },
  };
}

// ─── EventBus Support Types ───────────────────────────────────────────────────

/**
 * A glob-style pattern for subscribing to events:
 * - `'*'` — matches every event type
 * - `'hook:*'` — matches all hook events (namespace wildcard)
 * - `'agent:spawned'` — exact match
 */
export type EventTypePattern = EventType | `${string}:*` | '*';

/**
 * Callback invoked when a matching event is emitted.
 * May return a Promise; async handlers are fire-and-forget.
 */
export type EventHandler = (event: RuntimeEvent) => void | Promise<void>;

/**
 * Function returned by `EventBus.on` and `EventBus.once`.
 * Calling it removes the subscription.
 */
export type Unsubscribe = () => void;

/**
 * Filter criteria for querying event history.
 */
export interface EventFilter {
  /** Restrict results to these event types. */
  types?: EventType[];
  /** Restrict results by event source kind. */
  source?: { kind: EventSource['kind'] };
  /**
   * Include only events at or after this timestamp (epoch ms).
   * @migration Changed from L2's ISO 8601 string to epoch ms number for arithmetic compatibility.
   */
  since?: number;
  /**
   * Include only events at or before this timestamp (epoch ms).
   * @migration Changed from L2's ISO 8601 string to epoch ms number for arithmetic compatibility.
   */
  until?: number;
  /** Include only events with this correlation ID. */
  correlation_id?: string;
  /** Maximum number of events to return. */
  limit?: number;
  /**
   * Include only events with a sequence number greater than this value.
   * Enables efficient stream filtering without re-reading all events.
   */
  since_sequence?: number;
}
