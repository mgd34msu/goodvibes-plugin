/**
 * Hooks to Runtime Wiring interfaces for Batch Engine
 * @see SPEC-v2 Phase 11.2 - Integration
 *
 * This module defines the interfaces that connect the hooks system
 * to the GoodVibes runtime, enabling hooks to access runtime services
 * for checkpoint management, telemetry, memory, validation, and recovery.
 */

import type { HookRegistration, HookEvent, HooksSettings } from './hooks-config.js';
import type { HookPhase, HookResult } from './lifecycle.js';
import type { GoodVibesState, SessionState, CheckpointState } from './state.js';
import type { CheckpointSystem, Checkpoint, RestoreResult } from './checkpoint.js';
import type { Memory, Decision, Pattern, Failure } from './memory.js';
import type { Telemetry, SessionMetrics, BatchMetrics, OperationMetrics } from './telemetry.js';
import type { FixResult, FixableError, FixContext } from './fix-loop.js';

// ============================================================================
// GoodVibes Runtime Interface
// ============================================================================

/**
 * GoodVibes Runtime - Core runtime interface that hooks can access
 * Provides access to all runtime services for hook execution
 */
export interface GoodVibesRuntime {
  /** Current session state */
  readonly state: GoodVibesState;

  /** Checkpoint management system */
  readonly checkpoints: CheckpointSystem;

  /** Memory system for decisions, patterns, failures */
  readonly memory: MemorySystem;

  /** Telemetry system for metrics and audit trail */
  readonly telemetry: TelemetrySystem;

  /** Validation system for typecheck, lint, test */
  readonly validation: ValidationSystem;

  /** Recovery system for rollback and fix loop */
  readonly recovery: RecoverySystem;

  /** Session management */
  readonly session: SessionManager;

  /** Configuration */
  readonly config: RuntimeConfig;

  // ---- Utility Methods ----

  /**
   * Read a file from the filesystem
   */
  readFile(path: string): Promise<string>;

  /**
   * Write a file to the filesystem
   */
  writeFile(path: string, content: string): Promise<void>;

  /**
   * Execute a shell command
   */
  exec(command: string, options?: ExecOptions): Promise<ExecResult>;

  /**
   * Fetch a URL
   */
  fetch(url: string, options?: RequestInit): Promise<Response>;

  /**
   * Log a message with level
   */
  log(level: LogLevel, message: string, data?: Record<string, unknown>): void;
}

/**
 * Log levels for runtime logging
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Runtime configuration
 */
export interface RuntimeConfig {
  /** Project root directory */
  project_root: string;

  /** Current execution mode */
  mode: 'vibecoding' | 'justvibes';

  /** Hook wiring configuration */
  hooks: HookWiringConfig;

  /** Whether in dry-run mode */
  dry_run: boolean;

  /** Verbosity level */
  verbosity: 'quiet' | 'normal' | 'verbose';
}

/**
 * Options for exec command
 */
export interface ExecOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeout_ms?: number;
  shell?: boolean;
}

/**
 * Result from exec command
 */
export interface ExecResult {
  stdout: string;
  stderr: string;
  exit_code: number;
  duration_ms: number;
}

// ============================================================================
// Runtime Subsystems
// ============================================================================

/**
 * Memory system interface for runtime
 */
export interface MemorySystem {
  /** Record a decision */
  recordDecision(decision: Omit<Decision, 'id' | 'timestamp'>): Promise<string>;

  /** Record a pattern */
  recordPattern(pattern: Omit<Pattern, 'id' | 'timestamp'>): Promise<string>;

  /** Record a failure */
  recordFailure(failure: Omit<Failure, 'id' | 'timestamp'>): Promise<string>;

  /** Query decisions */
  queryDecisions(filter?: DecisionFilter): Decision[];

  /** Query patterns */
  queryPatterns(filter?: PatternFilter): Pattern[];

  /** Query failures */
  queryFailures(filter?: FailureFilter): Failure[];

  /** Get full memory state */
  getMemory(): Memory;
}

/**
 * Filter for querying decisions
 */
