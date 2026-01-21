/**
 * Agent System to Hooks Wiring interfaces for Batch Engine
 * @see SPEC-v2 Phase 11.5 - Agent System to Hooks Integration
 *
 * This module provides comprehensive interfaces for wiring the agent pool
 * and lifecycle systems to the hooks runtime. It enables hooks to be
 * executed at key points in the agent lifecycle: spawn, activity,
 * completion, chaining, and error handling.
 */

import type {
  AgentSpec,
  AgentPool,
  AgentBudget,
  ActiveAgent,
  CompletedAgent,
  BudgetStatus,
} from './agent-pool.js';
import type {
  AgentLifecycle,
  SpawnResult,
  CompletionResult,
  MonitorResult,
} from './agent-lifecycle.js';
import type { HookContext } from './lifecycle.js';
import type {
  HooksConfig,
  HookEvent,
  HooksExecutionResult,
} from './hooks-config.js';

// ============================================================================
// Runtime Types (Forward declarations for integration)
// ============================================================================

/**
 * GoodVibes Runtime interface
 * Core runtime that manages the overall execution environment
 */
export interface GoodVibesRuntime {
  /** Unique identifier for this runtime session */
  session_id: string;

  /** Current execution mode (e.g., 'careful', 'fast', 'yolo') */
  mode: string;

  /** Whether the runtime is currently active */
  active: boolean;

  /** Configuration for the runtime */
  config: GoodVibesRuntimeConfig;

  /** Start the runtime */
  start(): Promise<void>;

  /** Stop the runtime gracefully */
  stop(): Promise<void>;

  /** Get current runtime state */
  getState(): GoodVibesRuntimeState;
}

/**
 * Runtime configuration
 */
export interface GoodVibesRuntimeConfig {
  /** Hooks configuration */
  hooks: HooksConfig;

  /** Agent pool settings */
  agent_pool: {
    max_concurrent: number;
    default_budget: AgentBudget;
  };

  /** Telemetry settings */
  telemetry: {
    enabled: boolean;
    endpoint?: string;
  };

  /** Memory settings */
  memory: {
    enabled: boolean;
    persistence_path?: string;
  };
}

/**
 * Runtime state snapshot
 */
export interface GoodVibesRuntimeState {
  session_id: string;
  mode: string;
  active: boolean;
  uptime_ms: number;
  agents_spawned: number;
  agents_completed: number;
  hooks_executed: number;
  errors_count: number;
}

// ============================================================================
// Hook Executor Types
// ============================================================================

/**
 * Hook executor interface
 * Responsible for executing hooks at specified injection points
 */
export interface HookExecutor {
  /** Execute hooks for a specific event */
  execute(event: HookEvent, context: HookExecutionContext): Promise<HookExecutionBatch>;

  /** Execute a single hook by name */
  executeSingle(hookName: string, context: HookExecutionContext): Promise<HooksExecutionResult>;

  /** Check if hooks exist for an event */
  hasHooks(event: HookEvent): boolean;

  /** Get all registered hooks for an event */
  getHooks(event: HookEvent): string[];

  /** Register a dynamic hook */
  register(event: HookEvent, handler: HookHandler): string;

  /** Unregister a hook */
  unregister(hookId: string): boolean;
}

/**
 * Hook handler function signature
 */
export type HookHandler = (context: HookExecutionContext) => Promise<HookResult>;

/**
 * Context passed to hook execution
 */
export interface HookExecutionContext extends HookContext {
  /** The specific event being handled */
  event: HookEvent;

  /** Agent ID (if applicable) */
  agent_id?: string;

  /** Agent specification (if applicable) */
  agent_spec?: AgentSpec;

  /** Runtime reference */
  runtime?: GoodVibesRuntime;

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Result from executing a batch of hooks
 */
export interface HookExecutionBatch {
  /** Event that triggered the batch */
  event: HookEvent;

  /** Total execution time in milliseconds */
  total_duration_ms: number;

