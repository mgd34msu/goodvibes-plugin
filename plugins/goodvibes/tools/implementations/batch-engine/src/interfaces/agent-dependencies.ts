/**
 * Agent Dependency Resolution interfaces for Batch Engine
 * @see SPEC-v2 Section 12.4
 */

import type { AgentSpec, QueuedAgent } from './agent-pool.js';

// =============================================================================
// DEPENDENCY TYPES
// =============================================================================

/**
 * Type of dependency between agents
 * - hard: Must complete successfully before dependent can run
 * - soft: Should complete, but dependent can proceed if this fails
 * - data: Need data output from this agent (implies hard dependency)
 */
export type DependencyType = 'hard' | 'soft' | 'data';

/**
 * Definition of a dependency relationship
 */
export interface AgentDependency {
  /** ID of the agent this depends on */
  agent_id: string;

  /** Type of dependency */
  type: DependencyType;

  /** What status is acceptable for the dependency (default: 'success') */
  required_status?: 'success' | 'any';

  /** Key to extract from agent result (for data dependencies) */
  data_key?: string;
}

// =============================================================================
// DEPENDENCY GRAPH
// =============================================================================

/**
 * Node in the dependency graph representing a single agent
 */
export interface DependencyNode {
  /** Unique identifier for the agent */
  agent_id: string;

  /** The agent specification */
  spec: AgentSpec;

  /** Dependencies this agent has on other agents */
  dependencies: AgentDependency[];

  /** IDs of agents that depend on this one */
  dependents: string[];

  /** Current status in the execution lifecycle */
  status: 'pending' | 'ready' | 'running' | 'completed' | 'failed' | 'blocked';

  /** Distance from root (0 = no dependencies) */
  depth: number;
}

/**
 * Complete dependency graph for a set of agents
 */
export interface DependencyGraph {
  /** Map of agent IDs to their dependency nodes */
  nodes: Map<string, DependencyNode>;

  /** IDs of nodes with no dependencies (entry points) */
  roots: string[];

  /** IDs of nodes with no dependents (exit points) */
  leaves: string[];

  /** Maximum depth in the graph */
  max_depth: number;
}

// =============================================================================
// EXECUTION PLANNING
// =============================================================================

/**
 * A group of agents that can execute in parallel
 */
export interface ExecutionPhase {
  /** Phase number (0-indexed) */
  phase_number: number;

  /** IDs of agents that can run in this phase */
  agents: string[];

  /** Whether all dependencies for this phase are satisfied */
  dependencies_met: boolean;

  /** Estimated token usage for this phase */
  estimated_tokens: number;
}

/**
 * Complete execution plan with ordered phases
 */
export interface ExecutionPlan {
  /** Unique identifier for this plan */
  id: string;

  /** Ordered phases of execution */
  phases: ExecutionPhase[];

  /** Maximum number of agents in any single phase */
  max_parallelism: number;

  /** Agent IDs on the critical path (longest dependency chain) */
  critical_path: string[];

  /** Estimated time for the critical path in milliseconds */
  critical_path_ms: number;

  /** Total number of agents in the plan */
  total_agents: number;

  /** ISO timestamp when the plan was created */
  created_at: string;
}

// =============================================================================
// CYCLE DETECTION
// =============================================================================

/**
 * Result of checking for circular dependencies
 */
export interface CycleCheckResult {
  /** Whether a cycle was detected */
  has_cycle: boolean;

  /** Agent IDs forming the cycle (if detected) */
  cycle?: string[];

  /** Edges that create the cycle (if detected) */
  problematic_edges?: Array<{ from: string; to: string }>;
}

// =============================================================================
// RESOLUTION RESULTS
// =============================================================================

/**
 * Result of dependency resolution attempt
 */
export interface ResolutionResult {
  /** Whether resolution was successful */
  success: boolean;

  /** The execution plan (if successful) */
  plan?: ExecutionPlan;

  /** Error messages (if failed) */
  errors?: string[];

  /** Warning messages (non-fatal issues) */
  warnings?: string[];

  /** Agent IDs that cannot be scheduled */
  unresolvable?: string[];
}

// =============================================================================
// RESOLVER INTERFACE
// =============================================================================

/**
 * Dependency resolver - builds graphs and creates execution plans
 */
export interface DependencyResolver {
  // Graph building

  /**
   * Build a dependency graph from agent specifications
   * @param specs - Array of agent specifications
   * @returns The constructed dependency graph
   */
  buildGraph(specs: AgentSpec[]): DependencyGraph;

  /**
   * Add a node to an existing graph
   * @param graph - The graph to modify
   * @param spec - Agent specification to add
   */
  addNode(graph: DependencyGraph, spec: AgentSpec): void;

  /**
   * Remove a node from a graph
   * @param graph - The graph to modify
   * @param agent_id - ID of the agent to remove
   */
  removeNode(graph: DependencyGraph, agent_id: string): void;

  // Analysis

  /**
   * Check for circular dependencies in the graph
   * @param graph - The graph to check
   * @returns Result indicating if cycles exist
   */
  checkCycles(graph: DependencyGraph): CycleCheckResult;

