/**
 * Agent Coordinator
 *
 * Wraps the conceptual AgentPool with workflow context, WRFC chain tracking,
 * and budget enforcement. Every agent lifecycle change emits a RuntimeEvent
 * on the EventBus. Since the runtime engine runs as a separate MCP process
 * and cannot directly access Claude Code's AgentPool, the coordinator
 * maintains its own agent registry that mirrors pool state via IPC events.
 *
 * Key behaviours:
 * 1. spawn()        — registers agent with workflow context, emits agent:spawned
 * 2. updateStatus() — called when agent status changes, emits appropriate event
 * 3. complete()     — marks agent done, resolves dependencies, emits agent:completed
 * 4. fail()         — marks agent failed, emits agent:failed
 * 5. cancel()       — marks agent cancelled, emits agent:cancelled
 * 6. Dependency resolution — when an agent completes, pending agents whose
 *    dependencies are all satisfied transition to 'running'.
 * 7. Budget enforcement — checks budget before spawn, delegates to BudgetTracker
 */

import type { EventBus } from '../events/event-bus.js';
import type { AgentsConfig } from '../../shared/config.js';
import { createLogger } from '../../shared/logger.js';
import { generateEventId, generateId, timestamp, toErrorMessage } from '../../shared/utils.js';
import { ProcessingError } from '../../shared/errors.js';
import type { EventType } from '../../shared/events.js';
import { BudgetTracker } from './budget-tracker.js';
import type {
  AgentBudgetSnapshot,
  CoordinatedAgent,
  CoordinatedSpawnOptions,
  CoordinatorStats,
} from './types.js';
import type {
  BudgetSummary,
  ExecutionPlan,
  ExecutionPhaseInfo,
  WRFCChain,
  WRFCPhaseName,
} from '../../plugins/wrfc/types.js';

const logger = createLogger('agent-coordinator');

/** Approximate cost per token in USD (~$3 per 1M tokens). */
const DEFAULT_COST_PER_TOKEN = 0.000003;

/** Valid forward status transitions. */
const VALID_TRANSITIONS: Record<CoordinatedAgent['status'], Set<CoordinatedAgent['status']>> = {
  pending:   new Set(['running', 'cancelled']),
  running:   new Set(['completed', 'failed', 'cancelled']),
  completed: new Set(),
  failed:    new Set(),
  cancelled: new Set(),
};

/**
 * AgentCoordinator manages a registry of coordinated agents and their
 * workflow associations, budget usage, and dependency graphs.
 */
export class AgentCoordinator {
  private readonly eventBus: EventBus;
  private readonly budgetTracker: BudgetTracker;
  private config: AgentsConfig;
  private readonly agents: Map<string, CoordinatedAgent> = new Map();
  private readonly wrfcChains: Map<string, WRFCChain> = new Map();

  /** Timer for periodic cleanup of terminated agents. */
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * @param eventBus      - EventBus instance for emitting agent lifecycle events.
   * @param budgetTracker - BudgetTracker for session-level token budget accounting.
   * @param config        - Agent-specific runtime configuration.
   */
  constructor(
    eventBus: EventBus,
    budgetTracker: BudgetTracker,
    config: AgentsConfig
  ) {
    this.eventBus = eventBus;
    this.budgetTracker = budgetTracker;
    this.config = config;
    logger.debug('AgentCoordinator initialised', {
      max_concurrent: config.max_concurrent,
      session_budget: config.session_budget,
    });
  }

  // ─── Spawn ──────────────────────────────────────────────────────────────────

