/**
 * Event Factories — Layer 2 Extensions
 *
 * Consolidated factory functions for all source-specific RuntimeEvent subtypes:
 * HookEvent, AgentEvent, ExternalEvent, HumanEvent, TimeEvent.
 *
 * Each factory creates a typed event with sensible defaults.
 */

import { RuntimeEvent, EventContext, createEvent } from '../../core/types.js';

// ─────────────────────────────────────────────────────────────────────────────
// HookEvent
// ─────────────────────────────────────────────────────────────────────────────

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

/**
 * Narrows a RuntimeEvent to HookEvent.
 */
function isHookEvent(event: RuntimeEvent): event is HookEvent {
  return (
    event.source === 'internal' &&
    'hook_type' in event &&
    'hook_input' in event
  );
}

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

// ─────────────────────────────────────────────────────────────────────────────
// AgentEvent
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A runtime event sourced from an agent lifecycle transition.
 */
interface AgentEvent extends RuntimeEvent {
  /** Agent events always originate from the agent source. */
  source: 'agent';
  /** Unique identifier for the agent instance that produced this event. */
  agent_id: string;
  /** Agent role/type descriptor (e.g. 'goodvibes:engineer', 'goodvibes:reviewer'). */
  agent_type: string;
  /** Agent output or return value, if applicable. */
  result?: unknown;
  /**
   * Review score emitted by the agent, if applicable.
   * @range 0-10
   */
  score?: number;
  /** File paths or identifiers produced as output artifacts. */
  artifacts?: string[];
}

/**
 * Narrows a RuntimeEvent to AgentEvent.
 */
function isAgentEvent(event: RuntimeEvent): event is AgentEvent {
  return event.source === 'agent' && 'agent_id' in event && 'agent_type' in event;
}

/**
 * Creates an AgentEvent with sensible defaults.
 * Priority defaults to 60 (agent events are above-average priority).
 */
