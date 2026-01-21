/**
 * Agent Pool interfaces for Batch Engine
 * @see SPEC-v2 Section 12.1
 */

/**
 * Queue strategy for processing agents
 * - fifo: First-in, first-out processing
 * - priority: Higher priority agents processed first
 * - dependency: Process based on dependency resolution
 */
export type QueueStrategy = 'fifo' | 'priority' | 'dependency';

/**
 * Model selection for agent execution
 * - haiku: Fast, lightweight model for simple tasks
 * - sonnet: Balanced model for general tasks
 * - opus: Most capable model for complex tasks
 */
export type AgentModel = 'haiku' | 'sonnet' | 'opus';

/**
 * Status of an active agent
 * - running: Agent is actively executing
 * - waiting_input: Agent is waiting for external input
 * - completing: Agent is finishing up
 */
export type ActiveAgentStatus = 'running' | 'waiting_input' | 'completing';

/**
 * Completion status of an agent
 * - success: Agent completed successfully
 * - failed: Agent failed with an error
 * - timeout: Agent exceeded time budget
 * - cancelled: Agent was manually cancelled
 */
export type CompletedAgentStatus = 'success' | 'failed' | 'timeout' | 'cancelled';

/**
 * Budget constraints for a single agent
 */
export interface AgentBudget {
  /** Maximum tokens the agent can consume (default: 100000) */
  max_tokens: number;

  /** Maximum API turns/interactions the agent can make (default: 50) */
  max_turns: number;

  /** Maximum execution time in milliseconds (default: 300000 = 5 minutes) */
  max_duration_ms: number;
}

/**
 * Budget constraints across all agents in the pool
 */
export interface TotalBudget {
  /** Maximum total tokens across all agents in the session */
  max_tokens: number;

  /** Maximum total number of agents that can be spawned */
  max_agents: number;

  /** Percentage threshold for budget warning (default: 80) */
  warn_at_percent: number;
}

/**
 * Configuration for the agent pool
 */
export interface AgentPoolConfig {
  /** Maximum number of agents running simultaneously (default: 6) */
  max_concurrent: number;

  /** Default budget applied to each agent */
  default_budget: AgentBudget;

  /** Overall budget limits for the pool */
  total_budget: TotalBudget;

  /** Strategy for processing the agent queue */
  queue_strategy: QueueStrategy;
}

/**
 * Specification for spawning a new agent
 */
export interface AgentSpec {
  /** Unique identifier for this agent */
  id: string;

  /** Agent type identifier (e.g., 'goodvibes:backend-engineer') */
  type: string;

  /** Task description/prompt for the agent */
  task: string;

  /** Model to use for execution (defaults to sonnet) */
  model?: AgentModel;

  /** Custom budget overrides (merged with default_budget) */
  budget?: Partial<AgentBudget>;

  /** Additional context to inject into the agent's session */
  context_injection?: Record<string, unknown>;

  /** IDs of agents that must complete before this one can start */
  depends_on?: string[];

  /** Agent type to automatically spawn when this agent completes */
  chain_to?: string;

  /** Priority level (higher values = more urgent, default: 0) */
  priority?: number;
}

/**
 * Agent that is queued and waiting to be spawned
 */
export interface QueuedAgent {
  /** The agent specification */
  spec: AgentSpec;

  /** Effective priority (from spec or default) */
  priority: number;

  /** ISO timestamp when the agent was queued */
  queued_at: string;

  /** IDs of agents this one depends on (from spec) */
  depends_on: string[];

  /** IDs of agents currently blocking this one from running */
  blocked_by: string[];
}

/**
 * Agent that is currently executing
 */
export interface ActiveAgent {
  /** Unique identifier for this agent */
  id: string;

  /** The original agent specification */
  spec: AgentSpec;

  /** ISO timestamp when execution started */
  started_at: string;

  /** Number of tokens consumed so far */
  tokens_used: number;

