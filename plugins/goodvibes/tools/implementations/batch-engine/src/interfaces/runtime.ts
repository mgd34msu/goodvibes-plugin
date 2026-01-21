/**
 * GoodVibes Runtime interfaces for Batch Engine
 * Central runtime that connects all systems
 * @see SPEC-v2 Phase 11.1
 */

import type { StateManager } from './state-api.js';
import type { CheckpointManager } from './checkpoint.js';
import type { FixLoopManager } from './fix-loop.js';
import type { AgentPoolManager } from './agent-pool.js';
import type { MemoryManager } from './memory-api.js';
import type { TelemetryAPI } from './telemetry-api.js';
import type { ModeConfig, ModeName } from './mode.js';
import type { Batch } from './batch.js';
import type { BatchResult, OperationResult } from './result.js';
import type { Decision, Pattern, Failure } from './memory.js';

// ============================================================================
// Mode System
// ============================================================================

/**
 * Callback signature for mode change events
 * @param oldMode - The mode being changed from
 * @param newMode - The mode being changed to
 */
export type ModeChangeCallback = (oldMode: ModeName, newMode: ModeName) => void;

/**
 * Mode system for managing execution modes
 * Handles switching between vibecoding and justvibes modes
 */
export interface ModeSystem {
  /** Currently active mode configuration */
  readonly currentMode: ModeConfig;

  /**
   * Set the active mode by name
   * @param name - Mode name to activate
   * @throws If mode name is not recognized
   */
  setMode(name: ModeName): Promise<void>;

  /**
   * Get the current mode configuration
   * @returns Current ModeConfig
   */
  getMode(): ModeConfig;

  /**
   * List all available mode names
   * @returns Array of valid mode names
   */
  listModes(): ModeName[];

  /**
   * Register a callback for mode change events
   * @param callback - Function to call when mode changes
   */
  onModeChange(callback: ModeChangeCallback): void;

  /**
   * Unregister a mode change callback
   * @param callback - Previously registered callback to remove
   */
  offModeChange(callback: ModeChangeCallback): void;
}

// ============================================================================
// Context Injection
// ============================================================================

/**
 * Relevant memory gathered for context injection
 * Contains decisions, patterns, and failures relevant to the current scope
 */
export interface RelevantMemory {
  /** Relevant decisions from memory */
  decisions: Decision[];

  /** Relevant patterns from memory */
  patterns: Pattern[];

  /** Relevant failures from memory */
  failures: Failure[];

  /** User preferences applicable to current context */
  preferences: Record<string, unknown>;
}

/**
 * Context injected into batch operations
 * Provides session state, prior results, and relevant memory
 */
export interface InjectedContext {
  /** Current session state snapshot */
  session: {
    id: string;
    mode: ModeName;
    started_at: string;
    batches_executed: number;
  };

  /** Current batch information */
  batch: {
    id: string;
    parent_id?: string;
    operation_count: number;
  };

  /** Results from prior operations in this batch */
  prior_results: OperationResult[];

  /** Relevant memory for this operation */
  relevant_memory: RelevantMemory;
}

/**
 * Extended context for agent operations
 * Includes task-specific budgets and constraints
 */
export interface AgentInjectedContext extends InjectedContext {
  /** Task description for the agent */
  task: string;

  /** Budget constraints for the agent */
  budget: {
    /** Maximum tokens the agent can consume */
    max_tokens: number;
    /** Maximum operations the agent can perform */
    max_operations: number;
    /** Maximum duration in milliseconds */
    max_duration_ms: number;
  };

  /** Constraints the agent must follow */
  constraints: string[];

  /** Files the agent is allowed to modify */
  allowed_files?: string[];

  /** Files the agent must not modify */
  forbidden_files?: string[];
}

/**
 * Context injector for providing runtime context to operations and agents
 */
export interface ContextInjector {
  /**
   * Inject context into a batch operation
   * @param operationId - ID of the operation to inject context for
   * @returns Injected context for the operation
   */
  injectOperationContext(operationId: string): Promise<InjectedContext>;

  /**
   * Inject context into an agent
   * @param agentId - ID of the agent to inject context for
   * @param task - Task description for the agent
   * @returns Extended context for agent execution
   */
  injectAgentContext(agentId: string, task: string): Promise<AgentInjectedContext>;

  /**
   * Gather relevant memory for a given scope
   * @param scope - Array of scope identifiers (file paths, symbols, etc.)
   * @returns Relevant memory entries for the scope
   */
  gatherRelevantMemory(scope: string[]): Promise<RelevantMemory>;
}

// ============================================================================
// Batch Engine
// ============================================================================

/**
 * Preview result for a batch before execution
 */
export interface BatchPreview {
  /** Batch ID */
  batch_id: string;

  /** Operations that would be executed */
  operations: Array<{
    id: string;
    type: string;
    description: string;
    affected_files: string[];
  }>;

  /** Estimated execution time in milliseconds */
  estimated_duration_ms: number;

  /** Estimated token usage */
  estimated_tokens: number;

