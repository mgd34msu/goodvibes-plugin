/**
 * L3 Plugin Layer — FrontendEngineServer + bootstrap()
 *
 * Instantiates the MCP server, wires ListTools and CallTool request handlers
 * via the TOOL_SCHEMAS and DISPATCH_TABLE, and provides a bootstrap() function
 * as the single entry point for starting the server.
 *
 * @module plugins/server
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import { SERVER_NAME, SERVER_VERSION } from '../shared/constants.js';
import { logger } from '../shared/logger.js';
import { TOOL_SCHEMAS } from './schemas.js';
import { getDispatcher, listTools } from './dispatch.js';

// =============================================================================
// Server Class
// =============================================================================

/**
 * FrontendEngineServer — MCP server for React/CSS analysis tools.
 *
 * Handles ListTools by returning TOOL_SCHEMAS and CallTool by dispatching
 * through the DISPATCH_TABLE to handler functions.
 */
class FrontendEngineServer {
  private readonly server: Server;

  constructor() {
    this.server = new Server(
      { name: SERVER_NAME, version: SERVER_VERSION },
      { capabilities: { tools: {} } }
    );

    this.setupRoutes();
    this.setupLifecycle();
  }

  /**
   * Wire ListTools and CallTool request handlers.
   */
  private setupRoutes(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      logger.debug('ListTools request');
      return { tools: TOOL_SCHEMAS };
    });

    // Dispatch tool calls to handler functions
    this.server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
      const { name, arguments: args } = request.params;

      logger.tool(name, args);

      const dispatch = getDispatcher(name);
      if (!dispatch) {
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${name}. Available: ${listTools().join(', ')}`
        );
      }

      try {
        return await dispatch(args) as CallToolResult;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Tool ${name} failed`, { error: message, args });
        throw new McpError(ErrorCode.InternalError, `Tool ${name} failed: ${message}`);
      }
    });
  }

  /**
   * Wire error handler and graceful shutdown signals.
   */
  private setupLifecycle(): void {
    this.server.onerror = (error) => logger.error('MCP Server error', error);

    const handleShutdown = async (signal: string): Promise<void> => {
      logger.info(`Shutting down (${signal})`);
      try {
        await this.stop();
        process.exit(0);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error(`Error during shutdown (${signal})`, { error: message });
        process.exit(1);
      }
    };

    process.on('SIGINT', () => handleShutdown('SIGINT'));
    process.on('SIGTERM', () => handleShutdown('SIGTERM'));

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

  /**
   * Connect to stdio transport and begin serving requests.
   */
  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info(`${SERVER_NAME} v${SERVER_VERSION} started`);
    logger.info(`Tools: ${listTools().join(', ')}`);
  }

  /**
   * Close the MCP server connection.
   */
  async stop(): Promise<void> {
    await this.server.close();
  }
}

// =============================================================================
// Bootstrap
// =============================================================================

/**
 * Create and start the FrontendEngineServer.
 *
 * This is the single entry point for launching the MCP server. It instantiates
 * FrontendEngineServer and connects it to the stdio transport.
 *
 * @returns Promise that resolves once the server is connected and running
 *
 * @example
 * ```typescript
 * import { bootstrap } from './plugins/server.js';
 * bootstrap().catch(console.error);
 * ```
 */
export async function bootstrap(): Promise<void> {
  const server = new FrontendEngineServer();
  await server.start();
}
