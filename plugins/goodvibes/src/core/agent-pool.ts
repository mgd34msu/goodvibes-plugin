import { randomUUID } from "crypto";

/**
 * Specification for spawning an agent.
 */
export interface AgentSpec {
  /** Agent type (backend-engineer, frontend-architect, etc.) */
  type: string;
  /** Task description */
  task: string;
  /** Token budget allocation */
  budget: number;
  /** Priority (higher = more urgent) */
  priority?: number;
  /** Dependencies - agent IDs that must complete first */
  depends_on?: string[];
  /** Parent agent ID if nested */
  parent_id?: string;
  /** Callback when agent completes */
  on_complete?: AgentCallback;
  /** Callback when agent fails */
  on_fail?: AgentCallback;
}

/**
 * Runtime state of an agent in the pool.
 */
export interface PoolAgent {
  /** Unique agent identifier */
  id: string;
  /** Original specification */
  spec: AgentSpec;
  /** Current status */
  status: "queued" | "waiting" | "running" | "paused" | "completed" | "failed";
  /** ISO timestamp when added to pool */
  queued_at: string;
  /** ISO timestamp when started running */
  started_at?: string;
  /** ISO timestamp when completed/failed */
  ended_at?: string;
  /** Budget tracking */
  budget: AgentBudgetState;
  /** Result summary if completed */
  result?: string;
  /** Error message if failed */
  error?: string;
  /** Output from the agent */
  output?: unknown;
}

/**
 * Budget state for an agent.
 */
export interface AgentBudgetState {
  /** Maximum tokens allocated */
  allocated: number;
  /** Tokens used so far */
  spent: number;
  /** Remaining tokens */
  remaining: number;
  /** Whether budget is exhausted */
  exhausted: boolean;
  /** Percentage used */
  usage_percent: number;
  /** Input tokens used */
  input_tokens: number;
  /** Output tokens used */
  output_tokens: number;
  /** Estimated cost in USD */
  cost_usd: number;
}

/**
 * Token pricing configuration (per 1M tokens).
 */
export interface TokenPricing {
  /** Cost per 1M input tokens in USD */
  input_per_million: number;
  /** Cost per 1M output tokens in USD */
  output_per_million: number;
}

/**
 * Configuration for the agent pool.
 */
export interface AgentPoolConfig {
  /** Maximum concurrent agents */
  max_concurrent: number;
  /** Default budget per agent */
  default_budget: number;
  /** Total budget for all agents */
  total_budget: number;
  /** Whether to auto-start queued agents */
  auto_start: boolean;
  /** Budget warning threshold (0-1) */
  budget_warning_threshold: number;
  /** Token pricing for cost calculation */
  pricing: TokenPricing;
  /** Whether to auto-pause on budget exhaustion */
  auto_pause_on_exhaustion: boolean;
}

/**
 * Statistics for the agent pool.
 */
export interface AgentPoolStats {
  /** Total agents spawned */
  total_spawned: number;
  /** Currently active (running) */
  active: number;
  /** Currently queued */
  queued: number;
  /** Waiting on dependencies */
  waiting: number;
  /** Currently paused (budget exhausted) */
  paused: number;
  /** Successfully completed */
  completed: number;
  /** Failed */
  failed: number;
  /** Total budget allocated */
  total_budget_allocated: number;
  /** Total budget spent */
  total_budget_spent: number;
  /** Budget remaining */
  budget_remaining: number;
  /** Total input tokens used */
  total_input_tokens: number;
  /** Total output tokens used */
  total_output_tokens: number;
  /** Total cost in USD */
  total_cost_usd: number;
}

/**
 * Callback function type for agent events.
 */
export type AgentCallback = (agent: PoolAgent) => void | Promise<void>;

/** Default configuration */
const DEFAULT_CONFIG: AgentPoolConfig = {
  max_concurrent: 6,
  default_budget: 50000,
  total_budget: 500000,
  auto_start: true,
  budget_warning_threshold: 0.8,
  pricing: {
    // Claude Sonnet 3.5 pricing as default
    input_per_million: 3.0,
    output_per_million: 15.0,
  },
  auto_pause_on_exhaustion: true,
};

/**
 * Manages a pool of agents with budget tracking and dependency management.
 */
export class AgentPool {
  private config: AgentPoolConfig;
  private agents: Map<string, PoolAgent>;
  private queue: string[]; // Agent IDs in queue order
  private totalSpent: number = 0;
  private recentSpawns: Array<{ id: string; timestamp: number }> = [];
  private lastSequentialWarningTime: number = 0;

