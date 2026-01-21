/**
 * JustVibes Output Style interfaces for Batch Engine
 * @see SPEC-v2 Section 10 (Mode System)
 */

// =============================================================================
// CORE TYPES
// =============================================================================

/**
 * JustVibes style configuration - complete configuration for silent autonomous mode
 */
export interface JustVibesStyle {
  /** Style identifier */
  name: 'justvibes';

  /** Human-readable description */
  description: 'Silent, autonomous, logs to files';

  /** Communication settings (minimal for justvibes) */
  communication: JustVibesCommunication;

  /** Logging settings for file-based output */
  logging: JustVibesLogging;

  /** Autonomy configuration */
  autonomy: JustVibesAutonomy;

  /** Final output settings */
  final_output: JustVibesFinalOutput;
}

// =============================================================================
// COMMUNICATION SETTINGS
// =============================================================================

/**
 * Communication settings for JustVibes mode
 * Designed for minimal/no user interaction during execution
 */
export interface JustVibesCommunication {
  /** Show progress updates (false for justvibes) */
  show_progress: boolean;

  /** Explain decisions being made (false for justvibes) */
  explain_decisions: boolean;

  /** Ask user when requirements are ambiguous (false for justvibes) */
  ask_on_ambiguity: boolean;

  /** How to report results (minimal for justvibes) */
  report_results: 'none' | 'minimal';

  /** Enable silent mode - suppress all non-essential output */
  silent: boolean;
}

// =============================================================================
// LOGGING SETTINGS
// =============================================================================

/**
 * Logging configuration for file-based activity tracking
 * All activity is logged to files instead of displayed
 */
export interface JustVibesLogging {
  /** Log all activity to files instead of showing in console */
  log_to_files: boolean;

  /** Paths for different log types */
  log_paths: JustVibesLogPaths;

  /** Minimum level of events to log */
  log_level: 'debug' | 'info' | 'warn' | 'error';

  /** Include ISO timestamps in log entries */
  timestamps: boolean;

  /** Log rotation configuration */
  rotation: JustVibesLogRotation;
}

/**
 * File paths for different log categories
 */
export interface JustVibesLogPaths {
  /** General activity log */
  activity: string;

  /** Decision tracking log */
  decisions: string;

  /** Error log */
  errors: string;
}

/**
 * Log rotation settings to prevent unbounded log growth
 */
export interface JustVibesLogRotation {
  /** Enable automatic log rotation */
  enabled: boolean;

  /** Maximum size of each log file in megabytes */
  max_size_mb: number;

  /** Maximum number of rotated files to keep */
  max_files: number;
}

// =============================================================================
// AUTONOMY SETTINGS
// =============================================================================

/**
 * Autonomy configuration for self-directed execution
 * Enables fully autonomous operation without user prompts
 */
export interface JustVibesAutonomy {
  /** Automatically chain batches without asking */
  auto_chain: boolean;

  /** Maximum batches to chain autonomously before stopping */
  max_autonomous_batches: number;

  /** Automatically attempt to fix errors using fix loop */
  auto_fix: boolean;

  /** Maximum fix attempts before giving up and continuing */
  max_fix_attempts: number;

  /** Make decisions without asking user */
  make_decisions: boolean;

  /** Continue execution on non-critical errors */
  continue_on_error: boolean;
}

// =============================================================================
// FINAL OUTPUT SETTINGS
// =============================================================================

/**
 * Configuration for the final summary output after execution
 */
export interface JustVibesFinalOutput {
  /** Only show final summary, suppress intermediate output */
  final_summary_only: boolean;

  /** Format of the final summary */
  format: 'minimal' | 'compact' | 'standard';

  /** What to include in final output */
  include: JustVibesFinalOutputIncludes;

  /** Suggest git diff command for reviewing changes */
  suggest_diff: boolean;
}

/**
 * Flags controlling what information appears in final output
 */
export interface JustVibesFinalOutputIncludes {
  /** Show count of files changed */
  files_changed: boolean;

  /** Show count of commits/checkpoints made */
  commits_made: boolean;

  /** Show test pass/fail status */
  tests_status: boolean;

  /** Show path to activity log */
  log_path: boolean;

  /** Show total execution duration */
  duration: boolean;
}

