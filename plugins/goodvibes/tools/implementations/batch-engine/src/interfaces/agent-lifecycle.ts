/**
 * Agent Lifecycle interfaces for Batch Engine
 * @see SPEC-v2 Section 12.2
 */

import type { AgentSpec, ActiveAgent, CompletedAgent, AgentPool } from './agent-pool.js';

// ============================================================================
// Result Types
// ============================================================================

/**
 * Result of a spawn operation
 */
export interface SpawnResult {
  /** Whether the spawn was successful */
  success: boolean;

  /** ID of the spawned or queued agent */
  agent_id?: string;

  /** True if agent was queued instead of spawned immediately */
  queued?: boolean;

  /** Position in queue if queued */
  queue_position?: number;

  /** Error message if spawn failed */
  error?: string;

  /** IDs of agents blocking this spawn (dependency resolution) */
  blocked_by?: string[];
}

/**
 * Result of monitoring an agent
 */
export interface MonitorResult {
  /** ID of the monitored agent */
  agent_id: string;

  /** Current agent status */
  status: 'running' | 'waiting_input' | 'completing' | 'not_found';

  /** Number of tokens consumed so far */
  tokens_used: number;

  /** Number of API turns used so far */
  turns_used: number;

  /** Percentage of budget consumed (0-100) */
  budget_percent: number;

  /** Estimated completion time (ISO timestamp) */
  estimated_completion?: string;

  /** Agent health assessment */
  health: 'healthy' | 'slow' | 'stuck' | 'over_budget';
}

/**
 * Result of a completion operation
 */
export interface CompletionResult {
  /** ID of the completed agent */
  agent_id: string;

  /** Whether the completion was successful */
  success: boolean;

  /** Final completion status */
  status: 'success' | 'failed' | 'timeout' | 'cancelled';

  /** Result data from the agent (if successful) */
  result?: unknown;

  /** Error message (if failed or timeout) */
  error?: string;

  /** Total tokens consumed */
  tokens_used: number;

  /** Total API turns used */
  turns_used: number;

  /** Total execution time in milliseconds */
  duration_ms: number;

  /** ID of agent spawned via chaining (if chain_to was specified) */
  chained_agent?: string;
}

// ============================================================================
// Event Types
// ============================================================================

/**
 * Lifecycle events emitted by agents
 * - queued: Agent added to queue, waiting for capacity
 * - spawned: Agent started executing
 * - progress: Agent made progress (tokens/turns update)
 * - waiting: Agent waiting for external input
 * - completing: Agent finishing up
 * - completed: Agent finished successfully
 * - failed: Agent encountered an error
 * - timeout: Agent exceeded time or budget limit
 * - cancelled: Agent was manually cancelled
 */
export type AgentLifecycleEvent =
  | 'queued'
  | 'spawned'
  | 'progress'
  | 'waiting'
  | 'completing'
  | 'completed'
  | 'failed'
  | 'timeout'
  | 'cancelled';

/**
 * Event handler function signature for lifecycle events
 */
export interface AgentLifecycleHandler {
  (event: AgentLifecycleEvent, agent: ActiveAgent | CompletedAgent, data?: unknown): void;
}

// ============================================================================
// Progress Tracking
// ============================================================================

/**
 * Detailed progress information for an agent
 */
export interface AgentProgress {
  /** ID of the agent */
  agent_id: string;

  /** Estimated percentage complete (0-100) */
  percent_complete: number;

  /** Current phase of execution (e.g., 'analyzing', 'editing', 'testing') */
  current_phase?: string;

  /** Number of files touched during execution */
  files_touched: number;

  /** Name of the last tool invoked */
  last_tool: string;

  /** ISO timestamp of last activity */
  last_activity: string;
}

// ============================================================================
// Health Monitoring
// ============================================================================

/**
 * Issue detected during health check
 */
export interface HealthIssue {
  /** ID of the affected agent */
  agent_id: string;

  /** Type of issue detected */
  type: 'slow' | 'stuck' | 'over_budget' | 'error';

  /** Human-readable description of the issue */
  message: string;

  /** ISO timestamp when issue was detected */
  detected_at: string;

  /** Additional diagnostic data */
  data?: unknown;
}

/**
 * Report from health check operation
 */
export interface HealthReport {
  /** Number of agents in healthy state */
  healthy_count: number;

  /** Number of agents running slow */
  slow_count: number;

  /** Number of agents that appear stuck */
  stuck_count: number;

  /** Number of agents over budget */
  over_budget_count: number;

  /** Total number of active agents */
  total_active: number;

  /** List of detected issues */
  issues: HealthIssue[];
}

// ============================================================================
// Lifecycle Interfaces
// ============================================================================

/**
 * Core agent lifecycle operations
 * Handles spawn, monitor, and complete operations
 */
export interface AgentLifecycle {
  // -------------------------------------------------------------------------
  // Spawn Operations
  // -------------------------------------------------------------------------