export interface DecisionFilter {
  category?: string;
  status?: 'active' | 'superseded' | 'reverted';
  since?: string;
  batch_id?: string;
  limit?: number;
}

/**
 * Filter for querying patterns
 */
export interface PatternFilter {
  name_contains?: string;
  min_usage?: number;
  since?: string;
  limit?: number;
}

/**
 * Filter for querying failures
 */
export interface FailureFilter {
  error_type?: string;
  resolved?: boolean;
  since?: string;
  limit?: number;
}

/**
 * Telemetry system interface for runtime
 */
export interface TelemetrySystem {
  /** Record session metrics */
  recordSession(metrics: Partial<SessionMetrics>): void;

  /** Record batch metrics */
  recordBatch(metrics: BatchMetrics): void;

  /** Record operation metrics */
  recordOperation(metrics: OperationMetrics): void;

  /** Emit a telemetry event */
  emit(event: TelemetryEvent): void;

  /** Get current telemetry */
  getTelemetry(): Telemetry;

  /** Flush telemetry to storage */
  flush(): Promise<void>;
}

/**
 * Telemetry event structure
 */
export interface TelemetryEvent {
  type: string;
  timestamp: string;
  data: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

/**
 * Validation system interface for runtime
 */
export interface ValidationSystem {
  /** Run TypeScript type checking */
  typecheck(options?: TypecheckOptions): Promise<ValidationResult>;

  /** Run linter (ESLint) */
  lint(options?: LintOptions): Promise<ValidationResult>;

  /** Run test suite */
  test(options?: TestOptions): Promise<ValidationResult>;

  /** Run build */
  build(options?: BuildOptions): Promise<ValidationResult>;

  /** Run all validations */
  runAll(options?: ValidationOptions): Promise<ValidationSummary>;
}

/**
 * Options for typecheck
 */
export interface TypecheckOptions {
  files?: string[];
  strict?: boolean;
  project?: string;
}

/**
 * Options for lint
 */
export interface LintOptions {
  files?: string[];
  fix?: boolean;
  rules?: Record<string, unknown>;
}

/**
 * Options for test
 */
export interface TestOptions {
  files?: string[];
  coverage?: boolean;
  watch?: boolean;
  filter?: string;
}

/**
 * Options for build
 */
export interface BuildOptions {
  production?: boolean;
  clean?: boolean;
  analyze?: boolean;
}

/**
 * General validation options
 */
export interface ValidationOptions {
  typecheck?: TypecheckOptions | boolean;
  lint?: LintOptions | boolean;
  test?: TestOptions | boolean;
  build?: BuildOptions | boolean;
  parallel?: boolean;
  fail_fast?: boolean;
}

/**
 * Summary of all validation results
 */
export interface ValidationSummary {
  passed: boolean;
  typecheck?: ValidationResult;
  lint?: ValidationResult;
  test?: ValidationResult;
  build?: ValidationResult;
  duration_ms: number;
}

/**
 * Recovery system interface for runtime
 */
export interface RecoverySystem {
  /** Rollback to a checkpoint */
  rollback(checkpoint_id: string): Promise<RestoreResult>;

  /** Rollback to the latest checkpoint */
  rollbackToLatest(): Promise<RestoreResult>;

  /** Run fix loop for an error */
  runFixLoop(context: FixContext): Promise<FixResult>;

  /** Check if an error can be fixed */
  canFix(error: FixableError): boolean;

  /** Get recovery status */
  getStatus(): RecoveryStatus;
}

/**
 * Recovery system status
 */
export interface RecoveryStatus {
  available_checkpoints: number;
  latest_checkpoint_id?: string;
  fix_loop_active: boolean;
  current_attempt?: number;
}

/**
 * Session manager interface
 */
export interface SessionManager {
  /** Initialize a new session */
  initialize(config?: SessionInitConfig): Promise<void>;

  /** Cleanup current session */
  cleanup(): Promise<void>;

  /** Get current session state */
  getState(): SessionState;

  /** Update session state */
  updateState(updates: Partial<SessionState>): void;

  /** Get session ID */
  getId(): string;

