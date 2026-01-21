/**
 * Tools, Files, Examples Verification interfaces for Batch Engine
 * @see SPEC-v2 Sections 13-15, Appendices
 *
 * This module provides comprehensive verification interfaces for:
 * - Precision tools (grep, read, glob, symbols, edit, write, exec, fetch)
 * - Orchestration tools (discover, batch, batch_status, batch_recover, batch_state)
 * - Plugin directory structure (.claude-plugin, agents, skills, tools, hooks, etc.)
 * - Project state structure (.goodvibes directory hierarchy)
 * - Configuration files (plugin.json, .mcp.json, hooks.json)
 * - Examples and workflows documentation
 */

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Precision tools - low-level operations that batch orchestrates
 * @see SPEC-v2 Section 13.1
 */
export const PRECISION_TOOLS = [
  'precision_grep',
  'precision_read',
  'precision_glob',
  'precision_symbols',
  'precision_edit',
  'precision_write',
  'precision_exec',
  'precision_fetch',
] as const;

export type PrecisionToolName = typeof PRECISION_TOOLS[number];

/**
 * Orchestration tools - high-level batch coordination
 * @see SPEC-v2 Section 13.2
 */
export const ORCHESTRATION_TOOLS = [
  'discover',
  'batch',
  'batch_status',
  'batch_recover',
  'batch_state',
] as const;

export type OrchestrationToolName = typeof ORCHESTRATION_TOOLS[number];

/**
 * All tools combined
 */
export const ALL_TOOLS = [...PRECISION_TOOLS, ...ORCHESTRATION_TOOLS] as const;

export type AllToolName = PrecisionToolName | OrchestrationToolName;

/**
 * Configuration files required for plugin operation
 * @see SPEC-v2 Section 14, Appendix C
 */
export const CONFIG_FILES = [
  'plugin.json',
  '.mcp.json',
  '.lsp.json',
  'hooks.json',
] as const;

export type ConfigFileName = typeof CONFIG_FILES[number];

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL CHECK INTERFACES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Individual tool verification check
 * Verifies a single tool's definition and implementation
 */
export interface ToolCheck {
  /** Tool name */
  name: string;

  /** Whether the tool exists in the system */
  exists: boolean;

  // ─────────────────────────────────────────────────────────────────────────────
  // Definition checks
  // ─────────────────────────────────────────────────────────────────────────────

  /** Whether a definition file exists (YAML or JSON schema) */
  definition_exists: boolean;

  /** Whether input schema is complete and valid */
  input_schema_complete: boolean;

  /** Whether output schema is complete and valid */
  output_schema_complete: boolean;

  /** Schema validation errors (if any) */
  schema_errors?: string[];

  // ─────────────────────────────────────────────────────────────────────────────
  // Implementation checks
  // ─────────────────────────────────────────────────────────────────────────────

  /** Whether implementation file exists */
  implementation_exists: boolean;

  /** Whether implementation exports required functions */
  implementation_complete?: boolean;

  /** Implementation validation errors (if any) */
  implementation_errors?: string[];

  // ─────────────────────────────────────────────────────────────────────────────
  // Locations
  // ─────────────────────────────────────────────────────────────────────────────

  /** Path to definition file (relative to plugin root) */
  definition_location?: string;

  /** Path to implementation file (relative to plugin root) */
  implementation_location?: string;
}

/**
 * Precision tools verification result
 * @see SPEC-v2 Section 13.1
 */
export interface PrecisionToolsVerification {
  /** Individual tool checks */
  tools: ToolCheck[];

  /** Number of tools with complete definitions and implementations */
  defined: number;

  /** Number of tools missing definitions or implementations */
  missing: number;

  /** Overall status */
  status: 'complete' | 'partial' | 'missing';

  // ─────────────────────────────────────────────────────────────────────────────
  // Feature coverage
  // ─────────────────────────────────────────────────────────────────────────────

  /** precision_grep features verified */
  grep_features?: {
    output_modes: boolean;
    batch_queries: boolean;
    context_lines: boolean;
  };

  /** precision_read features verified */
  read_features?: {
    extract_modes: boolean;
    line_ranges: boolean;
    encoding_support: boolean;
  };

  /** precision_glob features verified */
  glob_features?: {
    pattern_filters: boolean;
    depth_limits: boolean;
    exclusion_patterns: boolean;
  };

  /** precision_symbols features verified */
  symbols_features?: {
    workspace_mode: boolean;
    document_mode: boolean;
    kind_filtering: boolean;
  };

  /** precision_edit features verified */
  edit_features?: {
    transaction_mode: boolean;
    match_mode: boolean;
    validation: boolean;
  };

  /** precision_write features verified */
  write_features?: {
    template_support: boolean;
    backup_creation: boolean;
    atomic_writes: boolean;
  };

  /** precision_exec features verified */
  exec_features?: {
    expectations: boolean;
    timeout_handling: boolean;
    output_capture: boolean;
  };