  /** Number of hooks executed */
  hooks_executed: number;

  /** Number of hooks that succeeded */
  hooks_succeeded: number;

  /** Number of hooks that failed */
  hooks_failed: number;

  /** Number of hooks that were skipped */
  hooks_skipped: number;

  /** Individual hook results */
  results: HooksExecutionResult[];

  /** Whether any hook aborted the batch */
  aborted: boolean;

  /** Abort reason if aborted */
  abort_reason?: string;
}

// ============================================================================
// Hook Result Types
// ============================================================================

/**
 * Result of a single hook execution
 */
export interface HookResult {
  /** Whether the hook executed successfully */
  executed: boolean;

  /** Whether the hook succeeded */
  success: boolean;

  /** Execution duration in milliseconds */
  duration_ms: number;

  /** Error message if failed */
  error?: string;

  /** Output data from the hook */
  output?: unknown;

  /** Whether to abort the current operation */
  abort?: boolean;

  /** Abort reason */
  abort_reason?: string;
}

// ============================================================================
// Hooked Agent Pool
// ============================================================================

/**
 * Agent pool with hooks integration
 * Extends the base AgentPool with runtime and hook executor references
 */
export interface HookedAgentPool extends AgentPool {
  /** Runtime reference */
  runtime: GoodVibesRuntime;

  /** Hook executor for triggering hooks */
  hookExecutor: HookExecutor;

  /** Enqueue with pre/post hooks */
  enqueueWithHooks(spec: AgentSpec): Promise<EnqueueWithHooksResult>;

  /** Dequeue with hooks */
  dequeueWithHooks(id: string): Promise<DequeueWithHooksResult>;
}

/**
 * Result of enqueueing with hooks
 */
export interface EnqueueWithHooksResult {
  /** The agent ID */
  agent_id: string;

  /** Whether enqueue succeeded */
  success: boolean;

  /** Hook results */
  hooks: {
    pre_enqueue: HookResult;
    post_enqueue: HookResult;
  };
}

/**
 * Result of dequeueing with hooks
 */
export interface DequeueWithHooksResult {
  /** Whether dequeue succeeded */
  success: boolean;

  /** Hook results */
  hooks: {
    pre_dequeue: HookResult;
    post_dequeue: HookResult;
  };
}

// ============================================================================
// Hooked Agent Lifecycle
// ============================================================================

/**
 * Agent lifecycle with hooks integration
 * Extends the base AgentLifecycle with hooked operations
 */
export interface HookedAgentLifecycle extends AgentLifecycle {
  /** Spawn with hooks execution */
  spawnWithHooks(spec: AgentSpec): Promise<HookedSpawnResult>;

  /** Complete with hooks execution */
  completeWithHooks(agentId: string, result: unknown): Promise<HookedCompletionResult>;

  /** Monitor with hooks */
  monitorWithHooks(agentId: string): Promise<HookedMonitorResult>;

  /** Cancel with hooks */
  cancelWithHooks(agentId: string, reason?: string): Promise<HookedCompletionResult>;
}

/**
 * Spawn result with hook execution details
 */
export interface HookedSpawnResult extends SpawnResult {
  /** Hook execution results for spawn lifecycle */
  hooks: {
    /** Pre-spawn validation hook */
    pre_spawn: HookResult;
    /** Post-spawn notification hook */
    post_spawn: HookResult;
    /** Context injection hook */
    context_injection: HookResult;
    /** Budget allocation hook */
    budget_set: HookResult;
  };
}

/**
 * Completion result with hook execution details
 */
export interface HookedCompletionResult extends CompletionResult {
  /** Hook execution results for completion lifecycle */
  hooks: {
    /** Pre-completion hook */
    pre_complete: HookResult;
    /** Result processing hook */
    result_processing: HookResult;
    /** Telemetry recording hook */
    telemetry_record: HookResult;
    /** Queue processing hook */
    queue_process: HookResult;
    /** Chain trigger hook (optional, only if chaining) */
    chain_trigger?: HookResult;
  };
}

/**
 * Monitor result with hook execution details
 */
export interface HookedMonitorResult extends MonitorResult {
  /** Hook execution results for monitoring */
  hooks: {
    /** Activity tracking hook */
    activity_track: HookResult;
    /** Budget check hook */
    budget_check: HookResult;
  };
}

// ============================================================================
// Agent Lifecycle Hooks Interface
// ============================================================================

/**
 * Agent lifecycle hooks interface
 * Defines all hooks that can be executed during agent lifecycle events
 */
export interface AgentLifecycleHooks {
  // ---- Spawn Hooks ----

