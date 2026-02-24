/**
 * Fix Loop Workflow Definition
 *
 * Formal state machine for a single fix iteration within the WRFC loop.
 * 6 states: IDLE → DIAGNOSING → APPLYING → VERIFYING → RETRYING / RESOLVED / FAILED
 *
 * State flow:
 * - IDLE: entry point; transitions to DIAGNOSING on fix:diagnosing
 * - DIAGNOSING: root-cause analysis phase; transitions to APPLYING
 * - APPLYING: patch/edit phase; transitions to VERIFYING
 * - VERIFYING: build/test verification phase:
 *     fix:resolved (verification passed) → RESOLVED
 *     fix:retrying (verification failed, attempts < max) → RETRYING
 *     fix:failed (attempts >= max) → FAILED
 * - RETRYING: reset phase; loops back to DIAGNOSING
 * - RESOLVED: terminal state (success)
 * - FAILED: terminal state (exhausted attempts)
 */

import type { WorkflowDefinition } from '../types.js';
import { CHAIN_MAX_TRANSITIONS } from './chain-types.js';

/**
 * Built-in fix loop workflow definition.
 *
 * Register this with WorkflowEngine.registerDefinition() during engine startup.
 * Instances are created with initial context including `max_fix_attempts` and
 * the issues to address.
 *
 * @example
 * ```ts
 * engine.registerDefinition(FIX_LOOP_DEFINITION);
 * const instance = engine.create('fix_loop', {
 *   max_fix_attempts: 5,
 *   diagnosed_issues: [],
 * });
 * ```
 */
export const FIX_LOOP_DEFINITION: WorkflowDefinition = {
  id: 'fix_loop',
  name: 'Fix Loop',
  version: 1,
  initial_state: 'IDLE',
  terminal_states: ['RESOLVED', 'FAILED'],
  max_transitions: CHAIN_MAX_TRANSITIONS.fix_loop,
  states: {
    IDLE: {
      name: 'IDLE',
      transitions: [
        {
          event: 'fix:diagnosing',
          target: 'DIAGNOSING',
        },
      ],
    },

    DIAGNOSING: {
      name: 'DIAGNOSING',
      transitions: [
        {
          event: 'fix:applying',
          target: 'APPLYING',
        },
      ],
    },

    APPLYING: {
      name: 'APPLYING',
      transitions: [
        {
          event: 'fix:verifying',
          target: 'VERIFYING',
        },
      ],
    },

    VERIFYING: {
      name: 'VERIFYING',
      transitions: [
        {
          // Verification passed — fix is done
          event: 'fix:resolved',
          target: 'RESOLVED',
        },
        {
          // Verification failed, still have budget — retry
          event: 'fix:retrying',
          target: 'RETRYING',
          guard: {
            type: 'expression',
            expression: 'context.fix_attempts < context.max_fix_attempts',
          },
        },
        {
          // Budget exhausted after failure
          event: 'fix:failed',
          target: 'FAILED',
          guard: {
            type: 'expression',
            expression: 'context.fix_attempts >= context.max_fix_attempts',
          },
        },
      ],
    },

    RETRYING: {
      name: 'RETRYING',
      transitions: [
        {
          // Loop back to diagnosis with updated context
          event: 'fix:diagnosing',
          target: 'DIAGNOSING',
        },
      ],
    },

    RESOLVED: {
      name: 'RESOLVED',
      transitions: [],
    },

    FAILED: {
      name: 'FAILED',
      transitions: [],
    },
  },
};