  /** precision_fetch features verified */
  fetch_features?: {
    caching: boolean;
    retry_logic: boolean;
    response_parsing: boolean;
  };
}

/**
 * Orchestration tools verification result
 * @see SPEC-v2 Section 13.2
 */
export interface OrchestrationToolsVerification {
  /** Individual tool checks */
  tools: ToolCheck[];

  /** Number of tools with complete definitions and implementations */
  defined: number;

  /** Number of tools missing definitions or implementations */
  missing: number;

  /** Overall status */
  status: 'complete' | 'partial' | 'missing';

  // ─────────────────────────────────────────────────────────────────────────────
  // Feature coverage
  // ─────────────────────────────────────────────────────────────────────────────

  /** discover tool features verified */
  discover_features?: {
    grep_queries: boolean;
    glob_queries: boolean;
    symbols_queries: boolean;
    combined_queries: boolean;
  };

  /** batch tool features verified */
  batch_features?: {
    full_execution_engine: boolean;
    parallel_execution: boolean;
    dependency_resolution: boolean;
    error_handling: boolean;
  };

  /** batch_status tool features verified */
  status_features?: {
    progress_tracking: boolean;
    operation_details: boolean;
    timing_metrics: boolean;
  };

  /** batch_recover tool features verified */
  recover_features?: {
    checkpoint_restore: boolean;
    partial_rollback: boolean;
    fix_loop_integration: boolean;
  };

  /** batch_state tool features verified */
  state_features?: {
    state_queries: boolean;
    state_updates: boolean;
    state_persistence: boolean;
  };
}

/**
 * Tool wiring verification
 * Verifies that tools are correctly wired together
 * @see SPEC-v2 Section 13.3
 */
export interface ToolWiringVerification {
  // ─────────────────────────────────────────────────────────────────────────────
  // Wiring checks
  // ─────────────────────────────────────────────────────────────────────────────

  /** batch tool uses precision tools for operations */
  batch_uses_precision: boolean;

  /** agents use batch tool for coordinated operations */
  agents_use_batch: boolean;

  /** recovery uses checkpoint system */
  recovery_uses_checkpoint: boolean;

  /** all tools share state manager */
  all_share_state: boolean;

  /** all tools share telemetry collector */
  all_share_telemetry: boolean;

  // ─────────────────────────────────────────────────────────────────────────────
  // Integration checks
  // ─────────────────────────────────────────────────────────────────────────────

  /** discover results flow to batch */
  discover_to_batch_flow: boolean;

  /** batch results flow to status */
  batch_to_status_flow: boolean;

  /** failures flow to recover */
  failures_to_recover_flow: boolean;

  /** state persists across tool calls */
  state_persistence_verified: boolean;

  // ─────────────────────────────────────────────────────────────────────────────
  // Status
  // ─────────────────────────────────────────────────────────────────────────────

  /** Overall wiring status */
  status: 'complete' | 'partial' | 'missing';

  /** Specific wiring issues found */
  issues?: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// TOOLS VERIFIER INTERFACE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Tools verification interface
 * Verifies all tool definitions, implementations, and wiring
 */
export interface ToolsVerifier {
  /**
   * Verify all tools (precision, orchestration, and wiring)
   * @returns Complete tools verification report
   */
  verifyAll(): Promise<ToolsVerificationReport>;

  /**
   * Verify precision tools only
   * @returns Precision tools verification result
   */
  verifyPrecisionTools(): Promise<PrecisionToolsVerification>;

  /**
   * Verify orchestration tools only
   * @returns Orchestration tools verification result
   */
  verifyOrchestrationTools(): Promise<OrchestrationToolsVerification>;

  /**
   * Verify tool wiring and integration
   * @returns Tool wiring verification result
   */
  verifyToolWiring(): Promise<ToolWiringVerification>;

  /**
   * Verify a specific tool by name
   * @param name - Tool name to verify
   * @returns Individual tool check result
   */
  verifyTool(name: AllToolName): Promise<ToolCheck>;

  /**
   * Check if a tool is available for use
   * @param name - Tool name to check
   * @returns True if tool is available
   */
  isToolAvailable(name: AllToolName): Promise<boolean>;
}

/**
 * Complete tools verification report
 * Aggregates all tool verification results
 */
export interface ToolsVerificationReport {
  /** ISO timestamp when verification was performed */
  verified_at: string;

  /** Precision tools verification */
  precision_tools: PrecisionToolsVerification;

  /** Orchestration tools verification */
  orchestration_tools: OrchestrationToolsVerification;

  /** Tool wiring verification */
  wiring: ToolWiringVerification;

  /** Overall status */
  status: 'passed' | 'partial' | 'failed';

  /** Summary counts */
  summary: {
    precision_complete: number;
    precision_missing: number;
    orchestration_complete: number;
    orchestration_missing: number;
    total_issues: number;
  };

