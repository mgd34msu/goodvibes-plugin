/**
 * Lifecycle, Context, State, Memory Verification interfaces for Batch Engine
 * Provides comprehensive verification of lifecycle phases, context types,
 * state structure, and memory organization.
 * @see SPEC-v2 Sections 5-8
 */

// ============================================================================
// Constant Definitions
// ============================================================================

/**
 * Lifecycle phases from SPEC-v2 Section 5
 * Defines the complete operation lifecycle from intent to completion
 */
export const LIFECYCLE_PHASES = [
  'intent',
  'plan',
  'prepare',
  'validate_before',
  'execute',
  'validate_after',
  'commit',
  'chain',
  'error',
  'rollback',
  'complete',
] as const;

/** Type for lifecycle phase values */
export type LifecyclePhase = (typeof LIFECYCLE_PHASES)[number];

/**
 * Context types from SPEC-v2 Section 6
 * Defines the hierarchical context structure
 */
export const CONTEXT_TYPES = [
  'session',
  'batch',
  'operation',
  'agent',
] as const;

/** Type for context type values */
export type ContextType = (typeof CONTEXT_TYPES)[number];

/**
 * State components from SPEC-v2 Section 7
 * Defines the state structure components
 */
export const STATE_COMPONENTS = [
  'session_state',
  'agent_state',
  'checkpoint_state',
  'lock_state',
] as const;

/** Type for state component values */
export type StateComponent = (typeof STATE_COMPONENTS)[number];

/**
 * Memory types from SPEC-v2 Section 8
 * Defines the memory storage categories
 */
export const MEMORY_TYPES = [
  'decision',
  'pattern',
  'failure',
  'preference',
] as const;

/** Type for memory type values */
export type MemoryType = (typeof MEMORY_TYPES)[number];

// ============================================================================
// Common Verification Types
// ============================================================================

/**
 * Verification status for checks
 */
export type VerificationStatus = 'complete' | 'partial' | 'missing';

/**
 * Report status for overall verification
 */
export type ReportStatus = 'passed' | 'partial' | 'failed';

/**
 * Common interface verification result
 */
export interface InterfaceVerification {
  /** Name of the interface being verified */
  name: string;

  /** Whether the interface exists in the implementation */
  exists: boolean;

  /** File location of the interface (if exists) */
  location?: string;

  /** Whether the interface is completely implemented */
  complete: boolean;

  /** List of items that are missing */
  missing_items?: string[];
}

/**
 * API method verification check
 */
export interface APIMethodCheck {
  /** Method name */
  name: string;

  /** Whether the method exists */
  exists: boolean;

  /** Method parameters */
  parameters: string[];

  /** Return type of the method */
  return_type: string;
}

// ============================================================================
// Lifecycle Verification Types (SPEC-v2 Section 5)
// ============================================================================

/**
 * Verification result for hook definitions
 */
export interface HooksVerification {
  /** Lifecycle hooks interface verification */
  lifecycle_hooks_interface: InterfaceVerification;

  /** Phases that are defined in the implementation */
  phases_defined: LifecyclePhase[];

  /** Phases that are missing from implementation */
  phases_missing: LifecyclePhase[];

  /** Whether operation hooks are defined */
  operation_hooks_defined: boolean;

  /** Overall status */
  status: VerificationStatus;
}

/**
 * Check result for a single built-in hook
 */
export interface BuiltinHookCheck {
  /** Hook name */
  name: string;

  /** Phase where hook executes */
  phase: string;

  /** Whether the hook exists */
  exists: boolean;

  /** Whether the handler is defined */
  handler_defined: boolean;
}

/**
 * Verification result for built-in hooks
 */
export interface BuiltinHooksVerification {
  /** Array of built-in hook checks */
  hooks: BuiltinHookCheck[];

  /** Number of hooks that are defined */
  defined: number;

  /** Number of hooks that are missing */
  missing: number;

  /** Overall status */
  status: VerificationStatus;
}

/**
 * Verification result for hook configuration
 */
export interface HookConfigVerification {
  /** Config interface verification */
  config_interface: InterfaceVerification;

  /** Whether shorthand syntax is supported */
  shorthand_support: boolean;