  /**
   * Called before spawning an agent
   * Can modify the spec or reject the spawn
   */
  onAgentPreSpawn(spec: AgentSpec): Promise<PreSpawnResult>;

  /**
   * Called after an agent has been spawned
   * Used for notifications, logging, context setup
   */
  onAgentPostSpawn(agentId: string, spec: AgentSpec): Promise<void>;

  // ---- Running Hooks ----

  /**
   * Called when agent activity is detected
   * Used for monitoring, progress tracking
   */
  onAgentActivity(agentId: string, activity: AgentActivity): Promise<void>;

  /**
   * Called when agent approaches budget limits
   * Can trigger warnings or automatic actions
   */
  onAgentBudgetWarning(agentId: string, usage: BudgetUsage): Promise<void>;

  // ---- Completion Hooks ----

  /**
   * Called before marking an agent as complete
   * Can perform cleanup, validation
   */
  onAgentPreComplete(agentId: string): Promise<void>;

  /**
   * Called after an agent has completed
   * Used for result processing, telemetry
   */
  onAgentPostComplete(agentId: string, result: unknown): Promise<void>;

  // ---- Chaining Hooks ----

  /**
   * Called when evaluating whether to chain to another agent
   * Can approve, modify, or reject the chain
   */
  onAgentChainTrigger(fromAgentId: string, toSpec: AgentSpec): Promise<ChainDecision>;

  // ---- Error Hooks ----

  /**
   * Called when an agent encounters an error
   * Determines error handling strategy
   */
  onAgentError(agentId: string, error: Error): Promise<AgentErrorHandling>;

  /**
   * Called when an agent exceeds time/budget limits
   * Determines timeout handling strategy
   */
  onAgentTimeout(agentId: string): Promise<TimeoutHandling>;
}

// ============================================================================
// Hook Result Types
// ============================================================================

/**
 * Result of pre-spawn hook execution
 */
export interface PreSpawnResult {
  /** Whether the spawn is approved */
  approved: boolean;

  /** Modified agent spec (if changes needed) */
  modified_spec?: AgentSpec;

  /** Reason for rejection (if not approved) */
  rejection_reason?: string;

  /** Additional context to inject */
  context_injection?: Record<string, unknown>;
}

/**
 * Agent activity event data
 */
export interface AgentActivity {
  /** Type of activity */
  type: 'tool_call' | 'output' | 'thinking' | 'waiting' | 'error';

  /** ISO timestamp of the activity */
  timestamp: string;

  /** Activity-specific data */
  data: AgentActivityData;
}

/**
 * Activity data union type
 */
export type AgentActivityData =
  | ToolCallActivityData
  | OutputActivityData
  | ThinkingActivityData
  | WaitingActivityData
  | ErrorActivityData;

/**
 * Tool call activity data
 */
export interface ToolCallActivityData {
  tool_name: string;
  tool_input?: unknown;
  tool_output?: unknown;
  duration_ms?: number;
}

/**
 * Output activity data
 */
export interface OutputActivityData {
  content: string;
  type: 'text' | 'code' | 'file';
}

/**
 * Thinking activity data
 */
export interface ThinkingActivityData {
  content?: string;
  tokens_used: number;
}

/**
 * Waiting activity data
 */
export interface WaitingActivityData {
  reason: string;
  waiting_for?: string;
}

/**
 * Error activity data
 */
export interface ErrorActivityData {
  error_type: string;
  message: string;
  stack?: string;
}

/**
 * Budget usage information for warnings
 */
export interface BudgetUsage {
  /** Tokens consumed so far */
  tokens_used: number;

