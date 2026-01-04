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

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import Fuse from 'fuse.js';

// Local imports
import { Registry, RegistryEntry, ToolResponse } from './types.js';
import { PLUGIN_ROOT } from './config.js';
import { TOOL_SCHEMAS } from './tool-schemas.js';
import { loadRegistry, createIndex } from './utils.js';

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
  // Schema
  handleGetSchema,
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
  // Type imports
  type SkillDependenciesArgs,
  type CheckVersionsArgs,
  type FetchDocsArgs,
  type GetSchemaArgs,
  type ReadConfigArgs,
  type ValidateImplementationArgs,
  type CheckTypesArgs,
  type RunSmokeTestArgs,
  type ScaffoldProjectArgs,
  type ListTemplatesArgs,
  type ProjectIssuesArgs,
} from './handlers/index.js';

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
 * Type for tool handler functions
 */
type ToolHandler = (ctx: HandlerContext, args: unknown) => ToolResponse | Promise<ToolResponse>;

/**
 * Registry mapping tool names to their handler functions.
 * Each handler receives the context (indexes/registries) and arguments.
 */
const TOOL_HANDLERS: Record<string, ToolHandler> = {
  // Search tools
  search_skills: (ctx, args) =>
    handleSearchSkills(ctx.skillsIndex, args as { query: string; category?: string; limit?: number }),
  search_agents: (ctx, args) =>
    handleSearchAgents(ctx.agentsIndex, args as { query: string; limit?: number }),
  search_tools: (ctx, args) =>
    handleSearchTools(ctx.toolsIndex, args as { query: string; limit?: number }),
  recommend_skills: (ctx, args) =>
    handleRecommendSkills(ctx.skillsIndex, args as { task: string; max_results?: number }),

  // Content retrieval
  get_skill_content: (_ctx, args) =>
    handleGetSkillContent(args as { path: string }),
  get_agent_content: (_ctx, args) =>
    handleGetAgentContent(args as { path: string }),
  skill_dependencies: (ctx, args) =>
    handleSkillDependencies(ctx.skillsIndex, ctx.skillsRegistry, args as unknown as SkillDependenciesArgs),

  // Context gathering
  detect_stack: (_ctx, args) =>
    handleDetectStack(args as { path?: string; deep?: boolean }),
  check_versions: (_ctx, args) =>
    handleCheckVersions(args as CheckVersionsArgs),
  scan_patterns: (_ctx, args) =>
    handleScanPatterns(args as { path?: string; pattern_types?: string[] }),

  // Live data
  fetch_docs: (_ctx, args) =>
    handleFetchDocs(args as unknown as FetchDocsArgs),
  get_schema: (_ctx, args) =>
    handleGetSchema(args as unknown as GetSchemaArgs),
  read_config: (_ctx, args) =>
    handleReadConfig(args as unknown as ReadConfigArgs),

  // Validation
  validate_implementation: (_ctx, args) =>
    handleValidateImplementation(args as unknown as ValidateImplementationArgs),
  run_smoke_test: (_ctx, args) =>
    handleRunSmokeTest(args as RunSmokeTestArgs),
  check_types: (_ctx, args) =>
    handleCheckTypes(args as CheckTypesArgs),

  // Scaffolding
  scaffold_project: (_ctx, args) =>
    handleScaffoldProject(args as unknown as ScaffoldProjectArgs),
  list_templates: (_ctx, args) =>
    handleListTemplates(args as ListTemplatesArgs),

  // Status and issues
  plugin_status: () =>
    handlePluginStatus(),
  project_issues: (_ctx, args) =>
    handleProjectIssues(args as ProjectIssuesArgs),
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
        name: 'goodvibes-tools',
        version: '2.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  /**
   * Initialize search indexes
   */
  private initializeIndexes(): void {
    console.error('Initializing indexes from:', PLUGIN_ROOT);

    this.skillsRegistry = loadRegistry('skills/_registry.yaml');
    this.skillsIndex = createIndex(this.skillsRegistry);
    console.error(`Skills index: ${this.skillsRegistry?.search_index?.length || 0} entries`);

    const agentsRegistry = loadRegistry('agents/_registry.yaml');
    this.agentsIndex = createIndex(agentsRegistry);
    console.error(`Agents index: ${agentsRegistry?.search_index?.length || 0} entries`);

    const toolsRegistry = loadRegistry('tools/_registry.yaml');
    this.toolsIndex = createIndex(toolsRegistry);
    console.error(`Tools index: ${toolsRegistry?.search_index?.length || 0} entries`);
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
        return await handler(this.getHandlerContext(), args);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
          isError: true,
        };
      }
    });
  }

  /**
   * Start the server
   */
  async run(): Promise<void> {
    this.initializeIndexes();

    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    console.error(`GoodVibes MCP Server v2.1.0 running with ${TOOL_SCHEMAS.length} tools`);
  }
}

// Main entry point
const server = new GoodVibesServer();
server.run().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