  /** Check if session is active */
  isActive(): boolean;
}

/**
 * Session initialization configuration
 */
export interface SessionInitConfig {
  mode?: 'vibecoding' | 'justvibes';
  feature?: string;
  restore_checkpoint?: string;
}

// ============================================================================
// Hook Executor Interface
// ============================================================================

/**
 * Hook executor that uses runtime to execute hooks
 */
export interface HookExecutor {
  /** Reference to the runtime */
  readonly runtime: GoodVibesRuntime;

  /**
   * Execute all hooks for an event
   * @param event - The hook event type
   * @param context - Context for hook execution
   * @returns Aggregated results from all hooks
   */
  executeHooks(event: HookEvent, context: HookContext): Promise<HookExecutionResult>;

  /**
   * Execute a single hook
   * @param hook - The hook registration to execute
   * @param context - Context for hook execution
   * @returns Result from the single hook
   */
  executeHook(hook: HookRegistration, context: HookContext): Promise<SingleHookResult>;

  /**
   * Get all hooks registered for an event
   * @param event - The hook event type
   * @returns Array of hook registrations sorted by priority
   */
  getHooksForEvent(event: HookEvent): HookRegistration[];

  /**
   * Check if execution should be aborted
   */
  shouldAbort(): boolean;

  /**
   * Get current execution state
   */
  getExecutionState(): HookExecutionState;
}

/**
 * Current execution state of the hook executor
 */
export interface HookExecutionState {
  current_event?: HookEvent;
  hooks_pending: number;
  hooks_completed: number;
  hooks_failed: number;
  aborted: boolean;
  abort_reason?: string;
}

// ============================================================================
// Hook Context Interface
// ============================================================================

/**
 * Context passed to hooks during execution
 * Provides access to event info, runtime, and prior results
 */
export interface HookContext {
  // ---- Event Information ----

  /** The event that triggered this hook */
  event: HookEvent;

  /** ISO timestamp when the event was triggered */
  timestamp: string;

  /** Current lifecycle phase */
  phase: HookPhase;

  // ---- Identifiers ----

  /** Session ID */
  session_id: string;

  /** Current batch ID (if applicable) */
  batch_id?: string;

  /** Current operation ID (if applicable) */
  operation_id?: string;

  /** Agent ID (for agent events) */
  agent_id?: string;

  // ---- Runtime Reference ----

  /** Reference to the GoodVibes runtime */
  runtime: GoodVibesRuntime;

  // ---- Event-Specific Data ----

  /** Event-specific data payload */
  data: HookEventData;

  // ---- Prior Results ----

  /** Results from prior hooks in the same event */
  prior_results: SingleHookResult[];

  // ---- Utilities ----

  /**
   * Read a file (convenience wrapper)
   */
  read: (path: string) => Promise<string>;

  /**
   * Fetch a URL (convenience wrapper)
   */
  fetch: (url: string, options?: RequestInit) => Promise<Response>;

  /**
   * Log a message (convenience wrapper)
   */
  log: (level: LogLevel, message: string, data?: Record<string, unknown>) => void;
}

/**
 * Union type for all event-specific data payloads
 */
export type HookEventData =
  | SessionStartData
  | SessionEndData
  | BatchStartData
  | BatchEndData
  | OperationStartData
  | OperationEndData
  | OperationErrorData
  | OperationRetryData
  | AgentStartData
  | AgentEndData
  | CheckpointCreateData
  | CheckpointRestoreData
  | RollbackStartData
  | RollbackEndData
  | FixLoopStartData
  | FixLoopEndData
  | FixLoopIterationData
  | ValidateBeforeData
  | ValidateAfterData
  | ModeChangeData
  | MemoryRecordData
  | TelemetryEmitData
  | GenericHookData;

// ============================================================================
// Hook Execution Results
// ============================================================================

/**
 * Aggregated result from executing all hooks for an event
 */
export interface HookExecutionResult {
  /** The event that was processed */
  event: HookEvent;

  /** Total number of hooks registered for this event */
  total_hooks: number;

  /** Number of hooks that were executed */
  executed: number;

