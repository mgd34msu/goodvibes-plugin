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
  handleRenameSymbol,
  handleGetCodeActions,
  handleApplyCodeAction,
  handleGetCallHierarchy,
  handleGetSymbolInfo,
  handleGetSignatureHelp,
  handleGetDocumentSymbols,
  handleGetDiagnostics,
  handleFindDeadCode,
  handleGetApiSurface,
  handleDetectBreakingChanges,
  handleSemanticDiff,
} from './lsp/index.js';
export type {
  FindReferencesArgs,
  GoToDefinitionArgs,
  RenameSymbolArgs,
  GetCodeActionsArgs,
  ApplyCodeActionArgs,
  GetCallHierarchyArgs,
  GetSymbolInfoArgs,
  GetSignatureHelpArgs,
  GetDocumentSymbolsArgs,
  GetDiagnosticsArgs,
  FindDeadCodeArgs,
  GetApiSurfaceArgs,
  DetectBreakingChangesArgs,
  SemanticDiffArgs,
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