  /**
   * Register a new coordinated agent entry.
   *
   * Validates budget availability and concurrent agent limits before
   * creating the registry entry. Emits `agent:spawned` on the EventBus.
   *
   * @param options - Spawn configuration.
   * @returns The generated agent ID.
   * @throws If budget is insufficient or concurrency limit is reached.
   */
  spawn(options: CoordinatedSpawnOptions): string {
    // Budget check
    const budgetNeeded = options.budget ?? this.config.default_budget;
    if (!this.budgetTracker.hasBudget(budgetNeeded)) {
      throw new ProcessingError(
        `Session budget exhausted — cannot spawn agent (type=${options.type}, needed=${budgetNeeded})`
      );
    }

    // Concurrency check
    const activeCount = this.listActive().length;
    if (activeCount >= this.config.max_concurrent) {
      throw new ProcessingError(
        `Concurrency limit reached (max=${this.config.max_concurrent}, active=${activeCount})`
      );
    }

    const id = `agent_${generateId()}`;
    const agent: CoordinatedAgent = {
      id,
      type: options.type,
      task: options.task,
      status: 'pending',
      budget: {
        allocated: budgetNeeded,
        spent: 0,
        remaining: budgetNeeded,
        exhausted: false,
        usage_percent: 0,
        input_tokens: 0,
        output_tokens: 0,
        cache_tokens: 0,
        cost_usd: 0,
      },
      workflow_id: options.workflow_id,
      wrfc_phase: options.wrfc_phase,
      depends_on: options.depends_on ?? [],
      depended_by: [],
      files_modified: [],
      tools_called: 0,
    };

    // Wire reverse dependency edges
    for (const depId of agent.depends_on) {
      const dep = this.agents.get(depId);
      if (dep) {
        dep.depended_by.push(id);
      }
    }

    this.agents.set(id, agent);
    this.budgetTracker.registerAgent(id, options.type, options.workflow_id);

    // Update WRFC chain if applicable
    if (options.workflow_id && options.wrfc_phase) {
      this.addAgentToWRFCChain(id, options.workflow_id, options.wrfc_phase, options.task);
    }

    this.emitEvent('agent:spawned', id, {
      type: options.type,
      task: options.task,
      workflow_id: options.workflow_id,
      wrfc_phase: options.wrfc_phase,
      depends_on: agent.depends_on,
    });

    logger.info('Agent spawned', { id, type: options.type, workflow_id: options.workflow_id });
    return id;
  }

  // ─── Status updates ─────────────────────────────────────────────────────────

  /**
   * Update an agent's status, validate the transition, and emit the
   * appropriate lifecycle event.
   *
   * @param agentId - Target agent.
   * @param status  - New status.
   * @param details - Optional result, error, and telemetry details.
   */
  updateStatus(
    agentId: string,
    status: CoordinatedAgent['status'],
    details?: {
      result?: string;
      error?: string;
      files_modified?: string[];
      tools_called?: number;
    }
  ): void {
    const agent = this.agents.get(agentId);
    if (!agent) {
      logger.warn('updateStatus called for unknown agent', { agentId });
      return;
    }

    const allowed = VALID_TRANSITIONS[agent.status];
    if (!allowed.has(status)) {
      logger.warn('Invalid status transition ignored', {
        agentId,
        from: agent.status,
        to: status,
      });
      return;
    }

    const prev = agent.status;
    agent.status = status;

    if (details?.files_modified) agent.files_modified = details.files_modified;
    if (details?.tools_called !== undefined) agent.tools_called = details.tools_called;

    if (status === 'running' && !agent.started_at) {
      agent.started_at = timestamp();
    }

    if (status === 'completed' || status === 'failed' || status === 'cancelled') {
      agent.completed_at = timestamp();
      if (agent.started_at) {
        agent.duration_ms = Date.now() - new Date(agent.started_at).getTime();
      }
    }

    // Propagate status to budget tracker for per-workflow agent counts
    this.budgetTracker.updateAgentStatus(agentId, status);

    // Emit lifecycle event
    const eventType = statusToEventType(status);
    this.emitEvent(eventType, agentId, {
      previous_status: prev,
      result: details?.result,
      error: details?.error,
      files_modified: agent.files_modified,
      tools_called: agent.tools_called,
      duration_ms: agent.duration_ms,
    });

    // On completion, check if any waiting agents can now start
    if (status === 'completed') {
      this.resolveDependencies(agentId);
      this.updateWRFCPhaseOnCompletion(agentId);
    }

    logger.info('Agent status updated', { agentId, from: prev, to: status });
  }

  // ─── Budget ──────────────────────────────────────────────────────────────────

  /**
   * Update the budget snapshot for an agent.
   *
   * @param agentId - Target agent.
   * @param budget  - Updated budget snapshot.
   */
  updateBudget(agentId: string, budget: AgentBudgetSnapshot): void {
    const agent = this.agents.get(agentId);
    if (!agent) {
      logger.warn('updateBudget called for unknown agent', { agentId });
      return;
    }
    agent.budget = budget;
    this.budgetTracker.updateAgentBudget(agentId, budget);
  }

