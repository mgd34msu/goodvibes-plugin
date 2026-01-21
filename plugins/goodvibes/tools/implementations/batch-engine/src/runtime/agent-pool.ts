/**
 * Agent Pool Implementation for Batch Engine
 * @see SPEC-v2 Section 12
 */

import type {
  AgentPool,
  AgentPoolConfig,
  AgentPoolState,
  AgentPoolManager,
  AgentPoolShutdownOptions,
  AgentCompletionResult,
  AgentSpec,
  QueuedAgent,
  ActiveAgent,
  CompletedAgent,
  BudgetStatus,
  AgentPoolEvent,
  AgentPoolEventHandler,
  AgentPoolEventData,
  DEFAULT_POOL_CONFIG,
} from '../interfaces/agent-pool.js';

import type {
  AgentLifecycle,
  AgentLifecycleManager,
  SpawnResult,
  MonitorResult,
  CompletionResult,
  AgentLifecycleEvent,
  AgentLifecycleHandler,
  HealthReport,
  HealthIssue,
} from '../interfaces/agent-lifecycle.js';

import type {
  AgentCommunication,
  AgentCommunicationManager,
  SharedResult,
  BroadcastMessage,
  AgentMessage,
  AgentRequest,
  AgentResponse,
  MessagePriority,
  RequestType,
  CommunicationStats,
  SharingConfig,
} from '../interfaces/agent-communication.js';
import type { CompletedAgent as StateCompletedAgent } from '../interfaces/state.js';

import type {
  DependencyResolver,
  DependencyManager,
  DependencyGraph,
  DependencyNode,
  ExecutionPlan,
  ExecutionPhase,
  ResolutionResult,
  CycleCheckResult,
  AgentDependency,
  DependencyType,
  createDependencyGraph,
  createPlanId,
  createExecutionPhase,
} from '../interfaces/agent-dependencies.js';

// ============================================================================
// AGENT POOL IMPLEMENTATION
// ============================================================================

/**
 * Core agent pool implementation
 * Manages agent queuing, execution capacity, and budget tracking
 */
export class AgentPoolImpl implements AgentPoolManager {
  public config: AgentPoolConfig;
  public state: AgentPoolState;
  private eventHandlers: Map<AgentPoolEvent, Set<AgentPoolEventHandler>>;
  private initialized: boolean = false;

  constructor(config?: Partial<AgentPoolConfig>) {
    // Initialize configuration with defaults
    this.config = {
      max_concurrent: config?.max_concurrent ?? 6,
      default_budget: config?.default_budget ?? {
        max_tokens: 100000,
        max_turns: 50,
        max_duration_ms: 300000,
      },
      total_budget: config?.total_budget ?? {
        max_tokens: 1000000,
        max_agents: 50,
        warn_at_percent: 80,
      },
      queue_strategy: config?.queue_strategy ?? 'dependency',
    };

    // Initialize state
    this.state = {
      active: new Map(),
      queued: [],
      completed: [],
      tokens_used: 0,
      tokens_remaining: this.config.total_budget.max_tokens,
      agents_spawned: 0,
      agents_remaining: this.config.total_budget.max_agents,
    };

    this.eventHandlers = new Map();
  }

