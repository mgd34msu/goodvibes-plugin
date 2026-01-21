/**
 * Template interfaces for Batch Engine
 * @see SPEC-v2 Section 14.1
 */

// =============================================================================
// Template Paths
// =============================================================================

/**
 * Template file paths for all engine templates
 * Paths are relative to the engine's template directory
 */
export const TEMPLATE_PATHS = {
  agent_prompt: 'templates/agent-prompt.hbs',
  error_report: 'templates/error-report.hbs',
  batch_summary: 'templates/batch-summary.hbs',
  decision_log: 'templates/decision-log.hbs',
  checkpoint_manifest: 'templates/checkpoint-manifest.hbs',
} as const;

/**
 * Template name type derived from TEMPLATE_PATHS keys
 */
export type TemplateName = keyof typeof TEMPLATE_PATHS;

/**
 * All available template names
 */
export const TEMPLATE_NAMES: TemplateName[] = [
  'agent_prompt',
  'error_report',
  'batch_summary',
  'decision_log',
  'checkpoint_manifest',
];

// =============================================================================
// Template Engine Interface
// =============================================================================

/**
 * Helper function signature for template helpers
 * Follows Handlebars helper convention
 */
export type HelperFunction = (...args: unknown[]) => unknown;

/**
 * Compiled template representation
 */
export interface CompiledTemplate {
  /** Template name */
  name: string;
  /** Path to the template file */
  path: string;
  /** Compiled render function */
  compiled: (context: unknown) => string;
  /** Names of helpers used in this template */
  helpers_used: string[];
  /** Names of partials used in this template */
  partials_used: string[];
}

/**
 * Template engine interface (Handlebars-compatible)
 * Provides core template loading, compilation, and rendering
 */
export interface TemplateEngine {
  // ---------------------------------------------------------------------------
  // Load and compile templates
  // ---------------------------------------------------------------------------

  /**
   * Load and compile a single template by name
   * @param name - Template name from TEMPLATE_PATHS
   * @returns Compiled template ready for rendering
   */
  load(name: TemplateName): Promise<CompiledTemplate>;

  /**
   * Load and compile all registered templates
   * @returns Map of template names to compiled templates
   */
  loadAll(): Promise<Map<TemplateName, CompiledTemplate>>;

  // ---------------------------------------------------------------------------
  // Render templates
  // ---------------------------------------------------------------------------

  /**
   * Render a template by name with context
   * @param name - Template name from TEMPLATE_PATHS
   * @param context - Data context for rendering
   * @returns Rendered template string
   */
  render(name: TemplateName, context: unknown): Promise<string>;

  /**
   * Render an inline template string with context
   * @param template - Template string (Handlebars syntax)
   * @param context - Data context for rendering
   * @returns Rendered string
   */
  renderString(template: string, context: unknown): string;

  // ---------------------------------------------------------------------------
  // Register helpers
  // ---------------------------------------------------------------------------

  /**
   * Register a custom helper function
   * @param name - Helper name (used in templates as {{name}})
   * @param fn - Helper implementation
   */
  registerHelper(name: string, fn: HelperFunction): void;

  // ---------------------------------------------------------------------------
  // Register partials
  // ---------------------------------------------------------------------------

  /**
   * Register a partial template
   * @param name - Partial name (used in templates as {{> name}})
   * @param template - Partial template string
   */
  registerPartial(name: string, template: string): void;
}

// =============================================================================
// Built-in Template Helpers
// =============================================================================

/**
 * Built-in helper function implementations
 * These are automatically registered with the template engine
 */
