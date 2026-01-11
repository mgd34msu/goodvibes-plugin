/**
 * GoodVibes MCP Server
 *
 * Comprehensive tool server providing:
 * - Search capabilities (skills, agents, tools)
 * - Context gathering (detect stack, check versions, scan patterns)
 * - Live data (fetch docs, get schema, read config)
 * - Validation (validate implementation, smoke test, type check)
 * - Meta tools (recommend skills, skill dependencies)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  CallToolResult,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import Fuse from "fuse.js";

// Local imports
import {
  Registry,
  RegistryEntry,
  SearchSkillsArgs,
  SearchArgs,
  RecommendSkillsArgs,
  GetContentArgs,
  DetectStackArgs,
  ScanPatternsArgs,
} from "./types.js";
import { PLUGIN_ROOT, PROJECT_ROOT } from "./config.js";
import { TOOL_SCHEMAS } from "./tool-schemas.js";
import { loadRegistry, createIndex } from "./utils.js";
import { logInfo, logError } from "./logging.js";

// Handler imports - all extracted to separate modules
import {
  // Status
  handlePluginStatus,
  // Search
  handleSearchSkills,
  handleSearchAgents,
  handleSearchTools,
  handleRecommendSkills,
  // Content
  handleGetSkillContent,
  handleGetAgentContent,
  // Dependencies
  handleSkillDependencies,
  // Context
  handleDetectStack,
  handleScanPatterns,
  // NPM
  handleCheckVersions,
  // Docs
  handleFetchDocs,
  // OpenAPI Generation
  handleGenerateOpenApi,
  // Codebase Explanation
  handleExplainCodebase,
  // Schema
  handleGetSchema,
  handleGetDatabaseSchema,
  // API Routes
  handleGetApiRoutes,
  // Config
  handleReadConfig,
  // Validation
  handleValidateImplementation,
  handleCheckTypes,
  // Smoke Test
  handleRunSmokeTest,
  // Scaffolding
  handleScaffoldProject,
  handleListTemplates,
  // Issues
  handleProjectIssues,
  // LSP Tools
  handleFindReferences,
  handleGoToDefinition,
  handleGetImplementations,
  handleRenameSymbol,
  handleGetCodeActions,
  handleApplyCodeAction,
  handleGetCallHierarchy,
  handleGetTypeHierarchy,
  handleGetDocumentSymbols,
  handleGetSymbolInfo,
  handleGetSignatureHelp,
  handleGetDiagnostics,
  handleFindDeadCode,
  handleGetApiSurface,
  handleDetectBreakingChanges,
  handleSemanticDiff,
  handleGetInlayHints,
  handleWorkspaceSymbols,
  handleSafeDeleteCheck,
  handleValidateEditsPreview,
  // Dependency Analysis
  handleAnalyzeDependencies,
  handleFindCircularDeps,
  // Test Tools
  handleFindTestsForFile,
  handleGetTestCoverage,
  handleSuggestTestCases,
  // Security
  handleScanForSecrets,
  handleCheckPermissions,
  // Build Tools
  handleAnalyzeBundle,
  // Error Explanation
  handleExplainTypeError,
  // Error Stack Parsing
  handleParseErrorStack,
  // Project Tools
  handleGetEnvConfig,
  handleGetConventions,
  // Framework Tools
  handleGetReactComponentTree,
  handleGetPrismaOperations,
  // Process Management
  handleStartDevServer,
  handleWatchForErrors,
  handleHealthMonitor,
  // Runtime Tools
  handleBrowserAutomation,
  handleVerifyRuntimeBehavior,
  handleLighthouseAudit,
  handleVisualRegression,
  // Edit Tools
  handleRetryWithLearning,
  handleResolveMergeConflict,
  handleAtomicMultiEdit,
  handleAutoRollback,
  handleValidateApiContract,
  // Analysis Tools
  handleProfileFunction,
  handleLogAnalyzer,
  handleGenerateTypes,
  handleIdentifyTechDebt,
  handleDetectMemoryLeaks,
  // Database Tools
  handleQueryDatabase,
  // Environment Validation
  handleValidateEnvComplete,
  // Package Management
  handleUpgradePackage,
  // Sync Tools
  handleSyncApiTypes,
  // Fixture Generation
  handleGenerateFixture,
  // Git Tools
  handleCreatePullRequest,
  // Frontend Analysis Tools
  handleTraceComponentState,
  handleAnalyzeResponsiveBreakpoints,
  handleAnalyzeStackingContext,
  handleDiagnoseOverflow,
  handleAnalyzeRenderTriggers,
  handleAnalyzeLayoutHierarchy,
  handleGetAccessibilityTree,
  handleGetSizingStrategy,
  handleAnalyzeEventFlow,
  handleAnalyzeTailwindConflicts,
  // Type imports
  type SkillDependenciesArgs,
  type CheckVersionsArgs,
  type FetchDocsArgs,
  type GenerateOpenApiArgs,
  type ExplainCodebaseArgs,
  type GetSchemaArgs,
  type GetDatabaseSchemaArgs,
  type GetApiRoutesArgs,
  type ReadConfigArgs,
  type ValidateImplementationArgs,
  type CheckTypesArgs,
  type RunSmokeTestArgs,
  type ScaffoldProjectArgs,
  type ListTemplatesArgs,
  type ProjectIssuesArgs,
  type FindReferencesArgs,
  type GoToDefinitionArgs,
  type GetImplementationsArgs,
  type RenameSymbolArgs,
  type GetCodeActionsArgs,
  type ApplyCodeActionArgs,
  type GetCallHierarchyArgs,
  type GetTypeHierarchyArgs,
  type GetDocumentSymbolsArgs,
  type GetSymbolInfoArgs,
  type GetSignatureHelpArgs,
  type GetDiagnosticsArgs,
  type FindDeadCodeArgs,
  type GetApiSurfaceArgs,
  type DetectBreakingChangesArgs,
  type SemanticDiffArgs,
  type GetInlayHintsArgs,
  type WorkspaceSymbolsArgs,
  type SafeDeleteCheckArgs,
  type ValidateEditsPreviewArgs,
  type AnalyzeDependenciesArgs,
  type FindCircularDepsArgs,
  type FindTestsForFileArgs,
  type GetTestCoverageArgs,
  type SuggestTestCasesArgs,
  type ScanForSecretsArgs,
  type CheckPermissionsArgs,
  type AnalyzeBundleArgs,
  type ExplainTypeErrorArgs,
  type ParseErrorStackArgs,
  type GetEnvConfigArgs,
  type GetConventionsArgs,
  type GetReactComponentTreeArgs,
  type GetPrismaOperationsArgs,
  type StartDevServerArgs,
  type WatchForErrorsArgs,
  type HealthMonitorArgs,
  type BrowserAutomationArgs,
  type VerifyRuntimeBehaviorArgs,
  type LighthouseAuditArgs,
  type VisualRegressionArgs,
  type RetryWithLearningArgs,
  type ResolveMergeConflictArgs,
  type AtomicMultiEditArgs,
  type AutoRollbackArgs,
  type ValidateApiContractArgs,
  type ProfileFunctionArgs,
  type LogAnalyzerArgs,
  type GenerateTypesArgs,
  type IdentifyTechDebtArgs,
  type DetectMemoryLeaksArgs,
  // Database Tools
  type QueryDatabaseArgs,
  // Environment Validation
  type ValidateEnvCompleteArgs,
  // Package Management
  type UpgradePackageArgs,
  // Sync Tools
  type SyncApiTypesArgs,
  // Fixture Generation
  type GenerateFixtureArgs,
  // Git Tools
  type CreatePullRequestArgs,
  // Frontend Analysis Tools
  type TraceComponentStateArgs,
  type AnalyzeResponsiveBreakpointsArgs,
  type AnalyzeStackingContextArgs,
  type AnalyzeLayoutHierarchyArgs,
  type AnalyzeRenderTriggersArgs,
  type DiagnoseOverflowArgs,
  type GetAccessibilityTreeArgs,
  type GetSizingStrategyArgs,
  type AnalyzeEventFlowArgs,
  type AnalyzeTailwindConflictsArgs,
} from "./handlers/index.js";

/**
 * Union type of all possible tool arguments.
 * This allows safe type assertions from the union to specific arg types
 * without needing double-casting.
 */
