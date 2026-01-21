/**
 * Vibecoding Output Style interfaces for Batch Engine
 * @see SPEC-v2 Section 10.4 (Mode System - Output Styles)
 */

// -----------------------------------------------------------------------------
// Core Style Interface
// -----------------------------------------------------------------------------

/**
 * Vibecoding style configuration
 * Communicative, interactive mode that explains decisions and engages with users
 */
export interface VibecodingStyle {
  /** Style identifier */
  readonly name: 'vibecoding';

  /** Human-readable description */
  readonly description: 'Communicative, interactive, explains decisions';

  /** Communication settings */
  communication: VibecodingCommunication;

  /** Progress reporting configuration */
  progress: VibecodingProgress;

  /** Decision explanation settings */
  decisions: VibecodingDecisions;

  /** Output formatting options */
  formatting: VibecodingFormatting;
}

// -----------------------------------------------------------------------------
// Communication Configuration
// -----------------------------------------------------------------------------

/**
 * Communication settings for vibecoding mode
 * Controls how the system interacts with users
 */
export interface VibecodingCommunication {
  /** Show progress updates during execution */
  show_progress: boolean;

  /** Explain decisions made during operations */
  explain_decisions: boolean;

  /** Ask user for clarification on ambiguous requirements */
  ask_on_ambiguity: boolean;

  /** Level of detail in result reports */
  report_results: ReportResultsLevel;

  /** Overall interaction verbosity */
  interaction_level: InteractionLevel;
}

/** Report detail levels */
export type ReportResultsLevel = 'none' | 'minimal' | 'summary' | 'detailed';

/** Interaction verbosity levels */
export type InteractionLevel = 'minimal' | 'moderate' | 'verbose';

// -----------------------------------------------------------------------------
// Progress Configuration
// -----------------------------------------------------------------------------

/**
 * Progress reporting settings
 * Controls what progress information is shown and when
 */
export interface VibecodingProgress {
  /** Show progress for individual operations */
  show_operations: boolean;

  /** Show progress for agent executions */
  show_agents: boolean;

  /** Show validation step progress */
  show_validation: boolean;

  /** How often to emit progress updates */
  update_frequency: ProgressUpdateFrequency;

  /** Include token usage in progress updates */
  show_tokens: boolean;

  /** Include timing information in progress updates */
  show_timing: boolean;
}

/** Progress update frequency options */
export type ProgressUpdateFrequency = 'each_operation' | 'each_phase' | 'batch_complete';

// -----------------------------------------------------------------------------
// Decision Configuration
// -----------------------------------------------------------------------------

/**
 * Decision explanation settings
 * Controls how decisions are communicated and recorded
 */
export interface VibecodingDecisions {
  /** Explain the reasoning behind decisions */
  explain_why: boolean;

  /** Show alternative options that were considered */
  show_alternatives: boolean;

  /** Show confidence levels for decisions */
  show_confidence: boolean;

  /** Record decisions to memory for future reference */
  record_to_memory: boolean;
}

// -----------------------------------------------------------------------------
// Formatting Configuration
// -----------------------------------------------------------------------------

/**
 * Output formatting options
 * Controls the visual presentation of output
 */
export interface VibecodingFormatting {
  /** Output format type */
  format: OutputFormat;

  /** Include syntax-highlighted code blocks */
  include_code_blocks: boolean;

  /** Include file paths in output */
  include_file_paths: boolean;

  /** Include diff views for changes */
  include_diffs: boolean;

  /** Maximum lines to display (undefined = unlimited) */
  max_lines?: number;

  /** Line threshold for collapsing long outputs */
  collapse_threshold: number;
}

/** Output format types */
export type OutputFormat = 'markdown' | 'plain' | 'rich';

// -----------------------------------------------------------------------------
// Output Generator Interface
// -----------------------------------------------------------------------------

/**
 * Vibecoding output generator interface
 * Defines methods for generating formatted output messages
 */
export interface VibecodingOutputGenerator {
  /** Generate a progress message */
  generateProgressMessage(context: ProgressContext): string;

  /** Generate an explanation for a decision */
  generateDecisionExplanation(decision: DecisionContext): string;

  /** Generate a summary of batch results */
  generateResultSummary(result: ResultContext): string;

  /** Generate a user-friendly error message */
  generateErrorMessage(error: ErrorContext): string;

  /** Generate a question for user input */
  generateQuestion(question: QuestionContext): string;
}

// -----------------------------------------------------------------------------
// Context Interfaces
// -----------------------------------------------------------------------------

