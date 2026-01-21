/**
 * Batch Engine & Operations Verification interfaces for Batch Engine
 * @see SPEC-v2 Sections 3-4
 *
 * This module provides comprehensive verification interfaces for validating
 * the completeness and correctness of batch engine implementations against
 * SPEC-v2 requirements.
 */

// =============================================================================
// OPERATION CATEGORIES (SPEC-v2 Section 4)
// =============================================================================

/**
 * Operation categories as defined in SPEC-v2.
 * Each category groups related operation types that share execution characteristics.
 */
export const OPERATION_CATEGORIES = {
  /** Read operations - non-mutating data retrieval */
  READ: ['files', 'search', 'glob', 'symbols', 'url', 'analyze'] as const,
  /** Write operations - file system mutations */
  WRITE: ['create', 'edit', 'delete', 'move', 'copy', 'atomic'] as const,
  /** Exec operations - command and agent execution */
  EXEC: ['command', 'agent', 'script'] as const,
  /** Query operations - LSP and validation queries */
  QUERY: ['lsp', 'validate', 'diagnose'] as const,
  /** State operations - memory and preference management */
  STATE: ['get', 'set', 'delete_state', 'list', 'track', 'query'] as const,
} as const;

/** Type for operation category names */
export type OperationCategoryName = keyof typeof OPERATION_CATEGORIES;

/** Type for all operation type names */
export type OperationTypeName =
  | (typeof OPERATION_CATEGORIES.READ)[number]
  | (typeof OPERATION_CATEGORIES.WRITE)[number]
  | (typeof OPERATION_CATEGORIES.EXEC)[number]
  | (typeof OPERATION_CATEGORIES.QUERY)[number]
  | (typeof OPERATION_CATEGORIES.STATE)[number];

// =============================================================================
// VERIFICATION STATUS TYPES
// =============================================================================

/** Verification status for individual checks */
export type VerificationStatus = 'complete' | 'partial' | 'missing';

/** Overall report status */
export type ReportStatus = 'passed' | 'partial' | 'failed';

// =============================================================================
// INTERFACE CHECK STRUCTURES
// =============================================================================

/**
 * Result of checking a single interface for completeness.
 */
export interface InterfaceCheck {
  /** Name of the interface being checked */
  name: string;
  /** Whether the interface exists in the codebase */
  exists: boolean;
  /** File location if found */
  location?: string;
  /** Line number in file */
  line?: number;
  /** Properties required by SPEC-v2 */
  required_properties: string[];
  /** Properties actually implemented */
  implemented_properties: string[];
  /** Properties missing from implementation */
  missing_properties: string[];
  /** Additional properties not in spec (informational) */
  extra_properties?: string[];
  /** Type compliance notes */
  type_notes?: string[];
}

/**
 * Result of checking a single operation type.
 */
export interface OperationCheck {
  /** Operation name (e.g., 'files', 'create', 'command') */
  name: string;
  /** Whether the operation interface exists */
  exists: boolean;
  /** Whether it properly extends OperationBase */
  extends_operation_base: boolean;
  /** Required fields per SPEC-v2 */
  required_fields: string[];
  /** Fields actually implemented */
  implemented_fields: string[];
  /** Fields missing from implementation */
  missing_fields: string[];
  /** File location if found */
  location?: string;
  /** Line number in file */
  line?: number;
  /** Additional validation notes */
  notes?: string[];
}

// =============================================================================
// BATCH DEFINITION VERIFICATION (SPEC-v2 Section 3.1)
// =============================================================================

/**
 * Verification results for batch definition interfaces.
 * @see SPEC-v2 Section 3.1
 */
export interface BatchDefinitionVerification {
  // Core interfaces
  /** Batch interface with id, parent_id, operations, config, lifecycle, output */
  batch_interface: InterfaceCheck;
  /** BatchConfig with transaction, execution, preview, validation, recovery */
  batch_config_interface: InterfaceCheck;
  /** OutputConfig with mode, include, exclude, max_tokens */
  output_config_interface: InterfaceCheck;

