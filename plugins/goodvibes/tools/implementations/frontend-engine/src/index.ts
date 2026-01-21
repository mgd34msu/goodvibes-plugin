#!/usr/bin/env node
/**
 * Frontend Engine MCP Server
 *
 * React/CSS analysis tools for frontend development.
 *
 * Tools (11):
 * - get_react_component_tree: Build component hierarchy from JSX/TSX
 * - analyze_stacking_context: Analyze z-index and stacking contexts
 * - analyze_responsive_breakpoints: Analyze Tailwind responsive classes
 * - trace_component_state: Trace React state and props flow
 * - analyze_render_triggers: Identify React re-render causes
 * - analyze_layout_hierarchy: Analyze CSS layout hierarchy
 * - diagnose_overflow: Diagnose CSS overflow issues
 * - get_accessibility_tree: Build accessibility tree and detect WCAG issues
 * - get_sizing_strategy: Analyze element sizing strategy
 * - analyze_event_flow: Analyze event handling and propagation
 * - analyze_tailwind_conflicts: Detect Tailwind class conflicts
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
 * FrontendEngineServer - MCP server for React/CSS analysis tools.
 */
class FrontendEngineServer {
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
  const server = new FrontendEngineServer();
  await server.start();
}

main().catch((error) => {
  logger.error('Failed to start', error);
  process.exit(1);
});