export const BUILTIN_HELPERS = {
  /**
   * Convert object to formatted JSON string
   */
  json: (obj: unknown): string => JSON.stringify(obj, null, 2),

  /**
   * Join array elements with separator
   */
  join: (arr: unknown[], sep: string): string => {
    if (!Array.isArray(arr)) return '';
    return arr.map(String).join(sep);
  },

  /**
   * Get first element of array
   */
  first: <T>(arr: T[]): T | undefined => {
    if (!Array.isArray(arr)) return undefined;
    return arr[0];
  },

  /**
   * Get last element of array
   */
  last: <T>(arr: T[]): T | undefined => {
    if (!Array.isArray(arr)) return undefined;
    return arr[arr.length - 1];
  },

  /**
   * Filter array by key-value match
   */
  filter: <T extends Record<string, unknown>>(
    arr: T[],
    key: string,
    value: unknown
  ): T[] => {
    if (!Array.isArray(arr)) return [];
    return arr.filter((item) => item[key] === value);
  },

  /**
   * Format milliseconds to human-readable duration
   */
  formatMs: (ms: number): string => {
    if (typeof ms !== 'number') return '0ms';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
    return `${(ms / 60000).toFixed(2)}m`;
  },

  /**
   * Format bytes to human-readable size
   */
  formatBytes: (bytes: number): string => {
    if (typeof bytes !== 'number') return '0B';
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    if (bytes < 1024 * 1024 * 1024)
      return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
  },

  /**
   * Truncate string to specified length with ellipsis
   */
  truncate: (str: string, len: number): string => {
    if (typeof str !== 'string') return '';
    if (str.length <= len) return str;
    return str.slice(0, len) + '...';
  },

  /**
   * Return singular or plural form based on count
   */
  pluralize: (count: number, singular: string, plural: string): string => {
    return count === 1 ? singular : plural;
  },

  /**
   * Format ISO date string to locale format
   */
  formatDate: (isoString: string): string => {
    try {
      return new Date(isoString).toLocaleString();
    } catch {
      return isoString;
    }
  },

  /**
   * Check equality for conditional rendering
   */
  eq: (a: unknown, b: unknown): boolean => a === b,

  /**
   * Check if array contains value
   */
  includes: (arr: unknown[], value: unknown): boolean => {
    if (!Array.isArray(arr)) return false;
    return arr.includes(value);
  },

  /**
   * Get length of array or string
   */
  length: (value: unknown[] | string): number => {
    if (Array.isArray(value) || typeof value === 'string') {
      return value.length;
    }
    return 0;
  },
} as const;

/**
 * Type for builtin helper names
 */
export type BuiltinHelperName = keyof typeof BUILTIN_HELPERS;

// =============================================================================
// Agent Prompt Template Context
// =============================================================================

/**
 * Context for agent prompt template rendering
 */
export interface AgentPromptContext {
  /** Agent information */
  agent: {
    /** Agent name/identifier */
    name: string;
    /** Agent role description */
    role: string;
    /** Model to use (e.g., 'claude-sonnet-4-20250514') */
    model: string;
  };

  /** Task information */
  task: {
    /** Task description */
    description: string;
    /** Files/directories in scope */
    scope: string[];
    /** Constraints to follow */
    constraints: string[];
  };

  /** Context injection */
  context: {
    /** Relevant file paths */
    files: string[];
    /** Relevant symbols (functions, classes, etc.) */
    symbols: string[];
    /** Relevant past decisions */
    decisions: string[];
    /** Relevant patterns to follow */
    patterns: string[];
  };

  /** Budget constraints */
  budget: {
    /** Maximum tokens for this agent */
    max_tokens: number;
    /** Maximum operations allowed */
    max_operations: number;
    /** Timeout in milliseconds */
    timeout_ms: number;
  };

  /** Results from prior agents in the chain (for chaining) */
  prior_results?: {
    /** Agent name that produced the result */
    agent: string;
    /** Summary of what was done */
    summary: string;
    /** Key findings/outputs */
    key_findings: string[];
  }[];
}

// =============================================================================
// Error Report Template Context
// =============================================================================

/**
 * Context for error report template rendering
 */
export interface ErrorReportContext {
  /** Error information */
  error: {
    /** Error type/class name */
    type: string;
    /** Error message */
    message: string;
    /** Stack trace (if available) */
    stack?: string;
    /** Error code (if applicable) */
    code?: string;
  };

  /** Context where error occurred */
  context: {
    /** Operation ID where error occurred */
    operation_id?: string;
    /** Batch ID where error occurred */
    batch_id?: string;
    /** File being processed when error occurred */
    file?: string;
    /** Line number where error occurred */
    line?: number;
  };

