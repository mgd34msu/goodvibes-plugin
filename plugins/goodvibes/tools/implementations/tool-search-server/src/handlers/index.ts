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
export { handleGetSchema } from './schema.js';
export type { GetSchemaArgs } from './schema.js';

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
} from './lsp/index.js';
export type {
  FindReferencesArgs,
  GoToDefinitionArgs,
  RenameSymbolArgs,
  GetCodeActionsArgs,
  ApplyCodeActionArgs,
} from './lsp/index.js';