  /** Number of API turns used so far */
  turns_used: number;

  /** Current execution status */
  status: ActiveAgentStatus;

  /** ISO timestamp of last activity */
  last_activity: string;
}

/**
 * Record of a completed agent
 */
export interface CompletedAgent {
  /** Unique identifier for this agent */
  id: string;

  /** The original agent specification */
  spec: AgentSpec;

  /** ISO timestamp when execution started */
  started_at: string;

  /** ISO timestamp when execution completed */
  completed_at: string;

  /** Total tokens consumed */
  tokens_used: number;

  /** Total API turns used */
  turns_used: number;

  /** Final completion status */
  status: CompletedAgentStatus;

  /** Result data from the agent (if successful) */
  result?: unknown;

  /** Error message (if failed or timeout) */
  error?: string;

  /** ID of the agent spawned via chain_to (if any) */
  chained_to?: string;
}

/**
 * Current state of the agent pool
 */
export interface AgentPoolState {
  /** Map of currently active agents by ID */
  active: Map<string, ActiveAgent>;

  /** Queue of agents waiting to be spawned */
  queued: QueuedAgent[];

  /** History of completed agents */
  completed: CompletedAgent[];

  /** Total tokens used across all agents */
  tokens_used: number;

  /** Remaining token budget */
  tokens_remaining: number;

  /** Total number of agents spawned */
  agents_spawned: number;

  /** Remaining agent spawn budget */
  agents_remaining: number;
}

/**
 * Summary of budget utilization
 */
export interface BudgetStatus {
  /** Total tokens consumed */
  tokens_used: number;

  /** Remaining token budget */
  tokens_remaining: number;

  /** Percentage of token budget used */
  tokens_percent: number;

  /** Total agents spawned */
  agents_spawned: number;

  /** Remaining agent budget */
  agents_remaining: number;

  /** Percentage of agent budget used */
  agents_percent: number;

  /** Whether budget warning threshold has been reached */
  warning: boolean;

  /** Whether budget is completely exhausted */
  exhausted: boolean;
}

/**
 * Agent Pool interface
 * Manages agent queuing, execution capacity, and budget tracking
 */
export interface AgentPool {
  /** Pool configuration */
  config: AgentPoolConfig;

  /** Current pool state */
  state: AgentPoolState;

  // Queue management

  /**
   * Add an agent to the queue
   * @param spec - Agent specification
   * @returns The queued agent ID
   */
  enqueue(spec: AgentSpec): string;

  /**
   * Remove an agent from the queue
   * @param id - Agent ID to remove
   * @returns True if removed, false if not found
   */
  dequeue(id: string): boolean;

  /**
   * Get the current queue
   * @returns Array of queued agents
   */
  getQueue(): QueuedAgent[];

  // Capacity checks

  /**
   * Check if there is capacity to spawn more agents
   * @returns True if under max_concurrent limit
   */
  hasCapacity(): boolean;

  /**
   * Check if a specific agent can be spawned
   * Takes into account dependencies and capacity
   * @param spec - Agent specification to check
   * @returns True if agent can be spawned now
   */
  canSpawn(spec: AgentSpec): boolean;

  /**
   * Get the number of available execution slots
   * @returns Number of agents that can be spawned
   */
  getAvailableSlots(): number;

  // Budget checks

  /**
   * Check if there is budget to spawn an agent
   * @param spec - Agent specification to check
   * @returns True if within budget limits
   */
  hasBudget(spec: AgentSpec): boolean;

  /**
   * Estimate the token cost for an agent
   * @param spec - Agent specification
   * @returns Estimated token cost
   */
  estimateCost(spec: AgentSpec): number;

  /**
   * Get current budget utilization status
   * @returns Budget status summary
   */
  getBudgetStatus(): BudgetStatus;
}

/**
 * Event types emitted by the agent pool
 */