  /**
   * Spawn a single agent
   * Checks capacity and dependencies, queues if necessary
   * @param spec - Agent specification
   * @returns Result of the spawn operation
   */
  spawn(spec: AgentSpec): Promise<SpawnResult>;

  /**
   * Spawn multiple agents as a batch
   * Respects max_concurrent limits, queues excess agents
   * @param specs - Array of agent specifications
   * @returns Array of spawn results (same order as input)
   */
  spawnBatch(specs: AgentSpec[]): Promise<SpawnResult[]>;

  // -------------------------------------------------------------------------
  // Monitoring
  // -------------------------------------------------------------------------

  /**
   * Monitor a specific agent
   * @param agent_id - ID of the agent to monitor
   * @returns Current status and health of the agent
   */
  monitor(agent_id: string): MonitorResult;

  /**
   * Monitor all active agents
   * @returns Array of monitor results for all active agents
   */
  monitorAll(): MonitorResult[];

  // -------------------------------------------------------------------------
  // Completion
  // -------------------------------------------------------------------------

  /**
   * Mark an agent as completed
   * Handles chaining if chain_to was specified
   * @param agent_id - ID of the agent
   * @param result - Result data from the agent
   * @param error - Error message if failed (optional)
   * @returns Completion result
   */
  complete(agent_id: string, result?: unknown, error?: string): CompletionResult;

  /**
   * Cancel an agent
   * Stops execution and marks as cancelled
   * @param agent_id - ID of the agent to cancel
   * @param reason - Reason for cancellation (optional)
   * @returns Completion result with status 'cancelled'
   */
  cancel(agent_id: string, reason?: string): CompletionResult;

  /**
   * Timeout an agent
   * Forcefully stops execution due to budget/time limit
   * @param agent_id - ID of the agent to timeout
   * @returns Completion result with status 'timeout'
   */
  timeout(agent_id: string): CompletionResult;

  // -------------------------------------------------------------------------
  // Queue Processing
  // -------------------------------------------------------------------------

  /**
   * Process the agent queue
   * Spawns queued agents that have capacity and resolved dependencies
   * @returns Array of spawn results for newly spawned agents
   */
  processQueue(): Promise<SpawnResult[]>;

  // -------------------------------------------------------------------------
  // Event Handling
  // -------------------------------------------------------------------------

  /**
   * Register an event handler
   * @param event - Event type to handle
   * @param handler - Handler function
   */
  on(event: AgentLifecycleEvent, handler: AgentLifecycleHandler): void;

  /**
   * Unregister an event handler
   * @param event - Event type
   * @param handler - Handler function to remove
   */
  off(event: AgentLifecycleEvent, handler: AgentLifecycleHandler): void;

  // -------------------------------------------------------------------------
  // Chaining
  // -------------------------------------------------------------------------

  /**
   * Handle agent chaining after completion
   * Spawns the chain_to agent if specified and completion was successful
   * @param completed - The completed agent record
   * @returns Spawn result if chained, null if no chaining needed
   */
  handleChaining(completed: CompletedAgent): Promise<SpawnResult | null>;
}

/**
 * Full agent lifecycle manager
 * Extends AgentLifecycle with pool integration, lifecycle management,
 * bulk operations, and health monitoring
 */
export interface AgentLifecycleManager extends AgentLifecycle {
  /** The agent pool being managed */
  pool: AgentPool;

  // -------------------------------------------------------------------------
  // Lifecycle Management
  // -------------------------------------------------------------------------

  /**
   * Initialize the lifecycle manager
   * Sets up internal state, starts event listeners
   */
  initialize(): Promise<void>;

  /**
   * Shutdown the lifecycle manager
   * Waits for/cancels active agents, persists state
   */
  shutdown(): Promise<void>;

  // -------------------------------------------------------------------------
  // Bulk Operations
  // -------------------------------------------------------------------------

  /**
   * Cancel all active and queued agents
   * @param reason - Reason for cancellation (optional)
   * @returns Array of completion results
   */
  cancelAll(reason?: string): CompletionResult[];

  /**
   * Wait for all active agents to complete
   * @returns Array of completion results when all agents finish
   */
  waitForAll(): Promise<CompletionResult[]>;

  /**
   * Wait for any agent to complete
   * @returns Completion result of the first agent to finish
   */
  waitForAny(): Promise<CompletionResult>;

  // -------------------------------------------------------------------------
  // Health Checks
  // -------------------------------------------------------------------------

  /**
   * Perform a health check on all active agents
   * @returns Health report with issues and counts
   */
  checkHealth(): HealthReport;

  /**
   * Get agents that appear stuck
   * (No progress for extended period)
   * @returns Array of stuck agents
   */
  getStuckAgents(): ActiveAgent[];

  /**
   * Get agents that have exceeded their budget
   * @returns Array of over-budget agents
   */
  getOverBudgetAgents(): ActiveAgent[];
}