/**
 * Context for progress message generation
 */
export interface ProgressContext {
  /** Current execution phase */
  phase: string;

  /** Current operation name (if applicable) */
  operation?: string;

  /** Number of completed items */
  completed: number;

  /** Total number of items */
  total: number;

  /** Description of current action */
  current_action?: string;

  /** Tokens used so far (optional) */
  tokens_used?: number;

  /** Elapsed time in milliseconds (optional) */
  elapsed_ms?: number;
}

/**
 * Context for decision explanation generation
 */
export interface DecisionContext {
  /** The decision that was made */
  decision: string;

  /** The reasoning behind the decision */
  reason: string;

  /** Alternative options that were considered */
  alternatives?: string[];

  /** Confidence level (0-1) */
  confidence?: number;

  /** Impact assessment of the decision */
  impact?: 'low' | 'medium' | 'high';

  /** Whether this decision is reversible */
  reversible?: boolean;
}

/**
 * Context for result summary generation
 */
export interface ResultContext {
  /** Unique batch identifier */
  batch_id: string;

  /** Final batch status */
  status: ResultStatus;

  /** Number of successful operations */
  operations_succeeded: number;

  /** Number of failed operations */
  operations_failed: number;

  /** Number of skipped operations */
  operations_skipped?: number;

  /** Total execution duration in milliseconds */
  duration_ms: number;

  /** Total tokens consumed */
  tokens_used: number;

  /** Whether a checkpoint was created */
  checkpoint_created?: boolean;

  /** Whether a rollback was triggered */
  rollback_triggered?: boolean;

  /** List of files modified */
  files_modified?: string[];

  /** Validation summary */
  validation?: {
    before_passed: boolean;
    after_passed: boolean;
    errors?: string[];
  };
}

/** Possible result statuses */
export type ResultStatus = 'success' | 'partial' | 'failed' | 'rolled_back';

/**
 * Context for error message generation
 */
export interface ErrorContext {
  /** Type/category of error */
  error_type: ErrorType;

  /** Human-readable error message */
  message: string;

  /** Suggested fix or action */
  suggestion?: string;

  /** Available recovery options */
  recovery_options?: string[];

  /** Stack trace (for debugging) */
  stack?: string;

  /** Related file path (if applicable) */
  file_path?: string;

  /** Line number (if applicable) */
  line_number?: number;

  /** Error code for programmatic handling */
  code?: string;
}

/** Error type categories */
export type ErrorType =
  | 'validation_error'
  | 'execution_error'
  | 'permission_error'
  | 'timeout_error'
  | 'network_error'
  | 'resource_error'
  | 'configuration_error'
  | 'unknown_error';

/**
 * Context for question generation
 */
export interface QuestionContext {
  /** The question to ask the user */
  question: string;

  /** Available options (for multiple choice) */
  options?: string[];

  /** Default option if user doesn't respond */
  default?: string;

  /** Additional context to help user decide */
  context?: string;

  /** Whether the question is required */
  required?: boolean;

  /** Question type for UI rendering */
  type?: QuestionType;

  /** Timeout for auto-selecting default (milliseconds) */
  timeout_ms?: number;
}

/** Question types for different input methods */
export type QuestionType = 'confirm' | 'select' | 'multi_select' | 'text' | 'number';

// -----------------------------------------------------------------------------
// Default Configuration
// -----------------------------------------------------------------------------

/**
 * Default vibecoding style configuration
 * Provides sensible defaults for interactive development
 */
export const DEFAULT_VIBECODING_STYLE: VibecodingStyle = {
  name: 'vibecoding',
  description: 'Communicative, interactive, explains decisions',

  communication: {
    show_progress: true,
    explain_decisions: true,
    ask_on_ambiguity: true,
    report_results: 'summary',
    interaction_level: 'moderate',
  },

  progress: {
    show_operations: true,
    show_agents: true,
    show_validation: true,
    update_frequency: 'each_phase',
    show_tokens: true,
    show_timing: true,
  },

  decisions: {
    explain_why: true,
    show_alternatives: false,
    show_confidence: false,
    record_to_memory: true,
  },

  formatting: {
    format: 'markdown',
    include_code_blocks: true,
    include_file_paths: true,
    include_diffs: true,
    collapse_threshold: 50,
  },
} as const;

// -----------------------------------------------------------------------------
// Output Templates
// -----------------------------------------------------------------------------