  /** Tokens remaining in budget */
  tokens_remaining: number;

  /** Percentage of token budget used (0-100) */
  percentage_used: number;

  /** Estimated tokens needed to complete */
  estimated_completion: number;

  /** Turns used so far */
  turns_used: number;

  /** Turns remaining */
  turns_remaining: number;

  /** Time elapsed in milliseconds */
  elapsed_ms: number;

  /** Time remaining in milliseconds */
  time_remaining_ms: number;
}

/**
 * Decision on whether to chain to another agent
 */
export interface ChainDecision {
  /** Whether to proceed with chaining */
  should_chain: boolean;

  /** Delay before spawning chained agent (ms) */
  delay_ms?: number;

  /** Modified spec for the chained agent */
  modified_spec?: AgentSpec;

  /** Reason for the decision */
  reason?: string;

  /** Priority override for the chained agent */
  priority_override?: number;
}

/**
 * Error handling strategy for agent errors
 */
export interface AgentErrorHandling {
  /** Action to take */
  action: 'retry' | 'abort' | 'skip' | 'escalate' | 'fallback';

  /** Number of retries attempted/remaining */
  retry_count?: number;

  /** Maximum retries allowed */
  max_retries?: number;

  /** Delay before retry (ms) */
  retry_delay_ms?: number;

  /** Agent to escalate to (if action is 'escalate') */
  escalate_to?: string;

  /** Fallback spec (if action is 'fallback') */
  fallback_spec?: AgentSpec;

  /** Additional context for the action */
  context?: Record<string, unknown>;
}

/**
 * Timeout handling strategy
 */
export interface TimeoutHandling {
  /** Action to take */
  action: 'extend' | 'kill' | 'warn' | 'checkpoint';

  /** Extension amount in milliseconds (if action is 'extend') */
  extension_ms?: number;

  /** Maximum extensions allowed */
  max_extensions?: number;

  /** Current extension count */
  extension_count?: number;

  /** Whether to create checkpoint before kill */
  checkpoint_before_kill?: boolean;

  /** Warning message (if action is 'warn') */
  warning_message?: string;
}

// ============================================================================
// Agent Hook Injection Points
// ============================================================================

/**
 * All hook injection points in the agent lifecycle
 */
export interface AgentHookInjectionPoints {
  // ---- Spawn Lifecycle ----
  /** Before agent is spawned - validation, approval */
  PRE_SPAWN: 'pre_spawn';
  /** Context injection before agent starts */
  CONTEXT_INJECTION: 'context_injection';
  /** Budget allocation and limits set */
  BUDGET_SET: 'budget_set';
  /** After agent has been spawned */
  POST_SPAWN: 'post_spawn';

  // ---- Running Lifecycle ----
  /** Agent activity detected */
  ACTIVITY: 'activity';
  /** Periodic budget check */
  BUDGET_CHECK: 'budget_check';
  /** Budget warning threshold reached */
  BUDGET_WARNING: 'budget_warning';

  // ---- Completion Lifecycle ----
  /** Before marking agent complete */
  PRE_COMPLETE: 'pre_complete';
  /** Result processing and transformation */
  RESULT_PROCESS: 'result_process';
  /** Telemetry recording */
  TELEMETRY_RECORD: 'telemetry_record';
  /** Queue processing after completion */
  QUEUE_PROCESS: 'queue_process';
  /** After agent has completed */
  POST_COMPLETE: 'post_complete';

  // ---- Chaining ----
  /** Evaluate whether to chain */
  CHAIN_EVALUATE: 'chain_evaluate';
  /** Trigger the chain to next agent */
  CHAIN_TRIGGER: 'chain_trigger';