  // Config section interfaces
  /** Transaction config: mode, isolation, timeout_ms */
  transaction_config: InterfaceCheck;
  /** Execution config: mode, max_workers, fail_fast, retry */
  execution_config: InterfaceCheck;
  /** Preview config: dry_run, diff, impact */
  preview_config: InterfaceCheck;
  /** Validation config: before, after, on_fail */
  validation_config: InterfaceCheck;
  /** Recovery config: checkpoint, rollback_on_fail, cleanup_on_success */
  recovery_config: InterfaceCheck;

  /** Overall status of batch definition verification */
  status: VerificationStatus;
}

// =============================================================================
// OPERATIONS VERIFICATION (SPEC-v2 Section 4)
// =============================================================================

/**
 * Verification results for a single category of operations.
 */
export interface CategoryVerification {
  /** Category name (read, write, exec, query, state) */
  category: OperationCategoryName;
  /** Individual operation checks */
  operations: OperationCheck[];

  // Summary counts
  /** Number of operations fully implemented */
  complete: number;
  /** Number of operations partially implemented */
  partial: number;
  /** Number of operations missing */
  missing: number;
}

/**
 * Verification results for all operations.
 * @see SPEC-v2 Section 4
 */
export interface OperationsVerification {
  // Per category verification
  /** READ operations verification (Section 4.1) */
  read: CategoryVerification;
  /** WRITE operations verification (Section 4.2) */
  write: CategoryVerification;
  /** EXEC operations verification (Section 4.3) */
  exec: CategoryVerification;
  /** QUERY operations verification (Section 4.4) */
  query: CategoryVerification;
  /** STATE operations verification (Section 4.5) */
  state: CategoryVerification;

  /** Overall status */
  status: VerificationStatus;

  // Summary
  /** Total number of operations expected */
  total_operations: number;
  /** Number of operations implemented */
  implemented: number;
  /** Number of operations missing */
  missing: number;
}

// =============================================================================
// OPERATION TYPE VERIFICATION DETAILS
// =============================================================================

/**
 * Detailed verification for READ operations.
 * @see SPEC-v2 Section 4.1
 */
export interface ReadOperationsVerification {
  /** files: FileReadOperation with targets, extract mode */
  files: OperationCheck;
  /** search: SearchOperation with pattern, mode, context */
  search: OperationCheck;
  /** glob: GlobOperation with patterns, exclude, filters */
  glob: OperationCheck;
  /** symbols: SymbolOperation with query, kinds, scope */
  symbols: OperationCheck;
  /** url: UrlOperation with targets, extract mode */
  url: OperationCheck;
  /** analyze: AnalyzeOperation with kind */
  analyze: OperationCheck;
}

/**
 * Detailed verification for WRITE operations.
 * @see SPEC-v2 Section 4.2
 */
export interface WriteOperationsVerification {
  /** create: CreateOperation with files, options */
  create: OperationCheck;
  /** edit: EditOperation with edits, options */
  edit: OperationCheck;
  /** delete: DeleteOperation with files, options (safety guards) */
  delete: OperationCheck;
  /** move: MoveOperation with moves, options (update_imports) */
  move: OperationCheck;
  /** copy: CopyOperation with copies, options (transform) */
  copy: OperationCheck;
  /** atomic: AtomicOperation with operations, options */
  atomic: OperationCheck;
}

/**
 * Detailed verification for EXEC operations.
 * @see SPEC-v2 Section 4.3
 */
export interface ExecOperationsVerification {
  /** command: CommandOperation with commands, shell, env, safe_mode */
  command: OperationCheck;
  /** agent: AgentOperation with agents, budget, model, context */
  agent: OperationCheck;
  /** script: ScriptOperation with scripts, language, code, args */
  script: OperationCheck;
}

/**
 * Detailed verification for QUERY operations.
 * @see SPEC-v2 Section 4.4
 */
export interface QueryOperationsVerification {
  /** lsp: LspOperation with queries for definition, references, etc. */
  lsp: OperationCheck;
  /** validate: ValidateOperation with validations */
  validate: OperationCheck;
  /** diagnose: DiagnoseOperation with diagnoses */
  diagnose: OperationCheck;
}

/**
 * Detailed verification for STATE operations.
 * @see SPEC-v2 Section 4.5
 */