  /** Whether filter syntax is supported */
  filter_support: boolean;

  /** Overall status */
  status: VerificationStatus;
}

/**
 * Complete lifecycle verification report
 */
export interface LifecycleVerificationReport {
  /** ISO timestamp when verification was performed */
  verified_at: string;

  /** Hooks verification result */
  hooks: HooksVerification;

  /** Built-in hooks verification result */
  builtin_hooks: BuiltinHooksVerification;

  /** Hook configuration verification result */
  hook_config: HookConfigVerification;

  /** Overall report status */
  status: ReportStatus;
}

/**
 * Lifecycle verifier interface
 * @see SPEC-v2 Section 5
 */
export interface LifecycleVerifier {
  /**
   * Verify all lifecycle-related interfaces
   * @returns Complete lifecycle verification report
   */
  verifyAll(): Promise<LifecycleVerificationReport>;

  /**
   * Verify hook definitions
   * @returns Hooks verification result
   */
  verifyHooks(): Promise<HooksVerification>;

  /**
   * Verify built-in hooks
   * @returns Built-in hooks verification result
   */
  verifyBuiltinHooks(): Promise<BuiltinHooksVerification>;

  /**
   * Verify hook configuration
   * @returns Hook configuration verification result
   */
  verifyHookConfig(): Promise<HookConfigVerification>;
}

// ============================================================================
// Context Verification Types (SPEC-v2 Section 6)
// ============================================================================

/**
 * Check result for a single context type
 */
export interface ContextTypeCheck {
  /** Context type name */
  type: ContextType;

  /** Whether the interface exists */
  interface_exists: boolean;

  /** Required fields for this context type */
  required_fields: string[];

  /** Fields that are implemented */
  implemented_fields: string[];
}

/**
 * Verification result for context types
 */
export interface ContextTypesVerification {
  /** Array of context type checks */
  types: ContextTypeCheck[];

  /** Number of types that are defined */
  defined: number;

  /** Number of types that are missing */
  missing: number;

  /** Overall status */
  status: VerificationStatus;
}

/**
 * Verification result for context gathering
 */
export interface ContextGatheringVerification {
  /** Whether session start gathering is implemented */
  session_start: boolean;

  /** Whether batch start gathering is implemented */
  batch_start: boolean;

  /** Whether operation start gathering is implemented */
  operation_start: boolean;

  /** Whether agent spawn gathering is implemented */
  agent_spawn: boolean;

  /** Overall status */
  status: VerificationStatus;
}

/**
 * Verification result for template resolution
 */
export interface TemplateResolutionVerification {
  /** Whether template syntax is defined */
  syntax_defined: boolean;

  /** Built-in template values that are defined */
  builtins_defined: string[];

  /** Template helpers that are defined */
  helpers_defined: string[];

  /** Overall status */
  status: VerificationStatus;
}

/**
 * Complete context verification report
 */
export interface ContextVerificationReport {
  /** ISO timestamp when verification was performed */
  verified_at: string;

  /** Context types verification result */
  context_types: ContextTypesVerification;

  /** Context gathering verification result */
  context_gathering: ContextGatheringVerification;

  /** Template resolution verification result */
  template_resolution: TemplateResolutionVerification;

  /** Overall report status */
  status: ReportStatus;
}

/**
 * Context verifier interface
 * @see SPEC-v2 Section 6
 */
export interface ContextVerifier {
  /**
   * Verify all context-related interfaces
   * @returns Complete context verification report
   */
  verifyAll(): Promise<ContextVerificationReport>;

  /**
   * Verify context types
   * @returns Context types verification result
   */
  verifyContextTypes(): Promise<ContextTypesVerification>;

  /**
   * Verify context gathering
   * @returns Context gathering verification result
   */
  verifyContextGathering(): Promise<ContextGatheringVerification>;

  /**
   * Verify template resolution
   * @returns Template resolution verification result
   */
  verifyTemplateResolution(): Promise<TemplateResolutionVerification>;
}

// ============================================================================
// State Verification Types (SPEC-v2 Section 7)
// ============================================================================

/**
 * Check result for a single state component
 */
export interface StateComponentCheck {
  /** Component name */
  name: StateComponent;

