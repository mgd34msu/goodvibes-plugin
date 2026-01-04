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
import { Registry, RegistryEntry } from './types.js';
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
   * Setup request handlers
   */
  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: TOOL_SCHEMAS,
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          // Search tools
          case 'search_skills':
            return handleSearchSkills(this.skillsIndex, args as { query: string; category?: string; limit?: number });
          case 'search_agents':
            return handleSearchAgents(this.agentsIndex, args as { query: string; limit?: number });
          case 'search_tools':
            return handleSearchTools(this.toolsIndex, args as { query: string; limit?: number });
          case 'recommend_skills':
            return handleRecommendSkills(this.skillsIndex, args as { task: string; max_results?: number });

          // Content retrieval
          case 'get_skill_content':
            return handleGetSkillContent(args as { path: string });
          case 'get_agent_content':
            return handleGetAgentContent(args as { path: string });
          case 'skill_dependencies':
            return handleSkillDependencies(this.skillsIndex, this.skillsRegistry, args as unknown as SkillDependenciesArgs);

          // Context gathering
          case 'detect_stack':
            return handleDetectStack(args as { path?: string; deep?: boolean });
          case 'check_versions':
            return handleCheckVersions(args as CheckVersionsArgs);
          case 'scan_patterns':
            return handleScanPatterns(args as { path?: string; pattern_types?: string[] });

          // Live data
          case 'fetch_docs':
            return handleFetchDocs(args as unknown as FetchDocsArgs);
          case 'get_schema':
            return handleGetSchema(args as unknown as GetSchemaArgs);
          case 'read_config':
            return handleReadConfig(args as unknown as ReadConfigArgs);

          // Validation
          case 'validate_implementation':
            return handleValidateImplementation(args as unknown as ValidateImplementationArgs);
          case 'run_smoke_test':
            return handleRunSmokeTest(args as RunSmokeTestArgs);
          case 'check_types':
            return handleCheckTypes(args as CheckTypesArgs);

          // Scaffolding
          case 'scaffold_project':
            return handleScaffoldProject(args as unknown as ScaffoldProjectArgs);
          case 'list_templates':
            return handleListTemplates(args as ListTemplatesArgs);

          case 'plugin_status':
            return handlePluginStatus();

          case 'project_issues':
            return handleProjectIssues(args as ProjectIssuesArgs);

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
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
