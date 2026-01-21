/**
 * Verification interfaces index
 * @see SPEC-v2 Sections 13-15, Appendices
 *
 * Re-exports all verification interfaces for convenient importing.
 * Each module covers a specific SPEC-v2 section:
 *
 * - tools-files: Sections 13-15 (Tools, Files, Examples)
 * - architecture: Sections 4-6 (Architecture, Precision Engine)
 * - batch-operations: Sections 5-6 (Batch Operations)
 * - lifecycle-context: Sections 7-8 (Lifecycle, Context)
 * - telemetry-recovery: Sections 9-11 (Telemetry, Recovery)
 *
 * NOTE: Some types like VerificationStatus, ReportStatus, InterfaceCheck,
 * and determineOverallStatus are defined in multiple modules with slightly
 * different meanings. Import directly from the specific module if you need
 * one of these conflicting types.
 */

// Tools, Files, Examples verification (Sections 13-15)
export {
  // Constants
  PRECISION_TOOLS,
  ORCHESTRATION_TOOLS,
  ALL_TOOLS,
  CONFIG_FILES,
  TOOLS_FILES_CHECKLIST,
  EMPTY_TOOL_CHECK,
  EMPTY_TOOLS_VERIFICATION_REPORT,
  EMPTY_FILES_VERIFICATION_REPORT,
  // Types
  type PrecisionToolName,
  type OrchestrationToolName,
  type AllToolName,
  type ConfigFileName,
  type ToolCheck,
  type PrecisionToolsVerification,
  type OrchestrationToolsVerification,
  type ToolWiringVerification,
  type ToolsVerifier,
  type ToolsVerificationReport,
  type DirectoryCheck,
  type FileCheck,
  type ConfigFileCheck,
  type PluginStructureVerification,
  type ProjectStructureVerification,
  type ConfigFilesVerification,
  type FilesVerifier,
  type FilesVerificationReport,
  type ExampleCheck,
  type WorkflowCheck,
  type BatchExamplesVerification,
  type WorkflowExamplesVerification,
  type ExamplesVerifier,
  type ExamplesVerificationReport,
  type CompleteVerificationReport,
  type PhilosophyVerification,
  type ArchitectureVerification,
  type BatchOperationsVerification,
  type LifecycleContextVerification,
  type TelemetryRecoveryVerification,
  type ToolsFilesVerification,
  type VerificationSection,
  type ReportFormat,
  type MasterVerifier,
  type QuickHealthCheckResult,
  type PrioritizedIssue,
  type ChecklistStatus,
  type ChecklistItem,
  type ChecklistSection,
  // Functions
  getChecklistItems,
  getTotalChecklistItems,
  getChecklistSections,
} from './tools-files.js';

// Architecture verification (Sections 4-6)
export * from './architecture.js';

// Batch operations verification (Sections 5-6)
// Using explicit exports to avoid conflicts with tools-files exports
export {
  OPERATION_CATEGORIES,
  BATCH_OPERATIONS_CHECKLIST,
  REQUIRED_PROPERTIES,
  OPERATION_REQUIRED_FIELDS,
  type OperationCategoryName,
  type OperationTypeName,
  type VerificationStatus as BatchVerificationStatus,
  type ReportStatus as BatchReportStatus,
  type InterfaceCheck as BatchInterfaceCheck,
  type OperationCheck,
  type BatchDefinitionVerification,
  type CategoryVerification,
  type OperationsVerification,
  type ReadOperationsVerification,
  type WriteOperationsVerification,
  type ExecOperationsVerification,
  type QueryOperationsVerification,
  type StateOperationsVerification,
  type ResultsVerification,
  type VerificationSummary,
  type BatchEngineVerificationReport,
  type BatchEngineVerifier,
  type OperationTypeVerifier,
  type ChecklistCategory as BatchChecklistCategory,
  type ChecklistItems,
  type RequiredPropertiesKey,
  type OperationRequiredFieldsKey,
} from './batch-operations.js';

