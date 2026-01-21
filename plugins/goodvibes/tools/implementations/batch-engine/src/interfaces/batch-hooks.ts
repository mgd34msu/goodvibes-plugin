/**
 * Batch Engine to Hooks Wiring interfaces for Batch Engine
 * @see SPEC-v2 Phase 11.4 Integration
 *
 * This module provides comprehensive interfaces for wiring the batch engine
 * to the hooks system. It defines how batches integrate with lifecycle hooks,
 * operation hooks, and the full hook execution flow.
 */

import type { Batch, BatchConfig } from './batch.js';
import type { BatchResult, OperationResult, PhaseResult, ValidationResult as BaseValidationResult } from './result.js';
import type {
  HookPhase,
  HookContext,
  HookResult,
  LifecycleHooks,
  Hook,
  ErrorHook,
  RetryHook,
} from './lifecycle.js';
import type {
  HooksConfig,
  HookEvent,
  HookRegistration,
  HooksSettings,
  HooksEventContext,
  HooksExecutionResult,
  HookErrorBehavior,
} from './hooks-config.js';
import type { RecoveryMode, RecoveryResult, RecoveryContext } from './recovery.js';
import type { RollbackResult } from './rollback.js';
import type { FixResult } from './fix-loop.js';

// ============================================================================
// Runtime Types
// ============================================================================

/**
 * GoodVibes Runtime interface
 * Core runtime that provides access to all subsystems
 */
export interface GoodVibesRuntime {
  /** Runtime version */
  version: string;
  /** Runtime configuration */
  config: RuntimeConfig;
  /** Session management */
  session: SessionManager;
  /** State management */
  state: StateManager;
  /** Memory system */
  memory: MemorySystem;
  /** Telemetry system */
  telemetry: TelemetrySystem;
}

/**
 * Runtime configuration
 */
export interface RuntimeConfig {
  /** Working directory */
  cwd: string;
  /** Debug mode */
  debug: boolean;
  /** Log level */
  log_level: 'debug' | 'info' | 'warn' | 'error';
  /** Plugin directory */
  plugin_dir: string;
}

/**
 * Session manager interface (minimal for hooks)
 */
export interface SessionManager {
  /** Current session ID */
  id: string;
  /** Session start timestamp */
  started_at: string;
  /** Get session data */
  getData<T>(key: string): T | undefined;
  /** Set session data */
  setData<T>(key: string, value: T): void;
}

/**
 * State manager interface (minimal for hooks)
 */
export interface StateManager {
  /** Get state value */
  get<T>(key: string): T | undefined;
  /** Set state value */
  set<T>(key: string, value: T): void;
  /** Check if key exists */
  has(key: string): boolean;
  /** Delete key */
  delete(key: string): boolean;
}

/**
 * Memory system interface (minimal for hooks)
 */
export interface MemorySystem {
  /** Record a decision */
  recordDecision(decision: unknown): Promise<void>;
  /** Record a pattern */
  recordPattern(pattern: unknown): Promise<void>;
  /** Record a failure */
  recordFailure(failure: unknown): Promise<void>;
  /** Query memory */
  query(query: string): Promise<unknown[]>;
}

/**
 * Telemetry system interface (minimal for hooks)
 */
export interface TelemetrySystem {
  /** Emit a metric */
  emit(name: string, value: number, tags?: Record<string, string>): void;
  /** Record timing */
  timing(name: string, duration_ms: number, tags?: Record<string, string>): void;
  /** Record an event */
  event(name: string, data?: Record<string, unknown>): void;
}

// ============================================================================
// Hook Executor Types
// ============================================================================

/**
 * Hook executor interface
 * Responsible for executing hooks in the correct order with proper error handling
 */
export interface HookExecutor {
  /** Configuration for hook execution */
  config: HooksConfig;
  /** Settings for hook execution */
  settings: HooksSettings;

  /**
   * Execute hooks for a specific event
   * @param event - The event to trigger hooks for
   * @param context - Context to pass to hook handlers
   * @returns Results from all executed hooks
   */
  execute(event: HookEvent, context: HooksEventContext): Promise<HookExecutionBatchResult>;

