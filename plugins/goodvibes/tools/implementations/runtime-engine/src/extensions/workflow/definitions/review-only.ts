/**
 * Review-Only Workflow Definition
 *
 * Formal state machine for a single-pass review with no fix cycle.
 * 3 states: IDLE → REVIEWING → COMPLETE
 *
 * State flow:
 * - IDLE: entry point; transitions immediately on workflow:created
 * - REVIEWING: review phase; emits review_only:review_started on enter
 *     review_only:review_completed → COMPLETE
 * - COMPLETE: terminal state; emits review_only:completed on enter
 */

import type { WorkflowDefinition } from '../types.js';
import { CHAIN_MAX_TRANSITIONS } from './chain-types.js';

/**
 * Built-in review-only workflow definition.
 *
 * Register this with WorkflowEngine.registerDefinition() during engine startup.
 * Instances are created with optional context including `task`.
 *
 * @example
 * ```ts
 * engine.registerDefinition(REVIEW_ONLY_DEFINITION);
 * const instance = engine.create('review_only', {
 *   task: 'Review the authentication module',
 * });
 * ```
 */
export const REVIEW_ONLY_DEFINITION: WorkflowDefinition = {
  id: 'review_only',
  name: 'Review Only',
  version: 1,
  initial_state: 'IDLE',
  terminal_states: ['COMPLETE'],
  max_transitions: CHAIN_MAX_TRANSITIONS.review_only,
  states: {
    IDLE: {
      name: 'IDLE',
      transitions: [
        {
          event: 'workflow:created',
          target: 'REVIEWING',
        },
      ],
    },

    REVIEWING: {
      name: 'REVIEWING',
      on_enter: [
        {
          type: 'emit_event',
          config: { event_type: 'review_only:review_started' },
        },
      ],
      transitions: [
        {
          event: 'review_only:review_completed',
          target: 'COMPLETE',
        },
      ],
    },

    COMPLETE: {
      name: 'COMPLETE',
      on_enter: [
        {
          type: 'emit_event',
          config: { event_type: 'review_only:completed' },
        },
      ],
      transitions: [],
    },
  },
};