  /** Error analysis */
  analysis: {
    /** Determined root cause */
    root_cause?: string;
    /** Similar errors seen before */
    similar_errors?: string[];
    /** Suggested fix */
    suggested_fix?: string;
  };

  /** Recovery options */
  recovery: {
    /** Whether operation can be retried */
    can_retry: boolean;
    /** Whether changes can be rolled back */
    can_rollback: boolean;
    /** Whether error can be auto-fixed */
    can_auto_fix: boolean;
    /** Available recovery options */
    options: string[];
  };
}

// =============================================================================
// Batch Summary Template Context
// =============================================================================

/**
 * Context for batch summary template rendering
 */
export interface BatchSummaryContext {
  /** Batch information */
  batch: {
    /** Batch ID */
    id: string;
    /** Batch status (completed, failed, etc.) */
    status: string;
    /** Execution mode */
    mode: string;
  };

  /** Summary statistics */
  summary: {
    /** Total operations in batch */
    total_operations: number;
    /** Successfully completed operations */
    succeeded: number;
    /** Failed operations */
    failed: number;
    /** Skipped operations */
    skipped: number;
  };

  /** Timing information */
  timing: {
    /** ISO timestamp when batch started */
    started_at: string;
    /** ISO timestamp when batch ended */
    ended_at: string;
    /** Total duration in milliseconds */
    duration_ms: number;
    /** Duration breakdown by phase */
    phases: {
      /** Phase name */
      name: string;
      /** Phase duration in milliseconds */
      duration_ms: number;
    }[];
  };

  /** Token usage */
  tokens: {
    /** Total tokens used */
    total: number;
    /** Token breakdown by phase */
    by_phase: {
      /** Phase name */
      phase: string;
      /** Tokens used in phase */
      tokens: number;
    }[];
    /** Estimated cost in dollars */
    estimated_cost: number;
  };

  /** Validation results */
  validation: {
    /** Pre-batch validation */
    before: {
      /** Whether validation passed */
      passed: boolean;
      /** Validation errors (if any) */
      errors?: string[];
    };
    /** Post-batch validation */
    after: {
      /** Whether validation passed */
      passed: boolean;
      /** Validation errors (if any) */
      errors?: string[];
    };
  };

  /** File changes */
  files: {
    /** Files created */
    created: string[];
    /** Files modified */
    modified: string[];
    /** Files deleted */
    deleted: string[];
  };
}

// =============================================================================
// Decision Log Template Context
// =============================================================================

/**
 * Single decision entry
 */
export interface DecisionEntry {
  /** ISO timestamp of decision */
  timestamp: string;
  /** Decision made */
  decision: string;
  /** Reason for decision */
  reason: string;
  /** Decision category */
  category: string;
  /** Confidence level (0-1) */
  confidence: number;
  /** Alternatives considered */
  alternatives?: string[];
  /** Outcome of decision (if known) */
  outcome?: string;
}

/**
 * Context for decision log template rendering
 */
export interface DecisionLogContext {
  /** List of decisions made */
  decisions: DecisionEntry[];
}

// =============================================================================
// Checkpoint Manifest Template Context
// =============================================================================

/**
 * File entry in checkpoint manifest
 */
export interface CheckpointFileEntry {
  /** Absolute file path */
  path: string;
  /** Content checksum (SHA-256) */
  checksum: string;
  /** File size in bytes */
  size: number;
}

/**
 * State entry in checkpoint manifest
 */
export interface CheckpointStateEntry {
  /** State key */
  key: string;
  /** State value checksum */
  checksum: string;
}

/**
 * Context for checkpoint manifest template rendering
 */
export interface CheckpointManifestContext {
  /** Checkpoint information */
  checkpoint: {
    /** Checkpoint ID */
    id: string;
    /** Associated batch ID */
    batch_id: string;
    /** ISO timestamp of creation */
    created_at: string;
    /** Reason for checkpoint */
    reason: string;
  };

  /** Files included in checkpoint */
  files: CheckpointFileEntry[];

  /** State entries in checkpoint */
  state: CheckpointStateEntry[];
}

// =============================================================================
// Template Manager Interface
// =============================================================================

/**
 * Template manager provides high-level template operations
 * Built on top of TemplateEngine
 */