  /** Whether the interface exists */
  interface_exists: boolean;

  /** Required fields for this component */
  required_fields: string[];
}

/**
 * Verification result for state structure
 */
export interface StateStructureVerification {
  /** Array of state component checks */
  components: StateComponentCheck[];

  /** Number of components that are defined */
  defined: number;

  /** Number of components that are missing */
  missing: number;

  /** Overall status */
  status: VerificationStatus;
}

/**
 * Verification result for state files
 */
export interface StateFilesVerification {
  /** Whether file paths are defined */
  paths_defined: boolean;

  /** List of defined file paths */
  files: string[];

  /** Overall status */
  status: VerificationStatus;
}

/**
 * Verification result for state API
 */
export interface StateAPIVerification {
  /** Array of API method checks */
  methods: APIMethodCheck[];

  /** Number of methods that are defined */
  defined: number;

  /** Number of methods that are missing */
  missing: number;

  /** Overall status */
  status: VerificationStatus;
}

/**
 * Complete state verification report
 */
export interface StateVerificationReport {
  /** ISO timestamp when verification was performed */
  verified_at: string;

  /** State structure verification result */
  structure: StateStructureVerification;

  /** State files verification result */
  files: StateFilesVerification;

  /** State API verification result */
  api: StateAPIVerification;

  /** Overall report status */
  status: ReportStatus;
}

/**
 * State verifier interface
 * @see SPEC-v2 Section 7
 */
export interface StateVerifier {
  /**
   * Verify all state-related interfaces
   * @returns Complete state verification report
   */
  verifyAll(): Promise<StateVerificationReport>;

  /**
   * Verify state structure
   * @returns State structure verification result
   */
  verifyStateStructure(): Promise<StateStructureVerification>;

  /**
   * Verify state files
   * @returns State files verification result
   */
  verifyStateFiles(): Promise<StateFilesVerification>;

  /**
   * Verify state API
   * @returns State API verification result
   */
  verifyStateAPI(): Promise<StateAPIVerification>;
}

// ============================================================================
// Memory Verification Types (SPEC-v2 Section 8)
// ============================================================================

/**
 * Check result for a single memory type
 */
export interface MemoryTypeCheck {
  /** Memory type name */
  type: MemoryType;

  /** Whether the interface exists */
  interface_exists: boolean;

  /** Required fields for this type */
  required_fields: string[];
}

/**
 * Verification result for memory structure
 */
export interface MemoryStructureVerification {
  /** Array of memory type checks */
  types: MemoryTypeCheck[];

  /** Number of types that are defined */
  defined: number;

  /** Number of types that are missing */
  missing: number;

  /** Overall status */
  status: VerificationStatus;
}

/**
 * Verification result for memory files
 */
export interface MemoryFilesVerification {
  /** Whether file paths are defined */
  paths_defined: boolean;

  /** List of defined file paths */
  files: string[];

  /** Whether file format is defined */
  format_defined: boolean;

  /** Overall status */
  status: VerificationStatus;
}

/**
 * Verification result for memory API
 */
export interface MemoryAPIVerification {
  /** Array of API method checks */
  methods: APIMethodCheck[];

  /** Number of methods that are defined */
  defined: number;

  /** Number of methods that are missing */
  missing: number;

  /** Overall status */
  status: VerificationStatus;
}

/**
 * Complete memory verification report
 */
export interface MemoryVerificationReport {
  /** ISO timestamp when verification was performed */
  verified_at: string;

  /** Memory structure verification result */
  structure: MemoryStructureVerification;

  /** Memory files verification result */
  files: MemoryFilesVerification;

  /** Memory API verification result */
  api: MemoryAPIVerification;

  /** Overall report status */
  status: ReportStatus;
}

/**
 * Memory verifier interface
 * @see SPEC-v2 Section 8
 */
export interface MemoryVerifier {
  /**
   * Verify all memory-related interfaces
   * @returns Complete memory verification report
   */
  verifyAll(): Promise<MemoryVerificationReport>;

  /**
   * Verify memory structure
   * @returns Memory structure verification result
   */
  verifyMemoryStructure(): Promise<MemoryStructureVerification>;

