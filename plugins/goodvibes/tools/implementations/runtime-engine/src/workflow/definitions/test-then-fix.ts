/**
 * Test-Then-Fix Workflow Definition
 *
 * Formal state machine for a run-tests-then-fix-failures loop.
 * 6 states: IDLE → TESTING → FIXING → RE_TESTING → COMPLETE / ESCALATED
 *
 * State flow:
 * - IDLE: entry point; transitions immediately on workflow:created
 * - TESTING: initial test run phase; emits test_fix:testing_started on enter
 *     test_fix:tests_passed → COMPLETE
 *     test_fix:tests_failed → FIXING
 * - FIXING: engineer fix phase; emits test_fix:fix_started on enter
 *     test_fix:fix_completed (fix_attempts < max_fix_attempts) → RE_TESTING
 *     test_fix:fix_completed (fix_attempts >= max_fix_attempts) → ESCALATED
 * - RE_TESTING: re-run tests after fix; emits test_fix:retesting_started on enter
 *     test_fix:tests_passed → COMPLETE
 *     test_fix:tests_failed (fix_attempts < max_fix_attempts) → FIXING
 *     test_fix:tests_failed (fix_attempts >= max_fix_attempts) → ESCALATED
 * - COMPLETE: terminal state; emits test_fix:completed on enter
 * - ESCALATED: terminal state; emits test_fix:escalated on enter
 */

import type { WorkflowDefinition } from '../types.js';

/**
 * Built-in test-then-fix workflow definition.
 *
 * Register this with WorkflowEngine.registerDefinition() during engine startup.
 * Instances are created with initial context including `test_command`, `max_fix_attempts`.
 *
 * @example
 * ```ts
 * engine.registerDefinition(TEST_THEN_FIX_DEFINITION);
 * const instance = engine.create('test_then_fix', {
 *   test_command: 'npm test',
 *   max_fix_attempts: 3,
 * });
 * ```
 */
export const TEST_THEN_FIX_DEFINITION: WorkflowDefinition = {
  id: 'test_then_fix',
  name: 'Test-Then-Fix Loop',
  version: 1,
  initial_state: 'IDLE',
  terminal_states: ['COMPLETE', 'ESCALATED'],
  max_transitions: 60,
  states: {
    IDLE: {
      name: 'IDLE',
      transitions: [
        {
          event: 'workflow:created',
          target: 'TESTING',
        },
      ],
    },

    TESTING: {
      name: 'TESTING',
      on_enter: [
        {
          type: 'emit_event',
          config: { event_type: 'test_fix:testing_started' },
        },
      ],
      transitions: [
        {
          // Tests passed — work is done
          event: 'test_fix:tests_passed',
          target: 'COMPLETE',
        },
        {
          // Tests failed — enter fix cycle
          event: 'test_fix:tests_failed',
          target: 'FIXING',
        },
      ],
    },

    FIXING: {
      name: 'FIXING',
      on_enter: [
        {
          type: 'emit_event',
          config: { event_type: 'test_fix:fix_started' },
        },
      ],
      transitions: [
        {
          // Still have fix budget — re-run tests
          event: 'test_fix:fix_completed',
          target: 'RE_TESTING',
          guard: {
            type: 'expression',
            expression: 'context.fix_attempts < context.max_fix_attempts',
          },
        },
        {
          // Budget exhausted — escalate
          event: 'test_fix:fix_completed',
          target: 'ESCALATED',
          guard: {
            type: 'expression',
            expression: 'context.fix_attempts >= context.max_fix_attempts',
          },
        },
      ],
    },

    RE_TESTING: {
      name: 'RE_TESTING',
      on_enter: [
        {
          type: 'emit_event',
          config: { event_type: 'test_fix:retesting_started' },
        },
      ],
      transitions: [
        {
          // Tests pass after fix — complete
          event: 'test_fix:tests_passed',
          target: 'COMPLETE',
        },
        {
          // Tests still failing, still have budget — fix again
          event: 'test_fix:tests_failed',
          target: 'FIXING',
          guard: {
            type: 'expression',
            expression: 'context.fix_attempts < context.max_fix_attempts',
          },
        },
        {
          // Tests still failing, budget exhausted — escalate
          event: 'test_fix:tests_failed',
          target: 'ESCALATED',
          guard: {
            type: 'expression',
            expression: 'context.fix_attempts >= context.max_fix_attempts',
          },
        },
      ],
    },

    COMPLETE: {
      name: 'COMPLETE',
      on_enter: [
        {
          type: 'emit_event',
          config: { event_type: 'test_fix:completed' },
        },
      ],
      transitions: [],
    },

    ESCALATED: {
      name: 'ESCALATED',
      on_enter: [
        {
          type: 'emit_event',
          config: { event_type: 'test_fix:escalated' },
        },
      ],
      transitions: [],
    },
  },
};
