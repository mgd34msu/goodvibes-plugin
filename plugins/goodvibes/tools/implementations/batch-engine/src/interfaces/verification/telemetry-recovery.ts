/**
 * Telemetry, Mode, Recovery, Agents Verification interfaces for Batch Engine
 * Provides comprehensive verification of telemetry metrics, mode configurations,
 * recovery mechanisms, and agent systems.
 * @see SPEC-v2 Sections 9-12
 */

// ============================================================================
// Constants and Type Definitions
// ============================================================================

/**
 * Mode names from SPEC-v2 Section 10
 * - vibecoding: Autonomous coding with user communication
 * - justvibes: Fully autonomous silent execution
 */
export const MODE_NAMES = ['vibecoding', 'justvibes'] as const;

/** Type for mode name values */
export type ModeName = (typeof MODE_NAMES)[number];

/**
 * Recovery mechanisms from SPEC-v2 Section 11
 * - checkpoint: Save/restore state at specific points
 * - rollback: Revert to previous state
 * - fix_loop: Automated error correction cycle
 */
export const RECOVERY_MECHANISMS = ['checkpoint', 'rollback', 'fix_loop'] as const;

/** Type for recovery mechanism values */
export type RecoveryMechanism = (typeof RECOVERY_MECHANISMS)[number];

/**
 * Consolidated agent types from SPEC-v2 Section 12
 * 6 specialized agents covering all development tasks
 */
export const AGENT_TYPES = [
  'engineer',
  'reviewer',
  'tester',
  'architect',
  'deployer',
  'integrator',
] as const;

/** Type for agent type values */
export type AgentType = (typeof AGENT_TYPES)[number];

/**
 * Verification status for reports
 */
export type VerificationStatus = 'passed' | 'partial' | 'failed';

/**
 * Completeness status for individual sections
 */
export type CompletenessStatus = 'complete' | 'partial' | 'missing';

// ============================================================================
// Interface Check Helper
// ============================================================================

/**
 * Result of checking a single interface definition
 * Used across all verification sections to report interface status
 */
export interface InterfaceCheck {
  /** Name of the interface being checked */
  name: string;

  /** Whether the interface exists in the codebase */
  exists: boolean;

  /** File location of the interface (if found) */
  location?: string;

  /** Required fields for this interface (from SPEC) */
  required_fields: string[];

  /** Fields that are actually implemented */
  implemented_fields: string[];

  /** Fields that are missing from implementation */
  missing_fields: string[];
}

/**
 * Create an InterfaceCheck result
 * @param name - Interface name
 * @param exists - Whether interface exists
 * @param required - Required fields
 * @param implemented - Implemented fields
 * @param location - Optional file location
 */
export function createInterfaceCheck(
  name: string,
  exists: boolean,
  required: string[],
  implemented: string[],
  location?: string
): InterfaceCheck {
  const missing = required.filter((f) => !implemented.includes(f));
  return {
    name,
    exists,
    location,
    required_fields: required,
    implemented_fields: implemented,
    missing_fields: missing,
  };
}

// ============================================================================
// Telemetry Verification Types (SPEC-v2 Section 9)
// ============================================================================

/**
 * Verification of telemetry structure interfaces
 * @see SPEC-v2 Section 9.1
 */
export interface TelemetryStructureVerification {
  /** SessionMetrics interface verification */
  session_metrics: InterfaceCheck;

  /** BatchMetrics interface verification */
  batch_metrics: InterfaceCheck;

  /** OperationMetrics interface verification */
  operation_metrics: InterfaceCheck;

  /** AgentMetrics interface verification */
  agent_metrics: InterfaceCheck;

  /** Aggregations interface verification */
  aggregations: InterfaceCheck;

  /** Overall structure status */
  status: CompletenessStatus;
}

/**
 * Verification of telemetry file paths
 * @see SPEC-v2 Section 9.2
 */
export interface TelemetryFilesVerification {
  /** Whether telemetry paths are defined */
  paths_defined: boolean;

