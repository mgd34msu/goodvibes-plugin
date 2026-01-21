/**
 * Core Skills interfaces for Batch Engine
 * @see SPEC-v2 Section 14.1
 */

// =============================================================================
// Core Skill Names
// =============================================================================

/**
 * List of core skill names required by the Batch Engine
 * These skills provide essential guidance for batch operations, error recovery,
 * and code quality enforcement.
 */
export const CORE_SKILLS = [
  'batch-operations',
  'error-recovery',
  'code-quality'
] as const;

/**
 * Union type of core skill names
 */
export type CoreSkillName = typeof CORE_SKILLS[number];

// =============================================================================
// Batch Operations Skill
// =============================================================================

/**
 * Batch Operations skill definition
 * Provides guidance for using the batch tool effectively, including patterns,
 * optimization techniques, and transaction modes.
 */
export interface BatchOperationsSkill {
  /** Skill identifier */
  name: 'batch-operations';

  /**
   * Guidance sections for batch operations
   * Each section provides detailed instructions for specific aspects
   */
  sections: {
    /** How to use the batch tool effectively */
    using_batch_tool: string;
    /** Common batch operation patterns */
    batch_patterns: string;
    /** Techniques for optimizing batch performance */
    optimizing_batches: string;
    /** Available transaction modes and when to use them */
    transaction_modes: string;
    /** Parallel execution strategies and configuration */
    parallel_execution: string;
  };

  /** Example batch operations with explanations */
  examples: BatchExample[];

  /** Common mistakes to avoid when using batches */
  anti_patterns: AntiPattern[];
}

/**
 * Example batch operation with code and explanation
 */
export interface BatchExample {
  /** Name of the example */
  name: string;
  /** Description of what the example demonstrates */
  description: string;
  /** Code snippet showing the example */
  code: string;
  /** Output mode used in this example */
  output_mode: string;
  /** Estimated tokens saved compared to non-batched approach */
  tokens_saved: string;
}

/**
 * Anti-pattern definition showing what to avoid
 */
export interface AntiPattern {
  /** Name of the anti-pattern */
  name: string;
  /** Why this pattern is problematic */
  description: string;
  /** Example of the bad pattern */
  bad_example: string;
  /** Corrected version of the pattern */
  good_example: string;
}

// =============================================================================
// Error Recovery Skill
// =============================================================================

/**
 * Error Recovery skill definition
 * Provides guidance for understanding errors, using fix loops,
 * and implementing rollback strategies.
 */
export interface ErrorRecoverySkill {
  /** Skill identifier */
  name: 'error-recovery';

  /**
   * Guidance sections for error recovery
   * Each section covers a specific aspect of error handling
   */
  sections: {
    /** How to interpret and categorize errors */
    understanding_errors: string;
    /** How to use the fix loop effectively */
    using_fix_loop: string;
    /** Available rollback strategies and implementation */
    rollback_strategies: string;
    /** How to create and manage checkpoints */
    checkpoint_management: string;
    /** Best practices for robust error recovery */
    recovery_best_practices: string;
  };

  /** Common error patterns and how to handle them */
  error_patterns: ErrorPattern[];

  /** Available recovery strategies with examples */
  recovery_strategies: RecoveryStrategy[];
}

/**
 * Error pattern definition for categorizing and handling errors
 */
export interface ErrorPattern {
  /** Type of error (e.g., 'typescript_error', 'lint_error') */
  error_type: string;
  /** Observable symptoms that indicate this error type */
  symptoms: string[];
  /** Common causes of this error type */
  common_causes: string[];
  /** Steps to resolve this type of error */
  resolution_steps: string[];
}

/**
 * Recovery strategy definition with usage guidance
 */
export interface RecoveryStrategy {
  /** Name of the recovery strategy */
  name: string;
  /** Conditions under which this strategy should be used */
  when_to_use: string;
  /** Ordered steps to execute this strategy */
  steps: string[];
  /** Code example demonstrating the strategy */
  example: string;
}

// =============================================================================
// Code Quality Skill
// =============================================================================

/**
 * Code Quality skill definition
 * Provides guidance for maintaining code quality through validation hooks,
 * testing requirements, and security practices.
 */
