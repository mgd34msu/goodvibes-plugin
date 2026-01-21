/**
 * Mode System Wiring interfaces for Batch Engine
 * @see SPEC-v2 Section 10 Integration
 */

import type { ModeConfig, ModeName } from './mode.js';

// ============================================================================
// Runtime Reference (forward declaration for circular dependency avoidance)
// ============================================================================

/**
 * Minimal runtime interface for mode system wiring.
 * Full runtime interface defined in runtime module.
 */
export interface GoodVibesRuntime {
  readonly mode: ModeConfig;
  readonly state: RuntimeState;

  // Mode access
  getModeController(): ModeController;

  // Runtime lifecycle
  isActive(): boolean;
  shutdown(): Promise<void>;
}

export interface RuntimeState {
  status: 'idle' | 'running' | 'paused' | 'error' | 'shutdown';
  current_batch_id?: string;
  current_operation_id?: string;
}

// ============================================================================
// Mode Controller
// ============================================================================

/**
 * Mode controller that manages mode switching and applies mode effects.
 * Central orchestrator for all mode-aware behavior.
 */
export interface ModeController {
  readonly runtime: GoodVibesRuntime;
  readonly currentMode: ModeConfig;

  // Mode switching
  setMode(name: ModeName): Promise<ModeChangeResult>;
  getMode(): ModeConfig;

  // Mode queries
  listAvailableModes(): ModeName[];
  getModeConfig(name: ModeName): ModeConfig | undefined;

  // Mode effects
  applyModeToRuntime(): void;

  // Effects access
  getEffects(): ModeEffects;

  // Hooks management
  registerHooks(hooks: ModeSwitchHooks): void;
  unregisterHooks(): void;
}

// ============================================================================
// Mode Change Results
// ============================================================================

export interface ModeChangeResult {
  success: boolean;
  previous_mode: ModeName;
  new_mode: ModeName;
  changes_applied: ModeChangeEffect[];
  errors?: string[];
  timestamp: number;
}

export interface ModeChangeEffect {
  system: ModeEffectSystem;
  setting: string;
  old_value: unknown;
  new_value: unknown;
}

export type ModeEffectSystem =
  | 'output'
  | 'errors'
  | 'communication'
  | 'execution'
  | 'logging';

// ============================================================================
// Mode Effects
// ============================================================================

/**
 * Mode effects define how the current mode affects each system.
 * Provides typed accessors for mode-driven behavior.
 */
export interface ModeEffects {
  // Output verbosity
  readonly output: OutputModeEffects;

  // Error handling
  readonly errors: ErrorModeEffects;

  // User communication
  readonly communication: CommunicationModeEffects;

  // Execution behavior
  readonly execution: ExecutionModeEffects;

  // Logging behavior
  readonly logging: LoggingModeEffects;
}

export interface OutputModeEffects {
  getOutputMode(): OutputVerbosity;
  shouldShowProgress(): boolean;
  shouldExplainDecisions(): boolean;
  shouldShowDiffs(): boolean;
  shouldShowTelemetry(): boolean;
  getTelemetryLevel(): TelemetryLevel;
}

export type OutputVerbosity = 'count_only' | 'minimal' | 'standard' | 'verbose';
export type TelemetryLevel = 'none' | 'summary' | 'detailed';

export interface ErrorModeEffects {
  getErrorStrategy(): ErrorStrategy;
  shouldAutoFix(): boolean;
  getMaxFixAttempts(): number;
  getAmbiguityStrategy(): AmbiguityStrategy;
  getRiskStrategy(): RiskStrategy;
}

export type ErrorStrategy = 'halt' | 'ask' | 'log_and_continue' | 'fix_and_continue';
export type AmbiguityStrategy = 'ask' | 'best_guess';
export type RiskStrategy = 'halt' | 'ask' | 'proceed_with_checkpoint';

export interface CommunicationModeEffects {
  shouldAskOnAmbiguity(): boolean;
  shouldReportResults(): boolean;
  getReportFormat(): ReportFormat;
  shouldShowProgress(): boolean;
  shouldExplainDecisions(): boolean;
}

