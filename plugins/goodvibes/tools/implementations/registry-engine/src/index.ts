#!/usr/bin/env node
/**
 * Registry Engine MCP Server
 *
 * Provides plugin discovery tools for searching and accessing GoodVibes
 * skills, agents, and tools registries.
 *
 * Tools (7):
 * - search_skills: Search the skill registry
 * - search_agents: Search the agents registry
 * - search_tools: Search the tools registry
 * - recommend_skills: Get skill recommendations for a task
 * - get_skill_content: Retrieve full skill content
 * - get_agent_content: Retrieve full agent content
 * - skill_dependencies: Analyze skill dependency relationships
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import Fuse from 'fuse.js';

import { SERVER_NAME, SERVER_VERSION, PLUGIN_ROOT } from './config.js';
import { logger } from './logging.js';
import { DISCOVERY_SCHEMAS } from './schemas/index.js';
import { getHandler, hasHandler, listHandlers } from './handlers/index.js';
import { loadRegistry, createIndex } from './utils.js';
import { Registry, RegistryEntry, HandlerContext } from './types.js';

// =============================================================================
// Lazy Registry Loader
// =============================================================================

/**
 * Lazy loader for registry indexes.
 * Loads registries on-demand instead of synchronously at startup for faster server initialization.
 *
 * Benefits:
 * - Server starts immediately without waiting for all registries to load
 * - Registries are loaded only when first needed
 * - Multiple concurrent requests for the same registry share the same loading promise
 * - Optional preloading for warming up the cache
 */
class LazyRegistryLoader {
  private _skillsIndex: Fuse<RegistryEntry> | null = null;
  private _agentsIndex: Fuse<RegistryEntry> | null = null;
  private _toolsIndex: Fuse<RegistryEntry> | null = null;
  private _skillsRegistry: Registry | null = null;

  private _skillsLoading: Promise<void> | null = null;
  private _agentsLoading: Promise<void> | null = null;
  private _toolsLoading: Promise<void> | null = null;

  private _skillsLoaded = false;
  private _agentsLoaded = false;
  private _toolsLoaded = false;

  /**
   * Get skills index, loading it lazily if not already loaded.
   */
  async getSkillsIndex(): Promise<Fuse<RegistryEntry> | null> {
    if (!this._skillsLoaded) {
      if (!this._skillsLoading) {
        this._skillsLoading = this.loadSkills();
      }
      await this._skillsLoading;
    }
    return this._skillsIndex;
  }

  /**
   * Get skills registry, loading it lazily if not already loaded.
   */
  async getSkillsRegistry(): Promise<Registry | null> {
    if (!this._skillsLoaded) {
      if (!this._skillsLoading) {
        this._skillsLoading = this.loadSkills();
      }
      await this._skillsLoading;
    }
    return this._skillsRegistry;
  }

  /**
   * Get agents index, loading it lazily if not already loaded.
   */
  async getAgentsIndex(): Promise<Fuse<RegistryEntry> | null> {
    if (!this._agentsLoaded) {
      if (!this._agentsLoading) {
        this._agentsLoading = this.loadAgents();
      }
      await this._agentsLoading;
    }
    return this._agentsIndex;
  }

  /**
   * Get tools index, loading it lazily if not already loaded.
   */
  async getToolsIndex(): Promise<Fuse<RegistryEntry> | null> {
    if (!this._toolsLoaded) {
      if (!this._toolsLoading) {
        this._toolsLoading = this.loadTools();
      }
      await this._toolsLoading;
    }
    return this._toolsIndex;
  }

  /**
   * Preload all registries in parallel.
   * Call this to warm up the cache if you want eager loading behavior.
   */
  async preloadAll(): Promise<void> {
    await Promise.all([
      this.getSkillsIndex(),
      this.getAgentsIndex(),
      this.getToolsIndex(),
    ]);
  }

  /**
   * Get handler context with all registries loaded.
   */
  async getHandlerContext(): Promise<HandlerContext> {
    await Promise.all([
      this.getSkillsIndex(),
      this.getAgentsIndex(),
      this.getToolsIndex(),
    ]);

    return {
      skillsIndex: this._skillsIndex,
      agentsIndex: this._agentsIndex,
      toolsIndex: this._toolsIndex,
      skillsRegistry: this._skillsRegistry,
    };
  }