  /** Recommendations for fixing issues */
  recommendations?: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// FILE CHECK INTERFACES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Directory existence check
 */
export interface DirectoryCheck {
  /** Directory path (relative to root) */
  path: string;

  /** Whether the directory exists */
  exists: boolean;

  /** Whether this directory is required */
  required: boolean;

  /** Whether directory contents were verified */
  contents_verified?: boolean;

  /** Expected contents (if verified) */
  expected_contents?: string[];

  /** Actual contents found */
  actual_contents?: string[];

  /** Missing expected contents */
  missing_contents?: string[];
}

/**
 * File existence and validity check
 */
export interface FileCheck {
  /** File path (relative to root) */
  path: string;

  /** Whether the file exists */
  exists: boolean;

  /** Whether this file is required */
  required: boolean;

  /** Whether the file content is valid */
  valid?: boolean;

  /** Validation errors (if any) */
  validation_errors?: string[];

  /** File size in bytes (if exists) */
  size_bytes?: number;

  /** Last modified timestamp (if exists) */
  last_modified?: string;
}

/**
 * Configuration file check with schema validation
 */
export interface ConfigFileCheck {
  /** Config file name */
  name: ConfigFileName;

  /** Whether the file exists */
  exists: boolean;

  /** Whether the file content is valid JSON/YAML */
  valid: boolean;

  /** Whether the file conforms to its schema */
  schema_compliant: boolean;

  /** Schema version found */
  schema_version?: string;

  /** Validation errors (if any) */
  errors?: string[];

  /** Warnings (non-critical issues) */
  warnings?: string[];

  /** Path to the file */
  path?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PLUGIN STRUCTURE VERIFICATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Plugin directory structure verification
 * @see SPEC-v2 Section 14.1
 */
export interface PluginStructureVerification {
  /** Directory checks */
  directories: DirectoryCheck[];

  /** Required file checks */
  files: FileCheck[];

  /** Whether structure is complete */
  complete: boolean;

  /** Missing directories */
  missing_directories: string[];

  /** Missing files */
  missing_files: string[];

  /** Unexpected files (may indicate issues) */
  extra_files?: string[];

  /** Structure warnings */
  warnings?: string[];
}

/**
 * Project state directory structure verification
 * @see SPEC-v2 Section 14.2
 */
export interface ProjectStructureVerification {
  /** Whether .goodvibes root exists */
  root_exists: boolean;

  /** Subdirectory checks */
  subdirectories: DirectoryCheck[];

  /** File checks */
  files?: FileCheck[];

  /** Whether structure is complete */
  complete: boolean;

  /** Missing directories or files */
  missing: string[];

  /** Initialization status */
  initialized: boolean;

  /** Disk usage (if available) */
  disk_usage?: {
    state: number;
    memory: number;
    checkpoints: number;
    telemetry: number;
    logs: number;
    cache: number;
    total: number;
  };
}

/**
 * Configuration files verification
 * @see SPEC-v2 Appendix C
 */
export interface ConfigFilesVerification {
  /** Config file checks */
  files: ConfigFileCheck[];

  /** Whether all configs are complete and valid */
  complete: boolean;

  /** List of invalid config files */
  invalid: string[];

  /** List of missing config files */
  missing: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// FILES VERIFIER INTERFACE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Files verification interface
 * Verifies plugin structure, project structure, and config files
 */
export interface FilesVerifier {
  /**
   * Verify all file structures
   * @returns Complete files verification report
   */
  verifyAll(): Promise<FilesVerificationReport>;

  /**
   * Verify plugin directory structure
   * @returns Plugin structure verification result
   */
  verifyPluginStructure(): Promise<PluginStructureVerification>;

  /**
   * Verify project state directory structure
   * @returns Project structure verification result
   */
  verifyProjectStructure(): Promise<ProjectStructureVerification>;

  /**
   * Verify configuration files
   * @returns Config files verification result
   */
  verifyConfigFiles(): Promise<ConfigFilesVerification>;

  /**
   * Verify a specific directory exists and is valid
   * @param path - Directory path to verify
   * @param required - Whether directory is required
   * @returns Directory check result
   */
  verifyDirectory(path: string, required: boolean): Promise<DirectoryCheck>;

  /**
   * Verify a specific file exists and is valid
   * @param path - File path to verify
   * @param required - Whether file is required
   * @returns File check result
   */
  verifyFile(path: string, required: boolean): Promise<FileCheck>;

  /**
   * Verify a config file against its schema
   * @param name - Config file name
   * @returns Config file check result
   */
  verifyConfigFile(name: ConfigFileName): Promise<ConfigFileCheck>;
}

/**
 * Complete files verification report
 */
export interface FilesVerificationReport {
  /** ISO timestamp when verification was performed */
  verified_at: string;

  /** Plugin structure verification */
  plugin_structure: PluginStructureVerification;

  /** Project structure verification */
  project_structure: ProjectStructureVerification;

  /** Config files verification */
  config_files: ConfigFilesVerification;

