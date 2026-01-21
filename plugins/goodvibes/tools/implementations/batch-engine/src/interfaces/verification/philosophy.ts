/**
 * Philosophy & Principles Verification interfaces for Batch Engine
 * Provides comprehensive verification of core philosophy adherence including
 * batch-first primitives, parallel defaults, enterprise-grade requirements,
 * and token efficiency targets.
 * @see SPEC-v2 Section 1
 */

// ============================================================================
// Core Principles (SPEC-v2 Section 1.1)
// ============================================================================

/**
 * Core principles from SPEC-v2 Section 1.1
 * These are the foundational beliefs that guide all design decisions
 */
export const CORE_PRINCIPLES = {
  /** Batch is the primitive - every operation is a batch operation */
  BATCH_IS_PRIMITIVE: 'batch_is_primitive',
  /** Parallel is the default - operations run in parallel unless they have dependencies */
  PARALLEL_IS_DEFAULT: 'parallel_is_default',
  /** Enterprise-grade always - no mocks, no placeholders, production-ready */
  ENTERPRISE_GRADE_ALWAYS: 'enterprise_grade_always',
  /** Token efficiency - minimize token usage through batching and output modes */
  TOKEN_EFFICIENCY: 'token_efficiency',
} as const;

/** Type for core principle values */
export type CorePrinciple = (typeof CORE_PRINCIPLES)[keyof typeof CORE_PRINCIPLES];

/** Type for core principle keys */
export type CorePrincipleKey = keyof typeof CORE_PRINCIPLES;

// ============================================================================
// Design Principles (SPEC-v2 Section 1.2)
// ============================================================================

/**
 * Design principles from SPEC-v2 Section 1.2
 * These are the practical guidelines derived from core principles
 */
export const DESIGN_PRINCIPLES = {
  /** All tools accept arrays, process in parallel, return aggregated results */
  BATCH_NATIVE: 'batch_native',
  /** Every operation has output_mode for precision control over verbosity */
  TOKEN_EFFICIENT: 'token_efficient',
  /** All write operations support atomic execution with rollback */
  TRANSACTION_SAFE: 'transaction_safe',
  /** Operations receive relevant memory, patterns, and decisions automatically */
  CONTEXT_AWARE: 'context_aware',
  /** Behavior changes based on vibecoding vs justvibes mode */
  MODE_ADAPTIVE: 'mode_adaptive',
  /** Automatic retry, fix loops, and recovery without user intervention */
  SELF_HEALING: 'self_healing',
  /** Full telemetry, logging, and audit trail for every operation */
  OBSERVABLE: 'observable',
} as const;

/** Type for design principle values */
export type DesignPrinciple =
  (typeof DESIGN_PRINCIPLES)[keyof typeof DESIGN_PRINCIPLES];

/** Type for design principle keys */
export type DesignPrincipleKey = keyof typeof DESIGN_PRINCIPLES;

// ============================================================================
// Token Efficiency Targets (SPEC-v2 Section 1.3)
// ============================================================================

/**
 * Token efficiency targets from SPEC-v2 Section 1.3
 * Defines the expected token reduction for each operation type
 */
export const TOKEN_EFFICIENCY_TARGETS = {
  /** 90% reduction in multi-file read operations via batch + outline extraction */
  multi_file_read: {
    target: 90,
    description: '90% reduction in multi-file read operations',
    method: 'Batch + outline extraction',
  },
  /** 85% reduction in search + context operations via combined search */
  search_with_context: {
    target: 85,
    description: '85% reduction in search + context operations',
    method: 'Combined search with precise context',
  },
  /** 90% reduction in multi-file edit operations via atomic batch */
  multi_file_edit: {
    target: 90,
    description: '90% reduction in multi-file edit operations',
    method: 'Atomic batch with minimal output',
  },
  /** 95% reduction in structure analysis via symbol extraction */
  structure_analysis: {
    target: 95,
    description: '95% reduction in structure analysis',
    method: 'Symbol extraction vs full read',
  },
  /** 80% reduction in validation operations via combined pipeline */
  validation: {
    target: 80,
    description: '80% reduction in validation operations',
    method: 'Combined validation pipeline',
  },
} as const;

/** Type for token efficiency target keys */
export type TokenEfficiencyTargetKey = keyof typeof TOKEN_EFFICIENCY_TARGETS;

/** Type for a single token efficiency target */
export interface TokenEfficiencyTarget {
  target: number;
  description: string;
  method: string;
}

// ============================================================================
// Evidence Types
// ============================================================================