  // -------------------------------------------------------------------------
  // Lifecycle Management
  // -------------------------------------------------------------------------

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Set up event handlers and initialize internal state
    this.initialized = true;
    this.emit('queue_empty', {
      event: 'queue_empty',
      timestamp: new Date().toISOString(),
    });
  }

  async shutdown(options?: AgentPoolShutdownOptions): Promise<void> {
    const opts = {
      wait_for_active: options?.wait_for_active ?? true,
      timeout_ms: options?.timeout_ms ?? 60000,
      cancel_on_timeout: options?.cancel_on_timeout ?? true,
    };

    if (opts.wait_for_active && this.state.active.size > 0) {
      const startTime = Date.now();
      const timeout = opts.timeout_ms;

      // Wait for active agents to complete
      while (this.state.active.size > 0 && Date.now() - startTime < timeout) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // Cancel remaining if timeout reached
      if (opts.cancel_on_timeout && this.state.active.size > 0) {
        this.cancelAll();
      }
    }

    this.initialized = false;
  }

  // -------------------------------------------------------------------------
  // Queue Management
  // -------------------------------------------------------------------------

  enqueue(spec: AgentSpec): string {
    const queued: QueuedAgent = {
      spec,
      priority: spec.priority ?? 0,
      queued_at: new Date().toISOString(),
      depends_on: spec.depends_on ?? [],
      blocked_by: this.getBlockingAgents(spec),
    };

    this.state.queued.push(queued);
    this.sortQueue();

    this.emit('agent_queued', {
      event: 'agent_queued',
      timestamp: new Date().toISOString(),
      agent_id: spec.id,
      agent_spec: spec,
    });

    return spec.id;
  }

  dequeue(id: string): boolean {
    const index = this.state.queued.findIndex((q) => q.spec.id === id);
    if (index === -1) {
      return false;
    }

    this.state.queued.splice(index, 1);
    return true;
  }

  getQueue(): QueuedAgent[] {
    return [...this.state.queued];
  }

  private sortQueue(): void {
    switch (this.config.queue_strategy) {
      case 'priority':
        this.state.queued.sort((a, b) => b.priority - a.priority);
        break;
      case 'dependency':
        // Sort by dependency depth first, then priority
        this.state.queued.sort((a, b) => {
          const depthDiff = a.depends_on.length - b.depends_on.length;
          return depthDiff !== 0 ? depthDiff : b.priority - a.priority;
        });
        break;
      case 'fifo':
      default:
        // Keep insertion order
        break;
    }
  }

  private getBlockingAgents(spec: AgentSpec): string[] {
    const blocked: string[] = [];
    const depends_on = spec.depends_on ?? [];

    for (const depId of depends_on) {
      // Check if dependency is still active or queued
      if (this.state.active.has(depId)) {
        blocked.push(depId);
      } else if (this.state.queued.some((q) => q.spec.id === depId)) {
        blocked.push(depId);
      }
    }

    return blocked;
  }

  // -------------------------------------------------------------------------
  // Capacity Checks
  // -------------------------------------------------------------------------

  hasCapacity(): boolean {
    return this.state.active.size < this.config.max_concurrent;
  }

  canSpawn(spec: AgentSpec): boolean {
    // Check capacity
    if (!this.hasCapacity()) {
      return false;
    }

    // Check budget
    if (!this.hasBudget(spec)) {
      return false;
    }

    // Check dependencies
    const blockers = this.getBlockingAgents(spec);
    return blockers.length === 0;
  }

  getAvailableSlots(): number {
    return Math.max(0, this.config.max_concurrent - this.state.active.size);
  }

  // -------------------------------------------------------------------------
  // Budget Checks
  // -------------------------------------------------------------------------

  hasBudget(spec: AgentSpec): boolean {
    const estimated = this.estimateCost(spec);

    // Check token budget
    if (this.state.tokens_remaining < estimated) {
      return false;
    }

    // Check agent count budget
    if (this.state.agents_remaining <= 0) {
      return false;
    }

    return true;
  }

  estimateCost(spec: AgentSpec): number {
    // Use budget from spec or default
    const budget = spec.budget ?? this.config.default_budget;
    return budget.max_tokens ?? 100000;
  }

  getBudgetStatus(): BudgetStatus {
    const total_tokens = this.config.total_budget.max_tokens;
    const total_agents = this.config.total_budget.max_agents;
    const warn_threshold = this.config.total_budget.warn_at_percent;

    const tokens_percent = (this.state.tokens_used / total_tokens) * 100;
    const agents_percent = (this.state.agents_spawned / total_agents) * 100;

    const warning =
      tokens_percent >= warn_threshold || agents_percent >= warn_threshold;
    const exhausted =
      this.state.tokens_remaining <= 0 || this.state.agents_remaining <= 0;

    return {
      tokens_used: this.state.tokens_used,
      tokens_remaining: this.state.tokens_remaining,
      tokens_percent,
      agents_spawned: this.state.agents_spawned,
      agents_remaining: this.state.agents_remaining,
      agents_percent,
      warning,
      exhausted,
    };
  }

  // -------------------------------------------------------------------------
  // Agent Spawning
  // -------------------------------------------------------------------------

  async spawnNext(): Promise<ActiveAgent | null> {
    if (!this.hasCapacity()) {
      return null;
    }

    // Find first eligible agent in queue
    const index = this.state.queued.findIndex((q) => this.canSpawn(q.spec));
    if (index === -1) {
      return null;
    }

    const queued = this.state.queued.splice(index, 1)[0];
    if (!queued) {
      return null;
    }

    const agent = this.createActiveAgent(queued.spec);

    this.state.active.set(agent.id, agent);
    this.state.agents_spawned++;
    this.state.agents_remaining--;

    this.emit('agent_started', {
      event: 'agent_started',
      timestamp: new Date().toISOString(),
      agent_id: agent.id,
      agent_spec: queued.spec,
    });

    // Check if queue is empty
    if (this.state.queued.length === 0) {
      this.emit('queue_empty', {
        event: 'queue_empty',
        timestamp: new Date().toISOString(),
      });
    }

    return agent;
  }

  private createActiveAgent(spec: AgentSpec): ActiveAgent {
    const budget = {
      ...this.config.default_budget,
      ...spec.budget,
    };

    return {
      id: spec.id,
      spec,
      started_at: new Date().toISOString(),
      tokens_used: 0,
      turns_used: 0,
      status: 'running',
      last_activity: new Date().toISOString(),
    };
  }

  // -------------------------------------------------------------------------
  // Agent Completion
  // -------------------------------------------------------------------------

  recordCompletion(id: string, result: AgentCompletionResult): void {
    const active = this.state.active.get(id);
    if (!active) {
      return;
    }

    // Remove from active
    this.state.active.delete(id);

    // Update token budget
    this.state.tokens_used += result.tokens_used;
    this.state.tokens_remaining -= result.tokens_used;

    // Create completed record
    const completed: CompletedAgent = {
      id,
      spec: active.spec,
      started_at: active.started_at,
      completed_at: new Date().toISOString(),
      tokens_used: result.tokens_used,
      turns_used: result.turns_used,
      status: result.status,
      result: result.result,
      error: result.error,
    };

    this.state.completed.push(completed);

    // Emit appropriate event
    const eventMap: Record<typeof result.status, AgentPoolEvent> = {
      success: 'agent_completed',
      failed: 'agent_failed',
      timeout: 'agent_timeout',
      cancelled: 'agent_cancelled',
    };

    this.emit(eventMap[result.status], {
      event: eventMap[result.status],
      timestamp: new Date().toISOString(),
      agent_id: id,
      completed_agent: completed,
    });

    // Handle chaining if specified
    if (result.status === 'success' && active.spec.chain_to) {
      this.handleChaining(completed);
    }

    // Update blocked agents in queue
    this.updateBlockedAgents();

    // Check budget warnings
    const budgetStatus = this.getBudgetStatus();
    if (budgetStatus.warning) {
      this.emit('budget_warning', {
        event: 'budget_warning',
        timestamp: new Date().toISOString(),
        budget_status: budgetStatus,
      });
    }
    if (budgetStatus.exhausted) {
      this.emit('budget_exhausted', {
        event: 'budget_exhausted',
        timestamp: new Date().toISOString(),
        budget_status: budgetStatus,
      });
    }
  }

  private handleChaining(completed: CompletedAgent): void {
    if (!completed.spec.chain_to) {
      return;
    }

    // Create chained agent spec
    const chainedSpec: AgentSpec = {
      id: `${completed.id}_chained_${Date.now()}`,
      type: completed.spec.chain_to,
      task: `Continue from ${completed.id}`,
      context_injection: {
        previous_agent: completed.id,
        previous_result: completed.result,
      },
    };

    // Enqueue the chained agent
    this.enqueue(chainedSpec);

    // Update completed record
    completed.chained_to = chainedSpec.id;
  }

  private updateBlockedAgents(): void {
    for (const queued of this.state.queued) {
      queued.blocked_by = this.getBlockingAgents(queued.spec);
    }
  }

  // -------------------------------------------------------------------------
  // Cancellation
  // -------------------------------------------------------------------------

  cancel(id: string): boolean {
    // Check if agent is active
    const active = this.state.active.get(id);
    if (active) {
      this.recordCompletion(id, {
        status: 'cancelled',
        tokens_used: active.tokens_used,
        turns_used: active.turns_used,
        error: 'Agent was cancelled',
      });
      return true;
    }

    // Check if agent is queued
    return this.dequeue(id);
  }

  cancelAll(): void {
    // Cancel all active agents
    for (const agent of this.state.active.values()) {
      this.recordCompletion(agent.id, {
        status: 'cancelled',
        tokens_used: agent.tokens_used,
        turns_used: agent.turns_used,
        error: 'Agent was cancelled during shutdown',
      });
    }

    // Clear queue
    this.state.queued = [];
  }

  // -------------------------------------------------------------------------
  // Event Handling
  // -------------------------------------------------------------------------

  on(event: AgentPoolEvent, handler: AgentPoolEventHandler): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
  }

  off(event: AgentPoolEvent, handler: AgentPoolEventHandler): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  private emit(event: AgentPoolEvent, data: AgentPoolEventData): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(event, data);
        } catch (error) {
          console.error(`Error in event handler for ${event}:`, error);
        }
      }
    }
  }
}