  /**
   * Find all root nodes (no dependencies)
   * @param graph - The graph to analyze
   * @returns Array of root agent IDs
   */
  findRoots(graph: DependencyGraph): string[];

  /**
   * Find all leaf nodes (no dependents)
   * @param graph - The graph to analyze
   * @returns Array of leaf agent IDs
   */
  findLeaves(graph: DependencyGraph): string[];

  /**
   * Get the depth of a specific agent in the graph
   * @param graph - The graph to query
   * @param agent_id - ID of the agent
   * @returns Depth from root (0 = no dependencies)
   */
  getDepth(graph: DependencyGraph, agent_id: string): number;

  // Resolution

  /**
   * Resolve dependencies and create an execution plan
   * @param specs - Array of agent specifications
   * @returns Resolution result with plan or errors
   */
  resolve(specs: AgentSpec[]): ResolutionResult;

  /**
   * Perform topological sort on the graph
   * @param graph - The graph to sort
   * @returns Ordered array of agent IDs
   */
  topologicalSort(graph: DependencyGraph): string[];

  // Parallelization

  /**
   * Group sorted agents into parallel execution phases
   * @param sorted - Topologically sorted agent IDs
   * @param graph - The dependency graph
   * @returns Array of execution phases
   */
  groupByPhase(sorted: string[], graph: DependencyGraph): ExecutionPhase[];

  /**
   * Calculate the critical path through the graph
   * @param graph - The dependency graph
   * @returns Array of agent IDs on the critical path
   */
  calculateCriticalPath(graph: DependencyGraph): string[];
}

// =============================================================================
// MANAGER INTERFACE
// =============================================================================

/**
 * Dependency manager with runtime tracking
 * Extends resolver with state management and runtime updates
 */
export interface DependencyManager extends DependencyResolver {
  /** The current dependency graph */
  currentGraph: DependencyGraph;

  /** The current execution plan (null if not resolved) */
  currentPlan: ExecutionPlan | null;

  // Runtime updates

  /**
   * Mark an agent as completed
   * @param agent_id - ID of the completed agent
   * @param success - Whether the agent succeeded
   * @returns IDs of agents that are now ready to run
   */
  markCompleted(agent_id: string, success: boolean): string[];

  /**
   * Mark an agent as failed
   * @param agent_id - ID of the failed agent
   * @returns IDs of agents affected by this failure
   */
  markFailed(agent_id: string): string[];

  /**
   * Get all agents that are ready to run
   * @returns Array of agent IDs ready for execution
   */
  getReady(): string[];

  /**
   * Get all agents that are blocked
   * @returns Array of blocked agent IDs
   */
  getBlocked(): string[];

  // Queries

  /**
   * Get dependencies for a specific agent
   * @param agent_id - ID of the agent
   * @returns Array of dependencies
   */
  getDependencies(agent_id: string): AgentDependency[];

  /**
   * Get dependents of a specific agent
   * @param agent_id - ID of the agent
   * @returns Array of dependent agent IDs
   */
  getDependents(agent_id: string): string[];

  /**
   * Check if an agent is ready to run
   * @param agent_id - ID of the agent to check
   * @returns True if ready, false otherwise
   */
  isReady(agent_id: string): boolean;

  /**
   * Check if an agent is blocked
   * @param agent_id - ID of the agent to check
   * @returns True if blocked, false otherwise
   */
  isBlocked(agent_id: string): boolean;

  /**
   * Get the agents blocking a specific agent
   * @param agent_id - ID of the blocked agent
   * @returns Array of blocking agent IDs
   */
  getBlockers(agent_id: string): string[];

  // Plan adjustments

  /**
   * Recreate the execution plan based on current state
   * @returns New resolution result
   */
  replan(): ResolutionResult;

  /**
   * Add a dependency between agents
   * @param from - ID of the dependent agent
   * @param to - ID of the dependency agent
   * @param type - Type of dependency (default: 'hard')
   * @returns True if added successfully
   */
  addDependency(from: string, to: string, type?: DependencyType): boolean;

  /**
   * Remove a dependency between agents
   * @param from - ID of the dependent agent
   * @param to - ID of the dependency agent
   * @returns True if removed successfully
   */
  removeDependency(from: string, to: string): boolean;
}

// =============================================================================
// VISUALIZATION
// =============================================================================

/**
 * Visualization output for debugging dependency graphs
 */
export interface DependencyVisualization {
  /** Mermaid diagram syntax */
  mermaid: string;

  /** ASCII art representation */
  ascii: string;

  /** JSON graph representation for external tools */
  json: object;
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Create an empty dependency graph
 * @returns A new empty dependency graph
 */
export function createDependencyGraph(): DependencyGraph {
  return {
    nodes: new Map(),
    roots: [],
    leaves: [],
    max_depth: 0,
  };
}

/**
 * Create a default execution plan ID
 * @returns A unique plan identifier
 */
export function createPlanId(): string {
  return `plan_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Create an empty execution phase
 * @param phase_number - The phase number
 * @returns A new empty execution phase
 */
export function createExecutionPhase(phase_number: number): ExecutionPhase {
  return {
    phase_number,
    agents: [],
    dependencies_met: false,
    estimated_tokens: 0,
  };
}