type ToolArgs =
  | SearchSkillsArgs
  | SearchArgs
  | RecommendSkillsArgs
  | GetContentArgs
  | SkillDependenciesArgs
  | DetectStackArgs
  | CheckVersionsArgs
  | ScanPatternsArgs
  | FetchDocsArgs
  | GenerateOpenApiArgs
  | ExplainCodebaseArgs
  | GetSchemaArgs
  | GetDatabaseSchemaArgs
  | GetApiRoutesArgs
  | ReadConfigArgs
  | ValidateImplementationArgs
  | RunSmokeTestArgs
  | CheckTypesArgs
  | ScaffoldProjectArgs
  | ListTemplatesArgs
  | ProjectIssuesArgs
  | FindReferencesArgs
  | GoToDefinitionArgs
  | GetImplementationsArgs
  | RenameSymbolArgs
  | GetCodeActionsArgs
  | ApplyCodeActionArgs
  | GetCallHierarchyArgs
  | GetTypeHierarchyArgs
  | GetDocumentSymbolsArgs
  | GetSymbolInfoArgs
  | GetSignatureHelpArgs
  | GetDiagnosticsArgs
  | FindDeadCodeArgs
  | GetApiSurfaceArgs
  | DetectBreakingChangesArgs
  | SemanticDiffArgs
  | GetInlayHintsArgs
  | WorkspaceSymbolsArgs
  | SafeDeleteCheckArgs
  | ValidateEditsPreviewArgs
  | AnalyzeDependenciesArgs
  | FindCircularDepsArgs
  | FindTestsForFileArgs
  | GetTestCoverageArgs
  | SuggestTestCasesArgs
  | ScanForSecretsArgs
  | CheckPermissionsArgs
  | AnalyzeBundleArgs
  | ExplainTypeErrorArgs
  | GetEnvConfigArgs
  | GetConventionsArgs
  | ParseErrorStackArgs
  | GetReactComponentTreeArgs
  | GetPrismaOperationsArgs
  | StartDevServerArgs
  | WatchForErrorsArgs
  | HealthMonitorArgs
  | BrowserAutomationArgs
  | VerifyRuntimeBehaviorArgs
  | LighthouseAuditArgs
  | VisualRegressionArgs
  | RetryWithLearningArgs
  | ResolveMergeConflictArgs
  | AtomicMultiEditArgs
  | AutoRollbackArgs
  | ValidateApiContractArgs
  | ProfileFunctionArgs
  | LogAnalyzerArgs
  | GenerateTypesArgs
  | IdentifyTechDebtArgs
  | DetectMemoryLeaksArgs
  | QueryDatabaseArgs
  | ValidateEnvCompleteArgs
  | UpgradePackageArgs
  | SyncApiTypesArgs
  | GenerateFixtureArgs
  | CreatePullRequestArgs
  | TraceComponentStateArgs
  | AnalyzeResponsiveBreakpointsArgs
  | AnalyzeStackingContextArgs
  | AnalyzeRenderTriggersArgs
  | DiagnoseOverflowArgs
  | AnalyzeLayoutHierarchyArgs
  | GetAccessibilityTreeArgs
  | GetSizingStrategyArgs
  | AnalyzeEventFlowArgs
  | AnalyzeTailwindConflictsArgs
  | Record<string, never>; // For tools with no args (plugin_status)