// ============================================================================
// AGENT LIFECYCLE IMPLEMENTATION
// ============================================================================

/**
 * Agent lifecycle manager implementation
 * Handles spawn, monitor, and complete operations
 */
export class AgentLifecycleManagerImpl implements AgentLifecycleManager {
  public pool: AgentPool;
  private eventHandlers: Map<AgentLifecycleEvent, Set<AgentLifecycleHandler>>;
  private initialized: boolean = false;

  constructor(pool: AgentPool) {
    this.pool = pool;
    this.eventHandlers = new Map();
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }
    this.initialized = true;
  }

  async shutdown(): Promise<void> {
    await this.waitForAll();
    this.initialized = false;
  }

  // -------------------------------------------------------------------------
  // Spawn Operations
  // -------------------------------------------------------------------------

  async spawn(spec: AgentSpec): Promise<SpawnResult> {
    // Check budget first
    if (!this.pool.hasBudget(spec)) {
      return {
        success: false,
        error: 'Insufficient budget to spawn agent',
      };
    }

    // Check if can spawn immediately
    if (this.pool.canSpawn(spec)) {
      // Spawn directly
      this.pool.enqueue(spec);
      const poolManager = this.pool as AgentPoolManager;
      const agent = await poolManager.spawnNext();

      if (agent) {
        this.emitLifecycle('spawned', agent);
        return {
          success: true,
          agent_id: agent.id,
          queued: false,
        };
      }
    }

    // Queue the agent
    const agent_id = this.pool.enqueue(spec);
    const queue = this.pool.getQueue();
    const position = queue.findIndex((q) => q.spec.id === agent_id);

    this.emitLifecycle('queued', {
      id: agent_id,
      spec,
      started_at: new Date().toISOString(),
      tokens_used: 0,
      turns_used: 0,
      status: 'running',
      last_activity: new Date().toISOString(),
    });

    return {
      success: true,
      agent_id,
      queued: true,
      queue_position: position,
      blocked_by: spec.depends_on,
    };
  }

  async spawnBatch(specs: AgentSpec[]): Promise<SpawnResult[]> {
    const results: SpawnResult[] = [];

    for (const spec of specs) {
      const result = await this.spawn(spec);
      results.push(result);
    }

    return results;
  }

  // -------------------------------------------------------------------------
  // Monitoring
  // -------------------------------------------------------------------------

  monitor(agent_id: string): MonitorResult {
    const active = this.pool.state.active.get(agent_id);

    if (!active) {
      return {
        agent_id,
        status: 'not_found',
        tokens_used: 0,
        turns_used: 0,
        budget_percent: 0,
        health: 'healthy',
      };
    }

    const budget = active.spec.budget ?? this.pool.config.default_budget;
    const max_tokens = budget.max_tokens ?? 100000;
    const budget_percent =
      (active.tokens_used / max_tokens) * 100;

    // Assess health
    let health: 'healthy' | 'slow' | 'stuck' | 'over_budget' = 'healthy';
    if (budget_percent > 100) {
      health = 'over_budget';
    } else {
      const lastActivityMs =
        Date.now() - new Date(active.last_activity).getTime();
      if (lastActivityMs > 120000) {
        health = 'stuck';
      } else if (lastActivityMs > 60000) {
        health = 'slow';
      }
    }

    return {
      agent_id,
      status: active.status,
      tokens_used: active.tokens_used,
      turns_used: active.turns_used,
      budget_percent,
      health,
    };
  }

  monitorAll(): MonitorResult[] {
    const results: MonitorResult[] = [];
    for (const agent of this.pool.state.active.values()) {
      results.push(this.monitor(agent.id));
    }
    return results;
  }

  // -------------------------------------------------------------------------
  // Completion
  // -------------------------------------------------------------------------

  complete(agent_id: string, result?: unknown, error?: string): CompletionResult {
    const active = this.pool.state.active.get(agent_id);

    if (!active) {
      return {
        agent_id,
        success: false,
        status: 'failed',
        error: 'Agent not found',
        tokens_used: 0,
        turns_used: 0,
        duration_ms: 0,
      };
    }

    const status = error ? 'failed' : 'success';
    const duration_ms = Date.now() - new Date(active.started_at).getTime();

    const poolManager = this.pool as AgentPoolManager;
    poolManager.recordCompletion(agent_id, {
      status,
      tokens_used: active.tokens_used,
      turns_used: active.turns_used,
      result,
      error,
    });

    // Get completed agent for chaining info
    const completed = this.pool.state.completed.find((c) => c.id === agent_id);

    const completionResult: CompletionResult = {
      agent_id,
      success: status === 'success',
      status,
      result,
      error,
      tokens_used: active.tokens_used,
      turns_used: active.turns_used,
      duration_ms,
      chained_agent: completed?.chained_to,
    };

    this.emitLifecycle('completed', completed!);

    // Process queue after completion
    this.processQueue();

    return completionResult;
  }

  cancel(agent_id: string, reason?: string): CompletionResult {
    const active = this.pool.state.active.get(agent_id);

    if (!active) {
      return {
        agent_id,
        success: false,
        status: 'cancelled',
        error: 'Agent not found',
        tokens_used: 0,
        turns_used: 0,
        duration_ms: 0,
      };
    }

    const duration_ms = Date.now() - new Date(active.started_at).getTime();

    const poolManager = this.pool as AgentPoolManager;
    poolManager.recordCompletion(agent_id, {
      status: 'cancelled',
      tokens_used: active.tokens_used,
      turns_used: active.turns_used,
      error: reason ?? 'Agent was cancelled',
    });

    const completed = this.pool.state.completed.find((c) => c.id === agent_id);
    this.emitLifecycle('cancelled', completed!);

    return {
      agent_id,
      success: false,
      status: 'cancelled',
      error: reason ?? 'Agent was cancelled',
      tokens_used: active.tokens_used,
      turns_used: active.turns_used,
      duration_ms,
    };
  }

  timeout(agent_id: string): CompletionResult {
    const active = this.pool.state.active.get(agent_id);

    if (!active) {
      return {
        agent_id,
        success: false,
        status: 'timeout',
        error: 'Agent not found',
        tokens_used: 0,
        turns_used: 0,
        duration_ms: 0,
      };
    }

    const duration_ms = Date.now() - new Date(active.started_at).getTime();

    const poolManager = this.pool as AgentPoolManager;
    poolManager.recordCompletion(agent_id, {
      status: 'timeout',
      tokens_used: active.tokens_used,
      turns_used: active.turns_used,
      error: 'Agent exceeded time or budget limit',
    });

    const completed = this.pool.state.completed.find((c) => c.id === agent_id);
    this.emitLifecycle('timeout', completed!);

    return {
      agent_id,
      success: false,
      status: 'timeout',
      error: 'Agent exceeded time or budget limit',
      tokens_used: active.tokens_used,
      turns_used: active.turns_used,
      duration_ms,
    };
  }

  // -------------------------------------------------------------------------
  // Queue Processing
  // -------------------------------------------------------------------------

  async processQueue(): Promise<SpawnResult[]> {
    const results: SpawnResult[] = [];
    const poolManager = this.pool as AgentPoolManager;

    while (this.pool.hasCapacity() && this.pool.state.queued.length > 0) {
      const agent = await poolManager.spawnNext();
      if (!agent) {
        break;
      }

      this.emitLifecycle('spawned', agent);
      results.push({
        success: true,
        agent_id: agent.id,
        queued: false,
      });
    }

    return results;
  }

  // -------------------------------------------------------------------------
  // Chaining
  // -------------------------------------------------------------------------

  async handleChaining(completed: CompletedAgent): Promise<SpawnResult | null> {
    if (!completed.spec.chain_to) {
      return null;
    }

    const chainedSpec: AgentSpec = {
      id: `${completed.id}_chain`,
      type: completed.spec.chain_to,
      task: `Continue from ${completed.id}`,
      context_injection: {
        previous_result: completed.result,
      },
    };

    return this.spawn(chainedSpec);
  }

  // -------------------------------------------------------------------------
  // Event Handling
  // -------------------------------------------------------------------------

  on(event: AgentLifecycleEvent, handler: AgentLifecycleHandler): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
  }

  off(event: AgentLifecycleEvent, handler: AgentLifecycleHandler): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  private emitLifecycle(
    event: AgentLifecycleEvent,
    agent: ActiveAgent | CompletedAgent,
    data?: unknown
  ): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(event, agent, data);
        } catch (error) {
          console.error(`Error in lifecycle event handler for ${event}:`, error);
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Bulk Operations
  // -------------------------------------------------------------------------

  cancelAll(reason?: string): CompletionResult[] {
    const results: CompletionResult[] = [];

    // Cancel all active agents
    for (const agent of this.pool.state.active.values()) {
      results.push(this.cancel(agent.id, reason));
    }

    // Clear queue
    const poolManager = this.pool as AgentPoolManager;
    poolManager.cancelAll();

    return results;
  }

  async waitForAll(): Promise<CompletionResult[]> {
    const results: CompletionResult[] = [];

    while (this.pool.state.active.size > 0) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return results;
  }

  async waitForAny(): Promise<CompletionResult> {
    while (this.pool.state.active.size > 0) {
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Check if any agent completed
      if (this.pool.state.completed.length > 0) {
        const latest = this.pool.state.completed[this.pool.state.completed.length - 1];
        if (latest) {
          return {
            agent_id: latest.id,
            success: latest.status === 'success',
            status: latest.status === 'success' ? 'success' : 'failed',
            result: latest.result,
            error: latest.error,
            tokens_used: latest.tokens_used,
            turns_used: latest.turns_used,
            duration_ms: Date.now() - new Date(latest.started_at).getTime(),
          };
        }
      }
    }

    throw new Error('No agents active');
  }

  // -------------------------------------------------------------------------
  // Health Checks
  // -------------------------------------------------------------------------

  checkHealth(): HealthReport {
    const results = this.monitorAll();
    const issues: HealthIssue[] = [];

    let healthy_count = 0;
    let slow_count = 0;
    let stuck_count = 0;
    let over_budget_count = 0;

    for (const result of results) {
      switch (result.health) {
        case 'healthy':
          healthy_count++;
          break;
        case 'slow':
          slow_count++;
          issues.push({
            agent_id: result.agent_id,
            type: 'slow',
            message: `Agent ${result.agent_id} is running slowly`,
            detected_at: new Date().toISOString(),
          });
          break;
        case 'stuck':
          stuck_count++;
          issues.push({
            agent_id: result.agent_id,
            type: 'stuck',
            message: `Agent ${result.agent_id} appears stuck`,
            detected_at: new Date().toISOString(),
          });
          break;
        case 'over_budget':
          over_budget_count++;
          issues.push({
            agent_id: result.agent_id,
            type: 'over_budget',
            message: `Agent ${result.agent_id} has exceeded budget`,
            detected_at: new Date().toISOString(),
          });
          break;
      }
    }

    return {
      healthy_count,
      slow_count,
      stuck_count,
      over_budget_count,
      total_active: this.pool.state.active.size,
      issues,
    };
  }

  getStuckAgents(): ActiveAgent[] {
    const stuck: ActiveAgent[] = [];
    const now = Date.now();

    for (const agent of this.pool.state.active.values()) {
      const lastActivityMs = now - new Date(agent.last_activity).getTime();
      if (lastActivityMs > 120000) {
        stuck.push(agent);
      }
    }

    return stuck;
  }

  getOverBudgetAgents(): ActiveAgent[] {
    const overBudget: ActiveAgent[] = [];

    for (const agent of this.pool.state.active.values()) {
      const budget = agent.spec.budget ?? this.pool.config.default_budget;
      const max_tokens = budget.max_tokens ?? 100000;
      if (agent.tokens_used > max_tokens) {
        overBudget.push(agent);
      }
    }

    return overBudget;
  }
}

