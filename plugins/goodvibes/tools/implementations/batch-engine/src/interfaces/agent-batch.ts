/**
 * Agent-Batch Integration interfaces for Batch Engine
 * @see SPEC-v2 Section 12
 */

import type { Batch, BatchConfig } from './batch.js';
import type { BatchResult, OperationResult } from './result.js';
import type { AgentContext } from './context.js';

// Forward declarations for agent-pool.ts types (Phase 7.4)
// These will be properly imported once agent-pool.ts is created
export interface AgentSpec {
  type: string;
  task: string;
  scope: string[];
  constraints?: string[];
  budget?: { max_tokens?: number; max_turns?: number };
}

export interface AgentPool {
  max_concurrent: number;
  active: Map<string, ActiveAgent>;
  completed: Map<string, CompletedAgent>;
  queue: QueuedAgent[];
}

export interface ActiveAgent {
  id: string;
  spec: AgentSpec;
  started_at: string;
  tokens_used: number;
  turns_used: number;
  status: 'running' | 'waiting';
}

export interface CompletedAgent {
  id: string;
  spec: AgentSpec;
  started_at: string;
  completed_at: string;
  tokens_used: number;
  turns_used: number;
  status: 'success' | 'failed' | 'cancelled';
  result?: unknown;
  error?: string;
}

export interface QueuedAgent {
  id: string;
  spec: AgentSpec;
  queued_at: string;
  priority: number;
}

// Forward declarations for agent-prompts.ts types (Phase 7.5)
// These will be properly imported once agent-prompts.ts is created
export interface BuiltPrompt {
  system: string;
  user: string;
  context_tokens: number;
  injected_context: Record<string, unknown>;
}

// ============================================================================
// Agent Batch Access
// ============================================================================

/**
 * Agent batch access configuration
 * Defines what batch capabilities an agent has access to
 */
export interface AgentBatchAccess {
  // Tools available to agent
  /** Can read files within scope */
  can_read: boolean;
  /** Can write/modify files within scope */
  can_write: boolean;
  /** Can execute commands */
  can_exec: boolean;
  /** Can run database queries */
  can_query: boolean;
  /** Can spawn nested agents */
  can_spawn_agents: boolean;

  // Restrictions
  /** Files agent can access (glob patterns) */
  file_scope?: string[];
  /** Commands agent is allowed to run */
  command_allowlist?: string[];
  /** Maximum number of agents this agent can spawn */
  max_nested_agents?: number;
}

// ============================================================================
// Agent Batch Context
// ============================================================================

/**
 * Agent batch context - injected into agent during execution
 * Provides batch-level information and access to shared results
 */
export interface AgentBatchContext {
  /** ID of the current batch */
  batch_id: string;
  /** ID of parent batch (if this is a nested batch) */
  parent_batch_id?: string;
  /** Access permissions for this agent */
  agent_access: AgentBatchAccess;
  /** Results from prior operations in this batch */
  prior_operations: OperationResult[];
  /** Shared results from other agents */
  shared_results: Record<string, unknown>;
}

// ============================================================================
// Agent Operations
// ============================================================================

/**
 * Agent operation within a batch
 * Represents a single agent invocation as a batch operation
 */
export interface AgentOperation {
  /** Unique operation identifier */
  id: string;
  /** Operation type - always 'agent' for agent operations */
  type: 'agent';
  /** Agent specification */
  spec: AgentSpec;
  /** What to inject into the agent context */
  inject: {
    /** Inject batch context */
    batch_context: boolean;
    /** Inject results from prior operations */
    prior_results: boolean;
    /** Inject memory (decisions, patterns, failures) */
    memory: boolean;
  };
  /** Agent type to chain to on success */
  chain_on_success?: string;
  /** Agent type to chain to on failure */
  chain_on_failure?: string;
}

/**
 * Result of an agent operation
 * Extends OperationResult with agent-specific metrics
 */
export interface AgentOperationResult extends OperationResult {
  /** Agent ID that executed this operation */
  agent_id: string;
  /** Tokens used for prompts */
  prompt_tokens: number;
  /** Tokens used for completions */
  completion_tokens: number;
  /** Number of tool calls made */
  tool_calls: number;
  /** Number of files read */
  files_read: number;
  /** Number of files written */
  files_written: number;
  /** Number of nested agents spawned */
  nested_agents: number;
  /** Agent type chained to (if any) */
  chained_to?: string;
}

// ============================================================================
// Agent Coordinator
// ============================================================================

/**
 * Agent coordinator interface
 * Orchestrates agents within a batch execution
 */
export interface AgentCoordinator {
  /** Agent pool for managing concurrent agents */
  pool: AgentPool;

  // Execute agent operations
  /**
   * Execute a single agent operation
   * @param op - Agent operation to execute
   * @param context - Agent context
   * @returns Result of the agent operation
   */
  executeAgentOperation(op: AgentOperation, context: AgentContext): Promise<AgentOperationResult>;

  /**
   * Execute multiple agent operations
   * @param ops - Agent operations to execute
   * @param context - Agent context
   * @returns Results of all agent operations
   */
  executeAgentBatch(ops: AgentOperation[], context: AgentContext): Promise<AgentOperationResult[]>;

  // Context building
  /**
   * Build agent context from spec and batch context
   * @param spec - Agent specification
   * @param batch_context - Batch context to inject
   * @returns Fully built agent context
   */
  buildAgentContext(spec: AgentSpec, batch_context: AgentBatchContext): AgentContext;

