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

/**
 * @deprecated Import from '../../plugins/wrfc/types.js' instead.
 * WRFCPhaseName has moved to the WRFC plugin (L3).
 */
export type { WRFCPhaseName } from '../../plugins/wrfc/types.js';

/**
 * @deprecated Import from '../../plugins/wrfc/types.js' instead.
 * WRFCPhase has moved to the WRFC plugin (L3).
 */
export type { WRFCPhase } from '../../plugins/wrfc/types.js';

/**
 * @deprecated Import from '../../plugins/wrfc/types.js' instead.
 * WRFCChain has moved to the WRFC plugin (L3).
 */
export type { WRFCChain } from '../../plugins/wrfc/types.js';

/**
 * @deprecated Import from '../../plugins/wrfc/types.js' instead.
 * ExecutionPlanAgent has moved to the WRFC plugin (L3).
 */
export type { ExecutionPlanAgent } from '../../plugins/wrfc/types.js';

/**
 * @deprecated Import from '../../plugins/wrfc/types.js' instead.
 * ExecutionPhaseInfo has moved to the WRFC plugin (L3).
 */
export type { ExecutionPhaseInfo } from '../../plugins/wrfc/types.js';

/**
 * @deprecated Import from '../../plugins/wrfc/types.js' instead.
 * ExecutionPlan has moved to the WRFC plugin (L3).
 */
export type { ExecutionPlan } from '../../plugins/wrfc/types.js';

/**
 * @deprecated Import from '../../plugins/wrfc/types.js' instead.
 * BudgetSummary has moved to the WRFC plugin (L3).
 */
export type { BudgetSummary } from '../../plugins/wrfc/types.js';

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