// ============================================================================
// AGENT COMMUNICATION IMPLEMENTATION
// ============================================================================

/**
 * Agent communication manager implementation
 * Handles inter-agent messaging and result sharing
 */
export class AgentCommunicationManagerImpl implements AgentCommunicationManager {
  private sharedResults: Map<string, SharedResult[]> = new Map();
  private messages: Map<string, AgentMessage[]> = new Map();
  private broadcasts: BroadcastMessage[] = [];
  private pendingRequests: Map<string, AgentRequest> = new Map();
  private messageHistory: Map<string, AgentMessage[]> = new Map();
  private config: SharingConfig;
  private stats: CommunicationStats = {
    messages_sent: 0,
    messages_received: 0,
    broadcasts_sent: 0,
    results_shared: 0,
    requests_sent: 0,
    requests_completed: 0,
    requests_timed_out: 0,
    avg_response_time_ms: 0,
  };

  constructor(config?: Partial<SharingConfig>) {
    this.config = {
      auto_share_on_complete: config?.auto_share_on_complete ?? true,
      result_ttl_ms: config?.result_ttl_ms ?? 3600000,
      max_results_per_agent: config?.max_results_per_agent ?? 10,
    };
  }

  // -------------------------------------------------------------------------
  // Result Sharing
  // -------------------------------------------------------------------------