// =============================================================================
// LOGGER INTERFACE
// =============================================================================

/**
 * Logger interface for JustVibes file-based logging
 * Implementations write to configured log files instead of console
 */
export interface JustVibesLogger {
  /**
   * Log an activity message
   * @param message - The message to log
   * @param level - Optional log level (defaults to 'info')
   */
  logActivity(message: string, level?: 'debug' | 'info' | 'warn' | 'error'): void;

  /**
   * Log a decision with its reasoning
   * @param decision - What was decided
   * @param reason - Why the decision was made
   */
  logDecision(decision: string, reason: string): void;

  /**
   * Log an error with optional context
   * @param error - The error object
   * @param context - Optional context about when/where the error occurred
   */
  logError(error: Error, context?: string): void;

  /**
   * Flush all buffered log entries to files
   * @returns Promise that resolves when flush is complete
   */
  flush(): Promise<void>;

  /**
   * Get the current log file paths
   * @returns Object containing paths to all log files
   */
  getLogPaths(): JustVibesLogPaths;
}

/**
 * Log entry structure for activity logs
 */
export interface JustVibesActivityLogEntry {
  /** ISO timestamp */
  timestamp: string;

  /** Log level */
  level: 'debug' | 'info' | 'warn' | 'error';

  /** Log message */
  message: string;

  /** Optional additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Log entry structure for decision logs
 */
export interface JustVibesDecisionLogEntry {
  /** ISO timestamp */
  timestamp: string;

  /** The decision made */
  decision: string;

  /** Reasoning behind the decision */
  reason: string;

  /** Optional alternatives considered */
  alternatives?: string[];
}

/**
 * Log entry structure for error logs
 */
export interface JustVibesErrorLogEntry {
  /** ISO timestamp */
  timestamp: string;

  /** Error type/name */
  error_type: string;

  /** Error message */
  message: string;

  /** Stack trace if available */
  stack?: string;

  /** Context when error occurred */
  context?: string;

  /** Whether error was recovered from */
  recovered: boolean;
}

// =============================================================================
// FINAL OUTPUT GENERATOR
// =============================================================================

/**
 * Interface for generating the final summary output
 */
export interface JustVibesFinalOutputGenerator {
  /**
   * Generate the final summary string
   * @param context - Summary context containing execution results
   * @returns Formatted summary string
   */
  generateSummary(context: JustVibesSummaryContext): string;
}

/**
 * Context passed to the final output generator
 */
export interface JustVibesSummaryContext {
  /** Number of files modified during execution */
  files_modified: number;

  /** Number of new files created */
  files_created: number;

  /** Number of commits/checkpoints made */
  commits: number;

  /** Whether all tests are passing */
  tests_passing: boolean;

  /** Total execution duration in milliseconds */
  duration_ms: number;

  /** Path to the activity log file */
  log_path: string;

  /** Optional list of files changed */
  changed_files?: string[];

  /** Optional test summary */
  test_summary?: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };

  /** Optional error count */
  errors_encountered?: number;

  /** Optional fix attempts made */
  fixes_attempted?: number;
}

// =============================================================================
// DEFAULT CONFIGURATION
// =============================================================================

/**
 * Default justvibes configuration matching JustVibes mode behavior
 */
export const DEFAULT_JUSTVIBES_STYLE: JustVibesStyle = {
  name: 'justvibes',
  description: 'Silent, autonomous, logs to files',

  communication: {
    show_progress: false,
    explain_decisions: false,
    ask_on_ambiguity: false,
    report_results: 'minimal',
    silent: true
  },

  logging: {
    log_to_files: true,
    log_paths: {
      activity: '.goodvibes/logs/justvibes-log.md',
      decisions: '.goodvibes/logs/justvibes-decisions.md',
      errors: '.goodvibes/logs/justvibes-errors.md'
    },
    log_level: 'info',
    timestamps: true,
    rotation: {
      enabled: true,
      max_size_mb: 10,
      max_files: 5
    }
  },

  autonomy: {
    auto_chain: true,
    max_autonomous_batches: 10,
    auto_fix: true,
    max_fix_attempts: 3,
    make_decisions: true,
    continue_on_error: true
  },

  final_output: {
    final_summary_only: true,
    format: 'compact',
    include: {
      files_changed: true,
      commits_made: true,
      tests_status: true,
      log_path: true,
      duration: false
    },
    suggest_diff: true
  }
};