export interface StateOperationsVerification {
  /** get: GetOperation for retrieving state by keys */
  get: OperationCheck;
  /** set: SetOperation for storing state entries */
  set: OperationCheck;
  /** delete_state: DeleteOperation for removing state */
  delete_state: OperationCheck;
  /** list: ListOperation for listing state keys */
  list: OperationCheck;
  /** track: TrackOperation for recording decisions, patterns, etc. */
  track: OperationCheck;
  /** query: MemoryQueryOperation for searching tracked entries */
  query: OperationCheck;
}

// =============================================================================
// RESULTS VERIFICATION (SPEC-v2 Section 3.3)
// =============================================================================

/**
 * Verification results for result structure interfaces.
 * @see SPEC-v2 Section 3.3
 */
export interface ResultsVerification {
  /** BatchResult with summary, phases, validation, recovery, execution_graph */
  batch_result: InterfaceCheck;
  /** PhaseResult with status, results, duration_ms, tokens_used */
  phase_result: InterfaceCheck;
  /** OperationResult with id, type, status, data, error, duration_ms, tokens_used */
  operation_result: InterfaceCheck;
  /** ErrorInfo with code, message, stack */
  error_info: InterfaceCheck;
  /** ValidationResult with check, passed, errors */
  validation_result: InterfaceCheck;

  /** Overall status */
  status: VerificationStatus;
}

// =============================================================================
// BATCH ENGINE VERIFICATION REPORT
// =============================================================================

/**
 * Summary statistics for the verification report.
 */
export interface VerificationSummary {
  /** Whether all batch definition interfaces are complete */
  batch_interfaces_complete: boolean;
  /** Number of operations fully implemented */
  operations_complete: number;
  /** Number of operations missing or partial */
  operations_missing: number;
  /** Whether all result interfaces are complete */
  result_interfaces_complete: boolean;
  /** Total interfaces checked */
  total_interfaces_checked: number;
  /** Total interfaces passing */
  total_interfaces_passing: number;
}

/**
 * Complete verification report for the batch engine.
 */
export interface BatchEngineVerificationReport {
  /** ISO timestamp when verification was performed */
  verified_at: string;

  /** Batch definition verification results */
  batch_definition: BatchDefinitionVerification;

  /** Operations verification results */
  operations: OperationsVerification;

  /** Results structure verification */
  results: ResultsVerification;

  /** Overall status of verification */
  status: ReportStatus;

  /** Summary statistics */
  summary: VerificationSummary;

  /** Any warnings or notes from verification */
  warnings?: string[];

  /** Verification tool version */
  verifier_version?: string;
}

// =============================================================================
// VERIFIER INTERFACES
// =============================================================================

/**
 * Main batch engine verifier interface.
 * Implementations should check all SPEC-v2 requirements.
 */
export interface BatchEngineVerifier {
  /** Verify complete batch engine against SPEC-v2 */
  verifyAll(): Promise<BatchEngineVerificationReport>;

  /** Verify batch definition interfaces (Section 3.1) */
  verifyBatchDefinition(): Promise<BatchDefinitionVerification>;

  /** Verify all operation interfaces (Section 4) */
  verifyOperations(): Promise<OperationsVerification>;

  /** Verify result structure interfaces (Section 3.3) */
  verifyResults(): Promise<ResultsVerification>;
}

/**
 * Detailed operation type verifier interface.
 * Used for granular verification of specific operation categories.
 */
export interface OperationTypeVerifier {
  /** Verify READ operations (Section 4.1) */
  verifyReadOperations(): Promise<ReadOperationsVerification>;

  /** Verify WRITE operations (Section 4.2) */
  verifyWriteOperations(): Promise<WriteOperationsVerification>;

  /** Verify EXEC operations (Section 4.3) */
  verifyExecOperations(): Promise<ExecOperationsVerification>;

  /** Verify QUERY operations (Section 4.4) */
  verifyQueryOperations(): Promise<QueryOperationsVerification>;

  /** Verify STATE operations (Section 4.5) */
  verifyStateOperations(): Promise<StateOperationsVerification>;
}

// =============================================================================
// BATCH OPERATIONS CHECKLIST (SPEC-v2 Reference)
// =============================================================================

