#!/usr/bin/env node
/**
 * Project Engine MCP Server
 *
 * Project operations for GoodVibes - scaffolding, database, API, dependencies, tests.
 *
 * Tool Categories (17 tools):
 * - Scaffolding (2): scaffold_project, list_templates
 * - Project Info (3): plugin_status, project_issues, explain_codebase
 * - Database & API (5): get_database_schema, get_api_routes, get_prisma_operations, query_database, generate_openapi
 * - Dependencies (3): analyze_dependencies, analyze_bundle, upgrade_package
 * - Types & Fixtures (3): generate_types, generate_fixture, sync_api_types
 * - Tests (3): find_tests_for_file, get_test_coverage, suggest_test_cases
 * - Git (1): resolve_merge_conflict
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

/**
 * ProjectEngineServer - MCP server for project operations.
 */
class ProjectEngineServer {
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
    await this.server.close();
  }
}

async function main(): Promise<void> {
  const server = new ProjectEngineServer();
  await server.start();
}

main().catch((error) => {
  logger.error('Failed to start', error);
  process.exit(1);
});
