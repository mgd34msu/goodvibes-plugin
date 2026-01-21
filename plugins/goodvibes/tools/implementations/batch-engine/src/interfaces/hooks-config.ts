/**
 * Hooks Configuration (hooks.json) interfaces for Batch Engine
 * @see SPEC-v2 Appendix C.3
 *
 * This module provides comprehensive interfaces for the hooks.json configuration
 * file that controls batch engine hook behavior. It extends the basic hook-config.ts
 * with full JSON configuration support, manager interfaces, and defaults.
 */

import type { HookPhase, HookContext, HookResult } from './lifecycle.js';
import type { BuiltinHookName } from './hooks-builtin.js';

// ============================================================================
// Core Configuration Types
// ============================================================================

/**
 * Root hooks.json configuration structure
 * @see SPEC-v2 Appendix C.3
 */
export interface HooksConfig {
  /** Hook registrations by event */
  hooks: HookRegistration[];

  /** Global settings for hook execution */
  settings: HooksSettings;

  /** Shorthand configurations for common hook groups */
  shorthand: HookShorthand;
}

/**
 * Individual hook registration entry
 * Defines a single hook with its handler, execution control, and filtering
 */
export interface HookRegistration {
  // ---- Identity ----
  /** Unique name for this hook registration */
  name: string;

  /** Event that triggers this hook */
  event: HookEvent;

  // ---- Handler ----
  /** Path to handler file or built-in name (e.g., 'builtin:typecheck' or './hooks/custom.js') */
  handler: string;

  // ---- Execution Control ----
  /** Priority order - lower values run first (default: 50) */
  priority: number;

  /** Whether this hook is currently enabled */
  enabled: boolean;

  /** Whether this hook runs asynchronously (non-blocking) */
  async: boolean;

  // ---- Filtering ----
  /** Optional filter to control when this hook fires */
  filter?: HookFilter;

  // ---- Error Handling ----
  /** Behavior when hook fails: abort batch, warn and continue, or ignore */
  on_error: HookErrorBehavior;

  /** Override timeout for this specific hook (ms) */
  timeout_ms?: number;

  /** Maximum retry attempts on failure */
  max_retries?: number;

  /** Delay between retries (ms) */
  retry_delay_ms?: number;
}

/**
 * Hook error handling behavior
 */
export type HookErrorBehavior = 'abort' | 'warn' | 'ignore';

/**
 * All supported hook events in the batch engine lifecycle
 * @see SPEC-v2 Appendix C.3
 */
export type HookEvent =
  // Session lifecycle
  | 'session_start'
  | 'session_end'
  // Batch lifecycle
  | 'batch_start'
  | 'batch_end'
  // Operation lifecycle
  | 'operation_start'
  | 'operation_end'
  | 'operation_error'
  | 'operation_retry'
  // Agent lifecycle
  | 'agent_start'
  | 'agent_end'
  | 'agent_spawn'
  | 'agent_complete'
  // Checkpoint lifecycle
  | 'checkpoint_create'
  | 'checkpoint_restore'
  // Rollback lifecycle
  | 'rollback_start'
  | 'rollback_end'
  // Fix loop lifecycle
  | 'fix_loop_start'
  | 'fix_loop_end'
  | 'fix_loop_iteration'
  // Validation events
  | 'validate_before'
  | 'validate_after'
  // Mode changes
  | 'mode_change'
  // Memory events
  | 'memory_record'
  | 'memory_query'
  // Telemetry events
  | 'telemetry_emit';

/**
 * Mapping from HookEvent to HookPhase for lifecycle integration
 */