  /** Potential risks identified */
  risks: Array<{
    level: 'low' | 'medium' | 'high';
    description: string;
    mitigation: string;
  }>;

  /** Validation checks that would run */
  validation_steps: string[];
}

/**
 * Status of a batch execution
 */
export interface BatchStatus {
  /** Batch ID */
  batch_id: string;

  /** Current execution status */
  status: 'pending' | 'running' | 'completed' | 'failed' | 'rolled_back';

  /** Current phase being executed */
  current_phase?: 'read' | 'write' | 'exec' | 'query' | 'state';

  /** Progress percentage (0-100) */
  progress: number;

  /** Operations completed */
  operations_completed: number;

  /** Total operations */
  operations_total: number;

  /** Tokens consumed so far */
  tokens_used: number;

  /** Duration so far in milliseconds */
  duration_ms: number;

  /** ISO timestamp when batch started */
  started_at?: string;

  /** ISO timestamp when batch completed */
  completed_at?: string;
}

/**
 * Batch Engine interface for executing operation batches
 */
export interface BatchEngine {
  /**
   * Execute a batch of operations
   * @param batch - Batch definition to execute
   * @returns Result of batch execution
   */
  execute(batch: Batch): Promise<BatchResult>;

  /**
   * Preview a batch without executing
   * @param batch - Batch definition to preview
   * @returns Preview of what would happen
   */
  preview(batch: Batch): Promise<BatchPreview>;

  /**
   * Get the status of a running or completed batch
   * @param batchId - ID of the batch
   * @returns Current status of the batch
   */
  getStatus(batchId: string): BatchStatus | undefined;

  /**
   * Rollback a batch to its checkpoint
   * @param batchId - ID of the batch to rollback
   * @throws If no checkpoint exists or rollback fails
   */
  rollback(batchId: string): Promise<void>;

  /**
   * Retry a failed operation within a batch
   * @param operationId - ID of the operation to retry
   * @throws If operation not found or not retryable
   */
  retry(operationId: string): Promise<OperationResult>;

  /**
   * Cancel a running batch
   * @param batchId - ID of the batch to cancel
   * @returns True if cancelled, false if not running
   */
  cancel(batchId: string): Promise<boolean>;
}

// ============================================================================
// Health Monitoring
// ============================================================================

/**
 * Health status for an individual component
 */
export interface ComponentHealth {
  /** Component operational status */
  status: 'up' | 'down' | 'degraded';

  /** Optional message describing current state */
  message?: string;

  /** ISO timestamp of last activity */
  last_activity?: string;

  /** Additional component-specific metrics */
  metrics?: Record<string, number>;
}

/**
 * Overall runtime health status
 */
export interface RuntimeHealth {
  /** Overall runtime health status */
  status: 'healthy' | 'degraded' | 'unhealthy';

  /** Health status of each component */
  components: {
    stateManager: ComponentHealth;
    checkpointManager: ComponentHealth;
    fixLoop: ComponentHealth;
    agentPool: ComponentHealth;
    memory: ComponentHealth;
    telemetry: ComponentHealth;
    modeSystem: ComponentHealth;
    batchEngine: ComponentHealth;
  };

  /** ISO timestamp of last health check */
  last_check: string;

  /** Duration of health check in milliseconds */
  check_duration_ms: number;

  /** Any warnings that don't affect overall health */
  warnings?: string[];
}

// ============================================================================
// Runtime Configuration
// ============================================================================

/**
 * Configuration for the GoodVibes runtime
 */
export interface RuntimeConfig {
  /** Initial mode to start in (default: 'vibecoding') */
  initial_mode: ModeName;

  /** Auto-initialize all systems on runtime creation (default: true) */
  auto_initialize: boolean;

  /** Interval for health checks in milliseconds (default: 30000) */
  health_check_interval_ms: number;

  /** Timeout for graceful shutdown in milliseconds (default: 5000) */
  shutdown_timeout_ms: number;

  /** Enable telemetry collection (default: true) */
  telemetry_enabled: boolean;

  /** Enable memory persistence (default: true) */
  memory_persistence: boolean;

  /** Base directory for runtime data */
  data_dir: string;
}

/**
 * Default runtime configuration values
 */
export const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = {
  initial_mode: 'vibecoding',
  auto_initialize: true,
  health_check_interval_ms: 30000,
  shutdown_timeout_ms: 5000,
  telemetry_enabled: true,
  memory_persistence: true,
  data_dir: '.goodvibes',
};

// ============================================================================
// Main Runtime Interface
// ============================================================================

/**
 * Events emitted by the runtime
 */
export type RuntimeEvent =
  | 'initialized'
  | 'shutdown'
  | 'mode_changed'
  | 'health_changed'
  | 'error';

/**
 * Event handler for runtime events
 */
export interface RuntimeEventHandler {
  (event: RuntimeEvent, data: RuntimeEventData): void;
}

/**
 * Data passed to runtime event handlers
 */
export interface RuntimeEventData {
  /** Event type */
  event: RuntimeEvent;