  // ─── Cancel ──────────────────────────────────────────────────────────────────

  /**
   * Cancel an agent.
   *
   * @param agentId - Agent to cancel.
   * @param reason  - Human-readable reason for cancellation.
   */
  cancel(agentId: string, reason: string): void {
    this.updateStatus(agentId, 'cancelled', { error: reason });
  }

  // ─── Queries ─────────────────────────────────────────────────────────────────

  /**
   * Retrieve a single agent by ID.
   *
   * @param id - Agent ID.
   * @returns The agent or undefined.
   */
  getAgent(id: string): CoordinatedAgent | undefined {
    return this.agents.get(id);
  }

  /**
   * List all agents that are currently pending or running.
   *
   * @returns Array of active agents.
   */
  listActive(): CoordinatedAgent[] {
    return Array.from(this.agents.values()).filter(
      (a) => a.status === 'pending' || a.status === 'running'
    );
  }

  /**
   * List all agents registered with a given workflow ID.
   *
   * @param workflowId - Workflow to filter by.
   * @returns Array of matching agents.
   */
  listByWorkflow(workflowId: string): CoordinatedAgent[] {
    return Array.from(this.agents.values()).filter(
      (a) => a.workflow_id === workflowId
    );
  }

  /**
   * Build an execution plan for a workflow by analysing its agents
   * and their dependency relationships.
   *
   * @param workflowId - Workflow to plan.
   * @returns ExecutionPlan with critical path and cost estimates.
   */
  getExecutionPlan(workflowId: string): ExecutionPlan {
    const workflowAgents = this.listByWorkflow(workflowId);

    // Group agents by wrfc_phase
    const phaseMap = new Map<string, CoordinatedAgent[]>();
    for (const agent of workflowAgents) {
      const phase = agent.wrfc_phase ?? 'unknown';
      if (!phaseMap.has(phase)) phaseMap.set(phase, []);
      const phaseList = phaseMap.get(phase);
      if (phaseList) phaseList.push(agent);
    }

    const phases: ExecutionPhaseInfo[] = [];
    let maxParallelism = 1;
    let totalTokens = 0;

    for (const [phaseName, phaseAgents] of phaseMap) {
      const agentsInPhase = phaseAgents.map((a) => ({
        id: a.id,
        type: a.type,
        task: a.task,
        parallel: a.depends_on.length === 0,
        depends_on: a.depends_on,
      }));

      const parallelAgents = agentsInPhase.filter((a) => a.parallel).length;
      if (parallelAgents > maxParallelism) maxParallelism = parallelAgents;

      const phaseTokens = phaseAgents.reduce(
        (sum, a) => sum + a.budget.allocated,
        0
      );
      totalTokens += phaseTokens;

      phases.push({
        name: phaseName,
        agents: agentsInPhase,
        estimated_tokens: phaseTokens,
      });
    }

    const criticalPath = this.computeCriticalPath(workflowAgents);
    const estimatedCostUsd = totalTokens * DEFAULT_COST_PER_TOKEN;

    return {
      workflow_id: workflowId,
      phases,
      critical_path: criticalPath,
      estimated_tokens: totalTokens,
      estimated_cost_usd: estimatedCostUsd,
      max_parallelism: maxParallelism,
    };
  }

  /**
   * Get budget summary from the BudgetTracker.
   *
   * @returns BudgetSummary snapshot.
   */
  getBudgetSummary(): BudgetSummary {
    return this.budgetTracker.getBudgetSummary();
  }

  /**
   * Update the runtime configuration for this coordinator and its BudgetTracker.
   *
   * @param config - New agents configuration.
   */
  updateConfig(config: AgentsConfig): void {
    this.config = config;
    this.budgetTracker.updateConfig(config);
    logger.debug('AgentCoordinator config updated', {
      max_concurrent: config.max_concurrent,
      session_budget: config.session_budget,
    });
  }