  /**
   * Execute a single hook
   * @param hook - The hook registration to execute
   * @param context - Context to pass to the handler
   * @returns Result from the hook execution
   */
  executeOne(hook: HookRegistration, context: HooksEventContext): Promise<HooksExecutionResult>;

  /**
   * Check if any hooks are registered for an event
   * @param event - The event to check
   * @returns True if hooks exist for this event
   */
  hasHooksFor(event: HookEvent): boolean;

  /**
   * Get hooks that will run for an event
   * @param event - The event to get hooks for
   * @param context - Optional context for filtering
   * @returns List of hooks that would run
   */
  getHooksFor(event: HookEvent, context?: HooksEventContext): HookRegistration[];
}

/**
 * Result from executing multiple hooks for an event
 */
export interface HookExecutionBatchResult {
  /** Event that was triggered */
  event: HookEvent;
  /** Total hooks executed */
  hooks_executed: number;
  /** Hooks that succeeded */
  hooks_succeeded: number;
  /** Hooks that failed */
  hooks_failed: number;
  /** Hooks that were skipped (filtered out or disabled) */
  hooks_skipped: number;
  /** Total duration in milliseconds */
  duration_ms: number;
  /** Individual hook results */
  results: HooksExecutionResult[];
  /** Aggregated errors from failed hooks */
  errors: HookExecutionError[];
  /** Whether execution should abort (any hook requested abort) */
  should_abort: boolean;
}

/**
 * Error from hook execution
 */
export interface HookExecutionError {
  /** Hook name that failed */
  hook_name: string;
  /** Error message */
  message: string;
  /** Error code if available */
  code?: string;
  /** Stack trace if available */
  stack?: string;
  /** Behavior configured for this error */
  on_error: HookErrorBehavior;
}

// ============================================================================
// Hooked Batch Engine Types
// ============================================================================

/**
 * Batch engine with hooks integration
 * Extends the basic batch engine with full hook lifecycle support
 */
export interface HookedBatchEngine {
  /** GoodVibes runtime reference */
  runtime: GoodVibesRuntime;
  /** Hook executor for running hooks */
  hookExecutor: HookExecutor;
  /** Current hooks configuration */
  hooksConfig: HooksConfig;

  /**
   * Execute batch with full hook integration
   * Runs hooks at each lifecycle phase
   * @param batch - The batch to execute
   * @returns Result with hook execution details
   */
  execute(batch: Batch): Promise<HookedBatchResult>;

  /**
   * Preview batch without executing hooks
   * Shows what would happen including which hooks would run
   * @param batch - The batch to preview
   * @returns Preview with estimated impacts
   */
  preview(batch: Batch): Promise<BatchPreview>;

  /**
   * Validate batch configuration
   * Checks batch is valid before execution
   * @param batch - The batch to validate
   * @returns Validation result
   */
  validate(batch: Batch): Promise<BatchValidationResult>;

  /**
   * Get current hook registrations
   * @returns All registered hooks
   */
  getHooks(): HookRegistration[];

  /**
   * Temporarily disable hooks for next execution
   * @param hooks - Hook names to disable, or 'all' for all hooks
   */
  disableHooksOnce(hooks: string[] | 'all'): void;
}

/**
 * Extended batch result with hook execution details
 */
export interface HookedBatchResult extends BatchResult {
  /** Hook execution results for each phase */
  hooks: BatchHookResults;

  /** Recovery hooks if triggered */
  recovery_hooks?: RecoveryHookResults;

  /** Total time spent in hooks */
  total_hook_time_ms: number;

  /** Percentage of time spent in hooks vs operations */
  hook_overhead_percent: number;
}

/**
 * Hook results organized by batch lifecycle phase
 */
export interface BatchHookResults {
  /** Hooks run at batch start */
  batch_start: HookPhaseResult;
  /** Hooks run during prepare phase */
  prepare: HookPhaseResult;
  /** Hooks run for pre-execution validation */
  validate_before: HookPhaseResult;
  /** Hooks run during execution */
  execute: HookPhaseResult;
  /** Hooks run for post-execution validation */
  validate_after: HookPhaseResult;
  /** Hooks run during commit phase */
  commit: HookPhaseResult;
  /** Hooks run at batch end */
  batch_end: HookPhaseResult;
}