  /** ISO timestamp of event */
  timestamp: string;

  /** Event-specific data */
  payload?: {
    /** For mode_changed events */
    old_mode?: ModeName;
    new_mode?: ModeName;

    /** For health_changed events */
    old_status?: RuntimeHealth['status'];
    new_status?: RuntimeHealth['status'];

    /** For error events */
    error?: Error;
    component?: string;
  };
}

/**
 * Central GoodVibes Runtime interface
 * Connects and coordinates all batch engine systems
 */
export interface GoodVibesRuntime {
  // ========================================================================
  // Core Systems
  // ========================================================================

  /** State management API */
  readonly stateManager: StateManager;

  /** Checkpoint system for recovery */
  readonly checkpointManager: CheckpointManager;

  /** Fix loop for automatic error correction */
  readonly fixLoop: FixLoopManager;

  /** Agent pool for parallel execution */
  readonly agentPool: AgentPoolManager;

  /** Memory system for decisions and patterns */
  readonly memory: MemoryManager;

  /** Telemetry for metrics and reporting */
  readonly telemetry: TelemetryAPI;

  // ========================================================================
  // Mode System
  // ========================================================================

  /** Mode management system */
  readonly modeSystem: ModeSystem;

  // ========================================================================
  // Context Injection
  // ========================================================================

  /** Context injector for operations and agents */
  readonly contextInjector: ContextInjector;

  // ========================================================================
  // Batch Engine
  // ========================================================================

  /** Batch engine for executing operations */
  readonly batchEngine: BatchEngine;

  // ========================================================================
  // Configuration
  // ========================================================================

  /** Runtime configuration */
  readonly config: RuntimeConfig;

  // ========================================================================
  // Lifecycle
  // ========================================================================

  /**
   * Initialize the runtime and all subsystems
   * Called automatically if auto_initialize is true
   */
  initialize(): Promise<void>;

  /**
   * Gracefully shutdown the runtime
   * Waits for active operations, persists state
   */
  shutdown(): Promise<void>;

  /**
   * Check if the runtime is initialized
   * @returns True if initialized
   */
  isInitialized(): boolean;

  // ========================================================================
  // Health Monitoring
  // ========================================================================

  /**
   * Get current health status of the runtime
   * @returns Health status of runtime and all components
   */
  getHealth(): RuntimeHealth;

  /**
   * Force a health check of all components
   * @returns Updated health status
   */
  checkHealth(): Promise<RuntimeHealth>;

  // ========================================================================
  // Event Handling
  // ========================================================================

  /**
   * Register an event handler
   * @param event - Event type to handle
   * @param handler - Handler function
   */
  on(event: RuntimeEvent, handler: RuntimeEventHandler): void;

  /**
   * Unregister an event handler
   * @param event - Event type
   * @param handler - Handler to remove
   */
  off(event: RuntimeEvent, handler: RuntimeEventHandler): void;
}

// ============================================================================
// Factory and Accessor
// ============================================================================

/**
 * Factory for creating GoodVibes runtime instances
 */
export interface RuntimeFactory {
  /**
   * Create a new runtime instance
   * @param config - Optional configuration overrides
   * @returns Initialized runtime instance
   */
  create(config?: Partial<RuntimeConfig>): Promise<GoodVibesRuntime>;

  /**
   * Create a runtime with custom system implementations
   * @param systems - Custom system implementations
   * @param config - Optional configuration overrides
   * @returns Initialized runtime instance
   */
  createWithSystems(
    systems: Partial<RuntimeSystems>,
    config?: Partial<RuntimeConfig>
  ): Promise<GoodVibesRuntime>;
}

/**
 * Custom system implementations for runtime creation
 */
export interface RuntimeSystems {
  stateManager: StateManager;
  checkpointManager: CheckpointManager;
  fixLoop: FixLoopManager;
  agentPool: AgentPoolManager;
  memory: MemoryManager;
  telemetry: TelemetryAPI;
}

/**
 * Singleton accessor for the global runtime instance
 */
export interface RuntimeAccessor {
  /**
   * Get the global runtime instance
   * @throws If runtime is not initialized
   * @returns The global runtime instance
   */
  get(): GoodVibesRuntime;

  /**
   * Check if the global runtime is initialized
   * @returns True if initialized
   */
  isInitialized(): boolean;

  /**
   * Set the global runtime instance
   * @param runtime - Runtime instance to set as global
   */
  set(runtime: GoodVibesRuntime): void;

  /**
   * Clear the global runtime instance
   */
  clear(): void;
}

// ============================================================================
// Re-exports for convenience
// ============================================================================

export type { StateAPI, StateManager } from './state-api.js';
export type { CheckpointSystem, CheckpointManager } from './checkpoint.js';
export type { FixLoop, FixLoopManager } from './fix-loop.js';
export type { AgentPool, AgentPoolManager } from './agent-pool.js';
export type { MemoryAPI, MemoryManager } from './memory-api.js';
export type { TelemetryAPI } from './telemetry-api.js';
export type { ModeConfig, ModeName } from './mode.js';