  /** Overall status */
  status: 'passed' | 'partial' | 'failed';

  /** Summary counts */
  summary: {
    directories_ok: number;
    directories_missing: number;
    files_ok: number;
    files_missing: number;
    configs_valid: number;
    configs_invalid: number;
  };

  /** Recommendations for fixing issues */
  recommendations?: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXAMPLES VERIFICATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Individual example check
 */
export interface ExampleCheck {
  /** Example name or identifier */
  name: string;

  /** Whether the example exists */
  exists: boolean;

  /** Whether the example is valid (parseable, syntactically correct) */
  valid: boolean;

  /** Whether the example can be executed */
  executable?: boolean;

  /** Example category */
  category?: string;

  /** Example description */
  description?: string;

  /** Validation errors (if any) */
  errors?: string[];

  /** Path to example file */
  path?: string;
}

/**
 * Workflow example check
 */
export interface WorkflowCheck {
  /** Workflow name */
  name: string;

  /** Workflow mode (vibecoding, justvibes) */
  mode: string;

  /** Number of steps defined */
  steps_defined: number;

  /** Whether all steps are complete */
  complete: boolean;

  /** Step names */
  steps?: string[];

  /** Missing steps */
  missing_steps?: string[];

  /** Workflow description */
  description?: string;

  /** Path to workflow file */
  path?: string;
}

/**
 * Batch examples verification
 * @see SPEC-v2 Section 15
 */
export interface BatchExamplesVerification {
  /** Individual example checks */
  examples: ExampleCheck[];

  /** Categories covered by examples */
  categories_covered: string[];

  /** Categories missing examples */
  categories_missing: string[];

  /** Overall status */
  status: 'complete' | 'partial' | 'missing';

  /** Total examples found */
  total_examples: number;

  /** Valid examples count */
  valid_examples: number;
}

/**
 * Workflow examples verification
 * @see SPEC-v2 Section 15
 */
export interface WorkflowExamplesVerification {
  /** Workflow checks */
  workflows: WorkflowCheck[];

  /** Modes covered (vibecoding, justvibes) */
  modes_covered: string[];

  /** Scenarios covered */
  scenarios_covered: string[];

  /** Scenarios missing */
  scenarios_missing?: string[];

  /** Overall status */
  status: 'complete' | 'partial' | 'missing';

  /** Total workflows found */
  total_workflows: number;

  /** Complete workflows count */
  complete_workflows: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXAMPLES VERIFIER INTERFACE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Examples verification interface
 * Verifies batch examples and workflow documentation
 */
export interface ExamplesVerifier {
  /**
   * Verify all examples
   * @returns Complete examples verification report
   */
  verifyAll(): Promise<ExamplesVerificationReport>;

  /**
   * Verify batch operation examples
   * @returns Batch examples verification result
   */
  verifyBatchExamples(): Promise<BatchExamplesVerification>;

  /**
   * Verify workflow examples
   * @returns Workflow examples verification result
   */
  verifyWorkflowExamples(): Promise<WorkflowExamplesVerification>;

  /**
   * Verify a specific example
   * @param name - Example name
   * @returns Example check result
   */
  verifyExample(name: string): Promise<ExampleCheck>;

  /**
   * Verify a specific workflow
   * @param name - Workflow name
   * @returns Workflow check result
   */
  verifyWorkflow(name: string): Promise<WorkflowCheck>;

  /**
   * List all available examples
   * @returns List of example names
   */
  listExamples(): Promise<string[]>;

  /**
   * List all available workflows
   * @returns List of workflow names
   */
  listWorkflows(): Promise<string[]>;
}

/**
 * Complete examples verification report
 */
export interface ExamplesVerificationReport {
  /** ISO timestamp when verification was performed */
  verified_at: string;

  /** Batch examples verification */
  batch_examples: BatchExamplesVerification;

  /** Workflow examples verification */
  workflow_examples: WorkflowExamplesVerification;

  /** Overall status */
  status: 'passed' | 'partial' | 'failed';

  /** Summary */
  summary: {
    total_examples: number;
    valid_examples: number;
    total_workflows: number;
    complete_workflows: number;
    categories_covered: number;
    categories_missing: number;
  };

  /** Recommendations for improving examples */
  recommendations?: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPLETE VERIFICATION REPORT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Complete verification report across all sections
 * Aggregates philosophy, architecture, batch, lifecycle, telemetry, and tools/files
 */
export interface CompleteVerificationReport {
  /** ISO timestamp when verification was performed */
  verified_at: string;

  /** SPEC version being verified against */
  spec_version: string;

  // ─────────────────────────────────────────────────────────────────────────────
  // All verification sections
  // ─────────────────────────────────────────────────────────────────────────────

  /** Philosophy verification (Sections 1-3) */
  philosophy: PhilosophyVerification;

  /** Architecture verification (Sections 4-6) */
  architecture: ArchitectureVerification;

