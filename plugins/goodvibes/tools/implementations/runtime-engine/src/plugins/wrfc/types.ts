/**
 * WRFC Plugin Types — Layer 3
 *
 * WRFC-domain-specific types. These live in L3 where they belong.
 * Generic workflow infrastructure types live in extensions/agents/workflow-types.ts.
 */

import type { WorkflowChain, WorkflowPhase } from '../../extensions/agents/workflow-types.js';

/** Valid WRFC phase names. */
export type WRFCPhaseName = 'gather' | 'plan' | 'write' | 'review' | 'fix';

/**
 * A single phase within a WRFC chain.
 * Narrows WorkflowPhase with WRFC-specific phase name typing.
 */
export interface WRFCPhase extends Omit<WorkflowPhase, 'name'> {
  /** WRFC phase name. */
  name: WRFCPhaseName;
}

/**
 * A WRFC (Gather-Plan-Write-Review-Fix-Check) execution chain.
 * Groups agents across phases for a single orchestration task.
 * Narrows WorkflowChain with WRFC-specific phase typing.
 */
export interface WRFCChain extends Omit<WorkflowChain, 'phases'> {
  /** Ordered list of WRFC phases in this chain. */
  phases: WRFCPhase[];
}

// Re-export generic types under WRFC-domain names for backward compatibility
export type {
  ExecutionPlanAgent,
  ExecutionPhaseInfo,
  ExecutionPlan,
  BudgetSummary,
} from '../../extensions/agents/workflow-types.js';
