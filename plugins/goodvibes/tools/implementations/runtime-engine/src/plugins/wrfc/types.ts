/**
 * WRFC Plugin Types — Layer 3
 *
 * WRFC-specific types extracted from L2 agent coordination types.
 * These types are owned by the WRFC domain and live at L3.
 */

/** Valid WRFC phase names. */
export type WRFCPhaseName = 'gather' | 'plan' | 'write' | 'review' | 'fix';

/**
 * A single phase within a WRFC chain.
 */
export interface WRFCPhase {
  /** Phase name. */
  name: WRFCPhaseName;
  /** Agent IDs executing in this phase. */
  agent_ids: string[];
  /** Phase execution status. */
  status: 'pending' | 'active' | 'completed' | 'skipped';
  /** ISO-8601 timestamp when this phase started. */
  started_at?: string;
  /** ISO-8601 timestamp when this phase completed. */
  completed_at?: string;
}

/**
 * A WRFC (Gather-Plan-Write-Review-Fix-Check) execution chain.
 * Groups agents across phases for a single orchestration task.
 */
export interface WRFCChain {
  /** Unique chain identifier. */
  id: string;
  /** Parent workflow ID. */
  workflow_id: string;
  /** Top-level task description for this chain. */
  task: string;
  /** Ordered list of phases in this chain. */
  phases: WRFCPhase[];
  /** Index into phases[] of the currently executing phase. */
  current_phase: number;
  /** Number of review iterations completed so far. */
  review_iterations: number;
  /** Maximum review iterations before the chain is marked failed. */
  max_review_iterations: number;
}

/**
 * Per-agent info for an execution plan phase.
 */
export interface ExecutionPlanAgent {
  /** Agent ID. */
  id: string;
  /** Agent type. */
  type: string;
  /** Task description. */
  task: string;
  /** Whether this agent can run in parallel with others in the phase. */
  parallel: boolean;
  /** Agent IDs this agent depends on. */
  depends_on: string[];
}

/**
 * A single phase in an execution plan.
 */
export interface ExecutionPhaseInfo {
  /** Phase name (e.g. "gather", "write"). */
  name: string;
  /** Agents executing in this phase. */
  agents: ExecutionPlanAgent[];
  /** Estimated token usage for the phase. */
  estimated_tokens: number;
}

/**
 * A computed execution plan for a workflow, summarising critical path
 * and estimated resource usage before execution begins.
 */
export interface ExecutionPlan {
  /** Workflow ID this plan is for. */
  workflow_id: string;
  /** Ordered phases in the plan. */
  phases: ExecutionPhaseInfo[];
  /** Agent IDs on the critical (longest) dependency path. */
  critical_path: string[];
  /** Total estimated tokens across all phases. */
  estimated_tokens: number;
  /** Total estimated cost in USD. */
  estimated_cost_usd: number;
  /** Maximum number of agents that can run simultaneously. */
  max_parallelism: number;
}

/**
 * Aggregated budget usage across the session, broken down by workflow
 * and agent type.
 */
export interface BudgetSummary {
  /** Session-level totals. */
  session: {
    total_tokens: { input: number; output: number; cache: number };
    total_cost_usd: number;
    /** Remaining session budget in tokens (undefined when session_budget is 0 = unlimited). */
    budget_remaining_tokens?: number;
  };
  /** Per-workflow breakdown. */
  by_workflow: Record<string, {
    tokens: { input: number; output: number; cache: number };
    cost_usd: number;
    agents_completed: number;
    agents_active: number;
  }>;
  /** Per-agent-type breakdown. */
  by_agent_type: Record<string, {
    count: number;
    total_tokens: number;
    total_cost_usd: number;
    avg_tokens_per_agent: number;
  }>;
}
