/**
 * Runtime Event Type System
 *
 * Defines the complete catalog of events that flow through the runtime engine.
 * Every state change, hook invocation, agent action, workflow transition, and
 * system lifecycle step is represented as a typed RuntimeEvent.
 *
 * Design principles:
 * - All event types are string literals in the form `namespace:action`
 * - EventPayload is a discriminated union keyed on `type` + `data`
 * - EventSource is a discriminated union keyed on `kind`
 * - Every field has JSDoc
 */

// ─── Base Event ───────────────────────────────────────────────────────────────

/**
 * Metadata attached to every runtime event.
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

/**
 * Discriminated union describing which subsystem emitted an event.
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
  | { kind: 'ipc'; client_id: string };

/**
 * The complete catalog of event types supported by the runtime engine.
 *
 * Namespaced with `namespace:action` convention:
 * - `session:*`    — Claude session lifecycle
 * - `hook:*`       — Hook script invocations
 * - `workflow:*`   — Workflow state machine transitions
 * - `wrfc:*`       — Write-Review-Fix-Check loop phases
 * - `fix:*`        — Fix loop sub-phases
 * - `agent:*`      — Agent spawning and execution
 * - `trigger:*`    — Event trigger evaluations
 * - `file:*`       — File system changes
 * - `build:*`      — Build command results
 * - `test:*`       — Test run results
 * - `devserver:*`  — Dev server lifecycle
 * - `engine:*`     — Inter-engine communication
 * - `system:*`     — Internal engine health and lifecycle
 */
export type EventType =
  // ── Session lifecycle ───────────────────────────────────────────────────
  /** A new Claude session has started. */
  | 'session:started'
  /** The session is in the process of ending (pre-shutdown). */
  | 'session:ending'
  /** The session has fully ended. */
  | 'session:ended'
  /** A context-compaction cycle has run. */
  | 'session:compact'

  // ── Hook events ─────────────────────────────────────────────────────────
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

  // ── Workflow events ─────────────────────────────────────────────────────
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

  // ── WRFC-specific events ────────────────────────────────────────────────
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

  // ── Fix loop events ──────────────────────────────────────────────────────
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

  // ── Agent events ─────────────────────────────────────────────────────────
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
  /** A dependency of this agent has been resolved. */
  | 'agent:dependency_resolved'

  // ── Trigger events ───────────────────────────────────────────────────────
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

  // ── Build events ─────────────────────────────────────────────────────────
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

  // ── Dev server events ────────────────────────────────────────────────────
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
  | 'system:gc';

// ─── Payload Types ────────────────────────────────────────────────────────────

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
  /** Component that raised the error (e.g. 'EventBus', 'ProcessManager'). */
  component: string;
  /** Error severity level. */
  severity: 'warning' | 'error' | 'fatal';
}

// ─── EventPayload Discriminated Union ────────────────────────────────────────

/**
 * Discriminated union mapping every EventType to its strongly-typed payload.
 *
 * Consumers can narrow to a specific payload type by checking `payload.type`:
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
  // Agent events without dedicated payloads
  | { type: 'agent:started' | 'agent:completed' | 'agent:failed' | 'agent:budget_warning' | 'agent:budget_exhausted' | 'agent:dependency_resolved'; data: Record<string, unknown> }
  // Trigger events already covered above; build:started and test:started covered above
  // Dev server events without dedicated payloads (covered above)
  // Engine events already covered above
  // System events without dedicated payloads
  | { type: 'system:startup' | 'system:shutdown' | 'system:health_check' | 'system:gc'; data: Record<string, unknown> };

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
  /** Restrict results by event source (partial match). */
  source?: Partial<EventSource>;
  /** Include only events at or after this ISO 8601 timestamp. */
  since?: string;
  /** Include only events at or before this ISO 8601 timestamp. */
  until?: string;
  /** Include only events with this correlation ID. */
  correlation_id?: string;
  /** Maximum number of events to return. */
  limit?: number;
}

// ─── Core Event Interface ─────────────────────────────────────────────────────

/**
 * The canonical runtime event structure.
 *
 * Every event emitted through the EventBus carries this shape.
 * The `payload` field is a discriminated union — narrow on `payload.type`
 * to access the strongly-typed `data`.
 *
 * @example
 * ```ts
 * bus.on('agent:spawned', (event) => {
 *   if (event.payload.type === 'agent:spawned') {
 *     console.log(event.payload.data.agent_id);
 *   }
 * });
 * ```
 */
export interface RuntimeEvent {
  /** Unique event identifier in the form `evt_<uuid>`. */
  id: string;
  /** ISO 8601 timestamp of when the event was emitted. */
  timestamp: string;
  /** Subsystem that produced this event. */
  source: EventSource;
  /** Namespaced event type string. */
  type: EventType;
  /** Typed payload; narrow on `payload.type` to get the specific data shape. */
  payload: EventPayload;
  /** Cross-cutting metadata assigned by the EventBus. */
  metadata: EventMetadata;
}