  /** Current session file path exists */
  current_session: boolean;

  /** History directory path exists */
  history_directory: boolean;

  /** Aggregations file path exists */
  aggregations: boolean;

  /** Overall files status */
  status: CompletenessStatus;
}

/**
 * Verification of telemetry API methods
 * @see SPEC-v2 Sections 9.3-9.4
 */
export interface TelemetryAPIVerification {
  /** Recording methods (recordBatchStart, recordBatchComplete, etc.) */
  record_methods: string[];

  /** Query methods (getSessionMetrics, getBatchMetrics, etc.) */
  query_methods: string[];

  /** Analysis methods (estimateCost, projectTokenUsage, identifyBottlenecks) */
  analysis_methods: string[];

  /** Export methods (exportReport) */
  export_methods: string[];

  /** Overall API status */
  status: CompletenessStatus;
}

/**
 * Verification of cost estimation functionality
 * @see SPEC-v2 Section 9.4
 */
export interface CostEstimationVerification {
  /** Whether TOKEN_COSTS constant is defined */
  token_costs_defined: boolean;

  /** Models covered by cost estimation (haiku, sonnet, opus) */
  models: string[];

  /** Whether estimation function exists */
  estimation_function: boolean;

  /** Overall cost estimation status */
  status: CompletenessStatus;
}

/**
 * Complete telemetry verification report
 * @see SPEC-v2 Section 9
 */
export interface TelemetryVerificationReport {
  /** ISO timestamp when verification was performed */
  verified_at: string;

  /** Structure verification results */
  structure: TelemetryStructureVerification;

  /** Files verification results */
  files: TelemetryFilesVerification;

  /** API verification results */
  api: TelemetryAPIVerification;

  /** Cost estimation verification results */
  cost_estimation: CostEstimationVerification;

  /** Overall verification status */
  status: VerificationStatus;
}

/**
 * Telemetry verifier interface
 * Provides methods to verify all telemetry-related interfaces
 */
export interface TelemetryVerifier {
  /**
   * Verify all telemetry interfaces
   * @returns Complete telemetry verification report
   */
  verifyAll(): Promise<TelemetryVerificationReport>;

  /**
   * Verify telemetry structure interfaces
   * @returns Structure verification results
   */
  verifyStructure(): Promise<TelemetryStructureVerification>;

  /**
   * Verify telemetry file paths
   * @returns Files verification results
   */
  verifyFiles(): Promise<TelemetryFilesVerification>;

  /**
   * Verify telemetry API methods
   * @returns API verification results
   */
  verifyAPI(): Promise<TelemetryAPIVerification>;

  /**
   * Verify cost estimation functionality
   * @returns Cost estimation verification results
   */
  verifyCostEstimation(): Promise<CostEstimationVerification>;
}

// ============================================================================
// Mode Verification Types (SPEC-v2 Section 10)
// ============================================================================

/**
 * Verification of mode definition interfaces
 * @see SPEC-v2 Section 10.1
 */
export interface ModeDefinitionsVerification {
  /** ModeConfig interface verification */
  mode_config: InterfaceCheck;

  /** Communication subsection exists */
  communication: boolean;

  /** Execution subsection exists */
  execution: boolean;

  /** Recovery subsection exists */
  recovery: boolean;

  /** Output subsection exists */
  output: boolean;

  /** Logging subsection exists */
  logging: boolean;

  /** Overall definitions status */
  status: CompletenessStatus;
}

/**
 * Check result for a single mode configuration
 */
export interface ModeConfigCheck {
  /** Mode name (vibecoding or justvibes) */
  name: ModeName;

  /** Whether the configuration exists */
  exists: boolean;

  /** Whether all required sections are present */
  complete: boolean;

  /** List of missing sections (if any) */
  missing_sections?: string[];
}

/**
 * Verification of mode configurations
 * @see SPEC-v2 Section 10.2
 */
export interface ModeConfigurationsVerification {
  /** Verification results for each mode */
  modes: ModeConfigCheck[];

  /** Number of modes defined */
  defined: number;