export const HOOK_EVENT_TO_PHASE: Record<HookEvent, HookPhase> = {
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

// ============================================================================
// Filter Types
// ============================================================================

/**
 * Filter configuration for controlling when hooks fire
 */
export interface HookFilter {
  /** Filter by operation type (e.g., ['write', 'exec']) */
  operation_types?: string[];

  /** Filter by batch id pattern (glob or regex) */
  batch_id_pattern?: string;

  /** Filter by minimum severity level */
  min_severity?: HookSeverity;

  /** Filter by execution mode (e.g., ['careful', 'fast']) */
  modes?: string[];

  /** Filter by agent name patterns */
  agent_patterns?: string[];

  /** Filter by file path patterns */
  path_patterns?: string[];

  /** Custom filter expression (JavaScript predicate) */
  expression?: string;

  /** Invert the filter (exclude matching instead of include) */
  invert?: boolean;
}

/**
 * Severity levels for hook filtering
 */
export type HookSeverity = 'info' | 'warning' | 'error' | 'critical';

/**
 * Severity level ordering for comparison
 */
export const SEVERITY_ORDER: Record<HookSeverity, number> = {
  info: 0,
  warning: 1,
  error: 2,
  critical: 3,
};

// ============================================================================
// Settings Types
// ============================================================================

/**
 * Global settings for hook execution
 */
export interface HooksSettings {
  /** Default timeout for all hooks (ms) */
  default_timeout_ms: number;

  /** Maximum number of hooks to run in parallel */
  max_parallel: number;

  /** Default error behavior when not specified per-hook */
  default_on_error: HookErrorBehavior;

  /** Log hook execution start/end */
  log_execution: boolean;

  /** Log hook timing information */
  log_timing: boolean;

  /** Enable hook execution metrics collection */
  collect_metrics: boolean;

  /** Fail fast on first hook error (overrides individual on_error) */
  fail_fast: boolean;

  /** Global enable/disable for all hooks */
  hooks_enabled: boolean;

  /** Default retry configuration */
  default_max_retries: number;
  default_retry_delay_ms: number;
}

// ============================================================================
// Shorthand Types
// ============================================================================

/**
 * Shorthand for common hook configurations
 * Allows enabling/disabling groups of related hooks together
 */
export interface HookShorthand {
  /** Enable validation hooks (typecheck, lint, test) */
  validation: boolean;

  /** Enable checkpointing hooks (checkpoint, restore) */
  checkpointing: boolean;

  /** Enable telemetry hooks (record metrics, audit trail) */
  telemetry: boolean;

  /** Enable memory hooks (record decisions, patterns, failures) */
  memory: boolean;

  /** Enable recovery hooks (rollback, fix_loop) */
  recovery: boolean;

  /** Enable locking hooks (acquire/release resource locks) */
  locking: boolean;

  /** Enable context injection hooks */
  context_injection: boolean;
}

/**
 * Mapping from shorthand keys to the hooks they control
 */
export const SHORTHAND_TO_HOOKS: Record<keyof HookShorthand, string[]> = {
  validation: ['pre_typecheck', 'post_typecheck', 'lint', 'test', 'build'],
  checkpointing: ['batch_checkpoint', 'checkpoint_restore'],
  telemetry: ['batch_telemetry', 'emit_telemetry'],
  memory: ['record_decision', 'record_pattern', 'record_failure', 'inject_context'],
  recovery: ['error_rollback', 'fix_attempt'],
  locking: ['acquire_locks', 'release_locks'],
  context_injection: ['session_init', 'inject_context'],
};

// ============================================================================
// Manager Interfaces
// ============================================================================

/**
 * Hooks configuration manager interface
 * Provides methods for loading, validating, and managing hook configurations
 */
export interface HooksConfigManager {
  /**
   * Load hooks configuration from file or default
   */
  load(): Promise<HooksConfig>;

  /**
   * Load from a specific file path
   */
  loadFromFile(path: string): Promise<HooksConfig>;

  /**
   * Validate the current configuration
   */
  validate(): Promise<HooksConfigValidation>;

  /**
   * Save current configuration to file
   */
  save(path?: string): Promise<void>;

  // ---- Hook Management ----

  /**
   * Get a specific hook by name
   */
  getHook(name: string): HookRegistration | undefined;

  /**
   * Get all hooks registered for a specific event
   */
  getHooksForEvent(event: HookEvent): HookRegistration[];

  /**
   * Get hooks sorted by priority for an event
   */
  getSortedHooksForEvent(event: HookEvent): HookRegistration[];

  /**
   * Enable a specific hook by name
   */
  enableHook(name: string): void;

  /**
   * Disable a specific hook by name
   */
  disableHook(name: string): void;

  /**
   * Add a new hook registration
   */
  addHook(hook: HookRegistration): void;

  /**
   * Remove a hook by name
   */
  removeHook(name: string): boolean;

  /**
   * Update an existing hook
   */
  updateHook(name: string, updates: Partial<HookRegistration>): boolean;

  // ---- Shorthand Management ----

  /**
   * Set a shorthand configuration value
   */
  setShorthand(key: keyof HookShorthand, value: boolean): void;

  /**
   * Get current shorthand configuration
   */
  getShorthand(): HookShorthand;

  /**
   * Get effective hooks after applying shorthand configurations
   * Returns only enabled hooks with shorthand groups applied
   */
  getEffectiveHooks(): HookRegistration[];

  // ---- Settings Management ----

  /**
   * Update global settings
   */
  updateSettings(updates: Partial<HooksSettings>): void;

  /**
   * Get current settings
   */
  getSettings(): HooksSettings;

  // ---- Event Helpers ----

  /**
   * Check if any hooks are registered for an event
   */
  hasHooksForEvent(event: HookEvent): boolean;

  /**
   * Get count of enabled hooks for an event
   */
  countHooksForEvent(event: HookEvent): number;
}

// ============================================================================
// Validation Types
// ============================================================================

/**
 * Result of validating a hooks configuration
 */
export interface HooksConfigValidation {
  /** Whether the configuration is valid */
  valid: boolean;

  /** Critical errors that prevent the configuration from being used */
  errors: HookConfigError[];

  /** Non-critical warnings about the configuration */
  warnings: string[];

  /** Informational messages */
  info: string[];
}

/**
 * Detailed error information for hook configuration issues
 */
export interface HookConfigError {
  /** Name of the hook with the error */
  hook: string;

  /** Error message */
  error: string;

  /** Suggested fix for the error */
  suggestion?: string;

  /** Error code for programmatic handling */
  code?: HookConfigErrorCode;
}

/**
 * Error codes for hook configuration issues
 */
export type HookConfigErrorCode =
  | 'INVALID_EVENT'
  | 'INVALID_HANDLER'
  | 'HANDLER_NOT_FOUND'
  | 'DUPLICATE_NAME'
  | 'INVALID_PRIORITY'
  | 'INVALID_TIMEOUT'
  | 'INVALID_FILTER'
  | 'CIRCULAR_DEPENDENCY'
  | 'MISSING_REQUIRED_FIELD';

// ============================================================================
// Execution Context Types
// ============================================================================

/**
 * Extended hook context with full event information
 */
export interface HooksEventContext extends HookContext {
  /** The specific event that triggered this hook */
  event: HookEvent;

  /** Session ID */
  session_id: string;

  /** Current execution mode */
  mode: string;

  /** Agent name (for agent events) */
  agent_name?: string;

  /** Checkpoint ID (for checkpoint events) */
  checkpoint_id?: string;

  /** Fix loop iteration (for fix loop events) */
  fix_iteration?: number;

  /** Previous mode (for mode_change events) */
  previous_mode?: string;

  /** Metadata passed from the triggering operation */
  metadata?: Record<string, unknown>;
}

/**
 * Result from hook execution with timing information
 */
export interface HooksExecutionResult extends HookResult {
  /** Hook name that was executed */
  hook_name: string;

  /** Execution time in milliseconds */
  duration_ms: number;

  /** Whether the hook was skipped due to filtering */
  filtered: boolean;

  /** Retry count if the hook was retried */
  retry_count?: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Default hooks configuration
 * Provides a sensible starting point for batch engine hook setup
 */
export const DEFAULT_HOOKS_CONFIG: HooksConfig = {
  hooks: [
    // ---- Session Hooks ----
    {
      name: 'session_init',
      event: 'session_start',
      handler: 'builtin:init_session',
      priority: 0,
      enabled: true,
      async: false,
      on_error: 'abort',
    },
    {
      name: 'session_cleanup',
      event: 'session_end',
      handler: 'builtin:cleanup_session',
      priority: 100,
      enabled: true,
      async: false,
      on_error: 'warn',
    },

    // ---- Batch Hooks ----
    {
      name: 'batch_checkpoint',
      event: 'batch_start',
      handler: 'builtin:create_checkpoint',
      priority: 10,
      enabled: true,
      async: false,
      on_error: 'warn',
    },
    {
      name: 'batch_telemetry',
      event: 'batch_end',
      handler: 'builtin:record_telemetry',
      priority: 50,
      enabled: true,
      async: true,
      on_error: 'ignore',
    },

    // ---- Validation Hooks (Pre) ----
    {
      name: 'pre_typecheck',
      event: 'batch_start',
      handler: 'builtin:typecheck',
      priority: 20,
      enabled: true,
      async: false,
      on_error: 'abort',
      filter: {
        operation_types: ['write'],
      },
    },

    // ---- Validation Hooks (Post) ----
    {
      name: 'post_typecheck',
      event: 'batch_end',
      handler: 'builtin:typecheck',
      priority: 10,
      enabled: true,
      async: false,
      on_error: 'abort',
      filter: {
        operation_types: ['write'],
      },
    },

    // ---- Recovery Hooks ----
    {
      name: 'error_rollback',
      event: 'operation_error',
      handler: 'builtin:rollback',
      priority: 0,
      enabled: true,
      async: false,
      on_error: 'warn',
    },
    {
      name: 'fix_attempt',
      event: 'operation_error',
      handler: 'builtin:fix_loop',
      priority: 10,
      enabled: true,
      async: false,
      on_error: 'warn',
      max_retries: 3,
    },

    // ---- Memory Hooks ----
    {
      name: 'record_decision',
      event: 'batch_end',
      handler: 'builtin:record_decision',
      priority: 60,
      enabled: true,
      async: true,
      on_error: 'ignore',
    },
    {
      name: 'record_pattern',
      event: 'batch_end',
      handler: 'builtin:record_pattern',
      priority: 61,
      enabled: true,
      async: true,
      on_error: 'ignore',
    },
    {
      name: 'record_failure',
      event: 'operation_error',
      handler: 'builtin:record_failure',
      priority: 20,
      enabled: true,
      async: true,
      on_error: 'ignore',
    },

    // ---- Context Injection ----
    {
      name: 'inject_context',
      event: 'batch_start',
      handler: 'builtin:inject_context',
      priority: 5,
      enabled: true,
      async: false,
      on_error: 'warn',
    },

    // ---- Locking Hooks ----
    {
      name: 'acquire_locks',
      event: 'batch_start',
      handler: 'builtin:acquire_locks',
      priority: 15,
      enabled: true,
      async: false,
      on_error: 'abort',
    },
    {
      name: 'release_locks',
      event: 'batch_end',
      handler: 'builtin:release_locks',
      priority: 90,
      enabled: true,
      async: false,
      on_error: 'warn',
    },
  ],

  settings: {
    default_timeout_ms: 30000,
    max_parallel: 4,
    default_on_error: 'warn',
    log_execution: true,
    log_timing: true,
    collect_metrics: true,
    fail_fast: false,
    hooks_enabled: true,
    default_max_retries: 2,
    default_retry_delay_ms: 1000,
  },

  shorthand: {
    validation: true,
    checkpointing: true,
    telemetry: true,
    memory: true,
    recovery: true,
    locking: true,
    context_injection: true,
  },
};

// ============================================================================
// Built-in Hook Handlers
// ============================================================================

/**
 * All built-in hook handlers available in the batch engine
 */
export const BUILTIN_HOOK_HANDLERS = [
  // Session handlers
  'builtin:init_session',
  'builtin:cleanup_session',

  // Checkpoint handlers
  'builtin:create_checkpoint',
  'builtin:restore_checkpoint',

  // Telemetry handlers
  'builtin:record_telemetry',
  'builtin:emit_telemetry',

  // Validation handlers
  'builtin:typecheck',
  'builtin:lint',
  'builtin:test',
  'builtin:build',

  // Recovery handlers
  'builtin:rollback',
  'builtin:fix_loop',

  // Memory handlers
  'builtin:record_decision',
  'builtin:record_pattern',
  'builtin:record_failure',
  'builtin:inject_context',

  // Lock handlers
  'builtin:acquire_locks',
  'builtin:release_locks',

  // State handlers
  'builtin:update_state',
] as const;

/**
 * Type for built-in handler names
 */
export type BuiltinHookHandler = (typeof BUILTIN_HOOK_HANDLERS)[number];

/**
 * Check if a handler string refers to a built-in handler
 */
export function isBuiltinHandler(handler: string): handler is BuiltinHookHandler {
  return BUILTIN_HOOK_HANDLERS.includes(handler as BuiltinHookHandler);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create a minimal hook registration with defaults
 */
export function createHookRegistration(
  name: string,
  event: HookEvent,
  handler: string,
  overrides?: Partial<HookRegistration>
): HookRegistration {
  return {
    name,
    event,
    handler,
    priority: 50,
    enabled: true,
    async: false,
    on_error: 'warn',
    ...overrides,
  };
}

/**
 * Merge two hook configurations, with the second taking precedence
 */
export function mergeHooksConfig(
  base: HooksConfig,
  override: Partial<HooksConfig>
): HooksConfig {
  return {
    hooks: override.hooks ?? base.hooks,
    settings: {
      ...base.settings,
      ...override.settings,
    },
    shorthand: {
      ...base.shorthand,
      ...override.shorthand,
    },
  };
}

/**
 * Filter hooks by event and return sorted by priority
 */
export function filterAndSortHooks(
  hooks: HookRegistration[],
  event: HookEvent
): HookRegistration[] {
  return hooks
    .filter((h) => h.event === event && h.enabled)
    .sort((a, b) => a.priority - b.priority);
}

/**
 * Check if a hook matches a filter
 */
export function matchesFilter(
  filter: HookFilter | undefined,
  context: HooksEventContext
): boolean {
  if (!filter) return true;

  let matches = true;

  if (filter.operation_types && context.operation_id) {
    // Would need operation type from context - simplified check
    matches = matches && true;
  }

  if (filter.batch_id_pattern && context.batch_id) {
    const pattern = new RegExp(filter.batch_id_pattern);
    matches = matches && pattern.test(context.batch_id);
  }

  if (filter.modes && context.mode) {
    matches = matches && filter.modes.includes(context.mode);
  }

  if (filter.agent_patterns && context.agent_name) {
    matches =
      matches &&
      filter.agent_patterns.some((p) => {
        const pattern = new RegExp(p);
        return pattern.test(context.agent_name!);
      });
  }

  return filter.invert ? !matches : matches;
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard for HookEvent
 */
export function isHookEvent(value: string): value is HookEvent {
  const validEvents: HookEvent[] = [
    'session_start',
    'session_end',
    'batch_start',
    'batch_end',
    'operation_start',
    'operation_end',
    'operation_error',
    'operation_retry',
    'agent_start',
    'agent_end',
    'agent_spawn',
    'agent_complete',
    'checkpoint_create',
    'checkpoint_restore',
    'rollback_start',
    'rollback_end',
    'fix_loop_start',
    'fix_loop_end',
    'fix_loop_iteration',
    'validate_before',
    'validate_after',
    'mode_change',
    'memory_record',
    'memory_query',
    'telemetry_emit',
  ];
  return validEvents.includes(value as HookEvent);
}

/**
 * Type guard for HookErrorBehavior
 */
export function isHookErrorBehavior(value: string): value is HookErrorBehavior {
  return value === 'abort' || value === 'warn' || value === 'ignore';
}

/**
 * Type guard for HookSeverity
 */
export function isHookSeverity(value: string): value is HookSeverity {
  return (
    value === 'info' ||
    value === 'warning' ||
    value === 'error' ||
    value === 'critical'
  );
}