  /**
   * Verify memory files
   * @returns Memory files verification result
   */
  verifyMemoryFiles(): Promise<MemoryFilesVerification>;

  /**
   * Verify memory API
   * @returns Memory API verification result
   */
  verifyMemoryAPI(): Promise<MemoryAPIVerification>;
}

// ============================================================================
// Combined Verification Types
// ============================================================================

/**
 * Complete verification report covering all four sections
 */
export interface LifecycleContextStateMemoryReport {
  /** ISO timestamp when verification was performed */
  verified_at: string;

  /** Lifecycle verification (Section 5) */
  lifecycle: LifecycleVerificationReport;

  /** Context verification (Section 6) */
  context: ContextVerificationReport;

  /** State verification (Section 7) */
  state: StateVerificationReport;

  /** Memory verification (Section 8) */
  memory: MemoryVerificationReport;

  /** Summary statistics */
  summary: {
    /** Total checks performed */
    total_checks: number;

    /** Total checks passed */
    passed: number;

    /** Total checks with partial results */
    partial: number;

    /** Total checks failed */
    failed: number;

    /** Completion percentage */
    completion_percent: number;
  };

  /** Overall report status */
  status: ReportStatus;
}

/**
 * Combined verifier for Sections 5-8
 */
export interface LifecycleContextStateMemoryVerifier {
  /** Lifecycle verifier instance */
  lifecycle: LifecycleVerifier;

  /** Context verifier instance */
  context: ContextVerifier;

  /** State verifier instance */
  state: StateVerifier;

  /** Memory verifier instance */
  memory: MemoryVerifier;

  /**
   * Verify all sections (5-8)
   * @returns Complete combined verification report
   */
  verifyAll(): Promise<LifecycleContextStateMemoryReport>;
}

// ============================================================================
// Verification Checklist
// ============================================================================

/**
 * Comprehensive checklist for Sections 5-8 verification
 * Used to ensure all requirements from SPEC-v2 are met
 */
export const LIFECYCLE_CONTEXT_CHECKLIST = {
  /** Lifecycle requirements (Section 5) */
  lifecycle: [
    'LifecycleHooks interface with all phases',
    'Operation hooks (before, after, error, retry)',
    'Built-in hooks: checkpoint, typecheck, lint, test, rollback, fix_loop',
    'Hook configuration with filters and shorthand',
  ],
  /** Context requirements (Section 6) */
  context: [
    'SessionContext interface',
    'BatchContext interface',
    'OperationContext interface',
    'AgentContext interface',
    'Context gathering functions',
    'Template resolution with helpers',
  ],
  /** State requirements (Section 7) */
  state: [
    'GoodVibesState interface',
    'SessionState, AgentState, CheckpointState, LockState',
    'State file paths defined',
    'StateAPI with all methods',
  ],
  /** Memory requirements (Section 8) */
  memory: [
    'Decision, Pattern, Failure, Preference interfaces',
    'Memory file paths and format',
    'MemoryAPI with all methods',
    'Search and relevance functions',
  ],
} as const;

/** Type for checklist category keys */
export type LifecycleContextChecklistCategory =
  keyof typeof LIFECYCLE_CONTEXT_CHECKLIST;

/** Get checklist items for a category */
export type LifecycleContextChecklistItems<
  C extends LifecycleContextChecklistCategory
> = (typeof LIFECYCLE_CONTEXT_CHECKLIST)[C][number];

// ============================================================================
// Checklist Verification Types
// ============================================================================

/**
 * Status of a single checklist item
 */
export interface ChecklistItemStatus {
  /** The checklist item description */
  item: string;

  /** Whether the item has been verified */
  verified: boolean;

  /** Optional notes about the verification */
  notes?: string;

  /** Location of implementation (if verified) */
  location?: string;
}

/**
 * Status of a checklist category
 */
export interface ChecklistCategoryStatus {
  /** Category name */
  category: LifecycleContextChecklistCategory;

  /** Status of each item in the category */
  items: ChecklistItemStatus[];

  /** Number of items verified */
  verified_count: number;

  /** Total number of items */
  total_count: number;

  /** Whether all items are verified */
  complete: boolean;
}

/**
 * Complete checklist verification result
 */
