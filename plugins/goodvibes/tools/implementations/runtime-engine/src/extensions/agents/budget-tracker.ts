/**
 * Budget Tracker
 *
 * Monitors agent spending against budgets, emitting warning events at
 * configurable thresholds (50%, 80%, 95%). Tracks per-agent, per-workflow,
 * and per-agent-type budget usage. Integrates with EventBus for alerts.
 *
 * Design: No direct dependency on AgentPool — receives budget updates
 * via explicit method calls from the coordinator.
 */

import type { EventBus } from '../events/event-bus.js';
import type { AgentsConfig } from '../../shared/config.js';
import { createLogger } from '../../shared/logger.js';
import { generateEventId, timestamp, toErrorMessage } from '../../shared/utils.js';
import type {
  AgentBudgetSnapshot,
  BudgetThreshold,
} from './types.js';
import type { BudgetSummary } from '../../plugins/wrfc/types.js';

const logger = createLogger('budget-tracker');

/** Tracks per-agent budget state plus which thresholds have already fired. */
interface AgentBudgetRecord {
  agentId: string;
  workflowId?: string;
  agentType: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  budget: AgentBudgetSnapshot;
  /** Set of threshold percentages that have already emitted a warning. */
  firedThresholds: Set<number>;
}

/**
 * BudgetTracker monitors token and cost usage across agents, emitting
 * `agent:budget_warning` events when configurable thresholds are crossed.
 */
export class BudgetTracker {
  private readonly eventBus: EventBus;
  private config: AgentsConfig;
  private readonly records: Map<string, AgentBudgetRecord> = new Map();
  /**
   * Running total of spent tokens across all tracked agents.
   * Updated incrementally on every `updateAgentBudget` and `removeAgent` call
   * to avoid O(n) iteration in `getTotalSpent()` / `hasBudget()`.
   */
  private runningTotal = 0;

