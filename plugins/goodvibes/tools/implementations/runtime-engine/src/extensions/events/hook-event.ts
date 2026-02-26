/**
 * HookEvent — Layer 2 Extension
 *
 * Extends RuntimeEvent for events sourced from Claude Code hook callbacks.
 * Source is always 'internal' for hook-originated events.
 */

import { RuntimeEvent, EventContext, createEvent } from '../../core/types.js';

// ─── Hook Type ────────────────────────────────────────────────────────────────

/**
 * All hook types that Claude Code can invoke.
 */
export type HookType =
  | 'PreToolUse'
  | 'PostToolUse'
  | 'PostToolUseFailure'
  | 'SubagentStart'
  | 'SubagentStop'
  | 'SessionStart'
  | 'SessionEnd'
  | 'PreCompact'
  | 'UserPromptSubmit'
  | 'Notification'
  | 'Stop';

// ─── HookEvent Interface ──────────────────────────────────────────────────────

/**
 * A runtime event sourced from a Claude Code hook callback.
 * Always carries the hook type, its raw input, and the originating session.
 */
export interface HookEvent extends RuntimeEvent {
  /** Hook events always originate from the internal (Claude Code) source. */
  source: 'internal';
  /** The hook lifecycle point that produced this event. */
  hook_type: HookType;
  /** Raw input data passed to the hook by Claude Code. */
  hook_input: Record<string, unknown>;
  /** Session ID of the Claude Code session that fired the hook. */
  session_id: string;
}

// ─── Type Guard ───────────────────────────────────────────────────────────────

/**
 * Narrows a RuntimeEvent to HookEvent.
 */
export function isHookEvent(event: RuntimeEvent): event is HookEvent {
  return (
    event.source === 'internal' &&
    'hook_type' in event &&
    'hook_input' in event
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Exhaustive lookup map from HookType to its snake_case slug.
 * The `satisfies` check ensures all HookType members are covered at compile time.
 */
const hookTypeSlugMap = {
  PreToolUse: 'pre_tool_use',
  PostToolUse: 'post_tool_use',
  PostToolUseFailure: 'post_tool_use_failure',
  SubagentStart: 'subagent_start',
  SubagentStop: 'subagent_stop',
  SessionStart: 'session_start',
  SessionEnd: 'session_end',
  PreCompact: 'pre_compact',
  UserPromptSubmit: 'user_prompt_submit',
  Notification: 'notification',
  Stop: 'stop',
} satisfies Record<HookType, string>;

/**
 * Returns the snake_case slug for a given HookType.
 * Example: 'PreToolUse' → 'pre_tool_use', 'SubagentStop' → 'subagent_stop'
 */
function hookTypeToSlug(hookType: HookType): string {
  return hookTypeSlugMap[hookType];
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Creates a HookEvent with sensible defaults.
 * The event `type` defaults to `hook:<snake_case_hook_type>` (e.g. `hook:pre_tool_use`).
 */
export function createHookEvent(params: {
  hook_type: HookType;
  hook_input: Record<string, unknown>;
  session_id: string;
  /**
   * Defaults to `hook:${hook_type_as_snake_case}`. Intentionally loose string
   * to allow Layer 3 extensions to supply custom type identifiers.
   */
  type?: string;
  payload?: unknown;
  priority?: number;
  context?: EventContext;
}): HookEvent {
  const base = createEvent({
    source: 'internal',
    type: params.type ?? `hook:${hookTypeToSlug(params.hook_type)}`,
    payload: params.payload ?? params.hook_input,
    priority: params.priority ?? 50,
    context: params.context,
  });
  return {
    ...base,
    source: 'internal',
    hook_type: params.hook_type,
    hook_input: params.hook_input,
    session_id: params.session_id,
  };
}