/**
 * Type of evidence supporting a principle verification
 */
export type EvidenceType = 'interface' | 'implementation' | 'test' | 'documentation';

/**
 * Evidence supporting a principle verification
 */
export interface PrincipleEvidence {
  /** Type of evidence */
  type: EvidenceType;

  /** File or resource location */
  location: string;

  /** Description of what this evidence demonstrates */
  description: string;

  /** Optional code snippet or excerpt */
  excerpt?: string;

  /** Line number range if applicable */
  lines?: {
    start: number;
    end: number;
  };
}

// ============================================================================
// Violation Types
// ============================================================================

/**
 * Severity of a principle violation
 */
export type ViolationSeverity = 'minor' | 'major' | 'critical';

/**
 * A violation of a principle found during verification
 */
export interface PrincipleViolation {
  /** Location where violation was found */
  location: string;

  /** Description of the violation */
  description: string;

  /** Severity of the violation */
  severity: ViolationSeverity;

  /** Suggestion for fixing the violation */
  suggestion?: string;

  /** Related evidence or context */
  context?: string;

  /** Line number if applicable */
  line?: number;
}

// ============================================================================
// Principle Verification Types
// ============================================================================

/**
 * Verification result for a single principle
 */
export interface PrincipleVerification {
  /** Principle identifier */
  principle: string;

  /** Human-readable description of the principle */
  description: string;

  /** Whether the principle verification passed */
  passed: boolean;

  /** Evidence supporting the verification */
  evidence: PrincipleEvidence[];

  /** Violations found (if any) */
  violations?: PrincipleViolation[];

  /** Additional notes about the verification */
  notes?: string;
}

// ============================================================================
// Token Efficiency Verification Types
// ============================================================================

/**
 * Measurement of token efficiency for a specific operation type
 */
export interface TokenEfficiencyMeasurement {
  /** Operation type being measured */
  operation: TokenEfficiencyTargetKey;

  /** Target reduction percentage */
  target_reduction: number;

  /** Actual reduction percentage achieved */
  actual_reduction: number;

  /** Whether the target was met */
  passed: boolean;

  /** Baseline token count (without optimization) */
  baseline_tokens: number;

  /** Optimized token count (with batch engine) */
  optimized_tokens: number;

  /** Number of operations in the sample */
  sample_size: number;

  /** Optional breakdown of measurements */
  samples?: TokenEfficiencySample[];
}

/**
 * Individual sample in a token efficiency measurement
 */
export interface TokenEfficiencySample {
  /** Description of the sample operation */
  description: string;

  /** Baseline token count */
  baseline: number;

  /** Optimized token count */
  optimized: number;

  /** Reduction percentage */
  reduction: number;
}

/**
 * Complete token efficiency report
 */
export interface TokenEfficiencyReport {
  /** Measurements for each operation type */
  measurements: TokenEfficiencyMeasurement[];

  /** Number of targets met */
  targets_met: number;

  /** Number of targets missed */
  targets_missed: number;

  /** Average reduction across all operation types */
  average_reduction: number;

  /** Overall status */
  status: 'passed' | 'partial' | 'failed';

  /** Additional analysis */
  analysis?: string;
}

// ============================================================================
// Batch-is-Primitive Verification
// ============================================================================

/**
 * Verification that batch is used as the fundamental primitive
 */
export interface BatchPrimitiveVerification {
  /** All operations go through batch */
  operations_use_batch: boolean;

  /** No direct file operations bypassing batch */
  no_direct_operations: boolean;

  /** Batch interfaces are complete */
  batch_interfaces_complete: boolean;

  /** Single operations are treated as batch of one */
  single_as_batch: boolean;

  /** Evidence supporting the verification */
  evidence: PrincipleEvidence[];

  /** Violations found (if any) */
  violations?: PrincipleViolation[];
}

// ============================================================================
// Parallel-is-Default Verification
// ============================================================================

/**
 * Verification that parallel execution is the default
 */
export interface ParallelDefaultVerification {
  /** Default execution mode is parallel */
  default_mode_parallel: boolean;

  /** Parallel execution interfaces are defined */
  parallel_interfaces: boolean;

  /** Worker pool is configured */
  worker_pool_configured: boolean;

  /** Dependency resolution is implemented */
  dependency_resolution: boolean;

  /** Sequential execution requires explicit opt-in */
  sequential_opt_in: boolean;

  /** Evidence supporting the verification */
  evidence: PrincipleEvidence[];

  /** Violations found (if any) */
  violations?: PrincipleViolation[];
}