  /** Batch operations verification (Sections 5-6) */
  batch_operations: BatchOperationsVerification;

  /** Lifecycle and context verification (Sections 7-8) */
  lifecycle_context: LifecycleContextVerification;

  /** Telemetry and recovery verification (Sections 9-11) */
  telemetry_recovery: TelemetryRecoveryVerification;

  /** Tools and files verification (Sections 13-15) */
  tools_files: ToolsFilesVerification;

  // ─────────────────────────────────────────────────────────────────────────────
  // Overall status
  // ─────────────────────────────────────────────────────────────────────────────

  /** Overall verification status */
  status: 'passed' | 'partial' | 'failed';

  /** Summary counts */
  summary: {
    total_checks: number;
    passed: number;
    failed: number;
    warnings: number;
    skipped: number;
  };

  /** Prioritized recommendations */
  recommendations: string[];

  /** Critical issues that must be fixed */
  critical_issues?: string[];

  /** Non-critical warnings */
  warnings?: string[];
}

/**
 * Philosophy verification section (Sections 1-3)
 */
export interface PhilosophyVerification {
  /** Mode definitions present and valid */
  modes_defined: boolean;

  /** Agent guidelines present */
  guidelines_present: boolean;

  /** Output styles configured */
  output_styles_configured: boolean;

  /** Status */
  status: 'passed' | 'partial' | 'failed';

  /** Issues found */
  issues?: string[];
}

/**
 * Architecture verification section (Sections 4-6)
 */
export interface ArchitectureVerification {
  /** Precision engine implemented */
  precision_engine: boolean;

  /** Batch executor implemented */
  batch_executor: boolean;

  /** Discover tool implemented */
  discover_tool: boolean;

  /** Tool integration verified */
  tool_integration: boolean;

  /** Status */
  status: 'passed' | 'partial' | 'failed';

  /** Issues found */
  issues?: string[];
}

/**
 * Batch operations verification section (Sections 5-6)
 */
export interface BatchOperationsVerification {
  /** Batch operations defined */
  operations_defined: boolean;

  /** Execution flow implemented */
  execution_flow: boolean;

  /** Parallel execution supported */
  parallel_execution: boolean;

  /** Dependency resolution works */
  dependency_resolution: boolean;

  /** Status */
  status: 'passed' | 'partial' | 'failed';

  /** Issues found */
  issues?: string[];
}

/**
 * Lifecycle and context verification section (Sections 7-8)
 */
export interface LifecycleContextVerification {
  /** State management implemented */
  state_management: boolean;

  /** Memory persistence works */
  memory_persistence: boolean;

  /** Context gathering works */
  context_gathering: boolean;

  /** Session management works */
  session_management: boolean;

  /** Status */
  status: 'passed' | 'partial' | 'failed';

  /** Issues found */
  issues?: string[];
}

/**
 * Telemetry and recovery verification section (Sections 9-11)
 */
export interface TelemetryRecoveryVerification {
  /** Telemetry collection works */
  telemetry_collection: boolean;

  /** Checkpoint system works */
  checkpoint_system: boolean;

  /** Rollback system works */
  rollback_system: boolean;

  /** Fix loop implemented */
  fix_loop: boolean;

  /** Status */
  status: 'passed' | 'partial' | 'failed';

  /** Issues found */
  issues?: string[];
}

/**
 * Tools and files verification section (Sections 13-15)
 */
export interface ToolsFilesVerification {
  /** Tools verification report */
  tools: ToolsVerificationReport;

  /** Files verification report */
  files: FilesVerificationReport;

  /** Examples verification report */
  examples: ExamplesVerificationReport;

  /** Status */
  status: 'passed' | 'partial' | 'failed';

  /** Issues found */
  issues?: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// MASTER VERIFIER INTERFACE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Verification section names
 */
export type VerificationSection =
  | 'philosophy'
  | 'architecture'
  | 'batch_operations'
  | 'lifecycle_context'
  | 'telemetry_recovery'
  | 'tools_files'
  | 'all';

/**
 * Report output format
 */
export type ReportFormat = 'json' | 'markdown' | 'html';

/**
 * Master verifier interface
 * Coordinates all verification activities and generates reports
 */
export interface MasterVerifier {
  // ─────────────────────────────────────────────────────────────────────────────
  // Component verifiers
  // ─────────────────────────────────────────────────────────────────────────────

  /** Tools verifier instance */
  toolsVerifier: ToolsVerifier;

  /** Files verifier instance */
  filesVerifier: FilesVerifier;

  /** Examples verifier instance */
  examplesVerifier: ExamplesVerifier;

  // ─────────────────────────────────────────────────────────────────────────────
  // Verification methods
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Run all verifications
   * @returns Complete verification report
   */
  verifyAll(): Promise<CompleteVerificationReport>;

  /**
   * Run verification for a specific section
   * @param section - Section to verify
   * @returns Section-specific verification result
   */
  verifySection(section: VerificationSection): Promise<unknown>;