/**
 * Context object passed to tool handlers providing access to indexes and registries
 */
interface HandlerContext {
  skillsIndex: Fuse<RegistryEntry> | null;
  agentsIndex: Fuse<RegistryEntry> | null;
  toolsIndex: Fuse<RegistryEntry> | null;
  skillsRegistry: Registry | null;
}

/**
 * Tool response type matching what handlers return
 */
interface ToolHandlerResponse {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

/**
 * Type for tool handler functions
 */
type ToolHandler = (
  ctx: HandlerContext,
  args: ToolArgs,
) => ToolHandlerResponse | Promise<ToolHandlerResponse>;

/**
 * Registry mapping tool names to their handler functions.
 * Each handler receives the context (indexes/registries) and arguments.
 */
const TOOL_HANDLERS: Record<string, ToolHandler> = {
  // Search tools
  search_skills: (ctx, args) =>
    handleSearchSkills(ctx.skillsIndex, args as SearchSkillsArgs),
  search_agents: (ctx, args) =>
    handleSearchAgents(ctx.agentsIndex, args as SearchArgs),
  search_tools: (ctx, args) =>
    handleSearchTools(ctx.toolsIndex, args as SearchArgs),
  recommend_skills: (ctx, args) =>
    handleRecommendSkills(ctx.skillsIndex, args as RecommendSkillsArgs),

  // Content retrieval
  get_skill_content: (_ctx, args) =>
    handleGetSkillContent(args as GetContentArgs),
  get_agent_content: (_ctx, args) =>
    handleGetAgentContent(args as GetContentArgs),
  skill_dependencies: (ctx, args) =>
    handleSkillDependencies(
      ctx.skillsIndex,
      ctx.skillsRegistry,
      args as SkillDependenciesArgs,
    ),

  // Context gathering
  detect_stack: (_ctx, args) => handleDetectStack(args as DetectStackArgs),
  check_versions: (_ctx, args) =>
    handleCheckVersions(args as CheckVersionsArgs),
  scan_patterns: (_ctx, args) => handleScanPatterns(args as ScanPatternsArgs),

  // Live data
  fetch_docs: (_ctx, args) => handleFetchDocs(args as FetchDocsArgs),
  generate_openapi: (_ctx, args) =>
    handleGenerateOpenApi(args as GenerateOpenApiArgs),
  explain_codebase: (_ctx, args) =>
    handleExplainCodebase(args as ExplainCodebaseArgs),
  get_schema: (_ctx, args) => handleGetSchema(args as GetSchemaArgs),
  get_database_schema: (_ctx, args) =>
    handleGetDatabaseSchema(args as GetDatabaseSchemaArgs),
  get_api_routes: (_ctx, args) =>
    handleGetApiRoutes(args as GetApiRoutesArgs),
  read_config: (_ctx, args) => handleReadConfig(args as ReadConfigArgs),

  // Validation
  validate_implementation: (_ctx, args) =>
    handleValidateImplementation(args as ValidateImplementationArgs),
  run_smoke_test: (_ctx, args) => handleRunSmokeTest(args as RunSmokeTestArgs),
  check_types: (_ctx, args) => handleCheckTypes(args as CheckTypesArgs),

  // Scaffolding
  scaffold_project: (_ctx, args) =>
    handleScaffoldProject(args as ScaffoldProjectArgs),
  list_templates: (_ctx, args) =>
    handleListTemplates(args as ListTemplatesArgs),

  // Status and issues
  plugin_status: () => handlePluginStatus(),
  project_issues: (_ctx, args) =>
    handleProjectIssues(args as ProjectIssuesArgs),

  // LSP Tools
  find_references: (_ctx, args) =>
    handleFindReferences(args as FindReferencesArgs),
  go_to_definition: (_ctx, args) =>
    handleGoToDefinition(args as GoToDefinitionArgs),
  get_implementations: (_ctx, args) =>
    handleGetImplementations(args as GetImplementationsArgs),
  rename_symbol: (_ctx, args) =>
    handleRenameSymbol(args as RenameSymbolArgs),
  get_code_actions: (_ctx, args) =>
    handleGetCodeActions(args as GetCodeActionsArgs),
  apply_code_action: (_ctx, args) =>
    handleApplyCodeAction(args as ApplyCodeActionArgs),
  get_call_hierarchy: (_ctx, args) =>
    handleGetCallHierarchy(args as GetCallHierarchyArgs),
  get_type_hierarchy: (_ctx, args) =>
    handleGetTypeHierarchy(args as GetTypeHierarchyArgs),
  get_document_symbols: (_ctx, args) =>
    handleGetDocumentSymbols(args as GetDocumentSymbolsArgs),
  get_symbol_info: (_ctx, args) =>
    handleGetSymbolInfo(args as GetSymbolInfoArgs),
  get_signature_help: (_ctx, args) =>
    handleGetSignatureHelp(args as GetSignatureHelpArgs),
  get_diagnostics: (_ctx, args) =>
    handleGetDiagnostics(args as GetDiagnosticsArgs),
  find_dead_code: (_ctx, args) =>
    handleFindDeadCode(args as FindDeadCodeArgs),
  get_api_surface: (_ctx, args) =>
    handleGetApiSurface(args as GetApiSurfaceArgs),
  detect_breaking_changes: (_ctx, args) =>
    handleDetectBreakingChanges(args as DetectBreakingChangesArgs),
  semantic_diff: (_ctx, args) =>
    handleSemanticDiff(args as SemanticDiffArgs),
  get_inlay_hints: (_ctx, args) =>
    handleGetInlayHints(args as GetInlayHintsArgs),
  workspace_symbols: (_ctx, args) =>
    handleWorkspaceSymbols(args as WorkspaceSymbolsArgs),
  safe_delete_check: (_ctx, args) =>
    handleSafeDeleteCheck(args as SafeDeleteCheckArgs),
  validate_edits_preview: (_ctx, args) =>
    handleValidateEditsPreview(args as ValidateEditsPreviewArgs),

  // Dependency Analysis
  analyze_dependencies: (_ctx, args) =>
    handleAnalyzeDependencies(args as AnalyzeDependenciesArgs),
  find_circular_deps: (_ctx, args) =>
    handleFindCircularDeps(args as FindCircularDepsArgs),

  // Security
  scan_for_secrets: (_ctx, args) =>
    handleScanForSecrets(args as ScanForSecretsArgs),
  check_permissions: (_ctx, args) =>
    handleCheckPermissions(args as CheckPermissionsArgs),

  // Build Tools
  analyze_bundle: (_ctx, args) =>
    handleAnalyzeBundle(args as AnalyzeBundleArgs),

  // Test Tools
  find_tests_for_file: (_ctx, args) =>
    handleFindTestsForFile(args as FindTestsForFileArgs),
  get_test_coverage: (_ctx, args) =>
    handleGetTestCoverage(args as GetTestCoverageArgs),
  suggest_test_cases: (_ctx, args) =>
    handleSuggestTestCases(args as SuggestTestCasesArgs),

  // Error Explanation
  explain_type_error: (_ctx, args) =>
    handleExplainTypeError(args as ExplainTypeErrorArgs),

  // Error Stack Parsing
  parse_error_stack: (_ctx, args) =>
    handleParseErrorStack(args as ParseErrorStackArgs),

  // Project Tools
  get_env_config: (_ctx, args) =>
    handleGetEnvConfig(args as GetEnvConfigArgs),
  get_conventions: (_ctx, args) =>
    handleGetConventions(args as GetConventionsArgs),

  // Framework Tools
  get_react_component_tree: (_ctx, args) =>
    handleGetReactComponentTree(args as GetReactComponentTreeArgs),
  get_prisma_operations: (_ctx, args) =>
    handleGetPrismaOperations(args as GetPrismaOperationsArgs),

  // Process Management
  start_dev_server: (_ctx, args) =>
    handleStartDevServer(args as StartDevServerArgs),
  watch_for_errors: (_ctx, args) =>
    handleWatchForErrors(args as WatchForErrorsArgs),
  health_monitor: (_ctx, args) =>
    handleHealthMonitor(args as HealthMonitorArgs),

  // Runtime Tools
  browser_automation: (_ctx, args) =>
    handleBrowserAutomation(args as BrowserAutomationArgs),
  verify_runtime_behavior: (_ctx, args) =>
    handleVerifyRuntimeBehavior(args as VerifyRuntimeBehaviorArgs),
  lighthouse_audit: (_ctx, args) =>
    handleLighthouseAudit(args as LighthouseAuditArgs),
  visual_regression: (_ctx, args) =>
    handleVisualRegression(args as VisualRegressionArgs),

  // Edit Tools
  retry_with_learning: (_ctx, args) =>
    handleRetryWithLearning(args as RetryWithLearningArgs),
  resolve_merge_conflict: (_ctx, args) =>
    handleResolveMergeConflict(args as ResolveMergeConflictArgs),
  atomic_multi_edit: (_ctx, args) =>
    handleAtomicMultiEdit(args as AtomicMultiEditArgs),
  auto_rollback: (_ctx, args) =>
    handleAutoRollback(args as AutoRollbackArgs),

  // API Contract Validation
  validate_api_contract: (_ctx, args) =>
    handleValidateApiContract(args as ValidateApiContractArgs),

  // Analysis Tools
  profile_function: (_ctx, args) =>
    handleProfileFunction(args as ProfileFunctionArgs),
  log_analyzer: (_ctx, args) =>
    handleLogAnalyzer(args as LogAnalyzerArgs),
  generate_types: (_ctx, args) =>
    handleGenerateTypes(args as GenerateTypesArgs),
  identify_tech_debt: (_ctx, args) =>
    handleIdentifyTechDebt(args as IdentifyTechDebtArgs),
  detect_memory_leaks: (_ctx, args) =>
    handleDetectMemoryLeaks(args as DetectMemoryLeaksArgs),

  // Database Tools
  query_database: (_ctx, args) =>
    handleQueryDatabase(args as QueryDatabaseArgs),

  // Environment Validation
  validate_env_complete: (_ctx, args) =>
    handleValidateEnvComplete(args as ValidateEnvCompleteArgs),

  // Package Management
  upgrade_package: (_ctx, args) =>
    handleUpgradePackage(args as UpgradePackageArgs),

  // Fixture Generation
  generate_fixture: (_ctx, args) =>
    handleGenerateFixture(args as GenerateFixtureArgs),

  // Sync Tools
  sync_api_types: (_ctx, args) =>
    handleSyncApiTypes(args as SyncApiTypesArgs),

  // Git Tools
  create_pull_request: (_ctx, args) =>
    handleCreatePullRequest(args as CreatePullRequestArgs),

  // Frontend Analysis Tools
  trace_component_state: (_ctx, args) =>
    handleTraceComponentState(args as TraceComponentStateArgs),
  analyze_responsive_breakpoints: (_ctx, args) =>
    handleAnalyzeResponsiveBreakpoints(args as AnalyzeResponsiveBreakpointsArgs),
  analyze_stacking_context: (_ctx, args) =>
    handleAnalyzeStackingContext(args as AnalyzeStackingContextArgs),
  analyze_render_triggers: (_ctx, args) =>
    handleAnalyzeRenderTriggers(args as AnalyzeRenderTriggersArgs),
  diagnose_overflow: (_ctx, args) =>
    handleDiagnoseOverflow(args as DiagnoseOverflowArgs),
  analyze_layout_hierarchy: (_ctx, args) =>
    handleAnalyzeLayoutHierarchy(args as AnalyzeLayoutHierarchyArgs),
  get_accessibility_tree: (_ctx, args) =>
    handleGetAccessibilityTree(args as GetAccessibilityTreeArgs),
  get_sizing_strategy: (_ctx, args) =>
    handleGetSizingStrategy(args as GetSizingStrategyArgs),
  analyze_event_flow: (_ctx, args) =>
    handleAnalyzeEventFlow(args as AnalyzeEventFlowArgs),
  analyze_tailwind_conflicts: (_ctx, args) =>
    handleAnalyzeTailwindConflicts(args as AnalyzeTailwindConflictsArgs),
};

/**
 * Main server class
 */
class GoodVibesServer {
  private server: Server;
  private skillsIndex: Fuse<RegistryEntry> | null = null;
  private agentsIndex: Fuse<RegistryEntry> | null = null;
  private toolsIndex: Fuse<RegistryEntry> | null = null;
  private skillsRegistry: Registry | null = null;