  /** Number of hooks that succeeded */
  succeeded: number;

  /** Number of hooks that failed */
  failed: number;

  /** Number of hooks that were skipped (filtered out or disabled) */
  skipped: number;

  /** Total duration of all hook executions in milliseconds */
  duration_ms: number;

  /** Individual results from each hook */
  results: SingleHookResult[];

  /** Whether execution was aborted early */
  aborted: boolean;

  /** Reason for abortion (if aborted) */
  abort_reason?: string;

  /** Any data aggregated from hook outputs */
  aggregated_data?: Record<string, unknown>;
}

/**
 * Result from executing a single hook
 */
export interface SingleHookResult {
  /** Name of the hook that was executed */
  hook_name: string;

  /** Execution status */
  status: 'success' | 'failed' | 'skipped' | 'timeout';

  /** Duration of execution in milliseconds */
  duration_ms: number;

  /** Output data from the hook (if any) */
  output?: unknown;

  /** Error information (if failed) */
  error?: HookError;

  /** Reason for skipping (if skipped) */
  skipped_reason?: string;

  /** Whether this hook requested abort */
  requested_abort?: boolean;

  /** Number of retries attempted */
  retries?: number;
}

/**
 * Error information from a failed hook
 */
export interface HookError {
  /** Error message */
  message: string;

  /** Error stack trace */
  stack?: string;

  /** Error code (if available) */
  code?: string;

  /** Original error object type */
  type?: string;
}

// ============================================================================
// Validation Result (for validation hooks)
// ============================================================================

/**
 * Result from validation hooks (typecheck, lint, test, build)
 */
export interface ValidationResult {
  /** Whether validation passed */
  passed: boolean;

  /** List of errors found */
  errors: ValidationError[];

  /** List of warnings found */
  warnings: ValidationWarning[];

  /** Duration of validation in milliseconds */
  duration_ms: number;

  /** Number of files checked */
  files_checked?: number;

  /** Command that was run */
  command?: string;

  /** Exit code from the validation command */
  exit_code?: number;
}

/**
 * Validation error
 */
export interface ValidationError {
  file?: string;
  line?: number;
  column?: number;
  message: string;
  code?: string;
  severity: 'error';
}

/**
 * Validation warning
 */
export interface ValidationWarning {
  file?: string;
  line?: number;
  column?: number;
  message: string;
  code?: string;
  severity: 'warning';
}

// ============================================================================
// Fix Loop Result (for recovery hooks)
// ============================================================================

/**
 * Result from running fix loop
 */
export interface FixLoopResult {
  /** Whether all errors were fixed */
  success: boolean;

  /** Number of fix attempts made */
  attempts: number;

  /** Errors that were fixed */
  fixed_errors: string[];

  /** Errors that remain unfixed */
  remaining_errors: string[];

  /** Total tokens consumed */
  tokens_used: number;

  /** Total duration in milliseconds */
  duration_ms: number;

  /** Actions taken during fix attempts */
  actions: FixLoopAction[];
}

/**
 * Action taken during fix loop
 */
export interface FixLoopAction {
  type: 'edit' | 'create' | 'delete' | 'command';
  target: string;
  description: string;
  success: boolean;
}

// ============================================================================
// Built-in Hook Handlers Interface
// ============================================================================

/**
 * Built-in hook handlers that use runtime services
 * These are the default implementations for common hook operations
 */
export interface RuntimeHookHandlers {
  // ---- Session Hooks ----

  /**
   * Initialize session - called on session_start
   * Sets up session state, loads memory context, initializes telemetry
   */
  initSession(context: HookContext): Promise<void>;

  /**
   * Cleanup session - called on session_end
   * Persists state, flushes telemetry, releases resources
   */
  cleanupSession(context: HookContext): Promise<void>;

  // ---- Checkpoint Hooks ----

  /**
   * Create checkpoint - called on batch_start or before risky operations
   * Returns the checkpoint ID
   */
  createCheckpoint(context: HookContext): Promise<string>;

  /**
   * Restore checkpoint - called during rollback
   */
  restoreCheckpoint(context: HookContext): Promise<void>;