export interface TemplateManager {
  /** Underlying template engine */
  engine: TemplateEngine;

  // ---------------------------------------------------------------------------
  // Render specific templates
  // ---------------------------------------------------------------------------

  /**
   * Render agent prompt template
   * @param context - Agent prompt context
   * @returns Rendered agent prompt
   */
  renderAgentPrompt(context: AgentPromptContext): Promise<string>;

  /**
   * Render error report template
   * @param context - Error report context
   * @returns Rendered error report
   */
  renderErrorReport(context: ErrorReportContext): Promise<string>;

  /**
   * Render batch summary template
   * @param context - Batch summary context
   * @returns Rendered batch summary
   */
  renderBatchSummary(context: BatchSummaryContext): Promise<string>;

  /**
   * Render decision log template
   * @param context - Decision log context
   * @returns Rendered decision log
   */
  renderDecisionLog(context: DecisionLogContext): Promise<string>;

  /**
   * Render checkpoint manifest template
   * @param context - Checkpoint manifest context
   * @returns Rendered checkpoint manifest
   */
  renderCheckpointManifest(context: CheckpointManifestContext): Promise<string>;

  // ---------------------------------------------------------------------------
  // Custom rendering
  // ---------------------------------------------------------------------------

  /**
   * Render a custom template from a file path
   * @param templatePath - Path to custom template file
   * @param context - Data context for rendering
   * @returns Rendered template string
   */
  renderCustom(templatePath: string, context: unknown): Promise<string>;
}

// =============================================================================
// Template Configuration
// =============================================================================

/**
 * Configuration for the template manager
 */
export interface TemplateManagerConfig {
  /** Base directory for templates */
  template_dir: string;
  /** Whether to cache compiled templates */
  cache_templates: boolean;
  /** Custom helpers to register */
  custom_helpers?: Record<string, HelperFunction>;
  /** Custom partials to register */
  custom_partials?: Record<string, string>;
  /** Whether to use strict mode (error on missing variables) */
  strict_mode: boolean;
}

/**
 * Default template manager configuration
 */
export const DEFAULT_TEMPLATE_CONFIG: TemplateManagerConfig = {
  template_dir: '.goodvibes/templates',
  cache_templates: true,
  strict_mode: false,
};

// =============================================================================
// Template Events
// =============================================================================

/**
 * Events emitted by the template system
 */
export type TemplateEvent =
  | { type: 'template_loaded'; name: TemplateName; path: string }
  | { type: 'template_rendered'; name: TemplateName; duration_ms: number }
  | { type: 'template_error'; name: TemplateName; error: string }
  | { type: 'helper_registered'; name: string }
  | { type: 'partial_registered'; name: string }
  | { type: 'cache_hit'; name: TemplateName }
  | { type: 'cache_miss'; name: TemplateName };

/**
 * Event handler for template events
 */
export type TemplateEventHandler = (event: TemplateEvent) => void;

// =============================================================================
// Template Validation
// =============================================================================

/**
 * Result of template validation
 */
export interface TemplateValidationResult {
  /** Whether the template is valid */
  valid: boolean;
  /** Validation errors */
  errors: string[];
  /** Validation warnings */
  warnings: string[];
  /** Helpers referenced in template */
  helpers_referenced: string[];
  /** Partials referenced in template */
  partials_referenced: string[];
}

/**
 * Template validator interface
 */
export interface TemplateValidator {
  /**
   * Validate a template string
   * @param template - Template string to validate
   * @returns Validation result
   */
  validate(template: string): TemplateValidationResult;

  /**
   * Validate a compiled template
   * @param compiled - Compiled template to validate
   * @returns Validation result
   */
  validateCompiled(compiled: CompiledTemplate): TemplateValidationResult;

  /**
   * Check if all required helpers are registered
   * @param template - Template to check
   * @param registeredHelpers - Set of registered helper names
   * @returns List of missing helper names
   */
  checkHelpers(template: string, registeredHelpers: Set<string>): string[];

  /**
   * Check if all required partials are registered
   * @param template - Template to check
   * @param registeredPartials - Set of registered partial names
   * @returns List of missing partial names
   */
  checkPartials(template: string, registeredPartials: Set<string>): string[];
}