  shareResults(
    from: string,
    to: string,
    data: unknown,
    key?: string
  ): SharedResult {
    const result: SharedResult = {
      from_agent: from,
      to_agent: to,
      result_key: key ?? `result_${Date.now()}`,
      data,
      shared_at: new Date().toISOString(),
      expires_at: new Date(
        Date.now() + this.config.result_ttl_ms
      ).toISOString(),
    };

    if (!this.sharedResults.has(to)) {
      this.sharedResults.set(to, []);
    }

    const results = this.sharedResults.get(to)!;
    results.push(result);

    // Enforce max results limit
    if (results.length > this.config.max_results_per_agent) {
      results.shift();
    }

    this.stats.results_shared++;

    return result;
  }

  getSharedResults(agent_id: string): SharedResult[] {
    return this.sharedResults.get(agent_id) ?? [];
  }

  // -------------------------------------------------------------------------
  // Broadcasting
  // -------------------------------------------------------------------------

  broadcast(
    from: string,
    message: string,
    data?: unknown,
    priority?: MessagePriority
  ): BroadcastMessage {
    const broadcast: BroadcastMessage = {
      id: `broadcast_${Date.now()}`,
      from,
      message,
      data,
      priority: priority ?? 'normal',
      sent_at: new Date().toISOString(),
      received_by: [],
    };

    this.broadcasts.push(broadcast);
    this.stats.broadcasts_sent++;

    return broadcast;
  }

  // -------------------------------------------------------------------------
  // Request/Response
  // -------------------------------------------------------------------------