/**
 * Comprehensive checklist of all batch operations requirements per SPEC-v2.
 * Use this as a reference for implementing verifiers.
 */
export const BATCH_OPERATIONS_CHECKLIST = {
  /**
   * Batch Definition (Section 3.1)
   */
  batch_definition: [
    'Batch interface with id, parent_id, operations, config, lifecycle, output',
    'BatchConfig with transaction, execution, preview, validation, recovery',
    'OutputConfig with mode, include, exclude, max_tokens',
    'Transaction modes: atomic, partial, none',
    'Transaction isolation: strict, relaxed',
    'Execution modes: parallel, sequential, adaptive',
    'Execution retry: attempts, backoff (linear/exponential/fixed), delay_ms',
    'Preview options: dry_run, diff, impact',
    'Validation steps: typecheck, lint, test, build, env, api_contract, secrets, permissions',
    'Validation timing: before, after with on_fail handler',
    'Recovery options: checkpoint, rollback_on_fail, cleanup_on_success',
  ] as const,

  /**
   * READ Operations (Section 4.1)
   */
  read_operations: [
    'FileReadOperation with targets (path/FileSpec[]), extract mode (content/outline/symbols/ast/lines)',
    'SearchOperation with pattern, mode (regex/semantic/fuzzy), context (before/after/max_per_file)',
    'GlobOperation with patterns, exclude, filters (size/modified/has_content)',
    'SymbolOperation with query, kinds (function/method/class/etc.), scope',
    'UrlOperation with targets, extract mode (raw/markdown/text/structured)',
    'AnalyzeOperation with kind (dependencies/dead_code/circular_deps/tech_debt/bundle/coverage/stack/api_surface/breaking_changes)',
  ] as const,

  /**
   * WRITE Operations (Section 4.2)
   */
  write_operations: [
    'CreateOperation with files (CreateSpec[]), options (overwrite/create_dirs/template)',
    'EditOperation with edits (EditSpec[]), options (match_mode/conflict_strategy/create_if_missing)',
    'DeleteOperation with files, options (require_empty/max_files/confirm_patterns/blocked_paths)',
    'MoveOperation with moves (MoveSpec[]), options (overwrite/update_imports)',
    'CopyOperation with copies (CopySpec[]), options (overwrite/preserve_timestamps/transform)',
    'AtomicOperation with operations (WriteOperation[]), options (rollback_on_failure/continue_on_error/dry_run)',
  ] as const,

  /**
   * EXEC Operations (Section 4.3)
   */
  exec_operations: [
    'CommandOperation with commands (CommandSpec[]), options (shell/working_dir/env/safe_mode)',
    'CommandSpec with cmd, timeout_ms, capture (stdout/stderr/exit_code), expect',
    'AgentOperation with agents (AgentSpec[])',
    'AgentSpec with id, agent, task, budget (max_tokens/max_turns/timeout_ms), model, inject, chain_on_complete',
    'ScriptOperation with scripts (ScriptSpec[])',
    'ScriptSpec with language (bash/python/node/deno/bun), code, args',
  ] as const,

  /**
   * QUERY Operations (Section 4.4)
   */
  query_operations: [
    'LspOperation with queries (LspQuery[])',
    'LspQuery with operation (definition/references/implementations/hover/signature/completion/diagnostics/code_actions/rename/call_hierarchy/type_hierarchy), file, position',
    'ValidateOperation with validations (ValidationSpec[])',
    'ValidationSpec with checks (ValidationCheck[]), options (fix/paths)',
    'DiagnoseOperation with diagnoses (DiagnosisSpec[])',
    'DiagnosisSpec with kind (error_stack/type_error/runtime_error/performance/memory_leak/bundle_size), subject, context',
  ] as const,

  /**
   * STATE Operations (Section 4.5)
   */
  state_operations: [
    'GetOperation with keys (string[])',
    'SetOperation with entries (SetEntry[]), options (merge/persist)',
    'DeleteOperation (delete_state) with keys (string[])',
    'ListOperation with optional prefix filter',
    'TrackOperation with entries (TrackEntry[])',
    'TrackEntry with kind (decision/pattern/failure/task/metric), data',
    'MemoryQueryOperation (query) with filters (kinds/since/keywords/limit)',
  ] as const,

  /**
   * Result Structures (Section 3.3)
   */
  results: [
    'BatchResult with summary (status/operations_total/succeeded/failed/skipped/duration_ms/tokens_used)',
    'BatchResult with phases (read/write/exec/query/state PhaseResults)',
    'BatchResult with validation (before/after ValidationResults)',
    'BatchResult with recovery (checkpoint_id/rollback_available/rollback_triggered)',
    'BatchResult with execution_graph (phases/parallel_groups/critical_path_ms)',
    'PhaseResult with status (success/partial/failed), results, duration_ms, tokens_used',
    'OperationResult with id, type, status (success/failed/skipped), data, error, duration_ms, tokens_used',
    'ErrorInfo with code, message, stack',
    'ValidationResult with check, passed, errors',
  ] as const,
} as const;

