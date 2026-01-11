/**
 * Handler exports
 *
 * This barrel file re-exports all handler functions from their respective modules.
 * Each handler module is organized by domain:
 * - status.ts: Plugin status and health checks
 * - search.ts: Search across skills, agents, and tools
 * - content.ts: Retrieve skill and agent content
 * - context.ts: Stack detection and pattern scanning
 * - dependencies.ts: Skill dependency analysis
 * - npm.ts: NPM package version checking
 * - docs.ts: Documentation fetching
 * - schema.ts: Database schema parsing
 * - config.ts: Configuration file reading
 * - validation.ts: Code validation and type checking
 * - smoke-test.ts: Smoke test execution
 * - scaffolding.ts: Project scaffolding and templates
 * - deps/: Dependency analysis tools (analyze unused/outdated packages)
 */

// Status
export { handlePluginStatus } from './status.js';

// Search
export { handleSearchSkills, handleSearchAgents, handleSearchTools, handleRecommendSkills } from './search.js';

// Content
export { handleGetSkillContent, handleGetAgentContent } from './content.js';

// Context
export { handleDetectStack, handleScanPatterns } from './context.js';

// Dependencies
export { handleSkillDependencies } from './dependencies.js';
export type { SkillDependenciesArgs } from './dependencies.js';

// NPM
export { handleCheckVersions, fetchNpmPackageInfo, fetchNpmReadme } from './npm.js';
export type { CheckVersionsArgs } from './npm.js';

// Docs
export { handleFetchDocs, getCommonApiReferences } from './docs.js';
export type { FetchDocsArgs } from './docs.js';

// Docs Tools (OpenAPI generation, Codebase Explanation)
export { handleGenerateOpenApi, handleExplainCodebase } from './docs/index.js';
export type { GenerateOpenApiArgs, ExplainCodebaseArgs } from './docs/index.js';

// Schema
export { handleGetSchema, handleGetDatabaseSchema } from './schema.js';
export type { GetSchemaArgs, GetDatabaseSchemaArgs } from './schema.js';

// API Routes
export { handleGetApiRoutes } from './schema/index.js';
export type { GetApiRoutesArgs } from './schema/index.js';

// Config
export { handleReadConfig } from './config.js';
export type { ReadConfigArgs } from './config.js';

// Validation
export { handleValidateImplementation, handleCheckTypes } from './validation.js';
export type { ValidateImplementationArgs, CheckTypesArgs } from './validation.js';

// Smoke Test
export { handleRunSmokeTest } from './smoke-test.js';
export type { RunSmokeTestArgs } from './smoke-test.js';

// Scaffolding
export { handleScaffoldProject, handleListTemplates } from './scaffolding.js';
export type { ScaffoldProjectArgs, ListTemplatesArgs } from './scaffolding.js';

// Issues
export { handleProjectIssues } from './issues.js';
export type { ProjectIssuesArgs } from './issues.js';

// LSP Tools
export {
  handleFindReferences,
  handleGoToDefinition,
  handleGetImplementations,
  handleRenameSymbol,
  handleGetCodeActions,
  handleApplyCodeAction,
  handleGetCallHierarchy,
  handleGetTypeHierarchy,
  handleGetSymbolInfo,
  handleGetSignatureHelp,
  handleGetDocumentSymbols,
  handleGetDiagnostics,
  handleFindDeadCode,
  handleGetApiSurface,
  handleDetectBreakingChanges,
  handleSemanticDiff,
  handleWorkspaceSymbols,
  handleSafeDeleteCheck,
  handleGetInlayHints,
  handleValidateEditsPreview,
} from './lsp/index.js';
export type {
  FindReferencesArgs,
  GoToDefinitionArgs,
  GetImplementationsArgs,
  RenameSymbolArgs,
  GetCodeActionsArgs,
  ApplyCodeActionArgs,
  GetCallHierarchyArgs,
  GetTypeHierarchyArgs,
  GetSymbolInfoArgs,
  GetSignatureHelpArgs,
  GetDocumentSymbolsArgs,
  GetDiagnosticsArgs,
  FindDeadCodeArgs,
  GetApiSurfaceArgs,
  DetectBreakingChangesArgs,
  SemanticDiffArgs,
  WorkspaceSymbolsArgs,
  SafeDeleteCheckArgs,
  GetInlayHintsArgs,
  ValidateEditsPreviewArgs,
} from './lsp/index.js';

// Dependency Analysis
export { handleAnalyzeDependencies, handleFindCircularDeps } from './deps/index.js';
export type { AnalyzeDependenciesArgs, FindCircularDepsArgs } from './deps/index.js';

// Error Tools
export { handleParseErrorStack, handleExplainTypeError } from './errors/index.js';
export type { ParseErrorStackArgs, ExplainTypeErrorArgs } from './errors/index.js';

// Test Tools
export { handleFindTestsForFile, handleGetTestCoverage, handleSuggestTestCases } from './test/index.js';
export type { FindTestsForFileArgs, TestType, GetTestCoverageArgs, SuggestTestCasesArgs } from './test/index.js';

// Security
export { handleScanForSecrets, handleCheckPermissions } from './security/index.js';
export type { ScanForSecretsArgs, CheckPermissionsArgs } from './security/index.js';

// Project Tools
export { handleGetEnvConfig, handleGetConventions } from './project/index.js';
export type { GetEnvConfigArgs, GetConventionsArgs } from './project/index.js';

