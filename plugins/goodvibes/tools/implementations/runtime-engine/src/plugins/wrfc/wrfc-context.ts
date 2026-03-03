/**
 * WRFC Context Helpers — WRFC Plugin (Layer 3)
 *
 * Provides typed access to WRFC-specific fields stored in the generic
 * WorkflowContext via its index signature. This keeps WRFC concerns
 * fully in Layer 3 while allowing L2 watchdog/guards to access these
 * fields via bracket notation with type assertions.
 */

import type { WorkflowContext } from '../../extensions/workflow/types.js';

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

/** Type-safe setter for WRFC fields in a generic WorkflowContext */
export function setWRFCField<K extends keyof WRFCFields>(
  ctx: WorkflowContext,
  key: K,
  value: WRFCFields[K],
): void {
  (ctx as Record<string, unknown>)[key] = value;
}