  /** Number of modes missing */
  missing: number;

  /** Overall configurations status */
  status: CompletenessStatus;
}

/**
 * Verification of mode behavior functions
 * @see SPEC-v2 Section 10.3
 */
export interface ModeBehaviorVerification {
  /** shouldAskUser function exists */
  should_ask_user: boolean;

  /** getOutputMode function exists */
  get_output_mode: boolean;

  /** handleError function exists */
  handle_error: boolean;

  /** formatResult function exists */
  format_result: boolean;

  /** Overall behavior status */
  status: CompletenessStatus;
}

/**
 * Complete mode verification report
 * @see SPEC-v2 Section 10
 */
export interface ModeVerificationReport {
  /** ISO timestamp when verification was performed */
  verified_at: string;

  /** Mode definitions verification results */
  definitions: ModeDefinitionsVerification;

  /** Mode configurations verification results */
  configurations: ModeConfigurationsVerification;

  /** Mode behavior verification results */
  behavior: ModeBehaviorVerification;

  /** Overall verification status */
  status: VerificationStatus;
}

/**
 * Mode verifier interface
 * Provides methods to verify all mode-related interfaces
 */
export interface ModeVerifier {
  /**
   * Verify all mode interfaces
   * @returns Complete mode verification report
   */
  verifyAll(): Promise<ModeVerificationReport>;

  /**
   * Verify mode definition interfaces
   * @returns Mode definitions verification results
   */
  verifyModeDefinitions(): Promise<ModeDefinitionsVerification>;

  /**
   * Verify mode configurations (vibecoding, justvibes)
   * @returns Mode configurations verification results
   */
  verifyModeConfigurations(): Promise<ModeConfigurationsVerification>;

  /**
   * Verify mode behavior functions
   * @returns Mode behavior verification results
   */
  verifyModeBehavior(): Promise<ModeBehaviorVerification>;
}

// ============================================================================
// Recovery Verification Types (SPEC-v2 Section 11)
// ============================================================================

/**
 * Verification of checkpoint system
 * @see SPEC-v2 Section 11.1
 */
export interface CheckpointVerification {
  /** CheckpointSystem interface verification */
  checkpoint_system: InterfaceCheck;

  /** CheckpointConfig interface verification */
  checkpoint_config: InterfaceCheck;

  /** RestoreResult interface verification */
  restore_result: InterfaceCheck;

  /** Whether file structure is defined */
  file_structure_defined: boolean;

  /** Overall checkpoint status */
  status: CompletenessStatus;
}

/**
 * Verification of fix loop system
 * @see SPEC-v2 Section 11.2
 */
export interface FixLoopVerification {
  /** FixLoop interface verification */
  fix_loop: InterfaceCheck;

  /** FixContext interface verification */
  fix_context: InterfaceCheck;

  /** FixResult interface verification */
  fix_result: InterfaceCheck;

  /** Fix strategies defined (auto_fix, agent_fix, targeted_fix) */
  strategies_defined: string[];

  /** Overall fix loop status */
  status: CompletenessStatus;
}

/**
 * Verification of rollback system
 * @see SPEC-v2 Section 11.4
 */
export interface RollbackVerification {
  /** RollbackSystem interface verification */
  rollback_system: InterfaceCheck;

  /** RollbackResult interface verification */
  rollback_result: InterfaceCheck;

  /** SelectiveRollbackOptions interface verification */
  selective_rollback: InterfaceCheck;

  /** Overall rollback status */
  status: CompletenessStatus;
}

/**
 * Complete recovery verification report
 * @see SPEC-v2 Section 11
 */
export interface RecoveryVerificationReport {
  /** ISO timestamp when verification was performed */
  verified_at: string;

  /** Checkpoint system verification results */
  checkpoint: CheckpointVerification;

  /** Fix loop verification results */
  fix_loop: FixLoopVerification;

  /** Rollback system verification results */
  rollback: RollbackVerification;

  /** Overall verification status */
  status: VerificationStatus;
}