export interface CodeQualitySkill {
  /** Skill identifier */
  name: 'code-quality';

  /**
   * Guidance sections for code quality
   * Each section addresses a specific quality dimension
   */
  sections: {
    /** Overall quality standards and expectations */
    quality_standards: string;
    /** Available validation hooks and their configuration */
    validation_hooks: string;
    /** Testing requirements and coverage expectations */
    testing_requirements: string;
    /** Documentation standards for code and APIs */
    documentation_standards: string;
    /** Security practices and vulnerability prevention */
    security_practices: string;
  };

  /** Quality checks that can be performed */
  checks: QualityCheck[];

  /** Enforcement rules for quality standards */
  rules: QualityRule[];
}

/**
 * Quality check definition
 */
export interface QualityCheck {
  /** Name of the quality check */
  name: string;
  /** Description of what the check validates */
  description: string;
  /** Hook that runs this check (e.g., 'pre_write', 'post_exec') */
  hook: string;
  /** Whether this check must pass */
  required: boolean;
  /** Whether this check can automatically fix issues */
  auto_fix: boolean;
}

/**
 * Quality rule severity levels
 */
export type QualityRuleSeverity = 'error' | 'warning' | 'info';

/**
 * Quality rule enforcement modes
 * - block: Prevent operation from completing
 * - warn: Log warning but allow operation
 * - suggest: Provide suggestion without blocking
 */
export type QualityRuleEnforcement = 'block' | 'warn' | 'suggest';

/**
 * Quality rule definition
 */
export interface QualityRule {
  /** Unique identifier for the rule */
  id: string;
  /** Human-readable description of the rule */
  description: string;
  /** Severity level of rule violations */
  severity: QualityRuleSeverity;
  /** How the rule is enforced */
  enforcement: QualityRuleEnforcement;
}

// =============================================================================
// Core Skills Content Structure
// =============================================================================

/**
 * Complete content structure for all core skills
 * Maps skill names to their full definitions
 */
export interface CoreSkillsContent {
  'batch-operations': BatchOperationsSkill;
  'error-recovery': ErrorRecoverySkill;
  'code-quality': CodeQualitySkill;
}

// =============================================================================
// Core Skills Loader
// =============================================================================

/**
 * Core skills loader interface
 * Provides methods to load and access core skill content
 */
export interface CoreSkillsLoader {
  /**
   * Load all core skills
   * @returns Promise resolving to all core skills content
   */
  loadAll(): Promise<CoreSkillsContent>;

  /**
   * Load a specific core skill by name
   * @param name - The skill name to load
   * @returns Promise resolving to the skill definition
   */
  load<T extends CoreSkillName>(name: T): Promise<CoreSkillsContent[T]>;

  /**
   * Get a specific section from a skill
   * @param skill - The skill name
   * @param section - The section name within the skill
   * @returns The section content, or undefined if not found
   */
  getSection(skill: CoreSkillName, section: string): string | undefined;

  /**
   * Get examples from a skill
   * @param skill - The skill name
   * @returns Array of examples (type depends on skill)
   */
  getExamples(skill: CoreSkillName): BatchExample[] | RecoveryStrategy[] | QualityCheck[];

  /**
   * Check if a skill is loaded
   * @param skill - The skill name to check
   * @returns Whether the skill is currently loaded
   */
  isLoaded(skill: CoreSkillName): boolean;

  /**
   * Reload a skill from disk
   * @param skill - The skill name to reload
   * @returns Promise resolving when reload is complete
   */
  reload(skill: CoreSkillName): Promise<void>;
}

// =============================================================================
// Core Skills File Paths
// =============================================================================

/**
 * File paths for core skills relative to plugin root
 * Used by the loader to locate skill content files
 */
export const CORE_SKILL_PATHS = {
  'batch-operations': 'skills/core/batch-operations.md',
  'error-recovery': 'skills/core/error-recovery.md',
  'code-quality': 'skills/core/code-quality.md'
} as const;

/**
 * Type for core skill paths mapping
 */
export type CoreSkillPaths = typeof CORE_SKILL_PATHS;

// =============================================================================
// Core Skills Metadata
// =============================================================================