// =============================================================================
// TEMPLATES
// =============================================================================

/**
 * JustVibes final output template (Handlebars-style)
 * Used to generate the final summary message
 */
export const JUSTVIBES_FINAL_TEMPLATE = `Done.

Changes: {{files_modified}} files modified, {{files_created}} created
Commits: {{commits}} checkpoints
Tests: {{#if tests_passing}}All passing{{else}}Some failing{{/if}}
Log: {{log_path}}

git diff HEAD~{{commits}} to review`;

/**
 * Minimal template for when minimal format is requested
 */
export const JUSTVIBES_MINIMAL_TEMPLATE = `Done. {{files_modified}} files, {{commits}} commits. Log: {{log_path}}`;

/**
 * Standard template with more details
 */
export const JUSTVIBES_STANDARD_TEMPLATE = `Execution Complete

Files Modified: {{files_modified}}
Files Created: {{files_created}}
Checkpoints: {{commits}}
Tests: {{#if tests_passing}}All passing{{else}}{{test_summary.failed}} failing{{/if}}
Duration: {{duration_ms}}ms
Activity Log: {{log_path}}

Review changes: git diff HEAD~{{commits}}`;

/**
 * Log entry format templates
 */
export const LOG_FORMATS = {
  /** Format for activity log entries */
  activity: '[{{timestamp}}] {{level}}: {{message}}',

  /** Format for decision log entries (markdown) */
  decision: '## {{timestamp}}\n**Decision:** {{decision}}\n**Reason:** {{reason}}\n',

  /** Format for error log entries (markdown) */
  error: '## {{timestamp}} - ERROR\n**Error:** {{error_type}}\n**Message:** {{message}}\n**Context:** {{context}}\n'
} as const;

/**
 * Log format type
 */
export type LogFormatType = keyof typeof LOG_FORMATS;

// =============================================================================
// HELPER TYPES
// =============================================================================

/**
 * Type guard to check if a style is JustVibes
 */
export function isJustVibesStyle(style: { name: string }): style is JustVibesStyle {
  return style.name === 'justvibes';
}

/**
 * Create a partial JustVibes style with defaults
 */
export function createJustVibesStyle(
  overrides: Partial<Omit<JustVibesStyle, 'name' | 'description'>> = {}
): JustVibesStyle {
  return {
    ...DEFAULT_JUSTVIBES_STYLE,
    communication: {
      ...DEFAULT_JUSTVIBES_STYLE.communication,
      ...overrides.communication
    },
    logging: {
      ...DEFAULT_JUSTVIBES_STYLE.logging,
      ...overrides.logging,
      log_paths: {
        ...DEFAULT_JUSTVIBES_STYLE.logging.log_paths,
        ...overrides.logging?.log_paths
      },
      rotation: {
        ...DEFAULT_JUSTVIBES_STYLE.logging.rotation,
        ...overrides.logging?.rotation
      }
    },
    autonomy: {
      ...DEFAULT_JUSTVIBES_STYLE.autonomy,
      ...overrides.autonomy
    },
    final_output: {
      ...DEFAULT_JUSTVIBES_STYLE.final_output,
      ...overrides.final_output,
      include: {
        ...DEFAULT_JUSTVIBES_STYLE.final_output.include,
        ...overrides.final_output?.include
      }
    }
  };
}

/**
 * Get the appropriate template based on format
 */
export function getJustVibesTemplate(format: JustVibesFinalOutput['format']): string {
  switch (format) {
    case 'minimal':
      return JUSTVIBES_MINIMAL_TEMPLATE;
    case 'compact':
      return JUSTVIBES_FINAL_TEMPLATE;
    case 'standard':
      return JUSTVIBES_STANDARD_TEMPLATE;
    default:
      return JUSTVIBES_FINAL_TEMPLATE;
  }
}

/**
 * Format a log entry using the appropriate template
 */
export function formatLogEntry(
  type: LogFormatType,
  data: Record<string, unknown>
): string {
  const template = LOG_FORMATS[type];
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const value = data[key];
    return value !== undefined ? String(value) : '';
  });
}