/**
 * Template strings for vibecoding output formatting
 * Uses Handlebars-style placeholders for variable substitution
 */
export const VIBECODING_TEMPLATES = {
  /** Progress message template */
  progress: '{{phase}}: {{current_action}} ({{completed}}/{{total}})',

  /** Progress with timing template */
  progress_detailed: '{{phase}}: {{current_action}} ({{completed}}/{{total}}) - {{elapsed_ms}}ms, {{tokens_used}} tokens',

  /** Decision explanation template */
  decision: '**Decision:** {{decision}}\n**Reason:** {{reason}}',

  /** Decision with alternatives template */
  decision_detailed: '**Decision:** {{decision}}\n**Reason:** {{reason}}\n{{#if alternatives}}**Alternatives considered:**\n{{#each alternatives}}- {{this}}\n{{/each}}{{/if}}{{#if confidence}}**Confidence:** {{confidence}}%{{/if}}',

  /** Result summary template */
  result: '## Batch Complete\n- Status: {{status}}\n- Operations: {{operations_succeeded}}/{{total}}\n- Duration: {{duration_ms}}ms\n- Tokens: {{tokens_used}}',

  /** Detailed result template */
  result_detailed: '## Batch Complete\n\n**Status:** {{status}}\n\n### Operations\n- Succeeded: {{operations_succeeded}}\n- Failed: {{operations_failed}}\n- Skipped: {{operations_skipped}}\n\n### Metrics\n- Duration: {{duration_ms}}ms\n- Tokens: {{tokens_used}}\n{{#if checkpoint_created}}\n### Recovery\n- Checkpoint: Created\n- Rollback available: Yes{{/if}}',

  /** Error message template */
  error: '**{{error_type}}**\n{{message}}\n\n{{#if suggestion}}**Suggestion:** {{suggestion}}{{/if}}',

  /** Error with recovery options template */
  error_detailed: '**{{error_type}}**\n\n{{message}}\n\n{{#if file_path}}**File:** `{{file_path}}`{{#if line_number}}:{{line_number}}{{/if}}\n{{/if}}{{#if suggestion}}\n**Suggestion:** {{suggestion}}\n{{/if}}{{#if recovery_options}}\n**Recovery options:**\n{{#each recovery_options}}- {{this}}\n{{/each}}{{/if}}',

  /** Question template */
  question: '{{question}}\n{{#each options}}- {{this}}\n{{/each}}',

  /** Question with context template */
  question_detailed: '{{question}}\n\n{{#if context}}**Context:** {{context}}\n\n{{/if}}{{#if options}}**Options:**\n{{#each options}}- {{this}}{{/each}}\n{{/if}}{{#if default}}\n**Default:** {{default}}{{/if}}',
} as const;

// -----------------------------------------------------------------------------
// Template Type
// -----------------------------------------------------------------------------

/** Template keys for type-safe template access */
export type VibecodingTemplateKey = keyof typeof VIBECODING_TEMPLATES;

// -----------------------------------------------------------------------------
// Style Presets
// -----------------------------------------------------------------------------

/**
 * Preset configurations for common use cases
 */
export const VIBECODING_PRESETS = {
  /** Minimal output for experienced users */
  minimal: {
    ...DEFAULT_VIBECODING_STYLE,
    communication: {
      ...DEFAULT_VIBECODING_STYLE.communication,
      show_progress: false,
      explain_decisions: false,
      report_results: 'minimal' as const,
      interaction_level: 'minimal' as const,
    },
    progress: {
      ...DEFAULT_VIBECODING_STYLE.progress,
      show_operations: false,
      show_agents: false,
      update_frequency: 'batch_complete' as const,
      show_tokens: false,
    },
  },

  /** Verbose output for debugging/learning */
  verbose: {
    ...DEFAULT_VIBECODING_STYLE,
    communication: {
      ...DEFAULT_VIBECODING_STYLE.communication,
      report_results: 'detailed' as const,
      interaction_level: 'verbose' as const,
    },
    progress: {
      ...DEFAULT_VIBECODING_STYLE.progress,
      update_frequency: 'each_operation' as const,
    },
    decisions: {
      ...DEFAULT_VIBECODING_STYLE.decisions,
      show_alternatives: true,
      show_confidence: true,
    },
  },

  /** Tutorial mode for new users */
  tutorial: {
    ...DEFAULT_VIBECODING_STYLE,
    communication: {
      ...DEFAULT_VIBECODING_STYLE.communication,
      explain_decisions: true,
      report_results: 'detailed' as const,
      interaction_level: 'verbose' as const,
    },
    decisions: {
      ...DEFAULT_VIBECODING_STYLE.decisions,
      explain_why: true,
      show_alternatives: true,
      show_confidence: true,
    },
    formatting: {
      ...DEFAULT_VIBECODING_STYLE.formatting,
      include_code_blocks: true,
      include_diffs: true,
      collapse_threshold: 100,
    },
  },
} as const;