  /**
   * Quick health check (subset of full verification)
   * @returns Quick health check result
   */
  quickHealthCheck(): Promise<QuickHealthCheckResult>;

  // ─────────────────────────────────────────────────────────────────────────────
  // Report generation
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Generate formatted report from verification results
   * @param format - Output format (json, markdown, html)
   * @returns Formatted report string
   */
  generateReport(format: ReportFormat): Promise<string>;

  /**
   * Generate report from existing verification result
   * @param result - Complete verification report
   * @param format - Output format
   * @returns Formatted report string
   */
  formatReport(result: CompleteVerificationReport, format: ReportFormat): string;

  /**
   * Save report to file
   * @param format - Output format
   * @param path - Output file path
   */
  saveReport(format: ReportFormat, path: string): Promise<void>;

  // ─────────────────────────────────────────────────────────────────────────────
  // Utilities
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get prioritized list of issues to fix
   * @returns Prioritized issue list
   */
  getPrioritizedIssues(): Promise<PrioritizedIssue[]>;

  /**
   * Get verification checklist status
   * @returns Checklist with completion status
   */
  getChecklistStatus(): Promise<ChecklistStatus>;
}

/**
 * Quick health check result (subset of full verification)
 */
export interface QuickHealthCheckResult {
  /** ISO timestamp */
  checked_at: string;

  /** Overall health status */
  healthy: boolean;

  /** Critical issues found */
  critical_issues: string[];

  /** Warnings found */
  warnings: string[];

  /** Quick checks performed */
  checks: {
    plugin_manifest_valid: boolean;
    mcp_config_valid: boolean;
    tools_available: boolean;
    state_directory_exists: boolean;
  };

  /** Recommendation */
  recommendation: 'ready' | 'needs_attention' | 'critical';
}

/**
 * Prioritized issue for fixing
 */
export interface PrioritizedIssue {
  /** Issue priority (1 = highest) */
  priority: number;

  /** Issue category */
  category: string;

  /** Issue description */
  description: string;

  /** Suggested fix */
  suggested_fix: string;

  /** Affected files/components */
  affected: string[];

  /** Estimated effort to fix */
  effort: 'trivial' | 'minor' | 'moderate' | 'major';
}

/**
 * Checklist status for tracking completion
 */
export interface ChecklistStatus {
  /** Checklist sections */
  sections: {
    name: string;
    total: number;
    completed: number;
    items: ChecklistItem[];
  }[];

  /** Overall completion percentage */
  completion_percentage: number;

  /** Total items */
  total_items: number;

  /** Completed items */
  completed_items: number;
}

/**
 * Individual checklist item
 */
export interface ChecklistItem {
  /** Item description */
  description: string;

  /** Whether item is completed */
  completed: boolean;