// =============================================================================
// REQUIRED PROPERTIES REFERENCE
// =============================================================================

/**
 * Required properties for each major interface.
 * Use for implementing InterfaceCheck verification.
 */
export const REQUIRED_PROPERTIES = {
  Batch: ['id', 'operations', 'config', 'lifecycle', 'output'],
  BatchConfig: ['transaction', 'execution', 'preview', 'validation', 'recovery'],
  OutputConfig: ['mode', 'include', 'exclude'],
  TransactionConfig: ['mode', 'isolation', 'timeout_ms'],
  ExecutionConfig: ['mode', 'max_workers', 'fail_fast', 'retry'],
  PreviewConfig: ['dry_run', 'diff', 'impact'],
  ValidationConfig: ['before', 'after', 'on_fail'],
  RecoveryConfig: ['checkpoint', 'rollback_on_fail', 'cleanup_on_success'],
  BatchResult: ['summary', 'phases', 'validation', 'recovery', 'execution_graph'],
  PhaseResult: ['status', 'results', 'duration_ms', 'tokens_used'],
  OperationResult: ['id', 'type', 'status', 'data', 'duration_ms', 'tokens_used'],
  ErrorInfo: ['code', 'message'],
  ValidationResult: ['check', 'passed'],
} as const;

/**
 * Required fields for each operation type.
 * All operations must have 'id' and 'type' from OperationBase.
 */
export const OPERATION_REQUIRED_FIELDS = {
  // READ operations
  files: ['id', 'type', 'targets', 'extract'],
  search: ['id', 'type', 'pattern', 'mode'],
  glob: ['id', 'type', 'patterns'],
  symbols: ['id', 'type', 'query'],
  url: ['id', 'type', 'targets', 'extract'],
  analyze: ['id', 'type', 'kind'],

  // WRITE operations
  create: ['id', 'type', 'files'],
  edit: ['id', 'type', 'edits'],
  delete: ['id', 'type', 'files'],
  move: ['id', 'type', 'moves'],
  copy: ['id', 'type', 'copies'],
  atomic: ['id', 'type', 'operations'],

  // EXEC operations
  command: ['id', 'type', 'commands'],
  agent: ['id', 'type', 'agents'],
  script: ['id', 'type', 'scripts'],

  // QUERY operations
  lsp: ['id', 'type', 'queries'],
  validate: ['id', 'type', 'validations'],
  diagnose: ['id', 'type', 'diagnoses'],

  // STATE operations
  get: ['id', 'type', 'keys'],
  set: ['id', 'type', 'entries'],
  delete_state: ['id', 'type', 'keys'],
  list: ['id', 'type'],
  track: ['id', 'type', 'entries'],
  query: ['id', 'type'],
} as const;

// =============================================================================
// HELPER TYPES
// =============================================================================

/** Extract checklist item type */
export type ChecklistCategory = keyof typeof BATCH_OPERATIONS_CHECKLIST;

/** Get checklist items for a category */
export type ChecklistItems<T extends ChecklistCategory> =
  (typeof BATCH_OPERATIONS_CHECKLIST)[T][number];

/** Type for required properties keys */
export type RequiredPropertiesKey = keyof typeof REQUIRED_PROPERTIES;

/** Type for operation required fields keys */
export type OperationRequiredFieldsKey = keyof typeof OPERATION_REQUIRED_FIELDS;