// Framework Tools
export { handleGetReactComponentTree, handleGetPrismaOperations } from './framework/index.js';
export type { GetReactComponentTreeArgs, GetPrismaOperationsArgs } from './framework/index.js';

// Build Tools
export { handleAnalyzeBundle } from './build/index.js';
export type { AnalyzeBundleArgs } from './build/index.js';

// Process Management
export {
  handleStartDevServer,
  getSpawnedProcesses,
  killProcess,
  killAllProcesses,
  handleWatchForErrors,
  handleHealthMonitor,
} from './process/index.js';
export type {
  StartDevServerArgs,
  StartDevServerResult,
  ServerStatus,
  WatchForErrorsArgs,
  WatchForErrorsResult,
  DetectedError,
  DetectedWarning,
  SourceInfo,
  ErrorType,
  HealthMonitorArgs,
} from './process/index.js';

// Runtime Tools (Browser Automation, Verification, Lighthouse)
export {
  handleBrowserAutomation,
  handleVerifyRuntimeBehavior,
  handleLighthouseAudit,
  handleVisualRegression,
} from './runtime/index.js';
export type {
  BrowserAutomationArgs,
  BrowserAutomationResult,
  BrowserStep,
  BrowserAssertion,
  StepResult,
  Viewport,
  ScrollPosition,
  VerifyRuntimeBehaviorArgs,
  LighthouseAuditArgs,
  LighthouseCategory,
  DeviceType,
  VisualRegressionArgs,
  VisualRegressionResult,
} from './runtime/index.js';

// Edit Tools (Retry with Learning, Conflict Resolution, Atomic Edits)
export {
  handleRetryWithLearning,
  handleResolveMergeConflict,
  handleAtomicMultiEdit,
  handleAutoRollback,
  handleValidateApiContract,
} from './edit/index.js';
export type {
  RetryWithLearningArgs,
  RetryWithLearningResult,
  AttemptInfo,
  FixStrategy,
  ResolveMergeConflictArgs,
  AtomicMultiEditArgs,
  AtomicMultiEditResult,
  EditOperation,
  ValidationOptions,
  AutoRollbackArgs,
  AutoRollbackResult,
  RollbackTrigger,
  ValidateApiContractArgs,
} from './edit/index.js';

// Analysis Tools (Function Profiling, Log Analysis, Memory Leak Detection)
export {
  handleProfileFunction,
  handleLogAnalyzer,
  handleGenerateTypes,
  handleIdentifyTechDebt,
  handleDetectMemoryLeaks,
} from './analysis/index.js';
export type {
  ProfileFunctionArgs,
  ProfileFunctionResult,
  TimingStats,
  MemoryStats,
  LogAnalyzerArgs,
  LogAnalyzerResult,
  GenerateTypesArgs,
  GenerateTypesResult,
  IdentifyTechDebtArgs,
  TechDebtCategory,
  TechDebtGrade,
  IssueSeverity,
  EffortEstimate,
  DetectMemoryLeaksArgs,
  DetectMemoryLeaksResult,
  MemorySnapshot,
  MemoryAnalysis,
  LinearRegressionResult,
  LeakSuspect,
} from './analysis/index.js';

// Database Tools
export { handleQueryDatabase } from './database/index.js';
export type { QueryDatabaseArgs, QueryDatabaseResult, ColumnInfo, DatabaseType } from './database/index.js';

// Environment Validation
export { handleValidateEnvComplete } from './env/index.js';
export type { ValidateEnvCompleteArgs } from './env/index.js';

// Package Management
export { handleUpgradePackage } from './package/index.js';
export type { UpgradePackageArgs } from './package/index.js';

// Sync Tools
export { handleSyncApiTypes } from './sync/index.js';
export type {
  SyncApiTypesArgs,
  SyncApiTypesResult,
  BackendRoute,
  FrontendCall,
  TypeDrift,
  SyncSummary,
} from './sync/index.js';

// Fixture Generation
export { handleGenerateFixture } from './fixtures/index.js';
export type { GenerateFixtureArgs, GenerateFixtureResult } from './fixtures/index.js';

// Git Tools
export { handleCreatePullRequest } from './git/index.js';
export type { CreatePullRequestArgs, CreatePullRequestResult } from './git/index.js';

// Frontend Analysis Tools
export {
  handleTraceComponentState,
  handleAnalyzeRenderTriggers,
  handleAnalyzeResponsiveBreakpoints,
  handleAnalyzeStackingContext,
  handleAnalyzeLayoutHierarchy,
  handleDiagnoseOverflow,
  handleGetAccessibilityTree,
  handleGetSizingStrategy,
  handleAnalyzeEventFlow,
  handleAnalyzeTailwindConflicts,
} from './frontend/index.js';
export type {
  TraceComponentStateArgs,
  AnalyzeRenderTriggersArgs,
  AnalyzeResponsiveBreakpointsArgs,
  AnalyzeStackingContextArgs,
  AnalyzeLayoutHierarchyArgs,
  DiagnoseOverflowArgs,
  GetAccessibilityTreeArgs,
  A11yNode,
  GetSizingStrategyArgs,
  GetSizingStrategyResult,
  AnalyzeEventFlowArgs,
  AnalyzeTailwindConflictsArgs,
} from './frontend/index.js';
