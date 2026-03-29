/**
 * RegistryEngineServer — MCP server for plugin discovery.
 * Wires MCP request handlers to business logic via the dispatch table.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

import { SERVER_NAME, SERVER_VERSION } from '../shared/constants.js';
import { PLUGIN_ROOT } from '../shared/config.js';
import { logger } from '../shared/logger.js';
import type { RegistryContext } from '../core/types.js';
import { RegistryIndexCache } from '../extensions/loader.js';
import { TOOL_SCHEMAS } from './schemas.js';
import { getDispatcher, hasDispatcher, listTools } from './dispatch.js';

class RegistryEngineServer {
  private server: Server;
  private indexCache: RegistryIndexCache;

  constructor() {
    this.server = new Server(
      { name: SERVER_NAME, version: SERVER_VERSION },
      { capabilities: { tools: {} } }
    );

    this.indexCache = new RegistryIndexCache();
    this.setupRoutes();
    this.setupLifecycle();
  }

  /**
   * Initialize the index cache.
   * Set GOODVIBES_EAGER_LOAD=true to warm all caches at startup.
   */
  private async initCache(): Promise<void> {
    const eagerLoad = process.env.GOODVIBES_EAGER_LOAD === 'true';

    if (eagerLoad) {
      logger.info('Eager loading indexes from', PLUGIN_ROOT);
      await this.indexCache.warmAll();
    } else {
      logger.info('Lazy loading enabled - indexes will be loaded on first access', {
        plugin_root: PLUGIN_ROOT,
      });
    }
  }

  /**
   * Get registry context with lazy-loaded indexes.
   */
  private async getContext(): Promise<RegistryContext> {
    return this.indexCache.getContext();
  }

  private setupRoutes(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      logger.debug('ListTools request');
      return { tools: TOOL_SCHEMAS };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      logger.request(name, args);

      if (!hasDispatcher(name)) {
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${name}. Available: ${listTools().join(', ')}`
        );
      }

      const dispatcher = getDispatcher(name)!;

      try {
        const ctx = await this.getContext();
        return await dispatcher(ctx, args);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Tool ${name} failed`, { error: message, args });
        throw new McpError(ErrorCode.InternalError, `Tool ${name} failed: ${message}`);
      }
    });
  }

  private setupLifecycle(): void {
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

    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception (process kept alive)', { message: error.message, stack: error.stack });
    });
    process.on('unhandledRejection', (reason) => {
      logger.error('Unhandled rejection (process kept alive)', {
        message: reason instanceof Error ? reason.message : String(reason),
      });
    });
    process.stdin.on('close', () => {
      logger.info('stdin closed — client disconnected');
      this.stop().finally(() => process.exit(0));
    });
  }

  async start(): Promise<void> {
    await this.initCache();

    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    logger.info(`${SERVER_NAME} v${SERVER_VERSION} started`);
    logger.info(`Tools: ${listTools().join(', ')}`);
  }

  async stop(): Promise<void> {
    await this.server.close();
  }
}

export async function bootstrap(): Promise<void> {
  const server = new RegistryEngineServer();
  await server.start();
}