/**
 * Recovery verifier interface
 * Provides methods to verify all recovery-related interfaces
 */
export interface RecoveryVerifier {
  /**
   * Verify all recovery interfaces
   * @returns Complete recovery verification report
   */
  verifyAll(): Promise<RecoveryVerificationReport>;

  /**
   * Verify checkpoint system interfaces
   * @returns Checkpoint verification results
   */
  verifyCheckpointSystem(): Promise<CheckpointVerification>;

  /**
   * Verify fix loop interfaces
   * @returns Fix loop verification results
   */
  verifyFixLoop(): Promise<FixLoopVerification>;

  /**
   * Verify rollback system interfaces
   * @returns Rollback verification results
   */
  verifyRollbackSystem(): Promise<RollbackVerification>;
}

// ============================================================================
// Agent Verification Types (SPEC-v2 Section 12)
// ============================================================================

/**
 * Verification of agent pool system
 * @see SPEC-v2 Section 12.1
 */
export interface AgentPoolVerification {
  /** AgentPool interface verification */
  agent_pool: InterfaceCheck;

  /** AgentPoolConfig interface verification */
  pool_config: InterfaceCheck;

  /** QueuedAgent interface verification */
  queued_agent: InterfaceCheck;

  /** Whether max_concurrent is defined */
  max_concurrent_defined: boolean;

  /** Whether budget tracking is implemented */
  budget_tracking: boolean;

  /** Overall pool status */
  status: CompletenessStatus;
}

/**
 * Verification of agent lifecycle system
 * @see SPEC-v2 Section 12.2
 */
export interface AgentLifecycleVerification {
  /** AgentLifecycle interface verification */
  lifecycle: InterfaceCheck;

  /** SpawnResult interface verification */
  spawn_result: InterfaceCheck;

  /** CompletionResult interface verification */
  completion_result: InterfaceCheck;

  /** spawn method defined */
  spawn_defined: boolean;

  /** monitor method defined */
  monitor_defined: boolean;

  /** complete method defined */
  complete_defined: boolean;

  /** Overall lifecycle status */
  status: CompletenessStatus;
}

/**
 * Verification of agent communication system
 * @see SPEC-v2 Section 12.3
 */
export interface AgentCommunicationVerification {
  /** AgentCommunication interface verification */
  communication: InterfaceCheck;

  /** AgentMessage interface verification */
  message: InterfaceCheck;

  /** SharedResult interface verification */
  shared_result: InterfaceCheck;

  /** shareResults method defined */
  share_results: boolean;

  /** broadcast method defined */
  broadcast: boolean;

  /** request method defined */
  request: boolean;

  /** Overall communication status */
  status: CompletenessStatus;
}

/**
 * Verification of dependency resolution system
 * @see SPEC-v2 Section 12.4
 */
export interface DependencyResolutionVerification {
  /** DependencyResolver interface verification */
  resolver: InterfaceCheck;

  /** DependencyGraph interface verification */
  graph: InterfaceCheck;

  /** ExecutionPlan interface verification */
  execution_plan: InterfaceCheck;

  /** Overall dependency resolution status */
  status: CompletenessStatus;
}

/**
 * Complete agent verification report
 * @see SPEC-v2 Section 12
 */
export interface AgentVerificationReport {
  /** ISO timestamp when verification was performed */
  verified_at: string;

  /** Agent pool verification results */
  pool: AgentPoolVerification;

  /** Agent lifecycle verification results */
  lifecycle: AgentLifecycleVerification;

  /** Agent communication verification results */
  communication: AgentCommunicationVerification;

  /** Dependency resolution verification results */
  dependencies: DependencyResolutionVerification;

  /** Overall verification status */
  status: VerificationStatus;
}

/**
 * Agent verifier interface
 * Provides methods to verify all agent-related interfaces
 */
export interface AgentVerifier {
  /**
   * Verify all agent interfaces
   * @returns Complete agent verification report
   */
  verifyAll(): Promise<AgentVerificationReport>;