  constructor() {
    this.server = new Server(
      {
        name: "goodvibes-tools",
        version: "2.1.0",
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    this.setupHandlers();
  }

  /**
   * Initialize search indexes
   */
  private async initializeIndexes(): Promise<void> {
    logInfo("Initializing indexes from", PLUGIN_ROOT);

    this.skillsRegistry = await loadRegistry("skills/_registry.yaml");
    this.skillsIndex = createIndex(this.skillsRegistry);
    logInfo("Skills index loaded", {
      entries: this.skillsRegistry?.search_index?.length || 0,
    });

    const agentsRegistry = await loadRegistry("agents/_registry.yaml");
    this.agentsIndex = createIndex(agentsRegistry);
    logInfo("Agents index loaded", {
      entries: agentsRegistry?.search_index?.length || 0,
    });

    const toolsRegistry = await loadRegistry("tools/_registry.yaml");
    this.toolsIndex = createIndex(toolsRegistry);
    logInfo("Tools index loaded", {
      entries: toolsRegistry?.search_index?.length || 0,
    });
  }

  /**
   * Build handler context from current instance state
   */
  private getHandlerContext(): HandlerContext {
    return {
      skillsIndex: this.skillsIndex,
      agentsIndex: this.agentsIndex,
      toolsIndex: this.toolsIndex,
      skillsRegistry: this.skillsRegistry,
    };
  }

  /**
   * Setup request handlers
   */
  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: TOOL_SCHEMAS,
    }));

    // Handle tool calls using the handler registry
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        const handler = TOOL_HANDLERS[name];
        if (!handler) {
          throw new Error(`Unknown tool: ${name}`);
        }
        const result = await handler(
          this.getHandlerContext(),
          args as ToolArgs,
        );
        // Cast to CallToolResult - handlers return compatible structure
        return result as CallToolResult;
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        return {
          content: [
            { type: "text" as const, text: JSON.stringify({ error: message }) },
          ],
          isError: true,
        };
      }
    });
  }

  /**
   * Start the server
   */
  async run(): Promise<void> {
    await this.initializeIndexes();

    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    logInfo(`GoodVibes MCP Server v2.1.0 running`, {
      tools: TOOL_SCHEMAS.length,
      project_root: PROJECT_ROOT,
      cwd: process.cwd(),
    });
  }
}

// Main entry point
const server = new GoodVibesServer();
server.run().catch((error) => {
  logError("Server failed to start", error);
  process.exit(1);
});