/**
 * Recovery-specific hook results
 */
export interface RecoveryHookResults {
  /** Hooks run on error detection */
  error: HookPhaseResult;
  /** Hooks run during rollback */
  rollback?: HookPhaseResult;
  /** Hooks run during fix loop iterations */
  fix_loop?: HookPhaseResult;
}

/**
 * Result from executing hooks for a single phase
 */
export interface HookPhaseResult {
  /** Whether hooks were executed for this phase */
  executed: boolean;
  /** Number of hooks that ran */
  hooks_run: number;
  /** Number of hooks that succeeded */
  hooks_succeeded: number;
  /** Number of hooks that failed */
  hooks_failed: number;
  /** Total duration in milliseconds */
  duration_ms: number;
  /** Error messages from failed hooks */
  errors?: string[];
  /** Individual hook results for detailed analysis */
  details?: HooksExecutionResult[];
}

// ============================================================================
// Batch Preview Types
// ============================================================================

/**
 * Preview of batch execution
 * Shows what would happen without actually executing
 */
export interface BatchPreview {
  /** Batch ID being previewed */
  batch_id: string;
  /** Preview of each operation */
  operations: OperationPreview[];
  /** Estimated token usage */
  estimated_tokens: number;
  /** Estimated execution time in milliseconds */
  estimated_duration_ms: number;
  /** List of hooks that will run */
  hooks_that_will_run: HookPreview[];
  /** Validation checks that will run */
  validation_checks: ValidationCheckPreview[];
  /** Risk assessment */
  risks: RiskAssessment[];
  /** Dependencies between operations */
  dependencies: DependencyGraph;
  /** Execution order */
  execution_order: string[];
}

/**
 * Preview of a single operation
 */
export interface OperationPreview {
  /** Operation ID */
  id: string;
  /** Operation type (read, write, exec, query, state) */
  type: string;
  /** Human-readable description */
  description: string;
  /** Files that will be affected */
  affected_files?: string[];
  /** Estimated tokens for this operation */
  estimated_tokens: number;
  /** Estimated duration in milliseconds */
  estimated_duration_ms: number;
  /** Risk level for this operation */
  risk_level: RiskLevel;
  /** Whether this operation is reversible */
  reversible: boolean;
  /** Operations this depends on */
  depends_on?: string[];
}

/**
 * Preview of a hook that will run
 */
export interface HookPreview {
  /** Hook name */
  name: string;
  /** Event that triggers this hook */
  event: HookEvent;
  /** Priority order */
  priority: number;
  /** Whether it runs async */
  async: boolean;
  /** Estimated duration */
  estimated_duration_ms: number;
}

/**
 * Preview of a validation check
 */
export interface ValidationCheckPreview {
  /** Check name */
  name: string;
  /** When it runs (before or after) */
  timing: 'before' | 'after';
  /** What it validates */
  description: string;
  /** Whether it can fail the batch */
  blocking: boolean;
}

/**
 * Risk assessment for batch execution
 */
export interface RiskAssessment {
  /** Risk level */
  level: RiskLevel;
  /** Description of the risk */
  description: string;
  /** Suggested mitigation */
  mitigation?: string;
  /** Related operations */
  operations?: string[];
  /** Related files */
  files?: string[];
}

/**
 * Risk level enumeration
 */
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

/**
 * Dependency graph for operations
 */
export interface DependencyGraph {
  /** Nodes (operations) in the graph */
  nodes: string[];
  /** Edges (dependencies) */
  edges: Array<{ from: string; to: string }>;
  /** Operations that can run in parallel */
  parallel_groups: string[][];
  /** Critical path (longest dependency chain) */
  critical_path: string[];
}

// ============================================================================
// Batch Validation Types
// ============================================================================

/**
 * Result from batch validation
 */