// Lifecycle and context verification (Sections 7-8)
export {
  LIFECYCLE_PHASES,
  CONTEXT_TYPES,
  STATE_COMPONENTS,
  MEMORY_TYPES,
  LIFECYCLE_CONTEXT_CHECKLIST,
  CONTEXT_REQUIRED_FIELDS,
  STATE_REQUIRED_FIELDS,
  MEMORY_REQUIRED_FIELDS,
  BUILTIN_HOOKS_DEFINITION,
  STATE_API_METHODS,
  MEMORY_API_METHODS,
  type LifecyclePhase,
  type ContextType,
  type StateComponent,
  type MemoryType,
  type VerificationStatus as LifecycleVerificationStatus,
  type ReportStatus as LifecycleReportStatus,
  type InterfaceVerification,
  type APIMethodCheck,
  type HooksVerification,
  type BuiltinHookCheck,
  type BuiltinHooksVerification,
  type HookConfigVerification,
  type LifecycleVerificationReport,
  type LifecycleVerifier,
  type ContextTypeCheck,
  type ContextTypesVerification,
  type ContextGatheringVerification,
  type TemplateResolutionVerification,
  type ContextVerificationReport,
  type ContextVerifier,
  type StateComponentCheck,
  type StateStructureVerification,
  type StateFilesVerification,
  type StateAPIVerification,
  type StateVerificationReport,
  type StateVerifier,
  type MemoryTypeCheck,
  type MemoryStructureVerification,
  type MemoryFilesVerification,
  type MemoryAPIVerification,
  type MemoryVerificationReport,
  type MemoryVerifier,
  type LifecycleContextStateMemoryReport,
  type LifecycleContextStateMemoryVerifier,
  type LifecycleContextChecklistCategory,
  type LifecycleContextChecklistItems,
  type ChecklistItemStatus,
  type ChecklistCategoryStatus,
  type LifecycleContextChecklistResult,
} from './lifecycle-context.js';

// Telemetry and recovery verification (Sections 9-11)
export {
  MODE_NAMES,
  RECOVERY_MECHANISMS,
  AGENT_TYPES,
  TELEMETRY_RECOVERY_CHECKLIST,
  REQUIRED_INTERFACE_FIELDS,
  type ModeName,
  type RecoveryMechanism,
  type AgentType,
  type VerificationStatus as TelemetryVerificationStatus,
  type CompletenessStatus,
  type InterfaceCheck as TelemetryInterfaceCheck,
  type TelemetryStructureVerification,
  type TelemetryFilesVerification,
  type TelemetryAPIVerification,
  type CostEstimationVerification,
  type TelemetryVerificationReport,
  type TelemetryVerifier,
  type ModeDefinitionsVerification,
  type ModeConfigCheck,
  type ModeConfigurationsVerification,
  type ModeBehaviorVerification,
  type ModeVerificationReport,
  type ModeVerifier,
  type CheckpointVerification,
  type FixLoopVerification,
  type RollbackVerification,
  type RecoveryVerificationReport,
  type RecoveryVerifier,
  type AgentPoolVerification,
  type AgentLifecycleVerification,
  type AgentCommunicationVerification,
  type DependencyResolutionVerification,
  type AgentVerificationReport,
  type AgentVerifier,
  type TelemetryRecoveryAgentsVerificationReport,
  type TelemetryRecoveryAgentsVerifier,
  type TelemetryRecoveryChecklistCategory,
  type ChecklistItemsOf,
  type RequiredInterfaceKey,
  type RequiredFieldsOf,
  // Functions
  createInterfaceCheck,
  determineOverallStatus as determineTelemetryOverallStatus,
  determineCompletenessStatus,
  createVerificationTimestamp,
  createEmptyTelemetryReport,
  createEmptyModeReport,
  createEmptyRecoveryReport,
  createEmptyAgentReport,
} from './telemetry-recovery.js';

// Philosophy verification (Appendix)
export * from './philosophy.js';