// ============================================================================
// Enterprise-Grade Verification
// ============================================================================

/**
 * Verification of enterprise-grade requirements
 */
export interface EnterpriseGradeVerification {
  /** Comprehensive error handling is implemented */
  error_handling: boolean;

  /** Recovery mechanisms are in place */
  recovery_mechanisms: boolean;

  /** Transaction support is available */
  transaction_support: boolean;

  /** Telemetry and monitoring is implemented */
  telemetry: boolean;

  /** Security considerations are addressed */
  security: boolean;

  /** No mocks or placeholders in production code */
  no_mocks: boolean;

  /** All features are production-ready */
  production_ready: boolean;

  /** Evidence supporting the verification */
  evidence: PrincipleEvidence[];

  /** Violations found (if any) */
  violations?: PrincipleViolation[];
}

// ============================================================================
// Token Efficiency Verification (Detailed)
// ============================================================================

/**
 * Verification of token efficiency principle
 */
export interface TokenEfficiencyVerification {
  /** Output mode configuration exists */
  output_mode_config: boolean;

  /** Precision read with filters is implemented */
  precision_read_filters: boolean;

  /** Incremental updates are supported */
  incremental_updates: boolean;

  /** Caching strategies are implemented */
  caching_strategies: boolean;

  /** Symbol extraction vs full read is available */
  symbol_extraction: boolean;

  /** Evidence supporting the verification */
  evidence: PrincipleEvidence[];

  /** Violations found (if any) */
  violations?: PrincipleViolation[];
}

// ============================================================================
// Philosophy Verification Report
// ============================================================================

/**
 * Summary of philosophy verification results
 */
export interface PhilosophyVerificationSummary {
  /** Number of principles that passed */
  principles_passed: number;

  /** Number of principles that failed */
  principles_failed: number;

  /** Number of efficiency targets met */
  efficiency_targets_met: number;

  /** Number of efficiency targets missed */
  efficiency_targets_missed: number;

  /** Total violations by severity */
  violations_by_severity: {
    critical: number;
    major: number;
    minor: number;
  };

  /** Overall compliance percentage */
  compliance_percent: number;
}

/**
 * Complete philosophy verification report
 */
export interface PhilosophyVerificationReport {
  /** ISO timestamp when verification was performed */
  verified_at: string;

  /** Verification results for each principle */
  principles: PrincipleVerification[];

  /** Token efficiency report */
  token_efficiency: TokenEfficiencyReport;

  /** Detailed batch primitive verification */
  batch_primitive?: BatchPrimitiveVerification;

  /** Detailed parallel default verification */
  parallel_default?: ParallelDefaultVerification;

  /** Detailed enterprise grade verification */
  enterprise_grade?: EnterpriseGradeVerification;

  /** Detailed token efficiency verification */
  token_efficiency_detail?: TokenEfficiencyVerification;

  /** Overall verification status */
  status: 'passed' | 'partial' | 'failed';

  /** Summary of results */
  summary: PhilosophyVerificationSummary;
}

// ============================================================================
// Philosophy Verifier Interface
// ============================================================================

/**
 * Main philosophy verification interface
 */
export interface PhilosophyVerifier {
  /**
   * Verify all principles and return comprehensive report
   * @returns Complete philosophy verification report
   */
  verifyAll(): Promise<PhilosophyVerificationReport>;

  /**
   * Verify a specific core principle
   * @param principle - Principle key to verify
   * @returns Verification result for the specified principle
   */
  verifyPrinciple(principle: CorePrincipleKey): Promise<PrincipleVerification>;

  /**
   * Verify token efficiency targets
   * @returns Token efficiency verification report
   */
  verifyTokenEfficiency(): Promise<TokenEfficiencyReport>;

  /**
   * Verify batch-is-primitive principle in detail
   * @returns Detailed batch primitive verification
   */
  verifyBatchPrimitive(): Promise<BatchPrimitiveVerification>;

  /**
   * Verify parallel-is-default principle in detail
   * @returns Detailed parallel default verification
   */
  verifyParallelDefault(): Promise<ParallelDefaultVerification>;

  /**
   * Verify enterprise-grade principle in detail
   * @returns Detailed enterprise grade verification
   */
  verifyEnterpriseGrade(): Promise<EnterpriseGradeVerification>;
}

// ============================================================================
// Philosophy Checklist
// ============================================================================

/**
 * Comprehensive checklist for philosophy verification
 * Organized by principle with specific checkpoints
 */