export type AgentPoolEvent =
  | 'agent_queued'
  | 'agent_started'
  | 'agent_completed'
  | 'agent_failed'
  | 'agent_timeout'
  | 'agent_cancelled'
  | 'budget_warning'
  | 'budget_exhausted'
  | 'queue_empty';

/**
 * Event handler function signature for agent pool events
 */
export interface AgentPoolEventHandler {
  (event: AgentPoolEvent, data: AgentPoolEventData): void;
}

/**
 * Data passed to agent pool event handlers
 */
export interface AgentPoolEventData {
  /** The event type that triggered this handler */
  event: AgentPoolEvent;

  /** ISO timestamp when the event occurred */
  timestamp: string;

  /** Agent ID (if applicable) */
  agent_id?: string;

  /** Agent specification (if applicable) */
  agent_spec?: AgentSpec;

  /** Completed agent record (for completion events) */
  completed_agent?: CompletedAgent;

  /** Current budget status (for budget events) */
  budget_status?: BudgetStatus;
}

/**
 * Full agent pool manager interface
 * Extends AgentPool with lifecycle management and event handling
 */
export interface AgentPoolManager extends AgentPool {
  /**
   * Initialize the agent pool manager
   * Sets up internal state, starts queue processor
   */
  initialize(): Promise<void>;

  /**
   * Shutdown the agent pool manager
   * Waits for active agents, persists state
   * @param options - Shutdown options
   */
  shutdown(options?: AgentPoolShutdownOptions): Promise<void>;

  /**
   * Spawn the next queued agent if capacity allows
   * @returns The spawned agent or null if none eligible
   */
  spawnNext(): Promise<ActiveAgent | null>;

  /**
   * Record agent completion
   * @param id - Agent ID
   * @param result - Completion data
   */
  recordCompletion(id: string, result: AgentCompletionResult): void;

  /**
   * Cancel an active or queued agent
   * @param id - Agent ID to cancel
   * @returns True if cancelled, false if not found
   */
  cancel(id: string): boolean;

  /**
   * Cancel all active and queued agents
   */
  cancelAll(): void;

  /**
   * Register an event handler
   * @param event - Event type to handle
   * @param handler - Handler function
   */
  on(event: AgentPoolEvent, handler: AgentPoolEventHandler): void;

  /**
   * Unregister an event handler
   * @param event - Event type
   * @param handler - Handler function to remove
   */
  off(event: AgentPoolEvent, handler: AgentPoolEventHandler): void;
}

/**
 * Options for agent pool shutdown
 */
export interface AgentPoolShutdownOptions {
  /** Wait for active agents to complete (default: true) */
  wait_for_active?: boolean;

  /** Maximum time to wait in milliseconds (default: 60000) */
  timeout_ms?: number;

  /** Cancel remaining agents if timeout reached (default: true) */
  cancel_on_timeout?: boolean;
}

/**
 * Result data when an agent completes
 */
export interface AgentCompletionResult {
  /** Final status */
  status: CompletedAgentStatus;

  /** Total tokens consumed */
  tokens_used: number;

  /** Total turns used */
  turns_used: number;

  /** Result data (if successful) */
  result?: unknown;

  /** Error message (if failed) */
  error?: string;
}

// Default configurations

/**
 * Default budget for individual agents
 */
export const DEFAULT_AGENT_BUDGET: AgentBudget = {
  max_tokens: 100000,
  max_turns: 50,
  max_duration_ms: 300000,
};

/**
 * Default budget for the entire pool
 */
export const DEFAULT_TOTAL_BUDGET: TotalBudget = {
  max_tokens: 1000000,
  max_agents: 50,
  warn_at_percent: 80,
};

/**
 * Default agent pool configuration
 */
export const DEFAULT_POOL_CONFIG: AgentPoolConfig = {
  max_concurrent: 6,
  default_budget: DEFAULT_AGENT_BUDGET,
  total_budget: DEFAULT_TOTAL_BUDGET,
  queue_strategy: 'dependency',
};
