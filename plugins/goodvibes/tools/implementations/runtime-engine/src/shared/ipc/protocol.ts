/**
 * IPC Protocol Types
 *
 * Defines all message and response types for the Unix domain socket IPC
 * channel between hook scripts (short-lived) and the runtime engine
 * (long-lived). Every type is a discriminated union for safe narrowing.
 *
 * Transport convention: newline-delimited JSON — one serialised message per
 * line, terminated with '\n'.
 */

// ─── Message Validation ──────────────────────────────────────────────────────

/** Valid IPC message type discriminants. */
const VALID_IPC_MESSAGE_TYPES = new Set<string>([
  'hook_event',
  'query',
  'state_update',
  'heartbeat',
]);

/**
 * Runtime type guard for IPCMessage.
 *
 * Validates that an unknown value conforms to the IPCMessage discriminated
 * union. Checks the shared envelope fields (type, id) and the type-specific
 * required fields for each message kind.
 *
 * Design: Uses manual property checks rather than a schema library (e.g. Zod)
 * to keep this module zero-dependency and low-overhead. The IPC hot path
 * processes every hook call, so the marginal cost of schema parsing is
 * avoided. The Set-based type discriminant guard rejects unknown types before
 * the switch, making the `default` branch a safety net for future additions.
 *
 * @param obj - Value to validate.
 * @returns `true` if `obj` is a well-formed IPCMessage.
 */
export function validateIPCMessage(obj: unknown): obj is IPCMessage {
  if (typeof obj !== 'object' || obj === null) return false;

  const msg = obj as Record<string, unknown>;

  if (typeof msg['type'] !== 'string' || !VALID_IPC_MESSAGE_TYPES.has(msg['type'])) return false;
  if (typeof msg['id'] !== 'string' || msg['id'].length === 0) return false;

  switch (msg['type']) {
    case 'hook_event':
      return (
        typeof msg['hook_name'] === 'string' &&
        msg['hook_name'].length > 0 &&
        typeof msg['hook_input'] === 'object' &&
        msg['hook_input'] !== null &&
        !Array.isArray(msg['hook_input']) &&
        typeof msg['timestamp'] === 'string'
      );
    case 'query':
      return (
        typeof msg['query'] === 'object' &&
        msg['query'] !== null &&
        !Array.isArray(msg['query']) &&
        typeof (msg['query'] as Record<string, unknown>)['kind'] === 'string'
      );
    case 'state_update':
      return typeof msg['updates'] === 'object' && msg['updates'] !== null && !Array.isArray(msg['updates']);
    case 'heartbeat':
      return true;
    default:
      // Unrecognised type discriminant — log a warning so operators can catch
      // mismatches between hook-script and engine versions at runtime.
      // eslint-disable-next-line no-console
      console.warn(
        '[ipc-protocol] validateIPCMessage: unrecognised message type:',
        typeof msg['type'] === 'string' ? msg['type'] : typeof msg['type'],
      );
      return false;
  }
}

// ─── Messages: Hook → Runtime Engine ─────────────────────────────────────────

/**
 * Sent by a hook script when it fires, carrying the full hook input received
 * from Claude Code. The runtime engine processes the event and responds with
 * any directives the hook should apply.
 */
export interface HookEventMessage {
  /** Discriminant — always 'hook_event'. */
  type: 'hook_event';
  /** Unique message ID used to correlate the response. */
  id: string;
  /** Name of the hook that fired (e.g. 'pre_tool_use'). */
  hook_name: string;
  /** The full hook input payload received from Claude Code. */
  hook_input: Record<string, unknown>;
  /** ISO-8601 timestamp of when the hook fired. */
  timestamp: string;
}

/**
 * Sent by a hook or client to query the runtime engine for state or decisions.
 * The `query` field is a discriminated union — each kind maps to a specific
 * response data shape.
 */
export interface QueryMessage {
  /** Discriminant — always 'query'. */
  type: 'query';
  /** Unique message ID used to correlate the response. */
  id: string;
  /** The query to execute. */
  query: IPCQuery;
}

/**
 * Sent by a hook to push state updates into the runtime engine.
 * Used for lightweight synchronisation without a full hook event.
 */
export interface StateUpdateMessage {
  /** Discriminant — always 'state_update'. */
  type: 'state_update';
  /** Unique message ID used to correlate the response. */
  id: string;
  /** Key/value pairs to merge into the runtime engine's hook state. */
  updates: Record<string, unknown>;
}