  /**
   * Get aggregate coordinator statistics.
   *
   * @returns CoordinatorStats snapshot.
   */
  getStats(): CoordinatorStats {
    let pending = 0, running = 0, completed = 0, failed = 0, cancelled = 0;
    let totalTokensSpent = 0;
    let totalCostUsd = 0;
    const workflowIds = new Set<string>();

    for (const agent of this.agents.values()) {
      switch (agent.status) {
        case 'pending': pending++; break;
        case 'running': running++; break;
        case 'completed': completed++; break;
        case 'failed': failed++; break;
        case 'cancelled': cancelled++; break;
      }
      totalTokensSpent += agent.budget.spent;
      totalCostUsd += agent.budget.cost_usd;
      if (agent.workflow_id) workflowIds.add(agent.workflow_id);
    }

    return {
      total_agents: this.agents.size,
      pending,
      running,
      completed,
      failed,
      cancelled,
      active_workflows: workflowIds.size,
      total_tokens_spent: totalTokensSpent,
      total_cost_usd: totalCostUsd,
    };
  }

  /**
   * Returns all agents tracked by the coordinator, regardless of status.
   *
   * Used for snapshotting to capture a full picture of agent state.
   *
   * @returns Array of all CoordinatedAgent instances.
   */
  getAllAgents(): CoordinatedAgent[] {
    return Array.from(this.agents.values());
  }

  /**
   * Start periodic cleanup of terminated agent entries to prevent unbounded Map growth.
   *
   * @param intervalMs - How often to run cleanup (default: 5 minutes).
   * @param maxAgeMs   - Remove terminated agents older than this (default: 1 hour).
   */
  startPeriodicCleanup(intervalMs = 300_000, maxAgeMs = 3_600_000): void {
    this.stopPeriodicCleanup();
    this.cleanupTimer = setInterval(() => {
      const pruned = this.prune(maxAgeMs);
      const chainsRemoved = this.pruneStaleWRFCChains();
      if (pruned > 0 || chainsRemoved > 0) {
        logger.debug('Periodic cleanup completed', { agents_pruned: pruned, chains_removed: chainsRemoved });
      }
    }, intervalMs);
    // Don't block process exit
    if (this.cleanupTimer && typeof this.cleanupTimer === 'object' && 'unref' in this.cleanupTimer) {
      (this.cleanupTimer as NodeJS.Timeout).unref();
    }
    logger.debug('Periodic cleanup started', { intervalMs, maxAgeMs });
  }

  /**
   * Stop periodic cleanup.
   */
  stopPeriodicCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Retrieve the WRFC chain for a workflow, or undefined.
   *
   * @param workflowId - Workflow ID.
   * @returns WRFCChain or undefined.
   */
  getWRFCChain(workflowId: string): WRFCChain | undefined {
    return this.wrfcChains.get(workflowId);
  }

  /**
   * Advance the active phase of a WRFC chain.
   *
   * Marks the current phase as completed and activates the next phase
   * with the given name. Emits `wrfc:phase_changed` on the EventBus.
   *
   * @param workflowId - Workflow whose chain to advance.
   * @param phase      - Name of the phase to transition to.
   */
  advanceWRFCPhase(workflowId: string, phase: WRFCPhaseName): void {
    const chain = this.wrfcChains.get(workflowId);
    if (!chain) {
      logger.warn('advanceWRFCPhase: no chain found', { workflowId });
      return;
    }

    // Mark current phase complete
    if (chain.current_phase < chain.phases.length) {
      const current = chain.phases[chain.current_phase];
      if (current) {
        current.status = 'completed';
        current.completed_at = timestamp();
      }
    }

    // Find or create the target phase
    let targetIdx = chain.phases.findIndex((p) => p.name === phase);
    if (targetIdx === -1) {
      chain.phases.push({
        name: phase,
        agent_ids: [],
        status: 'active',
        started_at: timestamp(),
      });
      targetIdx = chain.phases.length - 1;
    } else {
      chain.phases[targetIdx].status = 'active';
      chain.phases[targetIdx].started_at = timestamp();
    }

    const prevPhase = chain.phases[chain.current_phase]?.name;
    chain.current_phase = targetIdx;

    // Increment review iterations when entering review
    if (phase === 'review') {
      chain.review_iterations++;
    }

    this.emitEvent('wrfc:phase_changed', workflowId, {
      from_phase: prevPhase,
      to_phase: phase,
      review_iterations: chain.review_iterations,
    });

    logger.info('WRFC phase advanced', { workflowId, from: prevPhase, to: phase });
  }