  async request(
    from: string,
    to: string,
    type: RequestType,
    data?: unknown,
    timeout_ms: number = 30000
  ): Promise<AgentResponse> {
    const request: AgentRequest = {
      id: `request_${Date.now()}`,
      type,
      from,
      to,
      data,
      timeout_ms,
      sent_at: new Date().toISOString(),
    };

    this.pendingRequests.set(request.id, request);
    this.stats.requests_sent++;

    // Wait for response with timeout
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(request.id);
        this.stats.requests_timed_out++;
        reject(new Error(`Request ${request.id} timed out`));
      }, timeout_ms);

      // In a real implementation, this would wait for an actual response
      // For now, we'll simulate a timeout
      timer.unref();
    });
  }

  respond(
    request: AgentRequest,
    success: boolean,
    data?: unknown,
    error?: string
  ): AgentResponse {
    const response: AgentResponse = {
      request_id: request.id,
      from: request.to,
      to: request.from,
      success,
      data,
      error,
      responded_at: new Date().toISOString(),
    };

    this.pendingRequests.delete(request.id);
    this.stats.requests_completed++;

    return response;
  }

  // -------------------------------------------------------------------------
  // Messaging
  // -------------------------------------------------------------------------

  send(message: AgentMessage): void {
    const target = message.to;

    if (target === 'all') {
      // Broadcast to all agents
      // In a real implementation, this would send to all active agents
      this.stats.messages_sent++;
      return;
    }

    if (!this.messages.has(target)) {
      this.messages.set(target, []);
    }

    this.messages.get(target)!.push(message);
    this.stats.messages_sent++;

    // Store in history
    if (!this.messageHistory.has(message.from)) {
      this.messageHistory.set(message.from, []);
    }
    this.messageHistory.get(message.from)!.push(message);
  }

  receive(agent_id: string): AgentMessage[] {
    const messages = this.messages.get(agent_id) ?? [];
    this.messages.set(agent_id, []);
    this.stats.messages_received += messages.length;
    return messages;
  }

  peek(agent_id: string): AgentMessage | undefined {
    const messages = this.messages.get(agent_id);
    return messages && messages.length > 0 ? messages[0] : undefined;
  }

  // -------------------------------------------------------------------------
  // Waiting
  // -------------------------------------------------------------------------

  async waitForAgent(
    agent_id: string,
    timeout_ms?: number
  ): Promise<StateCompletedAgent> {
    // This would be implemented using the agent pool's state
    throw new Error('Not implemented - requires agent pool integration');
  }

  async waitForAnyOf(
    agent_ids: string[],
    timeout_ms?: number
  ): Promise<StateCompletedAgent> {
    // This would be implemented using the agent pool's state
    throw new Error('Not implemented - requires agent pool integration');
  }

  // -------------------------------------------------------------------------
  // History and Stats
  // -------------------------------------------------------------------------

  getMessageHistory(agent_id: string): AgentMessage[] {
    return this.messageHistory.get(agent_id) ?? [];
  }

  getSharedResultHistory(): SharedResult[] {
    const all: SharedResult[] = [];
    for (const results of this.sharedResults.values()) {
      all.push(...results);
    }
    return all;
  }

  getBroadcastHistory(): BroadcastMessage[] {
    return [...this.broadcasts];
  }

  getPendingRequests(agent_id: string): AgentRequest[] {
    const pending: AgentRequest[] = [];
    for (const request of this.pendingRequests.values()) {
      if (request.to === agent_id) {
        pending.push(request);
      }
    }
    return pending;
  }

  cancelRequest(request_id: string): boolean {
    return this.pendingRequests.delete(request_id);
  }

  clearMessages(agent_id: string): void {
    this.messages.delete(agent_id);
    this.messageHistory.delete(agent_id);
  }

  clearExpiredResults(): number {
    let cleared = 0;
    const now = Date.now();

    for (const [agent_id, results] of this.sharedResults.entries()) {
      const filtered = results.filter((r) => {
        if (!r.expires_at) return true;
        const expired = new Date(r.expires_at).getTime() < now;
        if (expired) cleared++;
        return !expired;
      });
      this.sharedResults.set(agent_id, filtered);
    }

    return cleared;
  }

  getStats(): CommunicationStats {
    return { ...this.stats };
  }
}

// ============================================================================
// DEPENDENCY RESOLVER IMPLEMENTATION
// ============================================================================

/**
 * Dependency resolver implementation
 * Builds graphs and creates execution plans
 */
export class DependencyResolverImpl implements DependencyManager {
  public currentGraph: DependencyGraph;
  public currentPlan: ExecutionPlan | null = null;

  constructor() {
    this.currentGraph = this.createEmptyGraph();
  }

  private createEmptyGraph(): DependencyGraph {
    return {
      nodes: new Map(),
      roots: [],
      leaves: [],
      max_depth: 0,
    };
  }

  // -------------------------------------------------------------------------
  // Graph Building
  // -------------------------------------------------------------------------

  buildGraph(specs: AgentSpec[]): DependencyGraph {
    const graph = this.createEmptyGraph();

    // Create nodes
    for (const spec of specs) {
      const node: DependencyNode = {
        agent_id: spec.id,
        spec,
        dependencies: (spec.depends_on ?? []).map((id) => ({
          agent_id: id,
          type: 'hard',
          required_status: 'success',
        })),
        dependents: [],
        status: 'pending',
        depth: 0,
      };
      graph.nodes.set(spec.id, node);
    }

    // Build dependent relationships
    for (const node of graph.nodes.values()) {
      for (const dep of node.dependencies) {
        const depNode = graph.nodes.get(dep.agent_id);
        if (depNode) {
          depNode.dependents.push(node.agent_id);
        }
      }
    }

    // Calculate depths
    this.calculateDepths(graph);

    // Find roots and leaves
    graph.roots = this.findRoots(graph);
    graph.leaves = this.findLeaves(graph);

    this.currentGraph = graph;
    return graph;
  }

  private calculateDepths(graph: DependencyGraph): void {
    const visited = new Set<string>();

    const visit = (nodeId: string, depth: number): number => {
      if (visited.has(nodeId)) {
        const node = graph.nodes.get(nodeId)!;
        return node.depth;
      }

      visited.add(nodeId);
      const node = graph.nodes.get(nodeId)!;

      let maxDepth = depth;
      for (const dep of node.dependencies) {
        const depDepth = visit(dep.agent_id, depth + 1);
        maxDepth = Math.max(maxDepth, depDepth);
      }

      node.depth = maxDepth;
      graph.max_depth = Math.max(graph.max_depth, maxDepth);
      return maxDepth;
    };

    for (const nodeId of graph.nodes.keys()) {
      visit(nodeId, 0);
    }
  }

  addNode(graph: DependencyGraph, spec: AgentSpec): void {
    const node: DependencyNode = {
      agent_id: spec.id,
      spec,
      dependencies: (spec.depends_on ?? []).map((id) => ({
        agent_id: id,
        type: 'hard',
        required_status: 'success',
      })),
      dependents: [],
      status: 'pending',
      depth: 0,
    };

    graph.nodes.set(spec.id, node);

    // Update dependents
    for (const dep of node.dependencies) {
      const depNode = graph.nodes.get(dep.agent_id);
      if (depNode) {
        depNode.dependents.push(spec.id);
      }
    }

    this.calculateDepths(graph);
  }

  removeNode(graph: DependencyGraph, agent_id: string): void {
    const node = graph.nodes.get(agent_id);
    if (!node) return;

    // Remove from dependents
    for (const dep of node.dependencies) {
      const depNode = graph.nodes.get(dep.agent_id);
      if (depNode) {
        depNode.dependents = depNode.dependents.filter((id) => id !== agent_id);
      }
    }

    graph.nodes.delete(agent_id);
    this.calculateDepths(graph);
  }

  // -------------------------------------------------------------------------
  // Analysis
  // -------------------------------------------------------------------------