  /** Verification that checked this item */
  verified_by?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// VERIFICATION CHECKLIST CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Comprehensive verification checklist
 * Maps SPEC-v2 requirements to verifiable items
 * @see SPEC-v2 Sections 13-15, Appendices
 */
export const TOOLS_FILES_CHECKLIST = {
  /**
   * Precision tools checklist
   * @see SPEC-v2 Section 13.1
   */
  precision_tools: [
    'precision_grep with output modes and batch queries',
    'precision_grep with context lines support',
    'precision_read with extract modes',
    'precision_read with line range support',
    'precision_read with encoding support',
    'precision_glob with filters',
    'precision_glob with depth limits',
    'precision_glob with exclusion patterns',
    'precision_symbols with workspace and document modes',
    'precision_symbols with kind filtering',
    'precision_edit with transaction mode',
    'precision_edit with match mode',
    'precision_edit with validation',
    'precision_write with templates',
    'precision_write with backup creation',
    'precision_write with atomic writes',
    'precision_exec with expectations',
    'precision_exec with timeout handling',
    'precision_exec with output capture',
    'precision_fetch with caching',
    'precision_fetch with retry logic',
    'precision_fetch with response parsing',
  ],

  /**
   * Orchestration tools checklist
   * @see SPEC-v2 Section 13.2
   */
  orchestration_tools: [
    'discover tool with grep queries',
    'discover tool with glob queries',
    'discover tool with symbols queries',
    'discover tool with combined queries',
    'batch tool with full execution engine',
    'batch tool with parallel execution',
    'batch tool with dependency resolution',
    'batch tool with error handling and recovery',
    'batch_status tool for progress tracking',
    'batch_status tool for operation details',
    'batch_status tool for timing metrics',
    'batch_recover tool for checkpoint restore',
    'batch_recover tool for partial rollback',
    'batch_recover tool for fix loop integration',
    'batch_state tool for state queries',
    'batch_state tool for state updates',
    'batch_state tool for state persistence',
  ],

  /**
   * Plugin structure checklist
   * @see SPEC-v2 Section 14.1
   */
  plugin_structure: [
    '.claude-plugin/plugin.json exists and valid',
    '.mcp.json exists and valid',
    '.lsp.json exists (optional)',
    'hooks.json exists and valid',
    'agents/ directory with 6 consolidated agents',
    'agents/_registry.yaml exists',
    'skills/ directory with core and stacks subdirectories',
    'skills/core/ directory with common skills',
    'skills/stacks/ directory with stack-specific skills',
    'skills/_registry.yaml exists',
    'tools/ directory with definitions and implementations',
    'tools/definitions/ directory',
    'tools/implementations/ directory',
    'tools/_registry.yaml exists',
    'hooks/ directory with scripts subdirectory',
    'hooks/scripts/ directory',
    'output-styles/ directory with vibecoding and justvibes',
    'commands/ directory with batch, status, recover, mode',
    'templates/ directory with handlebars templates',
  ],

  /**
   * Project structure checklist
   * @see SPEC-v2 Section 14.2
   */
  project_structure: [
    '.goodvibes/ root directory exists',
    '.goodvibes/state/ subdirectory exists',
    '.goodvibes/state/session.json exists',
    '.goodvibes/state/agents.json exists',
    '.goodvibes/state/locks.json exists',
    '.goodvibes/state/health.json exists',
    '.goodvibes/memory/ subdirectory exists',
    '.goodvibes/memory/decisions.md exists',
    '.goodvibes/memory/patterns.md exists',
    '.goodvibes/memory/failures.md exists',
    '.goodvibes/memory/preferences.json exists',
    '.goodvibes/memory/index.json exists',
    '.goodvibes/checkpoints/ subdirectory exists',
    '.goodvibes/checkpoints/index.json exists',
    '.goodvibes/telemetry/ subdirectory exists',
    '.goodvibes/telemetry/current_session.json exists',
    '.goodvibes/telemetry/history/ subdirectory exists',
    '.goodvibes/telemetry/aggregations.json exists',
    '.goodvibes/logs/ subdirectory exists',
    '.goodvibes/logs/justvibes-log.md exists',
    '.goodvibes/logs/justvibes-errors.md exists',
    '.goodvibes/cache/ subdirectory exists',
    '.goodvibes/cache/stack.json exists (optional)',
    '.goodvibes/cache/symbols.json exists (optional)',
    '.goodvibes/cache/deps.json exists (optional)',
  ],

  /**
   * Config files checklist
   * @see SPEC-v2 Appendix C
   */
  config_files: [
    'plugin.json valid per Appendix C.1 schema',
    'plugin.json has required name field',
    'plugin.json has required version field',
    'plugin.json has required description field',
    'plugin.json has required entrypoint field',
    '.mcp.json valid per Appendix C.2 schema',
    '.mcp.json has mcpServers configuration',
    '.mcp.json has correct server definitions',
    'hooks.json valid per Appendix C.3 schema',
    'hooks.json has hooks array',
    'hooks.json hooks have valid event names',
    'hooks.json hooks have valid handler paths',
  ],

  /**
   * Tool wiring checklist
   * @see SPEC-v2 Section 13.3
   */
  tool_wiring: [
    'batch tool calls precision tools internally',
    'discover tool integrates with batch operations',
    'agents can invoke batch tool',
    'recovery system uses checkpoint tools',
    'all tools share state manager instance',
    'all tools share telemetry collector instance',
    'discover results flow correctly to batch',
    'batch results flow correctly to status',
    'failures flow correctly to recover tool',
    'state persists across tool invocations',
  ],

  /**
   * Examples checklist
   * @see SPEC-v2 Section 15
   */
  examples: [
    'Basic batch operation example exists',
    'Parallel execution example exists',
    'Sequential execution example exists',
    'Discover-to-batch pipeline example exists',
    'Error handling example exists',
    'Recovery flow example exists',
    'Checkpoint/rollback example exists',
    'Agent batch delegation example exists',
    'Vibecoding mode workflow example exists',
    'Justvibes mode workflow example exists',
    'Multi-agent coordination example exists',
    'Full project workflow example exists',
  ],
} as const;

/**
 * Type for checklist section names
 */
export type ChecklistSection = keyof typeof TOOLS_FILES_CHECKLIST;

/**
 * Get all checklist items for a section
 * @param section - Checklist section name
 * @returns Array of checklist items
 */
export function getChecklistItems(section: ChecklistSection): readonly string[] {
  return TOOLS_FILES_CHECKLIST[section];
}

/**
 * Get total count of all checklist items
 * @returns Total number of checklist items
 */
export function getTotalChecklistItems(): number {
  return Object.values(TOOLS_FILES_CHECKLIST).reduce(
    (total, items) => total + items.length,
    0
  );
}

/**
 * Get all checklist sections
 * @returns Array of section names
 */
export function getChecklistSections(): ChecklistSection[] {
  return Object.keys(TOOLS_FILES_CHECKLIST) as ChecklistSection[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEFAULT VALUES AND FACTORIES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Empty tool check for initialization
 */
export const EMPTY_TOOL_CHECK: ToolCheck = {
  name: '',
  exists: false,
  definition_exists: false,
  input_schema_complete: false,
  output_schema_complete: false,
  implementation_exists: false,
};

/**
 * Empty tools verification report for initialization
 */
export const EMPTY_TOOLS_VERIFICATION_REPORT: ToolsVerificationReport = {
  verified_at: '',
  precision_tools: {
    tools: [],
    defined: 0,
    missing: PRECISION_TOOLS.length,
    status: 'missing',
  },
  orchestration_tools: {
    tools: [],
    defined: 0,
    missing: ORCHESTRATION_TOOLS.length,
    status: 'missing',
  },
  wiring: {
    batch_uses_precision: false,
    agents_use_batch: false,
    recovery_uses_checkpoint: false,
    all_share_state: false,
    all_share_telemetry: false,
    discover_to_batch_flow: false,
    batch_to_status_flow: false,
    failures_to_recover_flow: false,
    state_persistence_verified: false,
    status: 'missing',
  },
  status: 'failed',
  summary: {
    precision_complete: 0,
    precision_missing: PRECISION_TOOLS.length,
    orchestration_complete: 0,
    orchestration_missing: ORCHESTRATION_TOOLS.length,
    total_issues: 0,
  },
};

/**
 * Empty files verification report for initialization
 */
export const EMPTY_FILES_VERIFICATION_REPORT: FilesVerificationReport = {
  verified_at: '',
  plugin_structure: {
    directories: [],
    files: [],
    complete: false,
    missing_directories: [],
    missing_files: [],
  },
  project_structure: {
    root_exists: false,
    subdirectories: [],
    complete: false,
    missing: [],
    initialized: false,
  },
  config_files: {
    files: [],
    complete: false,
    invalid: [],
    missing: [],
  },
  status: 'failed',
  summary: {
    directories_ok: 0,
    directories_missing: 0,
    files_ok: 0,
    files_missing: 0,
    configs_valid: 0,
    configs_invalid: 0,
  },
};

/**
 * Empty examples verification report for initialization
 */
export const EMPTY_EXAMPLES_VERIFICATION_REPORT: ExamplesVerificationReport = {
  verified_at: '',
  batch_examples: {
    examples: [],
    categories_covered: [],
    categories_missing: [],
    status: 'missing',
    total_examples: 0,
    valid_examples: 0,
  },
  workflow_examples: {
    workflows: [],
    modes_covered: [],
    scenarios_covered: [],
    status: 'missing',
    total_workflows: 0,
    complete_workflows: 0,
  },
  status: 'failed',
  summary: {
    total_examples: 0,
    valid_examples: 0,
    total_workflows: 0,
    complete_workflows: 0,
    categories_covered: 0,
    categories_missing: 0,
  },
};

/**
 * Create a tool check result
 * @param name - Tool name
 * @param partial - Partial values to override defaults
 * @returns Tool check result
 */
export function createToolCheck(
  name: string,
  partial?: Partial<Omit<ToolCheck, 'name'>>
): ToolCheck {
  return {
    ...EMPTY_TOOL_CHECK,
    name,
    ...partial,
  };
}

/**
 * Create a directory check result
 * @param path - Directory path
 * @param exists - Whether directory exists
 * @param required - Whether directory is required
 * @returns Directory check result
 */
export function createDirectoryCheck(
  path: string,
  exists: boolean,
  required: boolean
): DirectoryCheck {
  return {
    path,
    exists,
    required,
  };
}

/**
 * Create a file check result
 * @param path - File path
 * @param exists - Whether file exists
 * @param required - Whether file is required
 * @returns File check result
 */
export function createFileCheck(
  path: string,
  exists: boolean,
  required: boolean
): FileCheck {
  return {
    path,
    exists,
    required,
  };
}

/**
 * Create a config file check result
 * @param name - Config file name
 * @param partial - Partial values
 * @returns Config file check result
 */
export function createConfigFileCheck(
  name: ConfigFileName,
  partial?: Partial<Omit<ConfigFileCheck, 'name'>>
): ConfigFileCheck {
  return {
    name,
    exists: false,
    valid: false,
    schema_compliant: false,
    ...partial,
  };
}

/**
 * Determine overall status from individual statuses
 * @param statuses - Array of status values
 * @returns Overall status
 */
export function determineOverallStatus(
  statuses: Array<'passed' | 'partial' | 'failed' | 'complete' | 'missing'>
): 'passed' | 'partial' | 'failed' {
  if (statuses.every((s) => s === 'passed' || s === 'complete')) {
    return 'passed';
  }
  if (statuses.every((s) => s === 'failed' || s === 'missing')) {
    return 'failed';
  }
  return 'partial';
}

/**
 * Get current ISO timestamp
 * @returns ISO timestamp string
 */
export function getCurrentTimestamp(): string {
  return new Date().toISOString();
}