  // ---- Errors ----
  /** Agent encountered an error */
  ERROR: 'error';
  /** Agent timed out */
  TIMEOUT: 'timeout';
  /** Recovery attempt */
  RECOVERY: 'recovery';
}

/**
 * Constant object with all hook injection point values
 */
export const AGENT_HOOK_INJECTION_POINTS: AgentHookInjectionPoints = {
  // Spawn lifecycle
  PRE_SPAWN: 'pre_spawn',
  CONTEXT_INJECTION: 'context_injection',
  BUDGET_SET: 'budget_set',
  POST_SPAWN: 'post_spawn',

  // Running lifecycle
  ACTIVITY: 'activity',
  BUDGET_CHECK: 'budget_check',
  BUDGET_WARNING: 'budget_warning',

  // Completion lifecycle
  PRE_COMPLETE: 'pre_complete',
  RESULT_PROCESS: 'result_process',
  TELEMETRY_RECORD: 'telemetry_record',
  QUEUE_PROCESS: 'queue_process',
  POST_COMPLETE: 'post_complete',

  // Chaining
  CHAIN_EVALUATE: 'chain_evaluate',
  CHAIN_TRIGGER: 'chain_trigger',

  // Errors
  ERROR: 'error',
  TIMEOUT: 'timeout',
  RECOVERY: 'recovery',
};

/**
 * Type for injection point keys
 */
export type AgentHookInjectionPoint = AgentHookInjectionPoints[keyof AgentHookInjectionPoints];

/**
 * Array of all injection points for iteration
 */
export const ALL_AGENT_HOOK_INJECTION_POINTS: AgentHookInjectionPoint[] = [
  'pre_spawn',
  'context_injection',
  'budget_set',
  'post_spawn',
  'activity',
  'budget_check',
  'budget_warning',
  'pre_complete',
  'result_process',
  'telemetry_record',
  'queue_process',
  'post_complete',
  'chain_evaluate',
  'chain_trigger',
  'error',
  'timeout',
  'recovery',
];

// ============================================================================
// Agent Hooks Coordinator
// ============================================================================

/**
 * Coordinator for agent-hooks integration
 * Orchestrates the hooked agent pool and lifecycle
 */
export interface AgentHooksCoordinator {
  /** Hooked agent pool */
  pool: HookedAgentPool;

  /** Hooked agent lifecycle */
  lifecycle: HookedAgentLifecycle;

  /** Agent lifecycle hooks implementation */
  hooks: AgentLifecycleHooks;

  /** Hook executor reference */
  executor: HookExecutor;

  // ---- Full Lifecycle Operations ----

  /**
   * Spawn an agent with full hook integration
   * Executes pre-spawn, context injection, budget set, and post-spawn hooks
   */
  spawnAgent(spec: AgentSpec): Promise<HookedSpawnResult>;

  /**
   * Monitor an agent with hook integration
   * Executes activity and budget check hooks
   */
  monitorAgent(agentId: string): Promise<HookedMonitorResult>;

  /**
   * Complete an agent with full hook integration
   * Executes pre-complete, result process, telemetry, queue, and post-complete hooks
   */
  completeAgent(agentId: string, result: unknown): Promise<HookedCompletionResult>;

  /**
   * Handle agent error with hooks
   */
  handleError(agentId: string, error: Error): Promise<AgentErrorHandling>;

  /**
   * Handle agent timeout with hooks
   */
  handleTimeout(agentId: string): Promise<TimeoutHandling>;

  // ---- Hook Registration ----

  /**
   * Register a custom hook handler at an injection point
   * @returns Hook registration ID for later removal
   */
  registerHook(
    point: AgentHookInjectionPoint,
    handler: (context: AgentHookContext) => Promise<HookResult>
  ): string;

  /**
   * Unregister a previously registered hook
   */
  unregisterHook(hookId: string): boolean;

  /**
   * Get all registered hooks for an injection point
   */
  getHooksForPoint(point: AgentHookInjectionPoint): string[];