export interface LifecycleContextChecklistResult {
  /** ISO timestamp when verification was performed */
  verified_at: string;

  /** Status of each category */
  categories: ChecklistCategoryStatus[];

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
// Required Fields Definitions
// ============================================================================

/**
 * Required fields for each context type
 * Used for verification checks
 */
export const CONTEXT_REQUIRED_FIELDS: Record<ContextType, string[]> = {
  session: [
    'id',
    'started_at',
    'mode',
    'project_root',
    'project_name',
    'stack',
    'git',
    'health',
    'preferences',
  ],
  batch: [
    'decisions',
    'patterns',
    'failures',
    'affected_files',
    'affected_symbols',
    'resolved_dependencies',
    'risk',
  ],
  operation: ['id', 'type', 'injected', 'prior_results'],
  agent: [
    'task',
    'scope',
    'constraints',
    'relevant_decisions',
    'relevant_patterns',
    'past_failures',
    'prior_results',
    'budget',
  ],
};

/**
 * Required fields for each state component
 * Used for verification checks
 */
export const STATE_REQUIRED_FIELDS: Record<StateComponent, string[]> = {
  session_state: [
    'id',
    'started_at',
    'mode',
    'current_batch',
    'batches_completed',
    'operations_completed',
    'tokens_used',
    'last_typecheck',
    'last_lint',
    'last_test',
    'last_build',
    'git',
    'files',
  ],
  agent_state: ['active', 'completed', 'total_spawned', 'total_tokens'],
  checkpoint_state: ['checkpoints', 'max_checkpoints', 'cleanup_after_hours'],
  lock_state: ['locks'],
};

/**
 * Required fields for each memory type
 * Used for verification checks
 */
export const MEMORY_REQUIRED_FIELDS: Record<MemoryType, string[]> = {
  decision: [
    'id',
    'timestamp',
    'what',
    'why',
    'category',
    'confidence',
    'status',
  ],
  pattern: [
    'id',
    'timestamp',
    'name',
    'description',
    'examples',
    'when_to_use',
    'usage_count',
  ],
  failure: [
    'id',
    'timestamp',
    'error_type',
    'error_message',
    'resolved',
  ],
  preference: ['id', 'timestamp', 'key', 'value', 'source', 'scope'],
};

/**
 * Built-in hooks definition
 * Used for verification checks
 */
export const BUILTIN_HOOKS_DEFINITION: Record<
  string,
  { phase: string; handler: string; description: string }
> = {
  checkpoint: {
    phase: 'prepare',
    handler: 'createCheckpoint',
    description: 'Create restore point before execution',
  },
  acquire_locks: {
    phase: 'prepare',
    handler: 'acquireResourceLocks',
    description: 'Lock files/resources for exclusive access',
  },
  inject_context: {
    phase: 'prepare',
    handler: 'injectRelevantContext',
    description: 'Load relevant memory, patterns, decisions',
  },
  typecheck: {
    phase: 'validate',
    handler: 'runTypeCheck',
    description: 'Run TypeScript type checking',
  },
  lint: {
    phase: 'validate',
    handler: 'runLinter',
    description: 'Run ESLint/Prettier',
  },
  test: {
    phase: 'validate',
    handler: 'runTests',
    description: 'Run test suite',
  },
  build: {
    phase: 'validate',
    handler: 'runBuild',
    description: 'Run build process',
  },
  update_state: {
    phase: 'commit',
    handler: 'updateSessionState',
    description: 'Update session state with results',
  },
  record_memory: {
    phase: 'commit',
    handler: 'recordToMemory',
    description: 'Record decisions, patterns, failures',
  },
  emit_telemetry: {
    phase: 'commit',
    handler: 'emitTelemetry',
    description: 'Record metrics and audit trail',
  },
  release_locks: {
    phase: 'commit',
    handler: 'releaseResourceLocks',
    description: 'Release acquired locks',
  },
  rollback: {
    phase: 'error',
    handler: 'rollbackToCheckpoint',
    description: 'Restore from checkpoint on failure',
  },
  fix_loop: {
    phase: 'error',
    handler: 'runFixLoop',
    description: 'Attempt automatic fixes',
  },
};

/**
 * State API required methods
 * Used for verification checks
 */
export const STATE_API_METHODS: APIMethodCheck[] = [
  {
    name: 'getSession',
    exists: true,
    parameters: [],
    return_type: 'SessionState',
  },
  {
    name: 'updateSession',
    exists: true,
    parameters: ['updates: Partial<SessionState>'],
    return_type: 'void',
  },
  {
    name: 'registerAgent',
    exists: true,
    parameters: ['agent: ActiveAgent'],
    return_type: 'void',
  },
  {
    name: 'updateAgent',
    exists: true,
    parameters: ['id: string', 'updates: Partial<ActiveAgent>'],
    return_type: 'void',
  },
  {
    name: 'completeAgent',
    exists: true,
    parameters: ['id: string', 'result: AgentResult'],
    return_type: 'void',
  },
  {
    name: 'getActiveAgents',
    exists: true,
    parameters: [],
    return_type: 'ActiveAgent[]',
  },
  {
    name: 'createCheckpoint',
    exists: true,
    parameters: ['batch_id: string', 'reason: string'],
    return_type: 'Checkpoint',
  },
  {
    name: 'restoreCheckpoint',
    exists: true,
    parameters: ['checkpoint_id: string'],
    return_type: 'void',
  },
  {
    name: 'cleanupCheckpoints',
    exists: true,
    parameters: [],
    return_type: 'void',
  },
  {
    name: 'acquireLock',
    exists: true,
    parameters: ['lock: Omit<Lock, "id" | "acquired_at">'],
    return_type: 'Lock | null',
  },
  {
    name: 'releaseLock',
    exists: true,
    parameters: ['lock_id: string'],
    return_type: 'void',
  },
  {
    name: 'isLocked',
    exists: true,
    parameters: ['target: string'],
    return_type: 'boolean',
  },
  { name: 'persist', exists: true, parameters: [], return_type: 'Promise<void>' },
  { name: 'load', exists: true, parameters: [], return_type: 'Promise<void>' },
];

/**
 * Memory API required methods
 * Used for verification checks
 */
export const MEMORY_API_METHODS: APIMethodCheck[] = [
  {
    name: 'recordDecision',
    exists: true,
    parameters: ['decision: Omit<Decision, "id" | "timestamp">'],
    return_type: 'Decision',
  },
  {
    name: 'getDecisions',
    exists: true,
    parameters: ['filter?: DecisionFilter'],
    return_type: 'Decision[]',
  },
  {
    name: 'supersedDecision',
    exists: true,
    parameters: ['id: string', 'new_decision_id: string'],
    return_type: 'void',
  },
  {
    name: 'recordPattern',
    exists: true,
    parameters: ['pattern: Omit<Pattern, "id" | "timestamp" | "usage_count">'],
    return_type: 'Pattern',
  },
  {
    name: 'getPatterns',
    exists: true,
    parameters: ['filter?: PatternFilter'],
    return_type: 'Pattern[]',
  },
  {
    name: 'incrementPatternUsage',
    exists: true,
    parameters: ['id: string'],
    return_type: 'void',
  },
  {
    name: 'recordFailure',
    exists: true,
    parameters: ['failure: Omit<Failure, "id" | "timestamp">'],
    return_type: 'Failure',
  },
  {
    name: 'getFailures',
    exists: true,
    parameters: ['filter?: FailureFilter'],
    return_type: 'Failure[]',
  },
  {
    name: 'resolveFailure',
    exists: true,
    parameters: ['id: string', 'resolution: string'],
    return_type: 'void',
  },
  {
    name: 'setPreference',
    exists: true,
    parameters: ['key: string', 'value: unknown', 'scope?: string'],
    return_type: 'void',
  },
  {
    name: 'getPreference',
    exists: true,
    parameters: ['key: string'],
    return_type: 'unknown',
  },
  {
    name: 'search',
    exists: true,
    parameters: ['keywords: string[]', 'kinds?: MemoryEntryKind[]'],
    return_type: 'MemoryEntry[]',
  },
  {
    name: 'getRelevant',
    exists: true,
    parameters: ['context: BatchContext'],
    return_type: 'Memory',
  },
  { name: 'compact', exists: true, parameters: [], return_type: 'void' },
  { name: 'export', exists: true, parameters: [], return_type: 'string' },
  {
    name: 'import',
    exists: true,
    parameters: ['data: string'],
    return_type: 'void',
  },
];

/**
 * Template helpers that should be defined
 */
export const TEMPLATE_HELPERS = [
  'json',
  'join',
  'first',
  'last',
  'filter',
  'map',
  'slice',
  'count',
  'keys',
  'values',
] as const;

/** Type for template helper names */
export type TemplateHelper = (typeof TEMPLATE_HELPERS)[number];

/**
 * Template built-ins that should be available
 */
export const TEMPLATE_BUILTINS = [
  'results',
  'session',
  'now',
] as const;

/** Type for template builtin names */
export type TemplateBuiltin = (typeof TEMPLATE_BUILTINS)[number];

// ============================================================================
// Verifier Configuration
// ============================================================================

/**
 * Configuration options for the lifecycle-context verifier
 */
export interface LifecycleContextVerifierConfig {
  /** Root directory of the project */
  project_root: string;