  // ---- Telemetry Hooks ----

  /**
   * Record telemetry - called on batch_end, operation_end
   */
  recordTelemetry(context: HookContext): Promise<void>;

  /**
   * Emit telemetry event
   */
  emitTelemetry(context: HookContext): Promise<void>;

  // ---- Validation Hooks ----

  /**
   * Run TypeScript type checking
   */
  runTypecheck(context: HookContext): Promise<ValidationResult>;

  /**
   * Run ESLint
   */
  runLint(context: HookContext): Promise<ValidationResult>;

  /**
   * Run test suite
   */
  runTest(context: HookContext): Promise<ValidationResult>;

  /**
   * Run build
   */
  runBuild(context: HookContext): Promise<ValidationResult>;

  // ---- Recovery Hooks ----

  /**
   * Rollback to checkpoint - called on operation_error
   */
  rollback(context: HookContext): Promise<void>;

  /**
   * Run fix loop - called on operation_error after rollback
   */
  runFixLoop(context: HookContext): Promise<FixLoopResult>;

  // ---- Memory Hooks ----

  /**
   * Record a decision to memory
   */
  recordDecision(context: HookContext): Promise<void>;

  /**
   * Record a pattern to memory
   */
  recordPattern(context: HookContext): Promise<void>;

  /**
   * Record a failure to memory
   */
  recordFailure(context: HookContext): Promise<void>;

  /**
   * Inject relevant context from memory
   */
  injectContext(context: HookContext): Promise<void>;

  // ---- Locking Hooks ----

  /**
   * Acquire resource locks
   */
  acquireLocks(context: HookContext): Promise<void>;

  /**
   * Release resource locks
   */
  releaseLocks(context: HookContext): Promise<void>;

  // ---- State Hooks ----

  /**
   * Update session state
   */
  updateState(context: HookContext): Promise<void>;
}

// ============================================================================
// Hook Registry Interface
// ============================================================================

/**
 * Handler function type
 */
export type HookHandler = (context: HookContext) => Promise<HookResult | void>;

/**
 * Hook registry with runtime integration
 */
export interface RuntimeHookRegistry {
  /**
   * Register all built-in handlers from RuntimeHookHandlers
   */
  registerBuiltinHandlers(handlers: RuntimeHookHandlers): void;

  /**
   * Register a custom handler
   * @param name - Handler name (e.g., 'custom:my_handler')
   * @param handler - Handler function
   */
  registerHandler(name: string, handler: HookHandler): void;

  /**
   * Unregister a handler
   * @param name - Handler name to remove
   * @returns True if handler was found and removed
   */
  unregisterHandler(name: string): boolean;

  /**
   * Get a handler by name
   * @param name - Handler name (supports 'builtin:' prefix)
   * @returns The handler function or undefined
   */
  getHandler(name: string): HookHandler | undefined;

  /**
   * Check if a handler exists
   * @param name - Handler name
   */
  hasHandler(name: string): boolean;

  /**
   * List all registered handler names
   */
  listHandlers(): string[];

  /**
   * List only built-in handlers
   */
  listBuiltinHandlers(): string[];

  /**
   * List only custom handlers
   */
  listCustomHandlers(): string[];
}

// ============================================================================
// Hook Wiring Configuration
// ============================================================================

/**
 * Configuration for hook wiring and execution
 */
export interface HookWiringConfig {
  /** Execute independent hooks in parallel where possible */
  parallel_execution: boolean;

  /** Maximum number of hooks to run in parallel */
  max_parallel: number;

  /** Default timeout for hook execution in milliseconds */
  default_timeout_ms: number;

  /** Continue executing subsequent hooks if one fails */
  continue_on_failure: boolean;

  /** Log hook execution start/end */
  log_execution: boolean;

  /** Log hook timing information */
  log_timing: boolean;

  /** Enable hook execution metrics collection */
  collect_metrics: boolean;

  /** Retry failed hooks automatically */
  auto_retry: boolean;

  /** Default retry count for failed hooks */
  default_retry_count: number;