  // ---- Batch Operations ----

  /**
   * Spawn multiple agents with hooks
   */
  spawnBatch(specs: AgentSpec[]): Promise<HookedSpawnResult[]>;

  /**
   * Complete multiple agents with hooks
   */
  completeBatch(
    completions: Array<{ agentId: string; result: unknown }>
  ): Promise<HookedCompletionResult[]>;

  // ---- State Management ----

  /**
   * Initialize the coordinator
   */
  initialize(): Promise<void>;

  /**
   * Shutdown the coordinator
   */
  shutdown(): Promise<void>;

  /**
   * Get coordinator statistics
   */
  getStats(): AgentHooksCoordinatorStats;
}

/**
 * Statistics from the agent hooks coordinator
 */
export interface AgentHooksCoordinatorStats {
  /** Total agents spawned through coordinator */
  total_spawned: number;

  /** Total agents completed through coordinator */
  total_completed: number;

  /** Total hooks executed */
  total_hooks_executed: number;

  /** Hooks executed by injection point */
  hooks_by_point: Record<AgentHookInjectionPoint, number>;

  /** Average hook execution time by point (ms) */
  avg_hook_duration_by_point: Record<AgentHookInjectionPoint, number>;

  /** Total hook failures */
  hook_failures: number;

  /** Hook failures by injection point */
  failures_by_point: Record<AgentHookInjectionPoint, number>;
}

// ============================================================================
// Agent Hook Context
// ============================================================================

/**
 * Context passed to agent hooks
 * Contains all information needed for hook execution
 */
export interface AgentHookContext {
  /** Agent ID being processed */
  agent_id: string;

  /** Agent specification */
  spec: AgentSpec;

  /** Runtime reference */
  runtime: GoodVibesRuntime;

  /** Current agent status */
  status: AgentHookStatus;

  /** Tokens consumed by this agent */
  tokens_used: number;

  /** Number of operations/tool calls made */
  operations_count: number;

  /** ISO timestamp when agent was spawned */
  spawned_at: string;

  /** ISO timestamp of last activity */
  last_activity_at?: string;

  /** Current budget status */
  budget_status: BudgetStatus;

  /** Active agent record (if running) */
  active_agent?: ActiveAgent;

  /** Completed agent record (if completed) */
  completed_agent?: CompletedAgent;

  /** Error (if in error state) */
  error?: Error;

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Agent status within hook context
 */
export type AgentHookStatus =
  | 'pending'
  | 'spawning'
  | 'running'
  | 'completing'
  | 'completed'
  | 'error'
  | 'timeout'
  | 'cancelled';

// ============================================================================
// Hook Configuration for Agents
// ============================================================================

/**
 * Configuration for agent-specific hooks
 */
export interface AgentHooksConfig {
  /** Enable/disable agent hooks globally */
  enabled: boolean;

  /** Default timeout for agent hooks (ms) */
  default_timeout_ms: number;

  /** Whether to run hooks in parallel where possible */
  parallel_execution: boolean;

  /** Maximum parallel hooks */
  max_parallel: number;

  /** Fail fast on hook error */
  fail_fast: boolean;

  /** Hook configurations by injection point */
  point_configs: Partial<Record<AgentHookInjectionPoint, AgentHookPointConfig>>;
}

/**
 * Configuration for a specific hook injection point
 */
export interface AgentHookPointConfig {
  /** Whether this point is enabled */
  enabled: boolean;

  /** Timeout for hooks at this point (ms) */
  timeout_ms: number;

  /** Error behavior: abort, warn, or ignore */
  on_error: 'abort' | 'warn' | 'ignore';

  /** Whether to run hooks at this point asynchronously */
  async: boolean;