  /**
   * Verify agent pool interfaces
   * @returns Agent pool verification results
   */
  verifyAgentPool(): Promise<AgentPoolVerification>;

  /**
   * Verify agent lifecycle interfaces
   * @returns Agent lifecycle verification results
   */
  verifyAgentLifecycle(): Promise<AgentLifecycleVerification>;

  /**
   * Verify agent communication interfaces
   * @returns Agent communication verification results
   */
  verifyAgentCommunication(): Promise<AgentCommunicationVerification>;

  /**
   * Verify dependency resolution interfaces
   * @returns Dependency resolution verification results
   */
  verifyDependencyResolution(): Promise<DependencyResolutionVerification>;
}

// ============================================================================
// Combined Verification Report
// ============================================================================

/**
 * Complete verification report for all SPEC-v2 Sections 9-12
 */
export interface TelemetryRecoveryAgentsVerificationReport {
  /** ISO timestamp when verification was performed */
  verified_at: string;

  /** Telemetry verification (Section 9) */
  telemetry: TelemetryVerificationReport;

  /** Mode verification (Section 10) */
  mode: ModeVerificationReport;

  /** Recovery verification (Section 11) */
  recovery: RecoveryVerificationReport;

  /** Agent verification (Section 12) */
  agents: AgentVerificationReport;

  /** Overall verification status */
  status: VerificationStatus;

  /** Summary statistics */
  summary: {
    /** Total interfaces checked */
    total_interfaces: number;
    /** Interfaces that exist */
    existing_interfaces: number;
    /** Interfaces that are complete */
    complete_interfaces: number;
    /** Interfaces with missing fields */
    partial_interfaces: number;
    /** Interfaces that are missing */
    missing_interfaces: number;
  };
}

/**
 * Combined verifier for all SPEC-v2 Sections 9-12
 */
export interface TelemetryRecoveryAgentsVerifier {
  /** Telemetry verifier instance */
  telemetry: TelemetryVerifier;

  /** Mode verifier instance */
  mode: ModeVerifier;

  /** Recovery verifier instance */
  recovery: RecoveryVerifier;

  /** Agents verifier instance */
  agents: AgentVerifier;

  /**
   * Verify all interfaces across Sections 9-12
   * @returns Complete verification report
   */
  verifyAll(): Promise<TelemetryRecoveryAgentsVerificationReport>;
}

// ============================================================================
// Verification Checklist
// ============================================================================

/**
 * Comprehensive verification checklist for SPEC-v2 Sections 9-12
 * Used to ensure all requirements are met
 */
export const TELEMETRY_RECOVERY_CHECKLIST = {
  /** Telemetry requirements (Section 9) */
  telemetry: [
    'SessionMetrics, BatchMetrics, OperationMetrics, AgentMetrics interfaces',
    'Telemetry file paths defined (TELEMETRY_PATHS)',
    'TelemetryAPI with record, query, analysis, export methods',
    'Cost estimation with TOKEN_COSTS constant',
    'TimeseriesPoint, TypeAggregation, TrendAnalysis interfaces',
    'TelemetryFileManager interface for persistence',
  ],
  /** Mode requirements (Section 10) */
  mode: [
    'ModeConfig interface with all subsections (communication, execution, recovery, output, logging)',
    'vibecoding configuration defined with interactive settings',
    'justvibes configuration defined with autonomous settings',
    'Mode behavior functions: shouldAskUser, getOutputMode, handleError, formatResult',
    'Situation types and ErrorAction interface',
    'MODES constant with all mode configurations',
  ],
  /** Recovery requirements (Section 11) */
  recovery: [
    'CheckpointSystem with create, restore, list, cleanup methods',
    'CheckpointConfig with batch_id, reason, type, include options',
    'FixLoop with strategies: auto_fix, agent_fix, targeted_fix',
    'FixContext with operation, batch, error, attempt info',
    'RollbackSystem with toCheckpoint, lastBatch, selective methods',
    'Checkpoint file structure defined (.goodvibes/checkpoints/)',
    'StrategyExecutor and StrategyChain interfaces',
  ],
  /** Agent requirements (Section 12) */
  agents: [
    'AgentPool with config, state, QueuedAgent',
    'AgentPoolConfig with max_concurrent, default_budget, total_budget',
    'AgentLifecycle with spawn, monitor, complete methods',
    'SpawnResult and CompletionResult interfaces',
    'AgentCommunication with shareResults, broadcast, request methods',
    'AgentMessage and SharedResult interfaces',
    'DependencyResolver with topological sort',
    'DependencyGraph and ExecutionPlan interfaces',
  ],
} as const;