  /** Delay between retries in milliseconds */
  retry_delay_ms: number;
}

/**
 * Default hook wiring configuration
 */
export const DEFAULT_HOOK_WIRING_CONFIG: HookWiringConfig = {
  parallel_execution: true,
  max_parallel: 4,
  default_timeout_ms: 30000,
  continue_on_failure: false,
  log_execution: true,
  log_timing: true,
  collect_metrics: true,
  auto_retry: false,
  default_retry_count: 2,
  retry_delay_ms: 1000,
};

// ============================================================================
// Event-Specific Data Types
// ============================================================================

/**
 * Data for session_start event
 */
export interface SessionStartData {
  event_type: 'session_start';
  session_id: string;
  mode: 'vibecoding' | 'justvibes';
  feature?: string;
  restore_checkpoint?: string;
}

/**
 * Data for session_end event
 */
export interface SessionEndData {
  event_type: 'session_end';
  session_id: string;
  duration_ms: number;
  batches_completed: number;
  operations_completed: number;
  exit_status: 'success' | 'error' | 'aborted';
}

/**
 * Data for batch_start event
 */
export interface BatchStartData {
  event_type: 'batch_start';
  batch_id: string;
  operations_count: number;
  operation_types: string[];
  estimated_tokens?: number;
}

/**
 * Data for batch_end event
 */
export interface BatchEndData {
  event_type: 'batch_end';
  batch_id: string;
  status: 'success' | 'partial' | 'failed' | 'rolled_back';
  operations_succeeded: number;
  operations_failed: number;
  duration_ms: number;
  tokens_used: number;
  result?: unknown;
}

/**
 * Data for operation_start event
 */
export interface OperationStartData {
  event_type: 'operation_start';
  operation_id: string;
  operation_type: string;
  batch_id: string;
  target?: string;
  estimated_tokens?: number;
}

/**
 * Data for operation_end event
 */
export interface OperationEndData {
  event_type: 'operation_end';
  operation_id: string;
  operation_type: string;
  batch_id: string;
  status: 'success' | 'failed' | 'skipped';
  duration_ms: number;
  tokens_used: number;
  result?: unknown;
}

/**
 * Data for operation_error event
 */
export interface OperationErrorData {
  event_type: 'operation_error';
  operation_id: string;
  operation_type: string;
  batch_id: string;
  error: Error;
  error_type?: string;
  recoverable: boolean;
  checkpoint_available: boolean;
}

/**
 * Data for operation_retry event
 */
export interface OperationRetryData {
  event_type: 'operation_retry';
  operation_id: string;
  operation_type: string;
  batch_id: string;
  attempt: number;
  max_attempts: number;
  previous_error: string;
  delay_ms: number;
}

/**
 * Data for agent_start event
 */
export interface AgentStartData {
  event_type: 'agent_start';
  agent_id: string;
  agent_type: string;
  batch_id: string;
  operation_id: string;
  task: string;
  budget: {
    max_tokens: number;
    max_turns: number;
  };
}

/**
 * Data for agent_end event
 */
export interface AgentEndData {
  event_type: 'agent_end';
  agent_id: string;
  agent_type: string;
  batch_id: string;
  operation_id: string;
  status: 'success' | 'failed' | 'timeout' | 'budget_exceeded';
  duration_ms: number;
  tokens_used: number;
  turns_used: number;
  files_modified: string[];
  summary?: string;
}

/**
 * Data for checkpoint_create event
 */
export interface CheckpointCreateData {
  event_type: 'checkpoint_create';
  checkpoint_id: string;
  batch_id?: string;
  reason: string;
  files_count: number;
  size_bytes: number;
}

/**
 * Data for checkpoint_restore event
 */
export interface CheckpointRestoreData {
  event_type: 'checkpoint_restore';
  checkpoint_id: string;
  files_restored: string[];
  state_restored: string[];
  duration_ms: number;
}

/**
 * Data for rollback_start event
 */
export interface RollbackStartData {
  event_type: 'rollback_start';
  checkpoint_id: string;
  batch_id: string;
  reason: string;
}

/**
 * Data for rollback_end event
 */
export interface RollbackEndData {
  event_type: 'rollback_end';
  checkpoint_id: string;
  batch_id: string;
  success: boolean;
  files_restored: string[];
  duration_ms: number;
}

/**
 * Data for fix_loop_start event
 */
export interface FixLoopStartData {
  event_type: 'fix_loop_start';
  batch_id: string;
  operation_id: string;
  errors_count: number;
  max_attempts: number;
}

/**
 * Data for fix_loop_end event
 */
export interface FixLoopEndData {
  event_type: 'fix_loop_end';
  batch_id: string;
  operation_id: string;
  success: boolean;
  attempts: number;
  fixed_count: number;
  remaining_count: number;
  duration_ms: number;
}

/**
 * Data for fix_loop_iteration event
 */
export interface FixLoopIterationData {
  event_type: 'fix_loop_iteration';
  batch_id: string;
  operation_id: string;
  iteration: number;
  strategy: string;
  errors_before: number;
  errors_after: number;
  actions_taken: number;
}

/**
 * Data for validate_before event
 */
export interface ValidateBeforeData {
  event_type: 'validate_before';
  batch_id: string;
  validation_types: ('typecheck' | 'lint' | 'test' | 'build')[];
}

/**
 * Data for validate_after event
 */
export interface ValidateAfterData {
  event_type: 'validate_after';
  batch_id: string;
  validation_types: ('typecheck' | 'lint' | 'test' | 'build')[];
  results: ValidationSummary;
}

/**
 * Data for mode_change event
 */
export interface ModeChangeData {
  event_type: 'mode_change';
  previous_mode: 'vibecoding' | 'justvibes';
  new_mode: 'vibecoding' | 'justvibes';
  reason?: string;
}

/**
 * Data for memory_record event
 */
export interface MemoryRecordData {
  event_type: 'memory_record';
  record_type: 'decision' | 'pattern' | 'failure';
  record_id: string;
  summary: string;
}

/**
 * Data for telemetry_emit event
 */
export interface TelemetryEmitData {
  event_type: 'telemetry_emit';
  telemetry_type: string;
  metrics: Record<string, unknown>;
}

/**
 * Generic data for events without specific structure
 */
export interface GenericHookData {
  event_type: 'generic';
  [key: string]: unknown;
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if data is SessionStartData
 */
export function isSessionStartData(data: HookEventData): data is SessionStartData {
  return (data as SessionStartData).event_type === 'session_start';
}

/**
 * Type guard to check if data is SessionEndData
 */
export function isSessionEndData(data: HookEventData): data is SessionEndData {
  return (data as SessionEndData).event_type === 'session_end';
}

/**
 * Type guard to check if data is BatchStartData
 */
export function isBatchStartData(data: HookEventData): data is BatchStartData {
  return (data as BatchStartData).event_type === 'batch_start';
}

/**
 * Type guard to check if data is BatchEndData
 */
export function isBatchEndData(data: HookEventData): data is BatchEndData {
  return (data as BatchEndData).event_type === 'batch_end';
}

/**
 * Type guard to check if data is OperationStartData
 */
export function isOperationStartData(data: HookEventData): data is OperationStartData {
  return (data as OperationStartData).event_type === 'operation_start';
}

/**
 * Type guard to check if data is OperationEndData
 */
export function isOperationEndData(data: HookEventData): data is OperationEndData {
  return (data as OperationEndData).event_type === 'operation_end';
}

/**
 * Type guard to check if data is OperationErrorData
 */
export function isOperationErrorData(data: HookEventData): data is OperationErrorData {
  return (data as OperationErrorData).event_type === 'operation_error';
}

/**
 * Type guard to check if data is OperationRetryData
 */
export function isOperationRetryData(data: HookEventData): data is OperationRetryData {
  return (data as OperationRetryData).event_type === 'operation_retry';
}

/**
 * Type guard to check if data is AgentStartData
 */
export function isAgentStartData(data: HookEventData): data is AgentStartData {
  return (data as AgentStartData).event_type === 'agent_start';
}

/**
 * Type guard to check if data is AgentEndData
 */
export function isAgentEndData(data: HookEventData): data is AgentEndData {
  return (data as AgentEndData).event_type === 'agent_end';
}

/**
 * Type guard to check if data is CheckpointCreateData
 */
export function isCheckpointCreateData(data: HookEventData): data is CheckpointCreateData {
  return (data as CheckpointCreateData).event_type === 'checkpoint_create';
}

/**
 * Type guard to check if data is CheckpointRestoreData
 */
export function isCheckpointRestoreData(data: HookEventData): data is CheckpointRestoreData {
  return (data as CheckpointRestoreData).event_type === 'checkpoint_restore';
}

/**
 * Type guard to check if data is FixLoopStartData
 */
export function isFixLoopStartData(data: HookEventData): data is FixLoopStartData {
  return (data as FixLoopStartData).event_type === 'fix_loop_start';
}

/**
 * Type guard to check if data is FixLoopEndData
 */
export function isFixLoopEndData(data: HookEventData): data is FixLoopEndData {
  return (data as FixLoopEndData).event_type === 'fix_loop_end';
}

/**
 * Type guard to check if data is ValidationResult
 */
export function isValidationResult(result: unknown): result is ValidationResult {
  return (
    typeof result === 'object' &&
    result !== null &&
    'passed' in result &&
    'errors' in result &&
    'warnings' in result
  );
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create a hook context with defaults
 */
export function createHookContext(
  event: HookEvent,
  runtime: GoodVibesRuntime,
  data: HookEventData,
  overrides?: Partial<HookContext>
): HookContext {
  return {
    event,
    timestamp: new Date().toISOString(),
    phase: getPhaseForEvent(event),
    session_id: runtime.session.getId(),
    runtime,
    data,
    prior_results: [],
    read: (path) => runtime.readFile(path),
    fetch: (url, options) => runtime.fetch(url, options),
    log: (level, message, logData) => runtime.log(level, message, logData),
    ...overrides,
  };
}

/**
 * Map event to lifecycle phase
 */
export function getPhaseForEvent(event: HookEvent): HookPhase {
  const mapping: Record<HookEvent, HookPhase> = {
    session_start: 'prepare',
    session_end: 'complete',
    batch_start: 'prepare',
    batch_end: 'complete',
    operation_start: 'execute',
    operation_end: 'execute',
    operation_error: 'error',
    operation_retry: 'error',
    agent_start: 'execute',
    agent_end: 'execute',
    agent_spawn: 'execute',
    agent_complete: 'execute',
    checkpoint_create: 'prepare',
    checkpoint_restore: 'rollback',
    rollback_start: 'rollback',
    rollback_end: 'rollback',
    fix_loop_start: 'error',
    fix_loop_end: 'error',
    fix_loop_iteration: 'error',
    validate_before: 'validate_before',
    validate_after: 'validate_after',
    mode_change: 'prepare',
    memory_record: 'commit',
    memory_query: 'prepare',
    telemetry_emit: 'commit',
  };
  return mapping[event] || 'execute';
}

/**
 * Create an empty hook execution result
 */
export function createEmptyExecutionResult(event: HookEvent): HookExecutionResult {
  return {
    event,
    total_hooks: 0,
    executed: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    duration_ms: 0,
    results: [],
    aborted: false,
  };
}

/**
 * Merge hook execution results
 */
export function mergeExecutionResults(
  results: HookExecutionResult[]
): HookExecutionResult {
  if (results.length === 0) {
    return createEmptyExecutionResult('batch_start');
  }

  const merged: HookExecutionResult = {
    event: results[0]!.event,
    total_hooks: 0,
    executed: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    duration_ms: 0,
    results: [],
    aborted: false,
  };

  for (const result of results) {
    merged.total_hooks += result.total_hooks;
    merged.executed += result.executed;
    merged.succeeded += result.succeeded;
    merged.failed += result.failed;
    merged.skipped += result.skipped;
    merged.duration_ms += result.duration_ms;
    merged.results.push(...result.results);
    if (result.aborted) {
      merged.aborted = true;
      merged.abort_reason = result.abort_reason;
    }
  }

  return merged;
}