  // Event callbacks
  private onAgentStart: AgentCallback | null = null;
  private onAgentComplete: AgentCallback | null = null;
  private onAgentFail: AgentCallback | null = null;
  private onBudgetWarning: AgentCallback | null = null;
  private onBudgetExhausted: AgentCallback | null = null;
  private onSequentialSpawnDetected: ((data: { count: number; suggestion: string }) => void) | null = null;

  /**
   * Creates a new AgentPool instance.
   */
  constructor(config: Partial<AgentPoolConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.agents = new Map();
    this.queue = [];
  }

  /**
   * Spawns a new agent and adds it to the pool.
   * @returns The agent ID
   */
  spawn(spec: AgentSpec): string {
    const id = randomUUID();
    
    // Track spawn timing for sequential detection
    const now = Date.now();
    
    // Clean old entries first (older than 5 seconds)
    this.recentSpawns = this.recentSpawns.filter(s => now - s.timestamp < 5000);
    this.recentSpawns.push({ id, timestamp: now });
    
    // Detect sequential pattern (multiple spawns in quick succession)
    if (this.recentSpawns.length >= 2 && this.onSequentialSpawnDetected) {
      // Debounce: only warn once per 5-second window
      if (now - this.lastSequentialWarningTime >= 5000) {
        this.lastSequentialWarningTime = now;
        this.onSequentialSpawnDetected({
          count: this.recentSpawns.length,
          suggestion: 'Spawn independent agents in a single Task() call batch for parallel execution',
        });
      }
    }
    
    const budget = spec.budget || this.config.default_budget;

    const agent: PoolAgent = {
      id,
      spec: { ...spec, budget },
      status: "queued",
      queued_at: new Date().toISOString(),
      budget: {
        allocated: budget,
        spent: 0,
        remaining: budget,
        exhausted: false,
        usage_percent: 0,
        input_tokens: 0,
        output_tokens: 0,
        cost_usd: 0,
      },
    };

    this.agents.set(id, agent);
    this.queue.push(id);

    // Check dependencies
    if (spec.depends_on && spec.depends_on.length > 0) {
      const pendingDeps = spec.depends_on.filter((depId) => {
        const dep = this.agents.get(depId);
        return dep && dep.status !== "completed";
      });

      if (pendingDeps.length > 0) {
        agent.status = "waiting";
      }
    }

    // Try to start if auto_start and not waiting
    if (this.config.auto_start && agent.status === "queued") {
      this.tryStartNext();
    }

    return id;
  }

  /**
   * Tries to start the next queued agent if capacity allows.
   */
  private tryStartNext(): void {
    const activeCount = this.getActiveCount();

    if (activeCount >= this.config.max_concurrent) {
      return;
    }

    // Find next agent that can start
    for (const agentId of this.queue) {
      const agent = this.agents.get(agentId);
      if (!agent) continue;

      if (agent.status === "queued" && this.canStart(agent)) {
        this.startAgent(agentId);
        break;
      }
    }
  }

  /**
   * Checks if an agent can start (dependencies met).
   */
  private canStart(agent: PoolAgent): boolean {
    if (!agent.spec.depends_on || agent.spec.depends_on.length === 0) {
      return true;
    }

    return agent.spec.depends_on.every((depId) => {
      const dep = this.agents.get(depId);
      return dep && dep.status === "completed";
    });
  }

  /**
   * Starts an agent.
   */
  private startAgent(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    agent.status = "running";
    agent.started_at = new Date().toISOString();

    // Remove from queue
    this.queue = this.queue.filter((id) => id !== agentId);

    // Trigger callback
    if (this.onAgentStart) {
      this.onAgentStart(agent);
    }
  }

  /**
   * Gets an agent by ID.
   */
  getAgent(id: string): PoolAgent | undefined {
    const agent = this.agents.get(id);
    return agent ? { ...agent } : undefined;
  }

  /**
   * Calculates cost from token counts.
   */
  private calculateCost(inputTokens: number, outputTokens: number): number {
    const inputCost = (inputTokens / 1_000_000) * this.config.pricing.input_per_million;
    const outputCost = (outputTokens / 1_000_000) * this.config.pricing.output_per_million;
    return Math.round((inputCost + outputCost) * 10000) / 10000; // Round to 4 decimal places
  }

  /**
   * Updates an agent's token usage (simple version - total tokens only).
   */
  updateBudget(agentId: string, tokensUsed: number): void {
    // Assume 20% input, 80% output as default split if not specified
    const inputTokens = Math.floor(tokensUsed * 0.2);
    const outputTokens = tokensUsed - inputTokens;
    this.updateBudgetDetailed(agentId, inputTokens, outputTokens);
  }