  private async loadSkills(): Promise<void> {
    logger.info('Loading skills registry lazily');
    this._skillsRegistry = await loadRegistry('skills/_registry.yaml');
    this._skillsIndex = createIndex(this._skillsRegistry);
    this._skillsLoaded = true;
    logger.info('Skills index loaded', {
      entries: this._skillsRegistry?.search_index?.length || 0,
    });
  }

  private async loadAgents(): Promise<void> {
    logger.info('Loading agents registry lazily');
    const agentsRegistry = await loadRegistry('agents/_registry.yaml');
    this._agentsIndex = createIndex(agentsRegistry);
    this._agentsLoaded = true;
    logger.info('Agents index loaded', {
      entries: agentsRegistry?.search_index?.length || 0,
    });
  }

  private async loadTools(): Promise<void> {
    logger.info('Loading tools registry lazily');
    const toolsRegistry = await loadRegistry('tools/_registry.yaml');
    this._toolsIndex = createIndex(toolsRegistry);
    this._toolsLoaded = true;
    logger.info('Tools index loaded', {
      entries: toolsRegistry?.search_index?.length || 0,
    });
  }
}

// =============================================================================
// Main Server Class
// =============================================================================

/**
 * RegistryEngineServer - MCP server for plugin discovery.
 */
class RegistryEngineServer {
  private server: Server;
  private registryLoader: LazyRegistryLoader;

  constructor() {
    this.server = new Server(
      { name: SERVER_NAME, version: SERVER_VERSION },
      { capabilities: { tools: {} } }
    );

    this.registryLoader = new LazyRegistryLoader();
    this.setupHandlers();
    this.setupErrorHandling();
  }

  /**
   * Initialize search indexes (optional - can be used for eager loading).
   * Set GOODVIBES_EAGER_LOAD=true to preload all registries at startup.
   */
  private async initializeIndexes(): Promise<void> {
    const eagerLoad = process.env.GOODVIBES_EAGER_LOAD === 'true';

    if (eagerLoad) {
      logger.info('Eager loading indexes from', PLUGIN_ROOT);
      await this.registryLoader.preloadAll();
    } else {
      logger.info('Lazy loading enabled - indexes will be loaded on first access', {
        plugin_root: PLUGIN_ROOT,
      });
    }
  }

  /**
   * Build handler context with lazy-loaded registries.
   */
  private async getHandlerContext(): Promise<HandlerContext> {
    return this.registryLoader.getHandlerContext();
  }

  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      logger.debug('ListTools request');
      return { tools: DISCOVERY_SCHEMAS };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      logger.tool(name, args);

      if (!hasHandler(name)) {
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${name}. Available: ${listHandlers().join(', ')}`
        );
      }

      const handler = getHandler(name);
      if (!handler) {
        throw new McpError(ErrorCode.InternalError, `Handler not found: ${name}`);
      }

      try {
        // Get handler context (with lazy loading of registries)
        const ctx = await this.getHandlerContext();
        return await handler(ctx, args);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Tool ${name} failed`, { error: message, args });
        throw new McpError(ErrorCode.InternalError, `Tool ${name} failed: ${message}`);
      }
    });
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error) => logger.error('MCP Server error', error);

    process.on('SIGINT', async () => {
      logger.info('Shutting down');
      await this.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('Shutting down');
      await this.stop();
      process.exit(0);
    });
  }

  async start(): Promise<void> {
    await this.initializeIndexes();

    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    logger.info(`${SERVER_NAME} v${SERVER_VERSION} started`);
    logger.info(`Tools: ${listHandlers().join(', ')}`);
  }

  async stop(): Promise<void> {
    await this.server.close();
  }
}

async function main(): Promise<void> {
  const server = new RegistryEngineServer();
  await server.start();
}

main().catch((error) => {
  logger.error('Failed to start', error);
  process.exit(1);
});