  /** Custom handlers for this point */
  handlers?: string[];
}

/**
 * Default agent hooks configuration
 */
export const DEFAULT_AGENT_HOOKS_CONFIG: AgentHooksConfig = {
  enabled: true,
  default_timeout_ms: 5000,
  parallel_execution: true,
  max_parallel: 4,
  fail_fast: false,
  point_configs: {
    pre_spawn: { enabled: true, timeout_ms: 3000, on_error: 'abort', async: false },
    context_injection: { enabled: true, timeout_ms: 2000, on_error: 'warn', async: false },
    budget_set: { enabled: true, timeout_ms: 1000, on_error: 'warn', async: false },
    post_spawn: { enabled: true, timeout_ms: 2000, on_error: 'ignore', async: true },
    activity: { enabled: true, timeout_ms: 1000, on_error: 'ignore', async: true },
    budget_check: { enabled: true, timeout_ms: 1000, on_error: 'warn', async: false },
    budget_warning: { enabled: true, timeout_ms: 2000, on_error: 'warn', async: true },
    pre_complete: { enabled: true, timeout_ms: 3000, on_error: 'warn', async: false },
    result_process: { enabled: true, timeout_ms: 5000, on_error: 'warn', async: false },
    telemetry_record: { enabled: true, timeout_ms: 2000, on_error: 'ignore', async: true },
    queue_process: { enabled: true, timeout_ms: 2000, on_error: 'warn', async: false },
    post_complete: { enabled: true, timeout_ms: 2000, on_error: 'ignore', async: true },
    chain_evaluate: { enabled: true, timeout_ms: 3000, on_error: 'warn', async: false },
    chain_trigger: { enabled: true, timeout_ms: 3000, on_error: 'abort', async: false },
    error: { enabled: true, timeout_ms: 5000, on_error: 'warn', async: false },
    timeout: { enabled: true, timeout_ms: 3000, on_error: 'warn', async: false },
    recovery: { enabled: true, timeout_ms: 5000, on_error: 'warn', async: false },
  },
};

// ============================================================================
// Factory and Builder Types
// ============================================================================

/**
 * Factory for creating agent hooks coordinator instances
 */
export interface AgentHooksCoordinatorFactory {
  /**
   * Create a new coordinator with the given configuration
   */
  create(config: AgentHooksCoordinatorConfig): AgentHooksCoordinator;

  /**
   * Create a coordinator with default configuration
   */
  createDefault(runtime: GoodVibesRuntime): AgentHooksCoordinator;
}

/**
 * Configuration for creating an agent hooks coordinator
 */
export interface AgentHooksCoordinatorConfig {
  /** Runtime reference */
  runtime: GoodVibesRuntime;

  /** Agent pool to use */
  pool: AgentPool;

  /** Agent lifecycle to use */
  lifecycle: AgentLifecycle;

  /** Hook executor to use */
  executor: HookExecutor;

  /** Agent hooks configuration */
  hooks_config: AgentHooksConfig;
}

// ============================================================================
// Event Types for Agent Hooks
// ============================================================================

/**
 * Events emitted by the agent hooks coordinator
 */
export type AgentHooksCoordinatorEvent =
  | 'hook_executed'
  | 'hook_failed'
  | 'hook_timeout'
  | 'spawn_approved'
  | 'spawn_rejected'
  | 'chain_approved'
  | 'chain_rejected'
  | 'error_handled'
  | 'timeout_handled';

/**
 * Event data for agent hooks coordinator events
 */
export interface AgentHooksCoordinatorEventData {
  /** Event type */
  event: AgentHooksCoordinatorEvent;

  /** ISO timestamp */
  timestamp: string;

  /** Agent ID (if applicable) */
  agent_id?: string;

  /** Hook injection point (if applicable) */
  injection_point?: AgentHookInjectionPoint;

  /** Hook result (if applicable) */
  hook_result?: HookResult;

  /** Error (if applicable) */
  error?: Error;

  /** Additional data */
  data?: unknown;
}

/**
 * Event handler for coordinator events
 */
export type AgentHooksCoordinatorEventHandler = (
  data: AgentHooksCoordinatorEventData
) => void;