/** Type for checklist category keys */
export type TelemetryRecoveryChecklistCategory =
  keyof typeof TELEMETRY_RECOVERY_CHECKLIST;

/** Get checklist items for a category */
export type ChecklistItemsOf<C extends TelemetryRecoveryChecklistCategory> =
  (typeof TELEMETRY_RECOVERY_CHECKLIST)[C][number];

// ============================================================================
// Required Interface Fields
// ============================================================================

/**
 * Required fields for each interface being verified
 * Used by verifiers to check interface completeness
 */
export const REQUIRED_INTERFACE_FIELDS = {
  // Telemetry interfaces
  SessionMetrics: [
    'id',
    'started_at',
    'mode',
    'total_batches',
    'total_operations',
    'total_agents',
    'total_tokens',
    'total_duration_ms',
    'operations_by_type',
    'tokens_by_type',
    'batch_success_rate',
    'operation_success_rate',
    'agent_success_rate',
  ],
  BatchMetrics: [
    'id',
    'started_at',
    'completed_at',
    'status',
    'operations_total',
    'operations_succeeded',
    'operations_failed',
    'duration_ms',
    'tokens_used',
  ],
  OperationMetrics: [
    'id',
    'batch_id',
    'type',
    'started_at',
    'completed_at',
    'duration_ms',
    'tokens_used',
    'status',
  ],
  AgentMetrics: [
    'id',
    'batch_id',
    'agent_type',
    'started_at',
    'completed_at',
    'duration_ms',
    'tokens_input',
    'tokens_output',
    'tokens_total',
    'turns',
    'tool_calls',
    'status',
  ],
  Aggregations: [
    'hourly',
    'daily',
    'by_operation_type',
    'by_agent_type',
    'token_trend',
    'success_trend',
    'duration_trend',
  ],
  TelemetryAPI: [
    'recordBatchStart',
    'recordBatchComplete',
    'recordOperationStart',
    'recordOperationComplete',
    'recordAgentStart',
    'recordAgentComplete',
    'getSessionMetrics',
    'getBatchMetrics',
    'getAggregations',
    'estimateCost',
    'exportReport',
  ],

  // Mode interfaces
  ModeConfig: ['name', 'description', 'communication', 'execution', 'recovery', 'output', 'logging'],
  ModeConfigCommunication: [
    'show_progress',
    'explain_decisions',
    'ask_on_ambiguity',
    'report_results',
  ],
  ModeConfigExecution: [
    'auto_chain',
    'max_autonomous_batches',
    'checkpoint_frequency',
    'parallel_agents',
  ],
  ModeConfigRecovery: ['on_error', 'on_ambiguity', 'on_risk', 'max_fix_attempts'],
  ModeConfigOutput: ['default_mode', 'show_diffs', 'show_telemetry'],
  ModeConfigLogging: ['log_decisions', 'log_errors', 'log_activity', 'log_path'],

  // Recovery interfaces
  CheckpointSystem: ['create', 'restore', 'list', 'get', 'delete', 'cleanup'],
  CheckpointConfig: ['reason', 'type'],
  RestoreResult: ['success', 'checkpoint_id', 'files_restored', 'state_restored', 'duration_ms'],
  FixLoop: ['run', 'canFix', 'getStrategy'],
  FixContext: ['operation', 'batch', 'error', 'attempt', 'max_attempts', 'prior_attempts'],
  FixResult: [
    'success',
    'attempts',
    'final_strategy',
    'actions_taken',
    'remaining_errors',
    'total_tokens_used',
    'duration_ms',
  ],
  RollbackSystem: ['toCheckpoint', 'lastBatch', 'operations', 'selective', 'preview', 'canRollback'],
  RollbackResult: [
    'success',
    'scope',
    'target',
    'files_restored',
    'files_failed',
    'state_restored',
    'state_failed',
    'duration_ms',
  ],
  SelectiveRollbackOptions: ['files', 'state_keys', 'to_batch', 'to_checkpoint', 'to_time'],

  // Agent interfaces
  AgentPool: ['config', 'state', 'enqueue', 'dequeue', 'getQueue', 'hasCapacity', 'canSpawn'],
  AgentPoolConfig: ['max_concurrent', 'default_budget', 'total_budget', 'queue_strategy'],
  QueuedAgent: ['spec', 'priority', 'queued_at', 'depends_on', 'blocked_by'],
  AgentLifecycle: ['spawn', 'spawnBatch', 'monitor', 'monitorAll', 'complete', 'cancel', 'timeout'],
  SpawnResult: ['success', 'agent_id'],
  CompletionResult: ['agent_id', 'success', 'status', 'tokens_used', 'turns_used', 'duration_ms'],
  AgentCommunication: [
    'shareResults',
    'getSharedResults',
    'broadcast',
    'request',
    'respond',
    'send',
    'receive',
  ],
  AgentMessage: ['id', 'type', 'from', 'to', 'priority', 'timestamp', 'payload'],
  SharedResult: ['from_agent', 'to_agent', 'result_key', 'data', 'shared_at'],
  DependencyResolver: [
    'buildGraph',
    'addNode',
    'removeNode',
    'checkCycles',
    'resolve',
    'topologicalSort',
  ],
  DependencyGraph: ['nodes', 'roots', 'leaves', 'max_depth'],
  ExecutionPlan: [
    'id',
    'phases',
    'max_parallelism',
    'critical_path',
    'critical_path_ms',
    'total_agents',
    'created_at',
  ],
} as const;