export const PHILOSOPHY_CHECKLIST = {
  /** Batch is primitive checkpoints */
  batch_is_primitive: [
    'All file operations go through batch engine',
    'No direct Read/Write/Edit tool calls in core logic',
    'Batch interfaces define all operation types',
    'Operations have proper dependency support',
    'Single operations treated as batch of one',
    'Batch result aggregation is implemented',
  ],
  /** Parallel is default checkpoints */
  parallel_is_default: [
    'Default execution mode is parallel',
    'Worker pool with configurable concurrency',
    'Dependency resolution for parallel execution',
    'Parallel-safe state management',
    'Sequential execution requires explicit opt-in',
    'Operation scheduling respects dependencies',
  ],
  /** Enterprise grade checkpoints */
  enterprise_grade: [
    'Comprehensive error handling',
    'Checkpoint and rollback support',
    'Fix loop for automatic recovery',
    'Telemetry and cost tracking',
    'Mode-aware behavior',
    'No mocks or placeholders',
    'Production-ready code quality',
    'Security considerations addressed',
  ],
  /** Token efficiency checkpoints */
  token_efficiency: [
    'Output mode configuration available',
    'Batch read with filters implemented',
    'Incremental updates supported',
    'Caching strategies in place',
    'Symbol extraction vs full read',
    'Minimal output for write operations',
    'Combined validation pipeline',
  ],
} as const;

/** Type for checklist category keys */
export type PhilosophyChecklistCategory = keyof typeof PHILOSOPHY_CHECKLIST;

/** Get checklist items for a category */
export type PhilosophyChecklistItems<C extends PhilosophyChecklistCategory> =
  (typeof PHILOSOPHY_CHECKLIST)[C][number];

// ============================================================================
// Checklist Verification Types
// ============================================================================

/**
 * Status of a single checklist item
 */
export interface PhilosophyChecklistItemStatus {
  /** The checklist item description */
  item: string;

  /** Whether the item has been verified */
  verified: boolean;

  /** Evidence supporting verification */
  evidence?: PrincipleEvidence;

  /** Notes about the verification */
  notes?: string;
}

/**
 * Status of a checklist category
 */
export interface PhilosophyChecklistCategoryStatus {
  /** Category name */
  category: PhilosophyChecklistCategory;

  /** Status of each item in the category */
  items: PhilosophyChecklistItemStatus[];

  /** Number of items verified */
  verified_count: number;

  /** Total number of items */
  total_count: number;

  /** Whether all items are verified */
  complete: boolean;

  /** Completion percentage */
  completion_percent: number;
}

/**
 * Complete checklist verification result
 */
export interface PhilosophyChecklistResult {
  /** Status of each category */
  categories: PhilosophyChecklistCategoryStatus[];

  /** Overall verified count */
  total_verified: number;

  /** Overall total count */
  total_items: number;

  /** Overall completion percentage */
  completion_percent: number;

  /** Whether all items are verified */
  all_complete: boolean;
}

// ============================================================================
// Verifier Configuration
// ============================================================================

/**
 * Configuration options for the philosophy verifier
 */
export interface PhilosophyVerifierConfig {
  /** Root directory of the project */
  project_root: string;

  /** Directory containing interface definitions */
  interfaces_dir: string;

  /** Whether to include detailed evidence in reports */
  include_evidence: boolean;

  /** Whether to run token efficiency measurements */
  measure_token_efficiency: boolean;

  /** Sample size for token efficiency measurements */
  token_efficiency_sample_size: number;

  /** Timeout for verification operations in milliseconds */
  timeout_ms: number;

  /** Minimum compliance percentage to pass */
  pass_threshold: number;
}

/**
 * Default philosophy verifier configuration
 */
export const DEFAULT_PHILOSOPHY_VERIFIER_CONFIG: PhilosophyVerifierConfig = {
  project_root: '.',
  interfaces_dir: 'src/interfaces',
  include_evidence: true,
  measure_token_efficiency: true,
  token_efficiency_sample_size: 10,
  timeout_ms: 60000,
  pass_threshold: 80,
};

// ============================================================================
// Factory Interface
// ============================================================================

/**
 * Factory for creating philosophy verifier instances
 */
export interface PhilosophyVerifierFactory {
  /**
   * Create a new philosophy verifier
   * @param config - Optional configuration overrides
   * @returns Configured philosophy verifier
   */
  create(config?: Partial<PhilosophyVerifierConfig>): PhilosophyVerifier;
}

// ============================================================================
// Extended Verifier Interface
// ============================================================================

/**
 * Extended philosophy verifier with additional capabilities
 */
