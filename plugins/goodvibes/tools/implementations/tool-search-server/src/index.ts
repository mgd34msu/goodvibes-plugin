/**
 * GoodVibes MCP Server
 *
 * Comprehensive tool server providing:
 * - Search capabilities (skills, agents, tools)
 * - Context gathering (detect stack, check versions, scan patterns)
 * - Live data (fetch docs, get schema, read config)
 * - Validation (validate implementation, smoke test, type check)
 * - Meta tools (recommend skills, skill dependencies)
 *
 * Tool handlers are registered declaratively in handlers/registry.ts
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
import { Registry, RegistryEntry } from "./types.js";
import { PLUGIN_ROOT, PROJECT_ROOT } from "./config.js";
import { TOOL_SCHEMAS } from "./schemas/index.js";
import { loadRegistry, createIndex } from "./utils.js";
import { logInfo, logError } from "./logging.js";

// Import the centralized handler registry and types
import {
  TOOL_HANDLERS,
  type HandlerContext,
} from "./handlers/index.js";

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
   * Useful if you know registries will be needed soon.
   */
  async preloadAll(): Promise<void> {
    await Promise.all([
      this.getSkillsIndex(),
      this.getAgentsIndex(),
      this.getToolsIndex(),
    ]);
  }

  /**
   * Check if a specific registry is loaded.
   */
  isLoaded(registry: 'skills' | 'agents' | 'tools'): boolean {
    switch (registry) {
      case 'skills': return this._skillsLoaded;
      case 'agents': return this._agentsLoaded;
      case 'tools': return this._toolsLoaded;
    }
  }

  /**
   * Get a synchronous snapshot of current state (for backward compatibility).
   * Returns null for any registries that haven't been loaded yet.
   */
  getSnapshot(): HandlerContext {
    return {
      skillsIndex: this._skillsIndex,
      agentsIndex: this._agentsIndex,
      toolsIndex: this._toolsIndex,
      skillsRegistry: this._skillsRegistry,
    };
  }

  /**
   * Get handler context with all registries loaded.
   * This ensures all registries are available before returning.
   */
  async getHandlerContext(): Promise<HandlerContext> {
    // Load all registries in parallel
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
    logInfo("Loading skills registry lazily");
    this._skillsRegistry = await loadRegistry("skills/_registry.yaml");
    this._skillsIndex = createIndex(this._skillsRegistry);
    this._skillsLoaded = true;
    logInfo("Skills index loaded", {
      entries: this._skillsRegistry?.search_index?.length || 0,
    });
  }

  private async loadAgents(): Promise<void> {
    logInfo("Loading agents registry lazily");
    const agentsRegistry = await loadRegistry("agents/_registry.yaml");
    this._agentsIndex = createIndex(agentsRegistry);
    this._agentsLoaded = true;
    logInfo("Agents index loaded", {
      entries: agentsRegistry?.search_index?.length || 0,
    });
  }

  private async loadTools(): Promise<void> {
    logInfo("Loading tools registry lazily");
    const toolsRegistry = await loadRegistry("tools/_registry.yaml");
    this._toolsIndex = createIndex(toolsRegistry);
    this._toolsLoaded = true;
    logInfo("Tools index loaded", {
      entries: toolsRegistry?.search_index?.length || 0,
    });
  }
}

// =============================================================================
// Main Server Class
// =============================================================================

/**
 * Main server class
 */
class GoodVibesServer {
  private server: Server;
  private registryLoader: LazyRegistryLoader;

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

    this.registryLoader = new LazyRegistryLoader();
    this.setupHandlers();
  }

  /**
   * Initialize search indexes (now optional - can be used for eager loading).
   * By default, indexes are loaded lazily on first access.
   *
   * Set GOODVIBES_EAGER_LOAD=true to preload all registries at startup.
   */
  private async initializeIndexes(): Promise<void> {
    const eagerLoad = process.env.GOODVIBES_EAGER_LOAD === 'true';

    if (eagerLoad) {
      logInfo("Eager loading indexes from", PLUGIN_ROOT);
      await this.registryLoader.preloadAll();
    } else {
      logInfo("Lazy loading enabled - indexes will be loaded on first access", { plugin_root: PLUGIN_ROOT });
    }
  }

  /**
   * Build handler context with lazy-loaded registries.
   * Loads required registries on-demand.
   */
  private async getHandlerContext(): Promise<HandlerContext> {
    return this.registryLoader.getHandlerContext();
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
        // Get handler context (with lazy loading of registries)
        const ctx = await this.getHandlerContext();
        const result = await handler(ctx, args);
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
