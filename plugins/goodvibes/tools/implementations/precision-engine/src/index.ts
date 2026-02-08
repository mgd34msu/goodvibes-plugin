#!/usr/bin/env node
/**
 * Precision Engine MCP Server - SPEC-v2
 *
 * Token-efficient file operations with configurable output modes.
 *
 * SPEC-v2 Tools (9):
 * - precision_grep: Search with precise output control
 * - precision_read: Read files with extraction modes
 * - precision_glob: Find files with intelligent filtering
 * - precision_symbols: Search and analyze code symbols
 * - precision_edit: Atomic file editing with validation
 * - precision_write: Create/write files with encoding support
 * - precision_exec: Execute shell commands with expectations
 * - precision_fetch: Fetch URLs with extraction modes
 * - discover: Lightweight parallel query execution
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

import { SERVER_NAME, SERVER_VERSION } from './config.js';
import { logger } from './logging.js';
import { allSchemas } from './schemas/index.js';
import { getHandler, hasHandler, listHandlers } from './handlers/index.js';
import { FileStateCache } from './state/file-cache.js';
import { sessionState } from './state/index.js';

/**
 * PrecisionEngineServer - MCP server for token-efficient file operations.
 */
class PrecisionEngineServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      { name: SERVER_NAME, version: SERVER_VERSION },
      { capabilities: { tools: {} } }
    );

    this.setupHandlers();
    this.setupErrorHandling();
  }

  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      logger.debug('ListTools request');
      return { tools: allSchemas };
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
        return await handler(args);
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
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info(`${SERVER_NAME} v${SERVER_VERSION} started`);
    logger.info(`Tools: ${listHandlers().join(', ')}`);
  }

  async stop(): Promise<void> {
    // Clear file state cache on shutdown
    try {
      const cache = FileStateCache.getInstance();
      const stats = cache.getStats();
      logger.info('FileStateCache session stats', stats);
      cache.clear();
    } catch {
      // Cache may not have been initialized
    }

    // Reset session state on shutdown
    try {
      sessionState.reset();
      logger.info('Session state reset');
    } catch {
      // Session state may not have been initialized
    }

    await this.server.close();
  }
}

async function main(): Promise<void> {
  const server = new PrecisionEngineServer();
  await server.start();
}

main().catch((error) => {
  logger.error('Failed to start', error);
  process.exit(1);
});