export interface BatchValidationResult {
  /** Whether validation passed */
  valid: boolean;
  /** Validation checks that were run */
  checks: ValidationCheck[];
  /** Critical errors that block execution */
  errors: ValidationError[];
  /** Non-critical warnings */
  warnings: ValidationWarning[];
}

/**
 * A single validation check
 */
export interface ValidationCheck {
  /** Check name */
  name: string;
  /** Whether it passed */
  passed: boolean;
  /** Error messages if failed */
  errors?: string[];
  /** Warning messages */
  warnings?: string[];
  /** Duration of the check */
  duration_ms: number;
}

/**
 * Validation error
 */
export interface ValidationError {
  /** Error code */
  code: string;
  /** Error message */
  message: string;
  /** Related operation ID */
  operation_id?: string;
  /** Related file */
  file?: string;
  /** Suggested fix */
  suggestion?: string;
}

/**
 * Validation warning
 */
export interface ValidationWarning {
  /** Warning code */
  code: string;
  /** Warning message */
  message: string;
  /** Related operation ID */
  operation_id?: string;
  /** Related file */
  file?: string;
}

// ============================================================================
// Batch Lifecycle Hooks Types
// ============================================================================

/**
 * Full batch lifecycle hooks interface
 * Provides hooks for every phase of batch execution
 */
export interface BatchLifecycleHooks {
  // ---- Batch-level hooks ----

  /**
   * Called when batch execution starts
   * @param batch - The batch being executed
   */
  onBatchStart(batch: Batch): Promise<void>;

  /**
   * Called during prepare phase
   * Creates checkpoints, acquires locks, injects context
   * @param batch - The batch being prepared
   * @returns Prepare result with checkpoint info
   */
  onBatchPrepare(batch: Batch): Promise<PrepareResult>;

  /**
   * Called before execution for validation
   * @param batch - The batch to validate
   * @returns Validation result
   */
  onBatchValidateBefore(batch: Batch): Promise<HookValidationResult>;

  /**
   * Called during execution phase
   * @param batch - The batch being executed
   */
  onBatchExecute(batch: Batch): Promise<void>;

  /**
   * Called after execution for validation
   * @param batch - The batch that was executed
   * @param result - The execution result
   * @returns Validation result
   */
  onBatchValidateAfter(batch: Batch, result: BatchResult): Promise<HookValidationResult>;

  /**
   * Called during commit phase
   * Persists state, records telemetry
   * @param batch - The batch being committed
   * @param result - The execution result
   */
  onBatchCommit(batch: Batch, result: BatchResult): Promise<void>;

  /**
   * Called when batch execution ends (success or failure)
   * @param batch - The batch that ended
   * @param result - The final result
   */
  onBatchEnd(batch: Batch, result: BatchResult): Promise<void>;

  // ---- Error hooks ----

  /**
   * Called when an error occurs during batch execution
   * @param batch - The batch that errored
   * @param error - The error that occurred
   * @returns Decision on how to handle the error
   */
  onBatchError(batch: Batch, error: Error): Promise<ErrorHandlingResult>;

  /**
   * Called during rollback
   * @param batch - The batch being rolled back
   * @returns Rollback result
   */
  onBatchRollback(batch: Batch): Promise<HookRollbackResult>;
}

/**
 * Result from prepare hook
 */