  checkCycles(graph: DependencyGraph): CycleCheckResult {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    let cycle: string[] | undefined;

    const visit = (nodeId: string, path: string[]): boolean => {
      if (recursionStack.has(nodeId)) {
        // Found cycle
        const cycleStart = path.indexOf(nodeId);
        cycle = path.slice(cycleStart);
        return true;
      }

      if (visited.has(nodeId)) {
        return false;
      }

      visited.add(nodeId);
      recursionStack.add(nodeId);
      path.push(nodeId);

      const node = graph.nodes.get(nodeId);
      if (node) {
        for (const dep of node.dependencies) {
          if (visit(dep.agent_id, [...path])) {
            return true;
          }
        }
      }

      recursionStack.delete(nodeId);
      return false;
    };

    for (const nodeId of graph.nodes.keys()) {
      if (visit(nodeId, [])) {
        const edges = cycle!.map((id, i) => {
          const nextId = cycle![i + 1];
          const firstId = cycle![0];
          if (!firstId) {
            throw new Error('Cycle is empty');
          }
          return {
            from: id,
            to: nextId !== undefined ? nextId : firstId,
          };
        });

        return {
          has_cycle: true,
          cycle,
          problematic_edges: edges,
        };
      }
    }

    return { has_cycle: false };
  }

  findRoots(graph: DependencyGraph): string[] {
    const roots: string[] = [];
    for (const [id, node] of graph.nodes) {
      if (node.dependencies.length === 0) {
        roots.push(id);
      }
    }
    return roots;
  }

  findLeaves(graph: DependencyGraph): string[] {
    const leaves: string[] = [];
    for (const [id, node] of graph.nodes) {
      if (node.dependents.length === 0) {
        leaves.push(id);
      }
    }
    return leaves;
  }

  getDepth(graph: DependencyGraph, agent_id: string): number {
    const node = graph.nodes.get(agent_id);
    return node?.depth ?? 0;
  }

  // -------------------------------------------------------------------------
  // Resolution
  // -------------------------------------------------------------------------

  resolve(specs: AgentSpec[]): ResolutionResult {
    const graph = this.buildGraph(specs);

    // Check for cycles
    const cycleCheck = this.checkCycles(graph);
    if (cycleCheck.has_cycle) {
      return {
        success: false,
        errors: [
          `Circular dependency detected: ${cycleCheck.cycle?.join(' -> ')}`,
        ],
        unresolvable: cycleCheck.cycle,
      };
    }

    // Perform topological sort
    const sorted = this.topologicalSort(graph);

    // Group into phases
    const phases = this.groupByPhase(sorted, graph);

    // Calculate critical path
    const critical_path = this.calculateCriticalPath(graph);

    // Create execution plan
    const plan: ExecutionPlan = {
      id: `plan_${Date.now()}`,
      phases,
      max_parallelism: Math.max(...phases.map((p) => p.agents.length), 0),
      critical_path,
      critical_path_ms: critical_path.length * 300000, // Estimate based on max duration
      total_agents: specs.length,
      created_at: new Date().toISOString(),
    };

    this.currentPlan = plan;

    return {
      success: true,
      plan,
      warnings: [],
    };
  }

  topologicalSort(graph: DependencyGraph): string[] {
    const sorted: string[] = [];
    const visited = new Set<string>();

    const visit = (nodeId: string): void => {
      if (visited.has(nodeId)) return;

      visited.add(nodeId);
      const node = graph.nodes.get(nodeId);

      if (node) {
        // Visit dependencies first
        for (const dep of node.dependencies) {
          visit(dep.agent_id);
        }
      }

      sorted.push(nodeId);
    };

    // Visit all nodes
    for (const nodeId of graph.nodes.keys()) {
      visit(nodeId);
    }

    return sorted;
  }

  groupByPhase(sorted: string[], graph: DependencyGraph): ExecutionPhase[] {
    const phases: ExecutionPhase[] = [];
    const processed = new Set<string>();

    let phaseNumber = 0;
    while (processed.size < sorted.length) {
      const phase: ExecutionPhase = {
        phase_number: phaseNumber,
        agents: [],
        dependencies_met: true,
        estimated_tokens: 0,
      };

      // Find agents whose dependencies are all processed
      for (const agentId of sorted) {
        if (processed.has(agentId)) continue;

        const node = graph.nodes.get(agentId)!;
        const depsMet = node.dependencies.every((dep) =>
          processed.has(dep.agent_id)
        );

        if (depsMet) {
          phase.agents.push(agentId);
          processed.add(agentId);

          // Estimate tokens
          const budget = node.spec.budget?.max_tokens ?? 100000;
          phase.estimated_tokens += budget;
        }
      }

      if (phase.agents.length === 0) {
        break; // No more agents can be processed
      }

      phases.push(phase);
      phaseNumber++;
    }

    return phases;
  }

  calculateCriticalPath(graph: DependencyGraph): string[] {
    // Find the longest path through the graph
    const memo = new Map<string, string[]>();

    const findLongestPath = (nodeId: string): string[] => {
      if (memo.has(nodeId)) {
        return memo.get(nodeId)!;
      }

      const node = graph.nodes.get(nodeId);
      if (!node || node.dependents.length === 0) {
        return [nodeId];
      }

      let longestPath: string[] = [nodeId];
      for (const depId of node.dependents) {
        const path = [nodeId, ...findLongestPath(depId)];
        if (path.length > longestPath.length) {
          longestPath = path;
        }
      }

      memo.set(nodeId, longestPath);
      return longestPath;
    };

    // Start from roots
    let criticalPath: string[] = [];
    for (const rootId of graph.roots) {
      const path = findLongestPath(rootId);
      if (path.length > criticalPath.length) {
        criticalPath = path;
      }
    }

    return criticalPath;
  }

  // -------------------------------------------------------------------------
  // Runtime Updates
  // -------------------------------------------------------------------------

  markCompleted(agent_id: string, success: boolean): string[] {
    const node = this.currentGraph.nodes.get(agent_id);
    if (!node) return [];

    node.status = success ? 'completed' : 'failed';

    // Find agents that are now ready
    const ready: string[] = [];
    for (const depId of node.dependents) {
      const depNode = this.currentGraph.nodes.get(depId);
      if (!depNode) continue;

      // Check if all dependencies are met
      const allMet = depNode.dependencies.every((dep) => {
        const depNode = this.currentGraph.nodes.get(dep.agent_id);
        return depNode?.status === 'completed';
      });

      if (allMet && depNode.status === 'pending') {
        depNode.status = 'ready';
        ready.push(depId);
      }
    }

    return ready;
  }