export type ReportFormat = 'none' | 'minimal' | 'summary' | 'detailed';

export interface ExecutionModeEffects {
  shouldAutoChain(): boolean;
  getMaxAutonomousBatches(): number | 'unlimited';
  getCheckpointFrequency(): CheckpointFrequency;
  getParallelAgents(): number;
}

export type CheckpointFrequency = 'never' | 'per_batch' | 'per_phase' | 'per_operation';

export interface LoggingModeEffects {
  shouldLogDecisions(): boolean;
  shouldLogErrors(): boolean;
  shouldLogActivity(): boolean;
  getLogPath(): string;
}

// ============================================================================
// Mode-Aware Component Wrappers
// ============================================================================

/**
 * Generic wrapper for making any component mode-aware.
 * Behavior is modified based on current mode configuration.
 */
export interface ModeAwareComponent<T> {
  readonly component: T;
  readonly mode: ModeConfig;

  // Behavior modified by mode
  getBehavior(): ModeAwareBehavior;

  // Update mode reference
  updateMode(mode: ModeConfig): void;
}

export interface ModeAwareBehavior {
  shouldExecute: boolean;
  verbosity: OutputVerbosity;
  errorHandling: ErrorStrategy;
  [key: string]: unknown;
}

// ============================================================================
// Mode-Aware Output Formatter
// ============================================================================

/**
 * Formats output based on current mode settings.
 * Controls what gets shown to user and in what format.
 */
export interface ModeAwareFormatter {
  readonly mode: ModeConfig;

  // Format based on mode
  formatProgress(context: ProgressContext): string;
  formatDecision(context: DecisionContext): string;
  formatResult(context: ResultContext): string;
  formatError(context: ErrorContext): string;

  // Should output at all?
  shouldOutput(type: OutputType): boolean;

  // Get format for type
  getFormat(type: OutputType): FormatConfig;
}

export type OutputType = 'progress' | 'decision' | 'result' | 'error' | 'telemetry';

export interface FormatConfig {
  enabled: boolean;
  verbosity: OutputVerbosity;
  include_timestamps: boolean;
  include_context: boolean;
}

export interface ProgressContext {
  phase: string;
  current: number;
  total: number;
  message?: string;
  operation_id?: string;
}

export interface DecisionContext {
  decision_type: string;
  options: string[];
  selected: string;
  reason?: string;
  confidence?: number;
}

export interface ResultContext {
  operation_id: string;
  status: 'success' | 'failure' | 'skipped';
  details?: unknown;
  duration_ms?: number;
}

export interface ErrorContext {
  error: Error;
  operation_id?: string;
  phase?: string;
  recoverable: boolean;
  action_taken?: string;
}

// ============================================================================
// Mode-Aware Error Handler
// ============================================================================

/**
 * Handles errors based on current mode settings.
 * Decides whether to halt, ask user, log, or auto-fix.
 */
export interface ModeAwareErrorHandler {
  readonly mode: ModeConfig;
  readonly runtime: GoodVibesRuntime;

  // Handle error based on mode
  handleError(error: Error, context: ErrorHandlingContext): Promise<ErrorHandlingResult>;

  // Decide action based on mode
  decideAction(error: Error, context?: ErrorHandlingContext): ErrorActionDecision;

  // Check if error is recoverable
  isRecoverable(error: Error): boolean;

  // Get max fix attempts for current mode
  getMaxFixAttempts(): number;
}

export interface ErrorHandlingContext {
  operation_id?: string;
  phase?: string;
  attempt_number?: number;
  previous_errors?: Error[];
}

export interface ErrorHandlingResult {
  action_taken: ErrorActionTaken;
  user_response?: string;
  fix_result?: FixResult;
  should_continue: boolean;
  error_logged: boolean;
}

export type ErrorActionTaken = 'halted' | 'asked_user' | 'logged' | 'fixed' | 'skipped';