export interface ExtendedPhilosophyVerifier extends PhilosophyVerifier {
  /** Current configuration */
  readonly config: PhilosophyVerifierConfig;

  /**
   * Verify a specific design principle
   * @param principle - Design principle key to verify
   * @returns Verification result
   */
  verifyDesignPrinciple(principle: DesignPrincipleKey): Promise<PrincipleVerification>;

  /**
   * Verify the philosophy checklist
   * @returns Checklist verification result
   */
  verifyChecklist(): Promise<PhilosophyChecklistResult>;

  /**
   * Get all violations found during verification
   * @returns Array of all violations
   */
  getViolations(): Promise<PrincipleViolation[]>;

  /**
   * Get violations filtered by severity
   * @param severity - Severity level to filter by
   * @returns Array of violations matching the severity
   */
  getViolationsBySeverity(severity: ViolationSeverity): Promise<PrincipleViolation[]>;

  /**
   * Get compliance score as a percentage
   * @returns Compliance percentage (0-100)
   */
  getComplianceScore(): Promise<number>;
}

// ============================================================================
// Verification Event Types
// ============================================================================

/**
 * Events emitted during philosophy verification
 */
export type PhilosophyVerificationEvent =
  | 'verification_started'
  | 'principle_verified'
  | 'token_efficiency_measured'
  | 'checklist_verified'
  | 'verification_completed'
  | 'verification_failed';

/**
 * Data passed to philosophy verification event handlers
 */
export interface PhilosophyVerificationEventData {
  /** Event type */
  event: PhilosophyVerificationEvent;

  /** ISO timestamp of event */
  timestamp: string;

  /** Event-specific payload */
  payload?: {
    /** For principle_verified events */
    principle?: PrincipleVerification;

    /** For token_efficiency_measured events */
    token_efficiency?: TokenEfficiencyReport;

    /** For checklist_verified events */
    checklist?: PhilosophyChecklistResult;

    /** For verification_completed events */
    report?: PhilosophyVerificationReport;

    /** For verification_failed events */
    error?: Error;
  };
}

/**
 * Handler for philosophy verification events
 */
export interface PhilosophyVerificationEventHandler {
  (event: PhilosophyVerificationEvent, data: PhilosophyVerificationEventData): void;
}

/**
 * Philosophy verifier with event support
 */
export interface ObservablePhilosophyVerifier extends ExtendedPhilosophyVerifier {
  /**
   * Register an event handler
   * @param event - Event type to handle
   * @param handler - Handler function
   */
  on(event: PhilosophyVerificationEvent, handler: PhilosophyVerificationEventHandler): void;

  /**
   * Unregister an event handler
   * @param event - Event type
   * @param handler - Handler to remove
   */
  off(event: PhilosophyVerificationEvent, handler: PhilosophyVerificationEventHandler): void;
}

// ============================================================================
// Principle Descriptions
// ============================================================================

/**
 * Human-readable descriptions for core principles
 */
export const CORE_PRINCIPLE_DESCRIPTIONS: Record<CorePrincipleKey, string> = {
  BATCH_IS_PRIMITIVE:
    'Every operation is a batch operation. Single operations are batches of one. ' +
    'This is not an optimization - it is the fundamental unit of work.',
  PARALLEL_IS_DEFAULT:
    'Operations run in parallel unless they have explicit dependencies. ' +
    'Sequential execution is the exception, not the rule.',
  ENTERPRISE_GRADE_ALWAYS:
    'No mocks, no placeholders, no shortcuts. ' +
    'Every output could ship to production.',
  TOKEN_EFFICIENCY:
    'Every operation has output_mode for precision control over verbosity. ' +
    'Batch operations significantly reduce token usage.',
};

/**
 * Human-readable descriptions for design principles
 */
export const DESIGN_PRINCIPLE_DESCRIPTIONS: Record<DesignPrincipleKey, string> = {
  BATCH_NATIVE:
    'All tools accept arrays, process in parallel, return aggregated results.',
  TOKEN_EFFICIENT:
    'Every operation has output_mode for precision control over verbosity.',
  TRANSACTION_SAFE:
    'All write operations support atomic execution with rollback.',
  CONTEXT_AWARE:
    'Operations receive relevant memory, patterns, and decisions automatically.',
  MODE_ADAPTIVE: 'Behavior changes based on vibecoding vs justvibes mode.',
  SELF_HEALING:
    'Automatic retry, fix loops, and recovery without user intervention.',
  OBSERVABLE: 'Full telemetry, logging, and audit trail for every operation.',
};
