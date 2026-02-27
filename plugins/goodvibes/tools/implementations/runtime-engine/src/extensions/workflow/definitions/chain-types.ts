/**
 * Chain Types
 *
 * Enumerates the supported orchestration chain types and provides
 * a shared constants section to avoid string duplication across files.
 *
 * Chain types correspond to workflow definition IDs registered with the WorkflowEngine.
 * Each chain type has a canonical workflow definition and a set of event names
 * used to drive its state machine.
 */

// ─── Chain Type Identifiers ────────────────────────────────────────────────────

/** Supported orchestration chain type identifiers. */
export type ChainType = 'wrfc_loop' | 'fix_loop' | 'test_then_fix' | 'review_only';

/** All chain type values as a readonly array. */
export const CHAIN_TYPES: readonly ChainType[] = [
  'wrfc_loop',
  'fix_loop',
  'test_then_fix',
  'review_only',
] as const;

// ─── Shared Event Name Constants ───────────────────────────────────────────────

/** Event names used in the WRFC loop workflow. */
export const WRFC_EVENTS = {
  GATHERING_STARTED: 'wrfc:gathering_started',
  PLAN_SUBMITTED: 'wrfc:plan_submitted',
  WRITING_STARTED: 'wrfc:writing_started',
  REVIEW_STARTED: 'wrfc:review_started',
  REVIEW_COMPLETED: 'wrfc:review_completed',
  FIX_STARTED: 'wrfc:fix_started',
  FIX_COMPLETED: 'wrfc:fix_completed',
  TEST_FAILED: 'wrfc:test_failed',
  ESCALATED: 'wrfc:escalated',
  COMPLETED: 'wrfc:completed',
} as const;

/** Event names used in the test-then-fix workflow. */
export const TEST_FIX_EVENTS = {
  TESTING_STARTED: 'test_fix:testing_started',
  TESTS_PASSED: 'test_fix:tests_passed',
  TESTS_FAILED: 'test_fix:tests_failed',
  FIX_STARTED: 'test_fix:fix_started',
  FIX_COMPLETED: 'test_fix:fix_completed',
  RETESTING_STARTED: 'test_fix:retesting_started',
  COMPLETED: 'test_fix:completed',
  ESCALATED: 'test_fix:escalated',
} as const;

/** Event names used in the review-only workflow. */
export const REVIEW_ONLY_EVENTS = {
  REVIEW_STARTED: 'review_only:review_started',
  REVIEW_COMPLETED: 'review_only:review_completed',
  COMPLETED: 'review_only:completed',
} as const;

// ─── Default Limits Per Chain Type ────────────────────────────────────────────

/**
 * Reasonable max_transitions defaults per chain type.
 * These serve as safeguards against infinite state machine loops.
 */
export const CHAIN_MAX_TRANSITIONS: Record<ChainType, number> = {
  wrfc_loop: 20,
  fix_loop: 30,
  test_then_fix: 15,
  review_only: 10,
} as const;

// ─── Type Guards ───────────────────────────────────────────────────────────────

/**
 * Type guard that checks whether a string value is a valid ChainType.
 *
 * @param value - The string to check.
 * @returns True if value is one of the known chain type identifiers.
 */
export function isChainType(value: unknown): value is ChainType {
  if (typeof value !== 'string') return false;
  return (CHAIN_TYPES as readonly string[]).includes(value);
}