export interface FixResult {
  success: boolean;
  attempts: number;
  final_error?: Error;
  changes_made?: string[];
}

export type ErrorActionDecision =
  | { action: 'halt'; reason: string }
  | { action: 'ask'; prompt: string; options: string[] }
  | { action: 'log'; continue_execution: boolean }
  | { action: 'fix'; max_attempts: number }
  | { action: 'skip'; reason: string };

// ============================================================================
// Mode-Aware Decision Maker
// ============================================================================

/**
 * Makes decisions based on mode settings.
 * Determines when to act autonomously vs ask user.
 */
export interface ModeAwareDecisionMaker {
  readonly mode: ModeConfig;

  // Make decision based on mode
  makeDecision(context: DecisionMakingContext): Promise<DecisionResult>;

  // Should ask user for this situation?
  shouldAskUser(situation: DecisionSituation): boolean;

  // Get default decision for situation
  getDefaultDecision(situation: DecisionSituation): string | undefined;
}

export interface DecisionMakingContext {
  situation: DecisionSituation;
  options: DecisionOption[];
  context?: Record<string, unknown>;
  urgency?: 'low' | 'medium' | 'high';
}

export interface DecisionOption {
  id: string;
  label: string;
  description?: string;
  risk_level?: 'low' | 'medium' | 'high';
  recommended?: boolean;
}

export type DecisionSituation =
  | 'ambiguous_requirement'
  | 'high_risk_operation'
  | 'error_occurred'
  | 'batch_complete'
  | 'checkpoint_needed'
  | 'parallel_conflict'
  | 'resource_limit';

export interface DecisionResult {
  decision: string;
  method: DecisionMethod;
  confidence?: number;
  reason?: string;
  timestamp: number;
}

export type DecisionMethod = 'autonomous' | 'user_input' | 'default' | 'fallback';

// ============================================================================
// Mode Configuration Loader
// ============================================================================

/**
 * Loads and validates mode configurations.
 * Supports built-in modes and custom user-defined modes.
 */
export interface ModeConfigLoader {
  // Load all mode configs
  loadModes(): Promise<Map<ModeName, ModeConfig>>;

  // Load single mode
  loadMode(name: ModeName): Promise<ModeConfig | undefined>;

  // Validate mode config
  validateMode(config: ModeConfig): ModeValidation;

  // Check if mode exists
  hasMode(name: string): boolean;

  // Register custom mode
  registerCustomMode(config: ModeConfig): ModeValidation;
}

export interface ModeValidation {
  valid: boolean;
  errors: ModeValidationError[];
  warnings: ModeValidationWarning[];
}

export interface ModeValidationError {
  field: string;
  message: string;
  value?: unknown;
}

export interface ModeValidationWarning {
  field: string;
  message: string;
  suggestion?: string;
}

// ============================================================================
// Mode Behavior Coordinator
// ============================================================================

/**
 * Coordinates all mode-aware components.
 * Single point of access for mode-driven behavior across the system.
 */
export interface ModeBehaviorCoordinator {
  readonly mode: ModeConfig;
  readonly effects: ModeEffects;
  readonly formatter: ModeAwareFormatter;
  readonly errorHandler: ModeAwareErrorHandler;
  readonly decisionMaker: ModeAwareDecisionMaker;

  // Apply mode to all components
  applyMode(mode: ModeConfig): void;

  // Get coordinated behavior for component
  getBehavior(component: CoordinatedComponent): ComponentBehavior;

  // Check if action is allowed in current mode
  isActionAllowed(action: string): boolean;

  // Get all current behaviors
  getAllBehaviors(): Map<CoordinatedComponent, ComponentBehavior>;
}

export type CoordinatedComponent =
  | 'executor'
  | 'validator'
  | 'reporter'
  | 'checkpoint'
  | 'rollback'
  | 'agent_pool';

export interface ComponentBehavior {
  enabled: boolean;
  verbosity: OutputVerbosity;
  error_strategy: ErrorStrategy;
  checkpoint_frequency: CheckpointFrequency;
  [key: string]: unknown;
}

