#!/usr/bin/env node
/**
 * Analysis Engine MCP Server
 *
 * Provides code analysis and intelligence tools for the GoodVibes ecosystem.
 *
 * Tool Categories (20 total):
 *
 * Context (5):
 * - detect_stack: Analyze project technology stack
 * - check_versions: Get installed package versions
 * - scan_patterns: Identify code patterns and conventions
 * - read_config: Parse configuration files
 * - get_conventions: LLM-powered convention analysis
 *
 * Code Intelligence (7):
 * - find_dead_code: Find unused exports using TypeScript LSP
 * - get_api_surface: Analyze public vs internal API surface
 * - safe_delete_check: Confirm zero usages before deletion
 * - detect_breaking_changes: LLM-powered breaking API change detection
 * - semantic_diff: Type-aware semantic diff with impact analysis
 * - validate_edits_preview: Preview TypeScript errors before applying edits
 *
 * Validation & Security (8):
 * - validate_implementation: Check code matches skill patterns
 * - env_audit: Comprehensive environment variable audit
 * - scan_for_secrets: Detect secrets and credentials in code
 * - check_permissions: Analyze file/network/system access patterns
 * - parse_error_stack: Parse and analyze error stack traces
 * - explain_type_error: Explain TypeScript errors with fix suggestions
 * - find_circular_deps: Detect circular import dependencies
 * - identify_tech_debt: Identify and grade technical debt
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
import { ALL_SCHEMAS } from './schemas/index.js';
import { getHandler, hasHandler, listHandlers } from './handlers/registry.js';

/**
 * AnalysisEngineServer - MCP server for code analysis and intelligence.
 */
class AnalysisEngineServer {
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
      return { tools: ALL_SCHEMAS };
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
  const server = new AnalysisEngineServer();
  await server.start();
}

main().catch((error) => {
  logger.error('Failed to start', error);
  process.exit(1);
});