  /**
   * Updates an agent's token usage with detailed input/output breakdown.
   */
  updateBudgetDetailed(agentId: string, inputTokens: number, outputTokens: number): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    const totalTokens = inputTokens + outputTokens;
    const cost = this.calculateCost(inputTokens, outputTokens);

    agent.budget.input_tokens = inputTokens;
    agent.budget.output_tokens = outputTokens;
    agent.budget.spent = totalTokens;
    agent.budget.remaining = agent.budget.allocated - totalTokens;
    agent.budget.usage_percent = (totalTokens / agent.budget.allocated) * 100;
    agent.budget.cost_usd = cost;

    const wasExhausted = agent.budget.exhausted;
    agent.budget.exhausted = agent.budget.remaining <= 0;

    // Check for budget warning
    if (
      agent.budget.usage_percent >= this.config.budget_warning_threshold * 100 &&
      this.onBudgetWarning
    ) {
      this.onBudgetWarning(agent);
    }

    // Check for budget exhausted (only trigger once)
    if (agent.budget.exhausted && !wasExhausted) {
      if (this.onBudgetExhausted) {
        this.onBudgetExhausted(agent);
      }

      // Auto-pause if configured
      if (this.config.auto_pause_on_exhaustion && agent.status === "running") {
        this.pause(agentId);
      }
    }
  }

  /**
   * Pauses a running agent (typically due to budget exhaustion).
   */
  pause(agentId: string): boolean {
    const agent = this.agents.get(agentId);
    if (!agent || agent.status !== "running") return false;

    agent.status = "paused";
    return true;
  }

  /**
   * Resumes a paused agent.
   */
  resume(agentId: string): boolean {
    const agent = this.agents.get(agentId);
    if (!agent || agent.status !== "paused") return false;

    // Only resume if budget allows
    if (agent.budget.exhausted) {
      return false;
    }

    agent.status = "running";
    return true;
  }

  /**
   * Adds additional budget to an agent (top-up).
   */
  topUp(agentId: string, additionalTokens: number): boolean {
    const agent = this.agents.get(agentId);
    if (!agent) return false;

    agent.budget.allocated += additionalTokens;
    agent.budget.remaining += additionalTokens;
    agent.budget.usage_percent = (agent.budget.spent / agent.budget.allocated) * 100;
    agent.budget.exhausted = agent.budget.remaining <= 0;

    // Auto-resume if was paused due to exhaustion and now has budget
    if (agent.status === "paused" && !agent.budget.exhausted) {
      agent.status = "running";
    }

    return true;
  }

  /**
   * Gets all paused agents.
   */
  getPausedAgents(): PoolAgent[] {
    return Array.from(this.agents.values())
      .filter((a) => a.status === "paused")
      .map((a) => ({ ...a }));
  }

  /**
   * Marks an agent as completed.
   */
  complete(agentId: string, result?: string, tokensSpent?: number): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    agent.status = "completed";
    agent.ended_at = new Date().toISOString();
    agent.result = result;

    if (tokensSpent !== undefined) {
      this.updateBudget(agentId, tokensSpent);
      this.totalSpent += tokensSpent;
    }

    // Trigger spec callback
    if (agent.spec.on_complete) {
      agent.spec.on_complete(agent);
    }

    // Trigger pool callback
    if (this.onAgentComplete) {
      this.onAgentComplete(agent);
    }

    // Check for waiting agents that can now start
    this.processWaitingAgents();

    // Try to start next queued agent
    if (this.config.auto_start) {
      this.tryStartNext();
    }
  }

  /**
   * Marks an agent as failed.
   */
  fail(agentId: string, error: string, tokensSpent?: number): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    agent.status = "failed";
    agent.ended_at = new Date().toISOString();
    agent.error = error;

    if (tokensSpent !== undefined) {
      this.updateBudget(agentId, tokensSpent);
      this.totalSpent += tokensSpent;
    }

    // Trigger spec callback
    if (agent.spec.on_fail) {
      agent.spec.on_fail(agent);
    }

    // Trigger pool callback
    if (this.onAgentFail) {
      this.onAgentFail(agent);
    }

    // Try to start next queued agent
    if (this.config.auto_start) {
      this.tryStartNext();
    }
  }

  /**
   * Processes waiting agents to see if they can start.
   */
  private processWaitingAgents(): void {
    for (const [id, agent] of this.agents.entries()) {
      if (agent.status === "waiting" && this.canStart(agent)) {
        agent.status = "queued";
        if (this.config.auto_start) {
          this.tryStartNext();
        }
      }
    }
  }

  /**
   * Gets the count of active (running) agents.
   */
  getActiveCount(): number {
    return Array.from(this.agents.values()).filter((a) => a.status === "running").length;
  }

  /**
   * Gets all active agents.
   */
  getActiveAgents(): PoolAgent[] {
    return Array.from(this.agents.values())
      .filter((a) => a.status === "running")
      .map((a) => ({ ...a }));
  }

  /**
   * Gets all queued agents.
   */
  getQueuedAgents(): PoolAgent[] {
    return Array.from(this.agents.values())
      .filter((a) => a.status === "queued")
      .map((a) => ({ ...a }));
  }

  /**
   * Gets all waiting agents.
   */
  getWaitingAgents(): PoolAgent[] {
    return Array.from(this.agents.values())
      .filter((a) => a.status === "waiting")
      .map((a) => ({ ...a }));
  }

  /**
   * Gets pool statistics.
   */
  getStats(): AgentPoolStats {
    const agents = Array.from(this.agents.values());

    const totalAllocated = agents.reduce((sum, a) => sum + a.budget.allocated, 0);
    const totalSpent = agents.reduce((sum, a) => sum + a.budget.spent, 0);
    const totalInputTokens = agents.reduce((sum, a) => sum + a.budget.input_tokens, 0);
    const totalOutputTokens = agents.reduce((sum, a) => sum + a.budget.output_tokens, 0);
    const totalCost = agents.reduce((sum, a) => sum + a.budget.cost_usd, 0);

    return {
      total_spawned: agents.length,
      active: agents.filter((a) => a.status === "running").length,
      queued: agents.filter((a) => a.status === "queued").length,
      waiting: agents.filter((a) => a.status === "waiting").length,
      paused: agents.filter((a) => a.status === "paused").length,
      completed: agents.filter((a) => a.status === "completed").length,
      failed: agents.filter((a) => a.status === "failed").length,
      total_budget_allocated: totalAllocated,
      total_budget_spent: totalSpent,
      budget_remaining: this.config.total_budget - totalSpent,
      total_input_tokens: totalInputTokens,
      total_output_tokens: totalOutputTokens,
      total_cost_usd: Math.round(totalCost * 10000) / 10000,
    };
  }

  /**
   * Gets agents by status.
   */
  getAgentsByStatus(status: PoolAgent["status"]): PoolAgent[] {
    return Array.from(this.agents.values())
      .filter((a) => a.status === status)
      .map((a) => ({ ...a }));
  }

  /**
   * Checks if total budget allows spawning another agent.
   */
  hasBudget(requestedBudget?: number): boolean {
    const budget = requestedBudget || this.config.default_budget;
    const stats = this.getStats();
    return stats.budget_remaining >= budget;
  }

  /**
   * Gets remaining total budget.
   */
  getRemainingBudget(): number {
    return this.config.total_budget - this.totalSpent;
  }

  /**
   * Sets the callback for agent start events.
   */
  onStart(callback: AgentCallback): void {
    this.onAgentStart = callback;
  }

  /**
   * Sets the callback for agent complete events.
   */
  onComplete(callback: AgentCallback): void {
    this.onAgentComplete = callback;
  }

  /**
   * Sets the callback for agent fail events.
   */
  onFail(callback: AgentCallback): void {
    this.onAgentFail = callback;
  }

  /**
   * Sets the callback for budget warning events.
   */
  onWarning(callback: AgentCallback): void {
    this.onBudgetWarning = callback;
  }

  /**
   * Sets the callback for budget exhausted events.
   */
  onExhausted(callback: AgentCallback): void {
    this.onBudgetExhausted = callback;
  }

  /**
   * Sets callback for sequential spawn detection warnings.
   */
  onSequentialSpawn(callback: (data: { count: number; suggestion: string }) => void): void {
    this.onSequentialSpawnDetected = callback;
  }

  /**
   * Gets the current configuration.
   */
  getConfig(): AgentPoolConfig {
    return { ...this.config };
  }

  /**
   * Updates the configuration.
   */
  updateConfig(config: Partial<AgentPoolConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Clears completed and failed agents from the pool.
   */
  prune(): number {
    let pruned = 0;
    for (const [id, agent] of this.agents.entries()) {
      if (agent.status === "completed" || agent.status === "failed") {
        this.agents.delete(id);
        pruned++;
      }
    }
    // Clear spawn tracking on prune
    this.recentSpawns = [];
    return pruned;
  }
}