export interface PrepareResult {
  /** Checkpoint ID if created */
  checkpoint_id?: string;
  /** Resource locks acquired */
  locks_acquired: string[];
  /** Whether context was injected */
  context_injected: boolean;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Result from validation hooks
 */
export interface HookValidationResult {
  /** Whether validation passed */
  passed: boolean;
  /** Individual check results */
  checks: ValidationCheck[];
  /** Whether to abort on failure */
  abort_on_failure: boolean;
}

/**
 * Result from error handling hook
 */
export interface ErrorHandlingResult {
  /** Whether the error was handled */
  handled: boolean;
  /** Action to take */
  action: ErrorAction;
  /** Result from fix attempt if applicable */
  fix_result?: FixResult;
  /** Message explaining the decision */
  message?: string;
}

/**
 * Error handling action
 */
export type ErrorAction = 'rollback' | 'fix' | 'continue' | 'abort' | 'ask_user';

/**
 * Result from rollback hook
 */
export interface HookRollbackResult {
  /** Whether rollback succeeded */
  success: boolean;
  /** Number of files restored */
  files_restored: number;
  /** Whether state was restored */
  state_restored: boolean;
  /** Error messages if any */
  errors?: string[];
  /** Checkpoint that was restored to */
  checkpoint_restored?: string;
}

// ============================================================================
// Operation Lifecycle Hooks Types
// ============================================================================

/**
 * Operation-level lifecycle hooks
 * Provides hooks for individual operation execution
 */
export interface OperationLifecycleHooks {
  /**
   * Called when an operation starts
   * @param operationId - ID of the operation
   * @param type - Type of operation
   * @param context - Operation context
   */
  onOperationStart(
    operationId: string,
    type: string,
    context: OperationHookContext
  ): Promise<void>;

  /**
   * Called when an operation ends successfully
   * @param operationId - ID of the operation
   * @param result - Operation result
   */
  onOperationEnd(operationId: string, result: OperationResult): Promise<void>;

  /**
   * Called when an operation fails
   * @param operationId - ID of the operation
   * @param error - The error that occurred
   */
  onOperationError(operationId: string, error: Error): Promise<void>;

  /**
   * Called when an operation is retried
   * @param operationId - ID of the operation
   * @param attempt - Current attempt number (1-based)
   * @param error - The error that triggered retry
   */
  onOperationRetry(operationId: string, attempt: number, error: Error): Promise<void>;

  /**
   * Called when an operation is skipped
   * @param operationId - ID of the operation
   * @param reason - Why it was skipped
   */
  onOperationSkipped(operationId: string, reason: string): Promise<void>;
}

/**
 * Context passed to operation hooks
 */
export interface OperationHookContext {
  /** Batch ID */
  batch_id: string;
  /** Operation type */
  operation_type: string;
  /** Files involved (if applicable) */
  files?: string[];
  /** Current mode */
  mode: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Hook Injection Points Types
// ============================================================================

/**
 * All hook injection points in the batch engine
 * Defines where custom hooks can be inserted
 */
export interface BatchHookInjectionPoints {
  // ---- Batch boundaries ----
  /** Before batch starts */
  PRE_BATCH: 'pre_batch';
  /** After batch config parsed */
  POST_CONFIG: 'post_config';
  /** After batch ends */
  POST_BATCH: 'post_batch';

  // ---- Phase boundaries ----
  /** Before read operations */
  PRE_READ: 'pre_read';
  /** After read operations */
  POST_READ: 'post_read';
  /** Before write operations */
  PRE_WRITE: 'pre_write';
  /** After write operations */
  POST_WRITE: 'post_write';
  /** Before exec operations */
  PRE_EXEC: 'pre_exec';
  /** After exec operations */
  POST_EXEC: 'post_exec';
  /** Before query operations */
  PRE_QUERY: 'pre_query';
  /** After query operations */
  POST_QUERY: 'post_query';
  /** Before state operations */
  PRE_STATE: 'pre_state';
  /** After state operations */
  POST_STATE: 'post_state';

  // ---- Validation points ----
  /** Before validation */
  PRE_VALIDATE: 'pre_validate';
  /** After validation */
  POST_VALIDATE: 'post_validate';

