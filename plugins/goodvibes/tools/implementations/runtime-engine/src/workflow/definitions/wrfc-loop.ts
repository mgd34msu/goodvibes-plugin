/**
 * WRFC Loop Workflow Definition
 *
 * Formal state machine for the Write-Review-Fix-Check loop.
 * 8 states: IDLE → GATHERING → PLANNING → WRITING → REVIEWING → FIXING → ESCALATED / COMPLETE
 *
 * State flow:
 * - IDLE: entry point, transitions immediately on workflow:created
 * - GATHERING: context collection phase; emits wrfc:gathering_started on enter
 * - PLANNING: no external actions; transitions when writing starts
 * - WRITING: implementation phase; transitions when review is ready
 * - REVIEWING: score-based branch point:
 *     score >= context.min_review_score → COMPLETE
 *     score < context.min_review_score  → FIXING
 * - FIXING: emits wrfc:fix_started on enter;
 *     fix_attempts < max_fix_attempts → back to REVIEWING
 *     fix_attempts >= max_fix_attempts → ESCALATED
 * - ESCALATED: terminal state; emits wrfc:escalated on enter
 * - COMPLETE: terminal state; emits wrfc:completed on enter
 */

import type { WorkflowDefinition } from '../types.js';
import { CHAIN_MAX_TRANSITIONS } from './chain-types.js';

/**
 * Built-in WRFC loop workflow definition.
 *
 * Register this with WorkflowEngine.registerDefinition() during engine startup.
 * Instances are created with initial context including `max_fix_attempts` and `task`.
 *
 * @example
 * ```ts
 * engine.registerDefinition(WRFC_LOOP_DEFINITION);
 * const instance = engine.create('wrfc_loop', {
 *   task: 'Implement user authentication',
 *   max_fix_attempts: 3,
 * });
 * ```
 */
export const WRFC_LOOP_DEFINITION: WorkflowDefinition = {
  id: 'wrfc_loop',
  name: 'Write-Review-Fix-Check Loop',
  version: 1,
  initial_state: 'IDLE',
  terminal_states: ['COMPLETE', 'ESCALATED'],
  max_transitions: CHAIN_MAX_TRANSITIONS.wrfc_loop,
  states: {
    IDLE: {
      name: 'IDLE',
      transitions: [
        {
          event: 'workflow:created',
          target: 'GATHERING',
        },
      ],
    },

    GATHERING: {
      name: 'GATHERING',
      on_enter: [
        {
          type: 'emit_event',
          config: { event_type: 'wrfc:gathering_started' },
        },
      ],
      transitions: [
        {
          event: 'wrfc:plan_submitted',
          target: 'PLANNING',
        },
      ],
    },

    PLANNING: {
      name: 'PLANNING',
      transitions: [
        {
          event: 'wrfc:writing_started',
          target: 'WRITING',
        },
      ],
    },

    WRITING: {
      name: 'WRITING',
      transitions: [
        {
          event: 'wrfc:review_started',
          target: 'REVIEWING',
        },
      ],
    },

    REVIEWING: {
      name: 'REVIEWING',
      on_enter: [
        {
          type: 'emit_event',
          config: { event_type: 'wrfc:review_started' },
        },
      ],
      transitions: [
        {
          // Perfect score — work is done
          event: 'wrfc:review_completed',
          target: 'COMPLETE',
          guard: {
            type: 'expression',
            expression: 'context.review_score >= context.min_review_score',
          },
        },
        {
          // Score below threshold — enter fix cycle
          event: 'wrfc:review_completed',
          target: 'FIXING',
          guard: {
            type: 'expression',
            expression: 'context.review_score < context.min_review_score',
          },
        },
      ],
    },

    FIXING: {
      name: 'FIXING',
      on_enter: [
        {
          type: 'emit_event',
          config: { event_type: 'wrfc:fix_started' },
        },
      ],
      transitions: [
        {
          // Still have fix budget — return to review
          event: 'wrfc:fix_completed',
          target: 'REVIEWING',
          guard: {
            type: 'expression',
            expression: 'context.fix_attempts < context.max_fix_attempts',
          },
        },
        {
          // Budget exhausted — escalate
          event: 'wrfc:fix_completed',
          target: 'ESCALATED',
          guard: {
            type: 'expression',
            expression: 'context.fix_attempts >= context.max_fix_attempts',
          },
        },
      ],
    },

    ESCALATED: {
      name: 'ESCALATED',
      on_enter: [
        {
          type: 'emit_event',
          config: { event_type: 'wrfc:escalated' },
        },
      ],
      transitions: [],
    },

    COMPLETE: {
      name: 'COMPLETE',
      on_enter: [
        {
          type: 'emit_event',
          config: { event_type: 'wrfc:completed' },
        },
      ],
      transitions: [],
    },
  },
};