  /** Directory containing interface definitions */
  interfaces_dir: string;

  /** Whether to include detailed file locations in reports */
  include_locations: boolean;

  /** Whether to verify API implementations */
  verify_implementations: boolean;

  /** Timeout for verification operations in milliseconds */
  timeout_ms: number;
}

/**
 * Default verifier configuration
 */
export const DEFAULT_LIFECYCLE_CONTEXT_VERIFIER_CONFIG: LifecycleContextVerifierConfig =
  {
    project_root: '.',
    interfaces_dir: 'src/interfaces',
    include_locations: true,
    verify_implementations: false,
    timeout_ms: 30000,
  };

// ============================================================================
// Factory Interface
// ============================================================================

/**
 * Factory for creating lifecycle-context verifier instances
 */
export interface LifecycleContextVerifierFactory {
  /**
   * Create a lifecycle verifier
   * @param config - Optional configuration overrides
   * @returns Configured lifecycle verifier
   */
  createLifecycleVerifier(
    config?: Partial<LifecycleContextVerifierConfig>
  ): LifecycleVerifier;

  /**
   * Create a context verifier
   * @param config - Optional configuration overrides
   * @returns Configured context verifier
   */
  createContextVerifier(
    config?: Partial<LifecycleContextVerifierConfig>
  ): ContextVerifier;

