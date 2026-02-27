/**
 * RuntimeEngineServer — MCP server core for the runtime engine.
 *
 * Wraps the @modelcontextprotocol/sdk Server with:
 * - ListToolsRequestSchema → returns all Phase 1 tool schemas
 * - CallToolRequestSchema  → dispatches to the handler registry
 * - ProcessManager lifecycle integration (startup / shutdown)
 * - Signal handler registration via setupSignalHandlers
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

import { loadConfig } from '../shared/config.js';
import { ENGINE_VERSION } from '../shared/constants.js';
import { createLogger } from '../shared/logger.js';
import { toErrorMessage } from '../shared/utils.js';
import { ProcessManager } from '../lifecycle/process-manager.js';
import { setupSignalHandlers } from '../lifecycle/signals.js';
import {
  allSchemas,
  getHandler,
  listHandlers,
} from './tool-handlers.js';
import type { HandlerContext } from './tool-handlers.js';

const SERVER_NAME = 'goodvibes-runtime-engine';

const logger = createLogger('mcp-server');

/**
 * RuntimeEngineServer manages the MCP server lifecycle and routes tool
 * calls to registered handler implementations.
 *
 * Usage:
 * ```typescript
 * const server = new RuntimeEngineServer();
 * await server.start();
 * ```
 */
export class RuntimeEngineServer {
  private readonly server: Server;
  private readonly processManager: ProcessManager;

  constructor() {
    this.server = new Server(
      { name: SERVER_NAME, version: ENGINE_VERSION },
      { capabilities: { tools: {} } }
    );

    const projectRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    this.processManager = new ProcessManager(loadConfig(projectRoot), projectRoot);

    this.setupHandlers();
    this.setupErrorHandling();
  }

  // ─── Setup ──────────────────────────────────────────────────────────────────

  /**
   * Register MCP request handlers for ListTools and CallTool.
   */
  private setupHandlers(): void {
    // List available tools — return all Phase 1 schemas
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      logger.debug('ListTools request');
      return { tools: allSchemas };
    });

    // Dispatch tool calls to registered handlers
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      logger.debug('CallTool request', { name });

      const handler = getHandler(name);
      if (!handler) {
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${name}. Available: ${listHandlers().join(', ')}`
        );
      }

      const ctx: HandlerContext = {
        getUptime: () => this.processManager.getUptime(),
        getConfig: () => this.processManager.getConfig(),
        getHealth: () => this.processManager.getHealthChecker().check(),
        updateConfig: (config) => this.processManager.updateConfig(config),
        projectRoot: this.processManager.getProjectRoot(),
        version: ENGINE_VERSION,
        getEventBus: () => this.processManager.getEventBus(),
        getEventLog: () => this.processManager.getEventLog(),
        getEventQueue: () => this.processManager.getEventQueue(),
        getWorkflowEngine: () => this.processManager.getWorkflowEngine(),
        getTriggerRegistry: () => this.processManager.getTriggerRegistry(),
        getAgentCoordinator: () => this.processManager.getAgentCoordinator(),
        getDirectiveQueue: () => this.processManager.getDirectiveQueue(),
      };

      try {
        return await handler(args, ctx);
      } catch (error) {
        if (error instanceof McpError) throw error;
        const message = toErrorMessage(error);
        logger.error(`Tool ${name} failed`, { error: message });
        throw new McpError(
          ErrorCode.InternalError,
          `Tool ${name} failed: ${message}`
        );
      }
    });
  }

  /**
   * Attach the MCP server error handler and register OS signal handlers.
   */
  private setupErrorHandling(): void {
    this.server.onerror = (error) =>
      logger.error('MCP Server error', { error: String(error) });
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  /**
   * Start the runtime engine:
   * 1. Run the ProcessManager startup sequence (config, state, PID file).
   * 2. Register OS signal handlers for graceful shutdown.
   * 3. Connect the MCP StdioServerTransport.
   * 4. Log the ready message.
   *
   * @throws If the ProcessManager startup or transport connection fails.
   */
  async start(): Promise<void> {
    // 1. Startup sequence
    await this.processManager.startup();

    // 2. Register signal handlers — must happen after processManager is ready
    setupSignalHandlers(async () => {
      await this.stop();
    });

    // 3. Connect MCP transport
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    // 4. Ready
    logger.info(`${SERVER_NAME} v${ENGINE_VERSION} ready`, {
      tools: listHandlers(),
      pid: process.pid,
    });
  }

  /**
   * Stop the runtime engine:
   * 1. Shut down the ProcessManager (checkpoint, PID removal).
   * 2. Close the MCP server transport.
   *
   * Safe to call multiple times — subsequent calls are no-ops once the
   * server has been closed.
   */
  async stop(): Promise<void> {
    logger.info('Stopping runtime engine');

    // Shutdown process manager (saves checkpoint, removes PID file)
    try {
      await this.processManager.shutdown();
    } catch (err) {
      logger.warn('ProcessManager shutdown error', {
        err: toErrorMessage(err),
      });
    }

    // Close MCP server
    try {
      await this.server.close();
    } catch (err) {
      logger.warn('MCP server close error', {
        err: toErrorMessage(err),
      });
    }

    logger.info('Runtime engine stopped');
  }
}