  // ---- Recovery points ----
  /** Before rollback */
  PRE_ROLLBACK: 'pre_rollback';
  /** After rollback */
  POST_ROLLBACK: 'post_rollback';
  /** Before fix attempt */
  PRE_FIX: 'pre_fix';
  /** After fix attempt */
  POST_FIX: 'post_fix';
}

/**
 * Constant mapping of all injection points
 */
export const BATCH_HOOK_INJECTION_POINTS: BatchHookInjectionPoints = {
  PRE_BATCH: 'pre_batch',
  POST_CONFIG: 'post_config',
  POST_BATCH: 'post_batch',
  PRE_READ: 'pre_read',
  POST_READ: 'post_read',
  PRE_WRITE: 'pre_write',
  POST_WRITE: 'post_write',
  PRE_EXEC: 'pre_exec',
  POST_EXEC: 'post_exec',
  PRE_QUERY: 'pre_query',
  POST_QUERY: 'post_query',
  PRE_STATE: 'pre_state',
  POST_STATE: 'post_state',
  PRE_VALIDATE: 'pre_validate',
  POST_VALIDATE: 'post_validate',
  PRE_ROLLBACK: 'pre_rollback',
  POST_ROLLBACK: 'post_rollback',
  PRE_FIX: 'pre_fix',
  POST_FIX: 'post_fix',
} as const;

/**
 * Type for injection point names
 */
export type InjectionPointName = BatchHookInjectionPoints[keyof BatchHookInjectionPoints];

/**
 * Handler function for custom injection point hooks
 */
export type InjectionPointHandler = (context: InjectionPointContext) => Promise<InjectionPointResult>;

/**
 * Context passed to injection point handlers
 */
export interface InjectionPointContext {
  /** The injection point being executed */
  point: InjectionPointName;
  /** Batch being processed */
  batch: Batch;
  /** Current batch result (if available) */
  result?: BatchResult;
  /** Phase-specific data */
  phase_data?: unknown;
  /** Runtime reference */
  runtime: GoodVibesRuntime;
}

/**
 * Result from injection point handler
 */
export interface InjectionPointResult {
  /** Whether to continue execution */
  continue: boolean;
  /** Modified context (if any) */
  modified_context?: Partial<InjectionPointContext>;
  /** Error if handler failed */
  error?: string;
}

// ============================================================================
// Batch Hooks Coordinator Types
// ============================================================================

/**
 * Main coordinator for batch-hooks integration
 * Orchestrates all hook execution throughout batch lifecycle
 */
export interface BatchHooksCoordinator {
  /** The hooked batch engine */
  engine: HookedBatchEngine;
  /** Batch lifecycle hooks */
  lifecycleHooks: BatchLifecycleHooks;
  /** Operation lifecycle hooks */
  operationHooks: OperationLifecycleHooks;
  /** Registered custom injection point handlers */
  customHandlers: Map<InjectionPointName, InjectionPointHandler[]>;

  /**
   * Execute batch with full hook integration
   * Coordinates all hook execution throughout the batch lifecycle
   * @param batch - The batch to execute
   * @returns Full result with all hook details
   */
  executeWithHooks(batch: Batch): Promise<HookedBatchResult>;

  /**
   * Register a custom hook at an injection point
   * @param point - The injection point to register at
   * @param handler - The handler function
   * @returns Unregister function
   */
  registerHook(
    point: InjectionPointName,
    handler: InjectionPointHandler
  ): () => void;

  /**
   * Unregister a custom hook
   * @param point - The injection point
   * @param handler - The handler to remove
   * @returns Whether the handler was found and removed
   */
  unregisterHook(
    point: InjectionPointName,
    handler: InjectionPointHandler
  ): boolean;

  /**
   * Get all handlers for an injection point
   * @param point - The injection point
   * @returns Array of registered handlers
   */
  getHandlers(point: InjectionPointName): InjectionPointHandler[];

  /**
   * Execute handlers at an injection point
   * @param point - The injection point
   * @param context - Context to pass to handlers
   * @returns Combined result from all handlers
   */
  executeHandlers(
    point: InjectionPointName,
    context: InjectionPointContext
  ): Promise<InjectionPointResult>;

  /**
   * Get execution statistics
   * @returns Statistics about hook execution
   */
  getStats(): CoordinatorStats;