/** Preset keys for type-safe preset access */
export type VibecodingPresetKey = keyof typeof VIBECODING_PRESETS;

// -----------------------------------------------------------------------------
// Utility Functions
// -----------------------------------------------------------------------------

/**
 * Creates a customized vibecoding style from partial configuration
 * @param overrides - Partial style configuration to merge with defaults
 * @returns Complete vibecoding style configuration
 */
export function createVibecodingStyle(
  overrides: Partial<{
    communication: Partial<VibecodingCommunication>;
    progress: Partial<VibecodingProgress>;
    decisions: Partial<VibecodingDecisions>;
    formatting: Partial<VibecodingFormatting>;
  }>,
): VibecodingStyle {
  return {
    name: 'vibecoding',
    description: 'Communicative, interactive, explains decisions',
    communication: {
      ...DEFAULT_VIBECODING_STYLE.communication,
      ...overrides.communication,
    },
    progress: {
      ...DEFAULT_VIBECODING_STYLE.progress,
      ...overrides.progress,
    },
    decisions: {
      ...DEFAULT_VIBECODING_STYLE.decisions,
      ...overrides.decisions,
    },
    formatting: {
      ...DEFAULT_VIBECODING_STYLE.formatting,
      ...overrides.formatting,
    },
  };
}

/**
 * Gets a preset by name
 * @param preset - Preset name
 * @returns Preset configuration or default if not found
 */
export function getVibecodingPreset(preset: VibecodingPresetKey): VibecodingStyle {
  return VIBECODING_PRESETS[preset] as unknown as VibecodingStyle;
}

/**
 * Validates a vibecoding style configuration
 * @param style - Style configuration to validate
 * @returns Validation result with any errors
 */
export function validateVibecodingStyle(style: unknown): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!style || typeof style !== 'object') {
    return { valid: false, errors: ['Style must be an object'] };
  }

  const s = style as Record<string, unknown>;

  // Validate name
  if (s.name !== 'vibecoding') {
    errors.push('Style name must be "vibecoding"');
  }

  // Validate communication
  if (!s.communication || typeof s.communication !== 'object') {
    errors.push('Communication settings are required');
  } else {
    const comm = s.communication as Record<string, unknown>;
    if (typeof comm.show_progress !== 'boolean') {
      errors.push('communication.show_progress must be a boolean');
    }
    if (typeof comm.explain_decisions !== 'boolean') {
      errors.push('communication.explain_decisions must be a boolean');
    }
    if (typeof comm.ask_on_ambiguity !== 'boolean') {
      errors.push('communication.ask_on_ambiguity must be a boolean');
    }
    if (!['none', 'minimal', 'summary', 'detailed'].includes(comm.report_results as string)) {
      errors.push('communication.report_results must be none|minimal|summary|detailed');
    }
    if (!['minimal', 'moderate', 'verbose'].includes(comm.interaction_level as string)) {
      errors.push('communication.interaction_level must be minimal|moderate|verbose');
    }
  }

  // Validate progress
  if (!s.progress || typeof s.progress !== 'object') {
    errors.push('Progress settings are required');
  } else {
    const prog = s.progress as Record<string, unknown>;
    if (typeof prog.show_operations !== 'boolean') {
      errors.push('progress.show_operations must be a boolean');
    }
    if (!['each_operation', 'each_phase', 'batch_complete'].includes(prog.update_frequency as string)) {
      errors.push('progress.update_frequency must be each_operation|each_phase|batch_complete');
    }
  }

  // Validate formatting
  if (!s.formatting || typeof s.formatting !== 'object') {
    errors.push('Formatting settings are required');
  } else {
    const fmt = s.formatting as Record<string, unknown>;
    if (!['markdown', 'plain', 'rich'].includes(fmt.format as string)) {
      errors.push('formatting.format must be markdown|plain|rich');
    }
    if (typeof fmt.collapse_threshold !== 'number' || fmt.collapse_threshold < 0) {
      errors.push('formatting.collapse_threshold must be a non-negative number');
    }
  }

  return { valid: errors.length === 0, errors };
}