function createAgentEvent(params: {
  agent_id: string;
  agent_type: string;
  /** e.g. 'agent:completed', 'agent:blocked', 'agent:spawned' */
  type: string;
  result?: unknown;
  score?: number;
  artifacts?: string[];
  payload?: unknown;
  /** Default 60 — agent events are above-average priority. */
  priority?: number;
  context?: EventContext;
}): AgentEvent {
  const base = createEvent({
    source: 'agent',
    type: params.type,
    payload: params.payload ?? { agent_id: params.agent_id, agent_type: params.agent_type },
    priority: params.priority ?? 60,
    context: params.context,
  });
  return {
    ...base,
    source: 'agent',
    agent_id: params.agent_id,
    agent_type: params.agent_type,
    ...(params.result !== undefined && { result: params.result }),
    ...(params.score !== undefined && { score: params.score }),
    ...(params.artifacts !== undefined && { artifacts: params.artifacts }),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ExternalEvent
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A runtime event sourced from an external system via webhook or integration.
 */
export interface ExternalEvent extends RuntimeEvent {
  /** External events always originate from the external source. */
  source: 'external';
  /** Identifier for the originating external system (e.g. 'github', 'slack', 'ci', 'stripe'). */
  external_source: string;
  /** The original, unmodified webhook payload. */
  raw_payload: unknown;
  /** Whether the payload was normalized by an adapter into a canonical shape. */
  normalized: boolean;
}

/**
 * Narrows a RuntimeEvent to ExternalEvent.
 */
function isExternalEvent(event: RuntimeEvent): event is ExternalEvent {
  return (
    event.source === 'external' &&
    'external_source' in event &&
    'raw_payload' in event
  );
}

/**
 * Creates an ExternalEvent with sensible defaults.
 * Priority defaults to 30 — external events are lower priority than internal/agent events.
 */
export function createExternalEvent(params: {
  external_source: string;
  /** e.g. 'webhook:github:pr_opened', 'webhook:stripe:payment_succeeded' */
  type: string;
  raw_payload: unknown;
  /** Whether the payload was normalized by an adapter. Default false. */
  normalized?: boolean;
  /** Normalized/canonical payload for matching, if different from raw_payload. */
  payload?: unknown;
  /** Default 30 — external events are lower priority. */
  priority?: number;
  context?: EventContext;
}): ExternalEvent {
  const base = createEvent({
    source: 'external',
    type: params.type,
    payload: params.payload ?? params.raw_payload,
    priority: params.priority ?? 30,
    context: params.context,
  });
  return {
    ...base,
    source: 'external',
    external_source: params.external_source,
    raw_payload: params.raw_payload,
    normalized: params.normalized ?? false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HumanEvent
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A runtime event sourced from a human interaction.
 */
interface HumanEvent extends RuntimeEvent {
  /** Human events always originate from the human source. */
  source: 'human';
  /** Raw user prompt text, if applicable. */
  prompt?: string;
  /** Slash command issued by the user (e.g. '/stop', '/pause'), if applicable. */
  command?: string;
  /** Approval decision for approval/rejection flows. */
  approval?: boolean;
}

/**
 * Narrows a RuntimeEvent to HumanEvent.
 * Only checks source discriminant since all extension fields (prompt, command, approval) are optional.
 * Any event with source 'human' is a valid HumanEvent by definition.
 */
function isHumanEvent(event: RuntimeEvent): event is HumanEvent {
  return event.source === 'human';
}

/**
 * Creates a HumanEvent with sensible defaults.
 * Priority defaults to 100 — human events are the highest priority.
 */
function createHumanEvent(params: {
  /** e.g. 'human:prompt', 'human:stop', 'human:approval' */
  type: string;
  prompt?: string;
  command?: string;
  approval?: boolean;
  payload?: unknown;
  /** Default 100 — human events are highest priority. */
  priority?: number;
  context?: EventContext;
}): HumanEvent {
  const base = createEvent({
    source: 'human',
    type: params.type,
    payload: params.payload ?? {},
    priority: params.priority ?? 100,
    context: params.context,
  });
  return {
    ...base,
    source: 'human',
    ...(params.prompt !== undefined && { prompt: params.prompt }),
    ...(params.command !== undefined && { command: params.command }),
    ...(params.approval !== undefined && { approval: params.approval }),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TimeEvent
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Discriminant for the category of time-based event.
 */
type TimeType = 'heartbeat' | 'cron' | 'scheduled' | 'one_shot';

/**
 * A runtime event sourced from the time subsystem.
 */
export interface TimeEvent extends RuntimeEvent {
  /** Time events always originate from the time source. */
  source: 'time';
  /** Category of this time event. */
  time_type: TimeType;
  /** Interval in milliseconds (heartbeat events). */
  interval_ms?: number;
  /** Cron expression defining the schedule (cron events). */
  schedule?: string;
  /** Maximum number of times this event series may fire before expiry. */
  ttl?: number;
  /** Fires remaining before expiry (decremented on each fire). */
  fires_remaining?: number;
  /** Unix epoch ms when the event was originally scheduled. */
  scheduled_at?: number;
}

/**
 * Narrows a RuntimeEvent to TimeEvent.
 */
function isTimeEvent(event: RuntimeEvent): event is TimeEvent {
  return event.source === 'time' && 'time_type' in event;
}

/**
 * Derives a default event type string from a TimeType.
 */
function defaultTimeEventType(timeType: TimeType): string {
  switch (timeType) {
    case 'heartbeat': return 'tick:heartbeat';
    case 'cron':      return 'cron:tick';
    case 'scheduled': return 'schedule:tick';
    case 'one_shot':  return 'schedule:one_shot';
  }
}

/**
 * Creates a TimeEvent with sensible defaults.
 * Priority defaults to 10 (time events are low priority).
 */
export function createTimeEvent(params: {
  time_type: TimeType;
  /**
   * Defaults to the category-specific type: `tick:heartbeat`, `cron:tick`,
   * `schedule:tick`, or `schedule:one_shot`. Intentionally loose string
   * to allow Layer 3 extensions to supply custom type identifiers.
   */
  type?: string;
  interval_ms?: number;
  schedule?: string;
  ttl?: number;
  fires_remaining?: number;
  scheduled_at?: number;
  payload?: unknown;
  /** Default 10 — time events are low priority. */
  priority?: number;
  context?: EventContext;
}): TimeEvent {
  const base = createEvent({
    source: 'time',
    type: params.type ?? defaultTimeEventType(params.time_type),
    payload: params.payload ?? {},
    priority: params.priority ?? 10,
    context: params.context,
  });
  return {
    ...base,
    source: 'time',
    time_type: params.time_type,
    ...(params.interval_ms !== undefined && { interval_ms: params.interval_ms }),
    ...(params.schedule !== undefined && { schedule: params.schedule }),
    ...(params.ttl !== undefined && { ttl: params.ttl }),
    ...(params.fires_remaining !== undefined && { fires_remaining: params.fires_remaining }),
    ...(params.scheduled_at !== undefined && { scheduled_at: params.scheduled_at }),
  };
}
