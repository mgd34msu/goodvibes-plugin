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
 * Converts a HookType (PascalCase) to a snake_case string segment.
 * Example: 'PreToolUse' → 'pre_tool_use', 'SubagentStop' → 'subagent_stop'
 */
function hookTypeToSlug(hookType: HookType): string {
  return hookType
    .replace(/([A-Z])/g, '_$1')
    .replace(/^_/, '')
    .toLowerCase();
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
  /** Defaults to `hook:${hook_type_as_snake_case}` */
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
    source: 'internal' as const,
    hook_type: params.hook_type,
    hook_input: params.hook_input,
    session_id: params.session_id,
  };
}
