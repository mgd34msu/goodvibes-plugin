/**
 * WRFC Field Helpers — Layer 2 Workflow Extension
 *
 * Provides typed access to WRFC-specific fields stored in the generic
 * WorkflowContext via its index signature. Lives in L2 (extensions/workflow)
 * so that the watchdog and other L2 components can use it without
 * importing from the L3 plugin layer.
 */

import type { WorkflowContext } from './types.js';

/** Typed WRFC-specific fields stored in WorkflowContext via index signature */
export interface WRFCFields {
  review_score?: number;
  review_issues?: unknown[];
  min_review_score?: number;
  fix_attempts?: number;
  max_fix_attempts?: number;
  files_modified?: string[];
}

/** Type-safe accessor for WRFC fields in a generic WorkflowContext */
export function getWRFCFields(ctx: WorkflowContext): WRFCFields {
  return {
    review_score: ctx['review_score'] as number | undefined,
    review_issues: ctx['review_issues'] as unknown[] | undefined,
    min_review_score: ctx['min_review_score'] as number | undefined,
    fix_attempts: ctx['fix_attempts'] as number | undefined,
    max_fix_attempts: ctx['max_fix_attempts'] as number | undefined,
    files_modified: ctx['files_modified'] as string[] | undefined,
  };
}