// ============================================================================
// Mode Switch Hooks
// ============================================================================

/**
 * Hooks for mode switching lifecycle.
 * Allows custom behavior before/after mode changes.
 */
export interface ModeSwitchHooks {
  /**
   * Called before mode switch. Return false to cancel.
   */
  beforeSwitch?: (context: BeforeSwitchContext) => Promise<boolean>;

  /**
   * Called after successful mode switch.
   */
  afterSwitch?: (context: AfterSwitchContext) => Promise<void>;

  /**
   * Called when mode switch fails.
   */
  onSwitchError?: (context: SwitchErrorContext) => Promise<void>;

  /**
   * Called to validate if switch is allowed.
   */
  validateSwitch?: (context: ValidateSwitchContext) => Promise<SwitchValidation>;
}

export interface BeforeSwitchContext {
  old_mode: ModeName;
  new_mode: ModeName;
  runtime_state: RuntimeState;
  timestamp: number;
}

export interface AfterSwitchContext {
  old_mode: ModeName;
  new_mode: ModeName;
  changes_applied: ModeChangeEffect[];
  duration_ms: number;
  timestamp: number;
}

export interface SwitchErrorContext {
  old_mode: ModeName;
  new_mode: ModeName;
  error: Error;
  timestamp: number;
}

export interface ValidateSwitchContext {
  current_mode: ModeName;
  requested_mode: ModeName;
  runtime_state: RuntimeState;
}

export interface SwitchValidation {
  allowed: boolean;
  reason?: string;
  warnings?: string[];
}

// ============================================================================
// Mode Wiring Factory
// ============================================================================

/**
 * Factory for creating mode-aware components.
 * Ensures consistent mode wiring across the system.
 */
export interface ModeWiringFactory {
  /**
   * Create a mode controller for the runtime.
   */
  createController(runtime: GoodVibesRuntime): ModeController;

  /**
   * Create mode effects accessor.
   */
  createEffects(mode: ModeConfig): ModeEffects;

  /**
   * Create mode-aware formatter.
   */
  createFormatter(mode: ModeConfig): ModeAwareFormatter;

  /**
   * Create mode-aware error handler.
   */
  createErrorHandler(mode: ModeConfig, runtime: GoodVibesRuntime): ModeAwareErrorHandler;

  /**
   * Create mode-aware decision maker.
   */
  createDecisionMaker(mode: ModeConfig): ModeAwareDecisionMaker;

  /**
   * Create behavior coordinator with all components.
   */
  createCoordinator(mode: ModeConfig, runtime: GoodVibesRuntime): ModeBehaviorCoordinator;

  /**
   * Wrap a component to make it mode-aware.
   */
  wrapComponent<T>(component: T, mode: ModeConfig): ModeAwareComponent<T>;
}

// ============================================================================
// Type Guards
// ============================================================================

export function isModeConfig(value: unknown): value is ModeConfig {
  if (typeof value !== 'object' || value === null) return false;
  const config = value as Record<string, unknown>;
  return (
    typeof config.name === 'string' &&
    typeof config.description === 'string' &&
    typeof config.communication === 'object' &&
    typeof config.execution === 'object' &&
    typeof config.recovery === 'object' &&
    typeof config.output === 'object' &&
    typeof config.logging === 'object'
  );
}

export function isValidModeName(name: string): name is ModeName {
  return name === 'vibecoding' || name === 'justvibes';
}

export function isErrorStrategy(value: string): value is ErrorStrategy {
  return ['halt', 'ask', 'log_and_continue', 'fix_and_continue'].includes(value);
}

export function isOutputVerbosity(value: string): value is OutputVerbosity {
  return ['count_only', 'minimal', 'standard', 'verbose'].includes(value);
}

export function isCheckpointFrequency(value: string): value is CheckpointFrequency {
  return ['never', 'per_batch', 'per_phase', 'per_operation'].includes(value);
}