/** Type for required interface field keys */
export type RequiredInterfaceKey = keyof typeof REQUIRED_INTERFACE_FIELDS;

/** Get required fields for an interface */
export type RequiredFieldsOf<K extends RequiredInterfaceKey> =
  (typeof REQUIRED_INTERFACE_FIELDS)[K][number];

// ============================================================================
// Verification Utilities
// ============================================================================

/**
 * Determine overall status from multiple completeness statuses
 * @param statuses - Array of completeness statuses
 * @returns Overall verification status
 */
export function determineOverallStatus(
  statuses: CompletenessStatus[]
): VerificationStatus {
  if (statuses.every((s) => s === 'complete')) {
    return 'passed';
  }
  if (statuses.every((s) => s === 'missing')) {
    return 'failed';
  }
  return 'partial';
}

/**
 * Determine completeness status from boolean checks
 * @param checks - Array of boolean check results
 * @returns Completeness status
 */
export function determineCompletenessStatus(
  checks: boolean[]
): CompletenessStatus {
  const total = checks.length;
  const passed = checks.filter(Boolean).length;

  if (passed === total) return 'complete';
  if (passed === 0) return 'missing';
  return 'partial';
}

/**
 * Create a timestamp for verification reports
 * @returns ISO timestamp string
 */
export function createVerificationTimestamp(): string {
  return new Date().toISOString();
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create an empty telemetry verification report
 * @returns Empty telemetry verification report
 */
export function createEmptyTelemetryReport(): TelemetryVerificationReport {
  return {
    verified_at: createVerificationTimestamp(),
    structure: {
      session_metrics: createInterfaceCheck('SessionMetrics', false, [], []),
      batch_metrics: createInterfaceCheck('BatchMetrics', false, [], []),
      operation_metrics: createInterfaceCheck('OperationMetrics', false, [], []),
      agent_metrics: createInterfaceCheck('AgentMetrics', false, [], []),
      aggregations: createInterfaceCheck('Aggregations', false, [], []),
      status: 'missing',
    },
    files: {
      paths_defined: false,
      current_session: false,
      history_directory: false,
      aggregations: false,
      status: 'missing',
    },
    api: {
      record_methods: [],
      query_methods: [],
      analysis_methods: [],
      export_methods: [],
      status: 'missing',
    },
    cost_estimation: {
      token_costs_defined: false,
      models: [],
      estimation_function: false,
      status: 'missing',
    },
    status: 'failed',
  };
}

/**
 * Create an empty mode verification report
 * @returns Empty mode verification report
 */
export function createEmptyModeReport(): ModeVerificationReport {
  return {
    verified_at: createVerificationTimestamp(),
    definitions: {
      mode_config: createInterfaceCheck('ModeConfig', false, [], []),
      communication: false,
      execution: false,
      recovery: false,
      output: false,
      logging: false,
      status: 'missing',
    },
    configurations: {
      modes: [],
      defined: 0,
      missing: MODE_NAMES.length,
      status: 'missing',
    },
    behavior: {
      should_ask_user: false,
      get_output_mode: false,
      handle_error: false,
      format_result: false,
      status: 'missing',
    },
    status: 'failed',
  };
}

/**
 * Create an empty recovery verification report
 * @returns Empty recovery verification report
 */
export function createEmptyRecoveryReport(): RecoveryVerificationReport {
  return {
    verified_at: createVerificationTimestamp(),
    checkpoint: {
      checkpoint_system: createInterfaceCheck('CheckpointSystem', false, [], []),
      checkpoint_config: createInterfaceCheck('CheckpointConfig', false, [], []),
      restore_result: createInterfaceCheck('RestoreResult', false, [], []),
      file_structure_defined: false,
      status: 'missing',
    },
    fix_loop: {
      fix_loop: createInterfaceCheck('FixLoop', false, [], []),
      fix_context: createInterfaceCheck('FixContext', false, [], []),
      fix_result: createInterfaceCheck('FixResult', false, [], []),
      strategies_defined: [],
      status: 'missing',
    },
    rollback: {
      rollback_system: createInterfaceCheck('RollbackSystem', false, [], []),
      rollback_result: createInterfaceCheck('RollbackResult', false, [], []),
      selective_rollback: createInterfaceCheck('SelectiveRollbackOptions', false, [], []),
      status: 'missing',
    },
    status: 'failed',
  };
}

/**
 * Create an empty agent verification report
 * @returns Empty agent verification report
 */
export function createEmptyAgentReport(): AgentVerificationReport {
  return {
    verified_at: createVerificationTimestamp(),
    pool: {
      agent_pool: createInterfaceCheck('AgentPool', false, [], []),
      pool_config: createInterfaceCheck('AgentPoolConfig', false, [], []),
      queued_agent: createInterfaceCheck('QueuedAgent', false, [], []),
      max_concurrent_defined: false,
      budget_tracking: false,
      status: 'missing',
    },
    lifecycle: {
      lifecycle: createInterfaceCheck('AgentLifecycle', false, [], []),
      spawn_result: createInterfaceCheck('SpawnResult', false, [], []),
      completion_result: createInterfaceCheck('CompletionResult', false, [], []),
      spawn_defined: false,
      monitor_defined: false,
      complete_defined: false,
      status: 'missing',
    },
    communication: {
      communication: createInterfaceCheck('AgentCommunication', false, [], []),
      message: createInterfaceCheck('AgentMessage', false, [], []),
      shared_result: createInterfaceCheck('SharedResult', false, [], []),
      share_results: false,
      broadcast: false,
      request: false,
      status: 'missing',
    },
    dependencies: {
      resolver: createInterfaceCheck('DependencyResolver', false, [], []),
      graph: createInterfaceCheck('DependencyGraph', false, [], []),
      execution_plan: createInterfaceCheck('ExecutionPlan', false, [], []),
      status: 'missing',
    },
    status: 'failed',
  };
}