  /**
   * Reset execution statistics
   */
  resetStats(): void;
}

/**
 * Statistics tracked by the coordinator
 */
export interface CoordinatorStats {
  /** Total batches processed */
  batches_processed: number;
  /** Total hooks executed */
  hooks_executed: number;
  /** Total hook failures */
  hooks_failed: number;
  /** Average hook execution time */
  avg_hook_time_ms: number;
  /** Breakdown by injection point */
  by_injection_point: Record<InjectionPointName, InjectionPointStats>;
  /** Breakdown by hook event */
  by_event: Record<HookEvent, EventStats>;
}

/**
 * Statistics for a single injection point
 */
export interface InjectionPointStats {
  /** Times this point was triggered */
  triggered: number;
  /** Total handlers executed */
  handlers_executed: number;
  /** Handler failures */
  failures: number;
  /** Average execution time */
  avg_time_ms: number;
}

/**
 * Statistics for a single hook event
 */
export interface EventStats {
  /** Times this event was triggered */
  triggered: number;
  /** Total hooks executed */
  hooks_executed: number;
  /** Hook successes */
  successes: number;
  /** Hook failures */
  failures: number;
  /** Average execution time */
  avg_time_ms: number;
}

// ============================================================================
// Factory and Builder Types
// ============================================================================

/**
 * Factory for creating hooked batch engines
 */
export interface HookedBatchEngineFactory {
  /**
   * Create a new hooked batch engine
   * @param runtime - GoodVibes runtime
   * @param config - Optional hooks configuration
   * @returns Configured hooked batch engine
   */
  create(runtime: GoodVibesRuntime, config?: Partial<HooksConfig>): HookedBatchEngine;