  /**
   * Build prompt for agent execution
   * @param spec - Agent specification
   * @param context - Agent context
   * @returns Built prompt ready for execution
   */
  buildPrompt(spec: AgentSpec, context: AgentContext): BuiltPrompt;

  // Budget management
  /**
   * Track token usage for an agent
   * @param agent_id - Agent ID
   * @param tokens - Tokens used
   */
  trackAgentUsage(agent_id: string, tokens: number): void;

  /**
   * Check if agent is within budget
   * @param agent_id - Agent ID
   * @returns True if agent has remaining budget
   */
  checkAgentBudget(agent_id: string): boolean;

  // Result handling
  /**
   * Collect results from a completed agent
   * @param agent_id - Agent ID
   * @returns Agent results
   */
  collectResults(agent_id: string): unknown;

  /**
   * Share results from one agent to another
   * @param from_agent - Source agent ID
   * @param to_agent - Target agent ID
   * @param results - Results to share
   */
  shareResultsTo(from_agent: string, to_agent: string, results: unknown): void;

  // Chaining
  /**
   * Handle agent chaining on completion
   * @param completed - Completed agent info
   * @param op - Original operation (for chain configuration)
   * @returns Result of chained agent, or null if no chain
   */
  handleAgentChain(completed: CompletedAgent, op: AgentOperation): Promise<AgentOperationResult | null>;
}

// ============================================================================
// Spawned Agent Tracking
// ============================================================================

/**
 * Record of a batch-spawned agent
 * Tracks agent lifecycle within a batch
 */
export interface SpawnedAgentRecord {
  /** Unique agent identifier */
  agent_id: string;
  /** Batch that spawned this agent */
  batch_id: string;
  /** Operation that triggered the spawn */
  operation_id: string;
  /** Agent specification */
  spec: AgentSpec;
  /** ISO timestamp when agent was spawned */
  spawned_at: string;
  /** ISO timestamp when agent completed */
  completed_at?: string;
  /** Current agent status */
  status: 'running' | 'completed' | 'failed';
  /** Agent result (if completed) */
  result?: unknown;
  /** Total tokens used by this agent */
  tokens_used: number;
}

// ============================================================================
// Agent Batch Manager
// ============================================================================

/**
 * Agent batch manager interface
 * Full lifecycle management for agents within batches
 * Extends AgentCoordinator with tracking, lifecycle hooks, and queries
 */
export interface AgentBatchManager extends AgentCoordinator {
  // Tracking
  /** Map of all spawned agents by ID */
  spawned_agents: Map<string, SpawnedAgentRecord>;

  // Lifecycle
  /**
   * Initialize the agent batch manager
   * @param config - Batch configuration
   */
  initialize(config: BatchConfig): Promise<void>;

  /**
   * Shutdown the agent batch manager
   * Cleans up resources and persists state
   */
  shutdown(): Promise<void>;

  // Batch hooks
  /**
   * Called when a batch starts
   * @param batch - The starting batch
   */
  onBatchStart(batch: Batch): void;

  /**
   * Called when a batch completes
   * @param batch - The completed batch
   * @param result - Batch result
   */
  onBatchComplete(batch: Batch, result: BatchResult): void;

  /**
   * Called when a batch errors
   * @param batch - The failed batch
   * @param error - Error that occurred
   */
  onBatchError(batch: Batch, error: Error): void;

  // Agent hooks
  /**
   * Called when an agent starts
   * @param agent - The starting agent
   */
  onAgentStart(agent: ActiveAgent): void;

  /**
   * Called when an agent completes
   * @param agent - The completed agent
   */
  onAgentComplete(agent: CompletedAgent): void;

  /**
   * Called when an agent errors
   * @param agent - The failed agent
   * @param error - Error that occurred
   */
  onAgentError(agent: ActiveAgent, error: Error): void;

  // Queries
  /**
   * Get all agents spawned for a batch
   * @param batch_id - Batch ID
   * @returns Array of spawned agent records
   */
  getAgentsForBatch(batch_id: string): SpawnedAgentRecord[];

  /**
   * Get result of a specific agent
   * @param agent_id - Agent ID
   * @returns Agent result or undefined
   */
  getAgentResult(agent_id: string): unknown | undefined;

  /**
   * Get total tokens used across all agents
   * @returns Total token count
   */
  getTotalTokens(): number;
}

// ============================================================================
// Default Configurations
// ============================================================================

/**
 * Default agent batch access (restrictive)
 * Standard permissions for most agents - no spawning allowed
 */
export const DEFAULT_AGENT_ACCESS: AgentBatchAccess = {
  can_read: true,
  can_write: true,
  can_exec: true,
  can_query: true,
  can_spawn_agents: false,
  max_nested_agents: 0,
};

/**
 * Elevated agent batch access (for orchestrator agents)
 * Extended permissions for orchestrator/coordinator agents
 */
export const ELEVATED_AGENT_ACCESS: AgentBatchAccess = {
  can_read: true,
  can_write: true,
  can_exec: true,
  can_query: true,
  can_spawn_agents: true,
  max_nested_agents: 3,
};

/**
 * Readonly agent batch access (for analysis agents)
 * Read-only permissions for analysis/review agents
 */
export const READONLY_AGENT_ACCESS: AgentBatchAccess = {
  can_read: true,
  can_write: false,
  can_exec: false,
  can_query: true,
  can_spawn_agents: false,
  max_nested_agents: 0,
};