  constructor(eventBus: EventBus, config: AgentsConfig) {
    this.eventBus = eventBus;
    this.config = config;
    logger.debug('BudgetTracker initialised', {
      session_budget: config.session_budget,
      thresholds: config.budget_thresholds,
    });
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Register a new agent for budget tracking.
   *
   * @param agentId - Unique agent identifier.
   * @param agentType - Agent type string (e.g. "engineer").
   * @param workflowId - Optional workflow the agent belongs to.
   */
  registerAgent(agentId: string, agentType: string, workflowId?: string): void {
    if (this.records.has(agentId)) return;
    this.records.set(agentId, {
      agentId,
      workflowId,
      agentType,
      status: 'pending',
      budget: {
        allocated: this.config.default_budget,
        spent: 0,
        remaining: this.config.default_budget,
        exhausted: false,
        usage_percent: 0,
        input_tokens: 0,
        output_tokens: 0,
        cache_tokens: 0,
        cost_usd: 0,
      },
      firedThresholds: new Set(),
    });
    logger.debug('Agent registered for budget tracking', { agentId, agentType, workflowId });
  }

  /**
   * Update the budget snapshot for an agent and fire threshold alerts as needed.
   *
   * @param agentId - Agent whose budget changed.
   * @param budget  - New budget snapshot.
   */
  updateAgentBudget(agentId: string, budget: AgentBudgetSnapshot): void {
    const record = this.records.get(agentId);
    if (!record) {
      logger.warn('updateAgentBudget called for unregistered agent', { agentId });
      return;
    }

    const previousSpent = record.budget.spent;
    record.budget = budget;
    // Maintain running total incrementally to keep getTotalSpent() O(1)
    this.runningTotal += budget.spent - previousSpent;

    // Check and fire thresholds that have not yet been emitted
    for (const threshold of this.config.budget_thresholds) {
      if (!record.firedThresholds.has(threshold) && budget.usage_percent >= threshold) {
        this.emitBudgetWarning(record, threshold);
        record.firedThresholds.add(threshold);
      }
    }
  }

  /**
   * Remove an agent's budget record (called after completion / pruning).
   *
   * @param agentId - Agent to remove.
   */
  removeAgent(agentId: string): void {
    const record = this.records.get(agentId);
    if (record) {
      // Deduct this agent's contribution from the running total
      this.runningTotal -= record.budget.spent;
    }
    this.records.delete(agentId);
  }

  /**
   * Update the status of a tracked agent. Used to populate per-workflow
   * agents_completed and agents_active counts in budget summaries.
   *
   * @param agentId - Agent whose status changed.
   * @param status  - New agent status.
   */
  updateAgentStatus(agentId: string, status: AgentBudgetRecord['status']): void {
    const record = this.records.get(agentId);
    if (record) record.status = status;
  }

  /**
   * Check whether sufficient session budget remains to spawn a new agent.
   *
   * A session_budget of 0 means unlimited — always returns true.
   *
   * @param requiredAmount - Additional tokens the new agent is expected to use.
   *   Defaults to the configured default_budget.
   * @returns True if the session budget allows spawning.
   */
  hasBudget(requiredAmount?: number): boolean {
    if (this.config.session_budget === 0) return true;

    const needed = requiredAmount ?? this.config.default_budget;
    const spent = this.getTotalSpent();
    return spent + needed <= this.config.session_budget;
  }

  /**
   * Build a full budget summary across the session, by workflow, and by agent type.
   *
   * @returns BudgetSummary snapshot.
   */
  getBudgetSummary(): BudgetSummary {
    let totalInput = 0;
    let totalOutput = 0;
    let totalCache = 0;
    let totalCost = 0;

    const byWorkflow: BudgetSummary['by_workflow'] = {};
    const byAgentType: BudgetSummary['by_agent_type'] = {};

    for (const record of this.records.values()) {
      const b = record.budget;
      totalInput += b.input_tokens;
      totalOutput += b.output_tokens;
      totalCache += b.cache_tokens;
      totalCost += b.cost_usd;

      // Per-workflow aggregation
      if (record.workflowId) {
        if (!byWorkflow[record.workflowId]) {
          byWorkflow[record.workflowId] = {
            tokens: { input: 0, output: 0, cache: 0 },
            cost_usd: 0,
            agents_completed: 0,
            agents_active: 0,
          };
        }
        const wf = byWorkflow[record.workflowId];
        wf.tokens.input += b.input_tokens;
        wf.tokens.output += b.output_tokens;
        wf.tokens.cache += b.cache_tokens;
        wf.cost_usd += b.cost_usd;
        if (record.status === 'completed') wf.agents_completed += 1;
        if (record.status === 'running') wf.agents_active += 1;
      }

      // Per-agent-type aggregation
      if (!byAgentType[record.agentType]) {
        byAgentType[record.agentType] = {
          count: 0,
          total_tokens: 0,
          total_cost_usd: 0,
          avg_tokens_per_agent: 0,
        };
      }
      const at = byAgentType[record.agentType];
      at.count += 1;
      at.total_tokens += b.input_tokens + b.output_tokens;
      at.total_cost_usd += b.cost_usd;
      at.avg_tokens_per_agent = at.count > 0 ? at.total_tokens / at.count : 0;
    }

    const remaining = this.config.session_budget > 0
      ? Math.max(0, this.config.session_budget - this.getTotalSpent())
      : undefined;

    return {
      session: {
        total_tokens: { input: totalInput, output: totalOutput, cache: totalCache },
        total_cost_usd: totalCost,
        budget_remaining_tokens: remaining,
      },
      by_workflow: byWorkflow,
      by_agent_type: byAgentType,
    };
  }

  /**
   * Return the budget record for a specific agent, or undefined.
   *
   * @param agentId - Agent to look up.
   */
  getAgentBudget(agentId: string): AgentBudgetSnapshot | undefined {
    return this.records.get(agentId)?.budget;
  }

  /**
   * Update the config used by this tracker (e.g. after a live config reload).
   *
   * @param config - New agents configuration.
   */
  updateConfig(config: AgentsConfig): void {
    this.config = config;
    logger.debug('BudgetTracker config updated', {
      session_budget: config.session_budget,
    });
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  /**
   * Returns the cached running total of spent tokens across all tracked agents.
   * O(1) — maintained incrementally via `updateAgentBudget` and `removeAgent`.
   */
  private getTotalSpent(): number {
    return this.runningTotal;
  }

  /**
   * Emit an `agent:budget_warning` event onto the EventBus.
   *
   * @param record    - The agent record that crossed the threshold.
   * @param threshold - The threshold percentage that was crossed.
   */
  private emitBudgetWarning(record: AgentBudgetRecord, threshold: number): void {
    try {
      this.eventBus.emit({
        id: generateEventId(),
        timestamp: timestamp(),
        type: 'agent:budget_warning',
        source: { kind: 'system' },
        payload: {
          type: 'agent:budget_warning',
          data: {
            agent_id: record.agentId,
            agent_type: record.agentType,
            workflow_id: record.workflowId,
            threshold_percent: threshold,
            usage_percent: record.budget.usage_percent,
            spent: record.budget.spent,
            allocated: record.budget.allocated,
            cost_usd: record.budget.cost_usd,
          },
        },
      });
      logger.warn('Budget threshold crossed', {
        agentId: record.agentId,
        threshold,
        usage_percent: record.budget.usage_percent,
      });
    } catch (err) {
      logger.error('Failed to emit budget warning event', {
        error: toErrorMessage(err),
        agentId: record.agentId,
        threshold,
      });
    }
  }
}