  markFailed(agent_id: string): string[] {
    const node = this.currentGraph.nodes.get(agent_id);
    if (!node) return [];

    node.status = 'failed';

    // Mark all dependents as blocked
    const affected: string[] = [];
    const markBlocked = (nodeId: string): void => {
      const node = this.currentGraph.nodes.get(nodeId);
      if (!node || node.status === 'blocked') return;

      node.status = 'blocked';
      affected.push(nodeId);

      for (const depId of node.dependents) {
        markBlocked(depId);
      }
    };

    for (const depId of node.dependents) {
      markBlocked(depId);
    }

    return affected;
  }

  getReady(): string[] {
    const ready: string[] = [];
    for (const [id, node] of this.currentGraph.nodes) {
      if (node.status === 'ready') {
        ready.push(id);
      }
    }
    return ready;
  }

  getBlocked(): string[] {
    const blocked: string[] = [];
    for (const [id, node] of this.currentGraph.nodes) {
      if (node.status === 'blocked') {
        blocked.push(id);
      }
    }
    return blocked;
  }

  // -------------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------------

  getDependencies(agent_id: string): AgentDependency[] {
    const node = this.currentGraph.nodes.get(agent_id);
    return node?.dependencies ?? [];
  }

  getDependents(agent_id: string): string[] {
    const node = this.currentGraph.nodes.get(agent_id);
    return node?.dependents ?? [];
  }

  isReady(agent_id: string): boolean {
    const node = this.currentGraph.nodes.get(agent_id);
    return node?.status === 'ready';
  }

  isBlocked(agent_id: string): boolean {
    const node = this.currentGraph.nodes.get(agent_id);
    return node?.status === 'blocked';
  }

  getBlockers(agent_id: string): string[] {
    const node = this.currentGraph.nodes.get(agent_id);
    if (!node) return [];

    const blockers: string[] = [];
    for (const dep of node.dependencies) {
      const depNode = this.currentGraph.nodes.get(dep.agent_id);
      if (depNode && depNode.status !== 'completed') {
        blockers.push(dep.agent_id);
      }
    }

    return blockers;
  }

  // -------------------------------------------------------------------------
  // Plan Adjustments
  // -------------------------------------------------------------------------

  replan(): ResolutionResult {
    const specs = Array.from(this.currentGraph.nodes.values()).map(
      (node) => node.spec
    );
    return this.resolve(specs);
  }

  addDependency(from: string, to: string, type?: DependencyType): boolean {
    const fromNode = this.currentGraph.nodes.get(from);
    const toNode = this.currentGraph.nodes.get(to);

    if (!fromNode || !toNode) return false;

    const dep: AgentDependency = {
      agent_id: to,
      type: type ?? 'hard',
      required_status: 'success',
    };

    fromNode.dependencies.push(dep);
    toNode.dependents.push(from);

    this.calculateDepths(this.currentGraph);
    return true;
  }

  removeDependency(from: string, to: string): boolean {
    const fromNode = this.currentGraph.nodes.get(from);
    const toNode = this.currentGraph.nodes.get(to);

    if (!fromNode || !toNode) return false;

    fromNode.dependencies = fromNode.dependencies.filter(
      (dep) => dep.agent_id !== to
    );
    toNode.dependents = toNode.dependents.filter((id) => id !== from);

    this.calculateDepths(this.currentGraph);
    return true;
  }
}

// ============================================================================
// SINGLETON FACTORY FUNCTIONS
// ============================================================================

let globalAgentPool: AgentPoolManager | null = null;
let globalLifecycleManager: AgentLifecycleManager | null = null;
let globalCommunicationManager: AgentCommunicationManager | null = null;
let globalDependencyManager: DependencyManager | null = null;

/**
 * Get the global agent pool instance (singleton)
 */
export function getAgentPool(config?: Partial<AgentPoolConfig>): AgentPoolManager {
  if (!globalAgentPool) {
    globalAgentPool = new AgentPoolImpl(config);
  }
  return globalAgentPool;
}

/**
 * Get the global lifecycle manager instance (singleton)
 */
export function getLifecycleManager(pool?: AgentPool): AgentLifecycleManager {
  if (!globalLifecycleManager) {
    const agentPool = pool ?? getAgentPool();
    globalLifecycleManager = new AgentLifecycleManagerImpl(agentPool);
  }
  return globalLifecycleManager;
}

/**
 * Get the global communication manager instance (singleton)
 */
export function getCommunicationManager(
  config?: Partial<SharingConfig>
): AgentCommunicationManager {
  if (!globalCommunicationManager) {
    globalCommunicationManager = new AgentCommunicationManagerImpl(config);
  }
  return globalCommunicationManager;
}

/**
 * Get the global dependency manager instance (singleton)
 */
export function getDependencyManager(): DependencyManager {
  if (!globalDependencyManager) {
    globalDependencyManager = new DependencyResolverImpl();
  }
  return globalDependencyManager;
}

/**
 * Reset all global instances (useful for testing)
 */
export function resetAgentCoordination(): void {
  globalAgentPool = null;
  globalLifecycleManager = null;
  globalCommunicationManager = null;
  globalDependencyManager = null;
}

/**
 * Create a new agent pool instance
 */
export function createAgentPool(config?: Partial<AgentPoolConfig>): AgentPoolManager {
  return new AgentPoolImpl(config);
}

/**
 * Create a new lifecycle manager instance
 */
export function createLifecycleManager(pool: AgentPool): AgentLifecycleManager {
  return new AgentLifecycleManagerImpl(pool);
}

/**
 * Create a new communication manager instance
 */
export function createCommunicationManager(
  config?: Partial<SharingConfig>
): AgentCommunicationManager {
  return new AgentCommunicationManagerImpl(config);
}

/**
 * Create a new dependency manager instance
 */
export function createDependencyManager(): DependencyManager {
  return new DependencyResolverImpl();
}
