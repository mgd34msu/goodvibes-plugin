/**
 * HumanEvent — Layer 2 Extension
 *
 * Extends RuntimeEvent for events sourced from human interactions:
 * user prompts, slash commands, and approval/rejection decisions.
 */

import { RuntimeEvent, EventContext, createEvent } from '../../core/types.js';

// ─── HumanEvent Interface ─────────────────────────────────────────────────────

/**
 * A runtime event sourced from a human interaction.
 */
export interface HumanEvent extends RuntimeEvent {
  /** Human events always originate from the human source. */
  source: 'human';
  /** Raw user prompt text, if applicable. */
  prompt?: string;
  /** Slash command issued by the user (e.g. '/stop', '/pause'), if applicable. */
  command?: string;
  /** Approval decision for approval/rejection flows. */
  approval?: boolean;
}

// ─── Type Guard ───────────────────────────────────────────────────────────────

/**
 * Narrows a RuntimeEvent to HumanEvent.
 * Only checks source discriminant since all extension fields (prompt, command, approval) are optional.
 * Any event with source 'human' is a valid HumanEvent by definition.
 */
export function isHumanEvent(event: RuntimeEvent): event is HumanEvent {
  return event.source === 'human';
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Creates a HumanEvent with sensible defaults.
 * Priority defaults to 100 — human events are the highest priority.
 */
export function createHumanEvent(params: {
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
    source: 'human' as const,
    ...(params.prompt !== undefined && { prompt: params.prompt }),
    ...(params.command !== undefined && { command: params.command }),
    ...(params.approval !== undefined && { approval: params.approval }),
  };
}
