/**
 * Agent Coordinator Type Definitions
 *
 * Types for workflow-aware agent management. CoordinatedAgent extends the
 * core AgentPool's PoolAgent concept with workflow context, WRFC phase
 * tracking, dependency graphs, and file modification tracking.
 */

/**
 * Budget snapshot for a single agent at a point in time.
 * Mirrors the shape of AgentBudgetState from the core AgentPool.
 */
export interface AgentBudgetSnapshot {
  /** Total tokens allocated to this agent. */
  allocated: number;
  /** Tokens consumed so far. */
  spent: number;
  /** Remaining tokens before exhaustion. */
  remaining: number;
  /** Whether the budget is fully exhausted. */
  exhausted: boolean;
  /** Usage as a percentage (0–100). */
  usage_percent: number;
  /** Input tokens consumed. */
  input_tokens: number;
  /** Output tokens generated. */
  output_tokens: number;
  /** Cache tokens read (0 when not available). */
  cache_tokens: number;
  /** Estimated cost in USD. */
  cost_usd: number;
}

/**
 * An agent entry in the coordinator registry.
 * Mirrors PoolAgent with additional workflow-context fields.
 */
export interface CoordinatedAgent {
  // ── Core fields (mirrors PoolAgent) ─────────────────────────────────────
  /** Unique agent identifier (e.g. "agent_<uuid>"). */
  id: string;
  /** Agent type (e.g. "engineer", "reviewer", "tester"). */
  type: string;
  /** Human-readable task description. */
  task: string;
  /** Current lifecycle status. */
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  /** Budget snapshot at the most recent update. */
  budget: AgentBudgetSnapshot;

  // ── Coordinator additions ────────────────────────────────────────────────
  /** Workflow this agent belongs to, if any. */
  workflow_id?: string;
  /** WRFC phase this agent is executing. */
  wrfc_phase?: 'gather' | 'plan' | 'write' | 'review' | 'fix';
  /** Agent IDs that must complete before this agent can start. */
  depends_on: string[];
  /** Agent IDs that are waiting on this agent to complete. */
  depended_by: string[];
  /** File paths modified by this agent (populated on completion). */
  files_modified: string[];
  /** Total number of tool calls made by this agent. */
  tools_called: number;
  /** ISO-8601 timestamp when the agent started running. */
  started_at?: string;
  /** ISO-8601 timestamp when the agent completed or failed. */
  completed_at?: string;
  /** Wall-clock duration in ms from start to completion. */
  duration_ms?: number;
}

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

/** Budget threshold levels (as percentages) for warning events. */
export type BudgetThreshold = 50 | 80 | 95;

/**
 * Aggregate statistics returned by AgentCoordinator.getStats().
 */
export interface CoordinatorStats {
  /** Total agents registered since the coordinator was created. */
  total_agents: number;
  /** Agents currently in 'pending' state. */
  pending: number;
  /** Agents currently in 'running' state. */
  running: number;
  /** Agents that completed successfully. */
  completed: number;
  /** Agents that failed. */
  failed: number;
  /** Agents that were cancelled. */
  cancelled: number;
  /** Number of distinct workflow IDs tracked. */
  active_workflows: number;
  /** Total tokens spent across all agents. */
  total_tokens_spent: number;
  /** Total cost in USD across all agents. */
  total_cost_usd: number;
}

/**
 * Options for spawning a new coordinated agent.
 */
export interface CoordinatedSpawnOptions {
  /** Agent type (e.g. "engineer", "reviewer"). */
  type: string;
  /** Task description passed to the agent. */
  task: string;
  /** Token budget cap for this agent. 0 = use configured default. */
  budget?: number;
  /** Scheduling priority (higher = runs sooner). */
  priority?: number;
  /** Agent IDs that must complete before this agent can start. */
  depends_on?: string[];
  /** Workflow this agent belongs to. */
  workflow_id?: string;
  /** WRFC phase this agent is executing. */
  wrfc_phase?: CoordinatedAgent['wrfc_phase'];
}