  /**
   * Create a state verifier
   * @param config - Optional configuration overrides
   * @returns Configured state verifier
   */
  createStateVerifier(
    config?: Partial<LifecycleContextVerifierConfig>
  ): StateVerifier;

  /**
   * Create a memory verifier
   * @param config - Optional configuration overrides
   * @returns Configured memory verifier
   */
  createMemoryVerifier(
    config?: Partial<LifecycleContextVerifierConfig>
  ): MemoryVerifier;

  /**
   * Create a combined verifier for all sections
   * @param config - Optional configuration overrides
   * @returns Configured combined verifier
   */
  createCombinedVerifier(
    config?: Partial<LifecycleContextVerifierConfig>
  ): LifecycleContextStateMemoryVerifier;
}

// ============================================================================
// Verification Event Types
// ============================================================================

/**
 * Events emitted during verification
 */
export type LifecycleContextVerificationEvent =
  | 'verification_started'
  | 'lifecycle_verified'
  | 'context_verified'
  | 'state_verified'
  | 'memory_verified'
  | 'verification_completed'
  | 'verification_failed';

/**
 * Data passed to verification event handlers
 */
export interface LifecycleContextVerificationEventData {
  /** Event type */
  event: LifecycleContextVerificationEvent;

  /** ISO timestamp of event */
  timestamp: string;

