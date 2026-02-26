/**
 * AgentEvent — Layer 2 Extension
 *
 * Extends RuntimeEvent for events sourced from agent completions and lifecycle
 * transitions (spawned, blocked, completed, failed).
 */

import { RuntimeEvent, EventContext, createEvent } from '../../core/types.js';

// ─── AgentEvent Interface ─────────────────────────────────────────────────────

/**
 * A runtime event sourced from an agent lifecycle transition.
 */
export interface AgentEvent extends RuntimeEvent {
  /** Agent events always originate from the agent source. */
  source: 'agent';
  /** Unique identifier for the agent instance that produced this event. */
  agent_id: string;
  /** Agent role/type descriptor (e.g. 'goodvibes:engineer', 'goodvibes:reviewer'). */
  agent_type: string;
  /** Agent output or return value, if applicable. */
  result?: unknown;
  /** Review score emitted by the agent (0–10), if applicable. */
  score?: number;
  /** File paths or identifiers produced as output artifacts. */
  artifacts?: string[];
}

// ─── Type Guard ───────────────────────────────────────────────────────────────

/**
 * Narrows a RuntimeEvent to AgentEvent.
 */
export function isAgentEvent(event: RuntimeEvent): event is AgentEvent {
  return event.source === 'agent' && 'agent_id' in event && 'agent_type' in event;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Creates an AgentEvent with sensible defaults.
 * Priority defaults to 60 (agent events are above-average priority).
 */
export function createAgentEvent(params: {
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
    source: 'agent' as const,
    agent_id: params.agent_id,
    agent_type: params.agent_type,
    ...(params.result !== undefined && { result: params.result }),
    ...(params.score !== undefined && { score: params.score }),
    ...(params.artifacts !== undefined && { artifacts: params.artifacts }),
  };
}