/**
 * Sent periodically by long-running hook processes to confirm the connection
 * is alive. The runtime engine responds with an 'ack' response data.
 */
export interface HeartbeatMessage {
  /** Discriminant — always 'heartbeat'. */
  type: 'heartbeat';
  /** Unique message ID used to correlate the response. */
  id: string;
}

/**
 * Discriminated union of all messages a hook or client may send to the
 * runtime engine over the IPC channel.
 */
export type IPCMessage =
  | HookEventMessage
  | QueryMessage
  | StateUpdateMessage
  | HeartbeatMessage;

// ─── Query Kinds ──────────────────────────────────────────────────────────────

/**
 * Discriminated union of all supported query kinds.
 *
 * - `get_system_message`    — Retrieve any system message to inject into the conversation.
 * - `get_directives`        — Retrieve active directives for the current hook.
 * - `get_workflow_state`    — Retrieve the current state of a workflow instance.
 * - `get_agent_status`      — Retrieve the current status of an agent instance.
 * - `should_block_tool`     — Ask whether a tool call should be allowed or blocked.
 * - `get_context_injection` — Retrieve context to inject into the next turn.
 * - `resolve_pending_bind`  — Resolve a pending agent-type → workflow-id bind from the queue.
 */
export type IPCQuery =
  | { kind: 'get_system_message' }
  | { kind: 'get_directives' }
  | { kind: 'get_workflow_state'; workflow_id: string }
  | { kind: 'get_agent_status'; agent_id: string }
  | { kind: 'should_block_tool'; tool_name: string; tool_input: Record<string, unknown> }
  | { kind: 'get_context_injection' }
  | { kind: 'resolve_pending_bind'; agent_type: string }
  | { kind: 'get_executor_mode' }
  | { kind: 'get_executor_budget' }
  | { kind: 'process_tick' };

// ─── Responses: Runtime Engine → Hook ────────────────────────────────────────

/**
 * Envelope returned by the runtime engine for every IPC message.
 * The `id` field correlates the response to the original message.
 */
export interface IPCResponse {
  /** Message ID copied from the original request. */
  id: string;
  /** 'ok' when the request was handled, 'error' on failure. */
  status: 'ok' | 'error';
  /** Typed response payload; present when `status === 'ok'`. */
  data?: IPCResponseData;
  /** Human-readable error message; present when `status === 'error'`. */
  error?: string;
}

/**
 * Discriminated union of all response data shapes.
 *
 * - `system_message`    — A message to inject as the Claude system prompt.
 * - `workflow_state`    — Serialised workflow instance state.
 * - `agent_status`      — Serialised agent record.
 * - `tool_decision`     — Allow/block/modify decision for a tool call.
 * - `context_injection` — Context text and priority for next-turn injection.
 * - `ack`               — Generic acknowledgement (for events, heartbeats, state updates).
 */
export type IPCResponseData =
  | { kind: 'system_message'; message: string; directives: Directive[] }
  | { kind: 'workflow_state'; instance: Record<string, unknown> }
  | { kind: 'agent_status'; agent: Record<string, unknown> }
  | { kind: 'tool_decision'; allow: boolean; reason?: string; modified_input?: Record<string, unknown> }
  | { kind: 'context_injection'; context: string; priority: number }
  | { kind: 'ack' }
  | { kind: 'pending_bind'; workflow_id: string | null }
  | { kind: 'executor_mode'; mode: string }
  | { kind: 'executor_budget'; spending: Record<string, unknown> | null; can_process: boolean }
  | { kind: 'tick_result'; result: Record<string, unknown> | undefined };

// ─── Directive ────────────────────────────────────────────────────────────────

/**
 * An instruction the runtime engine sends back to a hook script.
 * Directives are ordered by `priority` (higher = more important).
 */
export interface Directive {
  /**
   * The type of action the hook should take:
   * - `inject_system_message` — prepend `content` to the system prompt.
   * - `block_tool`            — prevent the current tool call from executing.
   * - `modify_input`          — replace the tool's input with the modified version.
   * - `warn`                  — surface `content` as a warning to the user.
   * - `suggest`               — add `content` as a non-blocking suggestion.
   */
  type: 'inject_system_message' | 'block_tool' | 'modify_input' | 'warn' | 'suggest';
  /** The directive payload (message text, JSON string for modified input, etc.). */
  content: string;
  /** Priority — higher values take precedence when multiple directives conflict. */
  priority: number;
  /** Subsystem or rule that generated this directive (e.g. 'workflow-guard'). */
  source: string;
}