  /** Event-specific payload */
  payload?: {
    /** For lifecycle_verified events */
    lifecycle?: LifecycleVerificationReport;

    /** For context_verified events */
    context?: ContextVerificationReport;

    /** For state_verified events */
    state?: StateVerificationReport;

    /** For memory_verified events */
    memory?: MemoryVerificationReport;

    /** For verification_completed events */
    report?: LifecycleContextStateMemoryReport;

    /** For verification_failed events */
    error?: Error;
  };
}

/**
 * Handler for verification events
 */
export interface LifecycleContextVerificationEventHandler {
  (
    event: LifecycleContextVerificationEvent,
    data: LifecycleContextVerificationEventData
  ): void;
}

/**
 * Verifier with event support
 */
export interface ObservableLifecycleContextVerifier
  extends LifecycleContextStateMemoryVerifier {
  /**
   * Register an event handler
   * @param event - Event type to handle
   * @param handler - Handler function
   */
  on(
    event: LifecycleContextVerificationEvent,
    handler: LifecycleContextVerificationEventHandler
  ): void;

  /**
   * Unregister an event handler
   * @param event - Event type
   * @param handler - Handler to remove
   */
  off(
    event: LifecycleContextVerificationEvent,
    handler: LifecycleContextVerificationEventHandler
  ): void;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Calculate verification status from counts
 * @param defined - Number of items defined
 * @param total - Total number of items expected
 * @returns Verification status
 */
export function calculateStatus(
  defined: number,
  total: number
): VerificationStatus {
  if (defined === total) return 'complete';
  if (defined > 0) return 'partial';
  return 'missing';
}

/**
 * Calculate report status from verification statuses
 * @param statuses - Array of verification statuses
 * @returns Report status
 */
export function calculateReportStatus(
  statuses: VerificationStatus[]
): ReportStatus {
  if (statuses.every((s) => s === 'complete')) return 'passed';
  if (statuses.some((s) => s !== 'missing')) return 'partial';
  return 'failed';
}

/**
 * Create an empty lifecycle verification report
 * @returns Empty lifecycle verification report
 */
export function createEmptyLifecycleReport(): LifecycleVerificationReport {
  return {
    verified_at: new Date().toISOString(),
    hooks: {
      lifecycle_hooks_interface: {
        name: 'LifecycleHooks',
        exists: false,
        complete: false,
      },
      phases_defined: [],
      phases_missing: [...LIFECYCLE_PHASES],
      operation_hooks_defined: false,
      status: 'missing',
    },
    builtin_hooks: {
      hooks: [],
      defined: 0,
      missing: Object.keys(BUILTIN_HOOKS_DEFINITION).length,
      status: 'missing',
    },
    hook_config: {
      config_interface: {
        name: 'HookConfig',
        exists: false,
        complete: false,
      },
      shorthand_support: false,
      filter_support: false,
      status: 'missing',
    },
    status: 'failed',
  };
}

/**
 * Create an empty context verification report
 * @returns Empty context verification report
 */
export function createEmptyContextReport(): ContextVerificationReport {
  return {
    verified_at: new Date().toISOString(),
    context_types: {
      types: [],
      defined: 0,
      missing: CONTEXT_TYPES.length,
      status: 'missing',
    },
    context_gathering: {
      session_start: false,
      batch_start: false,
      operation_start: false,
      agent_spawn: false,
      status: 'missing',
    },
    template_resolution: {
      syntax_defined: false,
      builtins_defined: [],
      helpers_defined: [],
      status: 'missing',
    },
    status: 'failed',
  };
}

/**
 * Create an empty state verification report
 * @returns Empty state verification report
 */
export function createEmptyStateReport(): StateVerificationReport {
  return {
    verified_at: new Date().toISOString(),
    structure: {
      components: [],
      defined: 0,
      missing: STATE_COMPONENTS.length,
      status: 'missing',
    },
    files: {
      paths_defined: false,
      files: [],
      status: 'missing',
    },
    api: {
      methods: [],
      defined: 0,
      missing: STATE_API_METHODS.length,
      status: 'missing',
    },
    status: 'failed',
  };
}

/**
 * Create an empty memory verification report
 * @returns Empty memory verification report
 */
export function createEmptyMemoryReport(): MemoryVerificationReport {
  return {
    verified_at: new Date().toISOString(),
    structure: {
      types: [],
      defined: 0,
      missing: MEMORY_TYPES.length,
      status: 'missing',
    },
    files: {
      paths_defined: false,
      files: [],
      format_defined: false,
      status: 'missing',
    },
    api: {
      methods: [],
      defined: 0,
      missing: MEMORY_API_METHODS.length,
      status: 'missing',
    },
    status: 'failed',
  };
}