/**
 * Metadata for a core skill
 */
export interface CoreSkillMetadata {
  /** Skill name */
  name: CoreSkillName;
  /** Human-readable display name */
  display_name: string;
  /** Brief description of the skill */
  description: string;
  /** Skill version */
  version: string;
  /** When the skill was last updated (ISO timestamp) */
  updated_at: string;
  /** Dependencies on other skills */
  dependencies: CoreSkillName[];
}

/**
 * Metadata for all core skills
 */
export const CORE_SKILL_METADATA: Record<CoreSkillName, CoreSkillMetadata> = {
  'batch-operations': {
    name: 'batch-operations',
    display_name: 'Batch Operations',
    description: 'Guidance for using batch tool effectively with patterns and optimization techniques',
    version: '1.0.0',
    updated_at: new Date().toISOString(),
    dependencies: []
  },
  'error-recovery': {
    name: 'error-recovery',
    display_name: 'Error Recovery',
    description: 'Understanding errors, fix loops, rollback strategies, and checkpoint management',
    version: '1.0.0',
    updated_at: new Date().toISOString(),
    dependencies: ['batch-operations']
  },
  'code-quality': {
    name: 'code-quality',
    display_name: 'Code Quality',
    description: 'Quality standards, validation hooks, testing requirements, and security practices',
    version: '1.0.0',
    updated_at: new Date().toISOString(),
    dependencies: ['batch-operations', 'error-recovery']
  }
};

// =============================================================================
// Core Skills Events
// =============================================================================

/**
 * Events emitted by the core skills loader
 */
export type CoreSkillsEvent =
  | 'skill_loaded'
  | 'skill_reloaded'
  | 'skill_error'
  | 'all_loaded';

/**
 * Event handler for core skills events
 */
export interface CoreSkillsEventHandler {
  (event: CoreSkillsEvent, data: CoreSkillsEventData): void;
}

/**
 * Data passed to core skills event handlers
 */
export interface CoreSkillsEventData {
  /** The event type */
  event: CoreSkillsEvent;
  /** ISO timestamp when the event occurred */
  timestamp: string;
  /** Skill name (if applicable) */
  skill?: CoreSkillName;
  /** Error message (for error events) */
  error?: string;
  /** Additional context data */
  context?: Record<string, unknown>;
}

// =============================================================================
// Core Skills Manager
// =============================================================================

/**
 * Core skills manager interface
 * Extends loader with lifecycle management and event handling
 */
export interface CoreSkillsManager extends CoreSkillsLoader {
  /** Current loaded skills content (may be partial) */
  content: Partial<CoreSkillsContent>;

  /** Metadata for all core skills */
  metadata: Record<CoreSkillName, CoreSkillMetadata>;

  /**
   * Initialize the manager and load all skills
   * @returns Promise resolving when initialization is complete
   */
  initialize(): Promise<void>;

  /**
   * Shutdown the manager and release resources
   * @returns Promise resolving when shutdown is complete
   */
  shutdown(): Promise<void>;

  /**
   * Get metadata for a skill
   * @param skill - The skill name
   * @returns The skill metadata
   */
  getMetadata(skill: CoreSkillName): CoreSkillMetadata;

  /**
   * Validate that all required skills are loaded
   * @returns Validation result with any missing skills
   */
  validate(): CoreSkillsValidationResult;

  /**
   * Register an event handler
   * @param event - Event type to handle
   * @param handler - Handler function
   */
  on(event: CoreSkillsEvent, handler: CoreSkillsEventHandler): void;

  /**
   * Unregister an event handler
   * @param event - Event type
   * @param handler - Handler function to remove
   */
  off(event: CoreSkillsEvent, handler: CoreSkillsEventHandler): void;
}

/**
 * Result of validating core skills
 */
export interface CoreSkillsValidationResult {
  /** Whether all required skills are loaded and valid */
  valid: boolean;
  /** List of missing skills */
  missing: CoreSkillName[];
  /** List of invalid skills (loaded but malformed) */
  invalid: CoreSkillName[];
  /** Validation error messages by skill */
  errors: Partial<Record<CoreSkillName, string>>;
}