  /**
   * Create with custom lifecycle hooks
   * @param runtime - GoodVibes runtime
   * @param lifecycleHooks - Custom lifecycle hooks
   * @param operationHooks - Custom operation hooks
   * @returns Configured hooked batch engine
   */
  createWithHooks(
    runtime: GoodVibesRuntime,
    lifecycleHooks: Partial<BatchLifecycleHooks>,
    operationHooks: Partial<OperationLifecycleHooks>
  ): HookedBatchEngine;
}

/**
 * Builder for constructing hooked batch engines
 */
export interface HookedBatchEngineBuilder {
  /** Set the runtime */
  withRuntime(runtime: GoodVibesRuntime): this;
  /** Set hooks configuration */
  withHooksConfig(config: HooksConfig): this;
  /** Set lifecycle hooks */
  withLifecycleHooks(hooks: Partial<BatchLifecycleHooks>): this;
  /** Set operation hooks */
  withOperationHooks(hooks: Partial<OperationLifecycleHooks>): this;
  /** Add a custom injection point handler */
  withInjectionHandler(point: InjectionPointName, handler: InjectionPointHandler): this;
  /** Enable/disable specific hooks */
  withHooksEnabled(enabled: Record<string, boolean>): this;
  /** Build the engine */
  build(): HookedBatchEngine;
}

// ============================================================================
// Default Implementations
// ============================================================================

/**
 * Default empty hook phase result
 */
export const EMPTY_HOOK_PHASE_RESULT: HookPhaseResult = {
  executed: false,
  hooks_run: 0,
  hooks_succeeded: 0,
  hooks_failed: 0,
  duration_ms: 0,
};

/**
 * Default batch hook results (all empty)
 */
export const DEFAULT_BATCH_HOOK_RESULTS: BatchHookResults = {
  batch_start: { ...EMPTY_HOOK_PHASE_RESULT },
  prepare: { ...EMPTY_HOOK_PHASE_RESULT },
  validate_before: { ...EMPTY_HOOK_PHASE_RESULT },
  execute: { ...EMPTY_HOOK_PHASE_RESULT },
  validate_after: { ...EMPTY_HOOK_PHASE_RESULT },
  commit: { ...EMPTY_HOOK_PHASE_RESULT },
  batch_end: { ...EMPTY_HOOK_PHASE_RESULT },
};

/**
 * Create a hook phase result from execution batch result
 */
export function createHookPhaseResult(
  executionResult: HookExecutionBatchResult
): HookPhaseResult {
  return {
    executed: true,
    hooks_run: executionResult.hooks_executed,
    hooks_succeeded: executionResult.hooks_succeeded,
    hooks_failed: executionResult.hooks_failed,
    duration_ms: executionResult.duration_ms,
    errors: executionResult.errors.map((e) => e.message),
    details: executionResult.results,
  };
}

/**
 * Merge multiple hook phase results
 */
export function mergeHookPhaseResults(
  results: HookPhaseResult[]
): HookPhaseResult {
  const merged: HookPhaseResult = {
    executed: results.some((r) => r.executed),
    hooks_run: results.reduce((sum, r) => sum + r.hooks_run, 0),
    hooks_succeeded: results.reduce((sum, r) => sum + r.hooks_succeeded, 0),
    hooks_failed: results.reduce((sum, r) => sum + r.hooks_failed, 0),
    duration_ms: results.reduce((sum, r) => sum + r.duration_ms, 0),
    errors: results.flatMap((r) => r.errors ?? []),
  };

  const details = results.flatMap((r) => r.details ?? []);
  if (details.length > 0) {
    merged.details = details;
  }

  return merged;
}

/**
 * Calculate hook overhead percentage
 */
export function calculateHookOverhead(
  totalTime: number,
  hookTime: number
): number {
  if (totalTime === 0) return 0;
  return Math.round((hookTime / totalTime) * 100 * 100) / 100;
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard for InjectionPointName
 */
export function isInjectionPointName(value: string): value is InjectionPointName {
  return Object.values(BATCH_HOOK_INJECTION_POINTS).includes(value as InjectionPointName);
}

/**
 * Type guard for RiskLevel
 */
export function isRiskLevel(value: string): value is RiskLevel {
  return ['low', 'medium', 'high', 'critical'].includes(value);
}

/**
 * Type guard for ErrorAction
 */
export function isErrorAction(value: string): value is ErrorAction {
  return ['rollback', 'fix', 'continue', 'abort', 'ask_user'].includes(value);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create a minimal hooked batch result from a regular batch result
 */
export function createHookedBatchResult(
  baseResult: BatchResult,
  hookResults: Partial<BatchHookResults> = {}
): HookedBatchResult {
  const hooks: BatchHookResults = {
    ...DEFAULT_BATCH_HOOK_RESULTS,
    ...hookResults,
  };

  const totalHookTime = Object.values(hooks).reduce(
    (sum, r) => sum + r.duration_ms,
    0
  );

  return {
    ...baseResult,
    hooks,
    total_hook_time_ms: totalHookTime,
    hook_overhead_percent: calculateHookOverhead(
      baseResult.summary.duration_ms,
      totalHookTime
    ),
  };
}

/**
 * Extract hook events that should run for a given phase
 */
export function getHookEventsForPhase(phase: HookPhase): HookEvent[] {
  const phaseToEvents: Record<HookPhase, HookEvent[]> = {
    intent: [],
    plan: [],
    prepare: ['batch_start', 'checkpoint_create'],
    validate_before: ['validate_before'],
    execute: ['operation_start', 'operation_end'],
    validate_after: ['validate_after'],
    commit: ['memory_record', 'telemetry_emit'],
    chain: [],
    error: ['operation_error', 'operation_retry', 'fix_loop_start', 'fix_loop_end'],
    rollback: ['rollback_start', 'rollback_end', 'checkpoint_restore'],
    complete: ['batch_end'],
  };

  return phaseToEvents[phase] ?? [];
}

/**
 * Map injection point to related hook events
 */
export function getHookEventsForInjectionPoint(
  point: InjectionPointName
): HookEvent[] {
  const pointToEvents: Record<InjectionPointName, HookEvent[]> = {
    pre_batch: ['batch_start'],
    post_config: [],
    post_batch: ['batch_end'],
    pre_read: ['operation_start'],
    post_read: ['operation_end'],
    pre_write: ['operation_start'],
    post_write: ['operation_end'],
    pre_exec: ['operation_start'],
    post_exec: ['operation_end'],
    pre_query: ['operation_start'],
    post_query: ['operation_end'],
    pre_state: ['operation_start'],
    post_state: ['operation_end'],
    pre_validate: ['validate_before'],
    post_validate: ['validate_after'],
    pre_rollback: ['rollback_start'],
    post_rollback: ['rollback_end'],
    pre_fix: ['fix_loop_start'],
    post_fix: ['fix_loop_end'],
  };

  return pointToEvents[point] ?? [];
}