  /**
   * Remove agents that completed or failed before a given age threshold.
   *
   * @param olderThanMs - Maximum age in ms of retained agents.
   * @returns Number of agents pruned.
   */
  prune(olderThanMs = 3_600_000): number {
    const cutoff = Date.now() - olderThanMs;
    let count = 0;

    for (const [id, agent] of this.agents) {
      if (
        (agent.status === 'completed' || agent.status === 'failed' || agent.status === 'cancelled') &&
        agent.completed_at &&
        new Date(agent.completed_at).getTime() < cutoff
      ) {
        this.agents.delete(id);
        this.budgetTracker.removeAgent(id);
        // Clean up stale references to this agent from remaining agents
        for (const remaining of this.agents.values()) {
          remaining.depends_on = remaining.depends_on.filter((d) => d !== id);
          remaining.depended_by = remaining.depended_by.filter((d) => d !== id);
        }
        count++;
      }
    }

    if (count > 0) {
      logger.debug('Pruned old agent records', { count, olderThanMs });
    }
    return count;
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  /**
   * Remove WRFC chains whose workflows have no active agents.
   *
   * @returns Number of chains removed.
   */
  private pruneStaleWRFCChains(): number {
    let removed = 0;
    for (const [workflowId, chain] of this.wrfcChains) {
      const hasActiveAgents = chain.phases.some((phase) =>
        phase.agent_ids.some((aid) => {
          const agent = this.agents.get(aid);
          return agent && (agent.status === 'pending' || agent.status === 'running');
        })
      );
      if (!hasActiveAgents) {
        this.wrfcChains.delete(workflowId);
        removed++;
      }
    }
    return removed;
  }

  /**
   * Emit a RuntimeEvent on the EventBus with source kind 'system'.
   *
   * @param type    - Event type string.
   * @param subject - Agent ID or workflow ID, used as correlation subject.
   * @param data    - Additional payload data.
   */
  private emitEvent(type: EventType | string, subject: string, data: Record<string, unknown>): void {
    try {
      this.eventBus.emit({
        id: generateEventId(),
        timestamp: timestamp(),
        type: type as EventType,
        source: { kind: 'system' },
        payload: {
          type: type as EventType,
          data: { subject, ...data },
        } as import('../events/types.js').EventPayload,
        metadata: { correlation_id: subject },
      });
    } catch (err) {
      logger.error('Failed to emit agent event', {
        type,
        subject,
        error: toErrorMessage(err),
      });
    }
  }

  /**
   * Check if any pending agents become runnable after agentId completes.
   * An agent is runnable when all its dependencies are completed.
   *
   * @param completedAgentId - The agent that just completed.
   */
  private resolveDependencies(completedAgentId: string): void {
    const completed = this.agents.get(completedAgentId);
    if (!completed) return;

    for (const waitingId of completed.depended_by) {
      const waiting = this.agents.get(waitingId);
      if (!waiting || waiting.status !== 'pending') continue;

      const allDepsComplete = waiting.depends_on.every((depId) => {
        const dep = this.agents.get(depId);
        return dep?.status === 'completed';
      });

      if (allDepsComplete) {
        this.emitEvent('agent:dependency_resolved', waitingId, {
          resolved_by: completedAgentId,
          agent_id: waitingId,
        });
        logger.debug('Agent dependencies resolved — ready to run', {
          agentId: waitingId,
          resolvedBy: completedAgentId,
        });
      }
    }
  }

  /**
   * Register an agent with its WRFC chain, creating the chain if needed.
   *
   * @param agentId    - Agent to register.
   * @param workflowId - Parent workflow.
   * @param phase      - WRFC phase the agent is in.
   * @param task       - Task description (used for chain initialisation).
   */
  private addAgentToWRFCChain(
    agentId: string,
    workflowId: string,
    phase: WRFCPhaseName,
    task: string
  ): void {
    let chain = this.wrfcChains.get(workflowId);
    if (!chain) {
      chain = {
        id: `wrfc_${generateId()}`,
        workflow_id: workflowId,
        task,
        phases: [],
        current_phase: 0,
        review_iterations: 0,
        max_review_iterations: this.config.max_review_iterations,
      };
      this.wrfcChains.set(workflowId, chain);
    }

    // Find or create this phase entry
    let phaseEntry = chain.phases.find((p) => p.name === phase);
    if (!phaseEntry) {
      phaseEntry = {
        name: phase,
        agent_ids: [],
        status: 'pending',
      };
      chain.phases.push(phaseEntry);
    }
    phaseEntry.agent_ids.push(agentId);
  }

  /**
   * When an agent completes, check if all agents in its WRFC phase
   * are done and mark the phase complete.
   *
   * @param completedAgentId - The agent that just completed.
   */
  private updateWRFCPhaseOnCompletion(completedAgentId: string): void {
    const agent = this.agents.get(completedAgentId);
    if (!agent?.workflow_id || !agent.wrfc_phase) return;

    const chain = this.wrfcChains.get(agent.workflow_id);
    if (!chain) return;

    const phase = chain.phases.find((p) => p.name === agent.wrfc_phase);
    if (!phase || phase.status === 'completed') return;

    const allDone = phase.agent_ids.every((aid) => {
      const a = this.agents.get(aid);
      return a?.status === 'completed' || a?.status === 'failed' || a?.status === 'cancelled';
    });

    if (allDone) {
      phase.status = 'completed';
      phase.completed_at = timestamp();
      logger.debug('WRFC phase auto-completed', {
        workflowId: agent.workflow_id,
        phase: agent.wrfc_phase,
      });
    }
  }

  /**
   * Compute the critical path through an agent dependency graph.
   * Returns agent IDs on the longest dependency chain.
   *
   * @param agentList - Agents to analyse.
   * @returns Ordered list of agent IDs on the critical path.
   */
  private computeCriticalPath(agentList: CoordinatedAgent[]): string[] {
    if (agentList.length === 0) return [];

    const agentMap = new Map(agentList.map((a) => [a.id, a]));

    // Compute depth of each node (longest path to a root)
    const depths = new Map<string, number>();
    const getDepth = (id: string, visited = new Set<string>()): number => {
      if (depths.has(id)) return depths.get(id)!;
      if (visited.has(id)) return 0; // cycle guard
      visited.add(id);
      const agent = agentMap.get(id);
      if (!agent || agent.depends_on.length === 0) {
        depths.set(id, 0);
        return 0;
      }
      const maxDepDepth = Math.max(...agent.depends_on.map((d) => getDepth(d, new Set(visited))));
      const depth = maxDepDepth + 1;
      depths.set(id, depth);
      return depth;
    };

    for (const agent of agentList) {
      getDepth(agent.id);
    }

    // Find the node with the maximum depth as the end of the critical path
    let maxDepth = -1;
    let endNode = '';
    for (const [id, depth] of depths) {
      if (depth > maxDepth) {
        maxDepth = depth;
        endNode = id;
      }
    }

    if (!endNode) return [];

    // Walk backwards from the end node to reconstruct the path
    const path: string[] = [];
    let current: string | undefined = endNode;
    while (current) {
      path.unshift(current);
      const agent = agentMap.get(current);
      if (!agent || agent.depends_on.length === 0) break;
      // Follow the dependency with the highest depth
      current = agent.depends_on.reduce((best, depId) => {
        const bd = depths.get(best) ?? -1;
        const dd = depths.get(depId) ?? -1;
        return dd > bd ? depId : best;
      }, agent.depends_on[0]);
    }

    return path;
  }
}

// ─── Private helpers ──────────────────────────────────────────────────────────

/**
 * Map a CoordinatedAgent status to the appropriate EventType string.
 *
 * @param status - Agent lifecycle status.
 * @returns EventType string.
 */
function statusToEventType(status: CoordinatedAgent['status']): EventType {
  switch (status) {
    case 'running':   return 'agent:started';
    case 'completed': return 'agent:completed';
    case 'failed':    return 'agent:failed';
    case 'cancelled': return 'agent:cancelled';
    default:          return 'agent:spawned';
  }
}
