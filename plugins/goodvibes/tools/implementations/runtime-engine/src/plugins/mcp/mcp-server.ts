/**
 * RuntimeEngineServer — MCP server core for the runtime engine.
 *
 * Wraps the @modelcontextprotocol/sdk Server with:
 * - ListToolsRequestSchema → returns all Phase 1 tool schemas
 * - CallToolRequestSchema  → dispatches to the handler registry
 * - RuntimeEngine lifecycle integration (startup / shutdown)
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

import { createTransport } from '../../transport/factory.js';
import type { RuntimeTransport } from '../../transport/types.js';
import { loadConfig, ensureRuntimeSections } from '../../shared/config.js';
import { ENGINE_VERSION } from '../../shared/constants.js';
import { createLogger } from '../../shared/logger.js';
import { toErrorMessage } from '../../shared/utils.js';
import { RuntimeEngine } from '../../bootstrap.js';
import { setupSignalHandlers } from '../../core/processing/signals.js';
import { DaemonLifecycle } from '../../transport/daemon-lifecycle.js';
import type { HealthStatus } from '../../shared/types.js';
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
  private processManager: RuntimeEngine | null = null;
  private runtimeTransport: RuntimeTransport | null = null;

  constructor() {
    this.server = new Server(
      { name: SERVER_NAME, version: ENGINE_VERSION },
      { capabilities: { tools: {} } }
    );

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
        transport: this.runtimeTransport ?? undefined,
        getUptime: () => this.processManager?.getUptime() ?? 0,
        getConfig: () => this.processManager?.getConfig()
          ?? loadConfig(process.env.CLAUDE_PROJECT_DIR || process.cwd()),
        getHealth: () => this.processManager?.getHealthChecker().check()
          ?? ({ status: 'unhealthy', checks: [] } as unknown as HealthStatus),
        updateConfig: (config) => {
          if (this.processManager) {
            this.processManager.updateConfig(config);
          } else {
            logger.warn(
              'updateConfig called but no local RuntimeEngine (daemon/hybrid mode) — config change will not take effect until restart',
              { transportMode: this.runtimeTransport?.mode ?? 'unknown' },
            );
          }
        },
        projectRoot: this.processManager?.getProjectRoot() ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd(),
        version: ENGINE_VERSION,
        getEventBus: () => this.processManager?.getEventBus() ?? null as any,
        getEventLog: () => this.processManager?.getEventLog() ?? null as any,
        getEventQueue: () => this.processManager?.getEventQueue() ?? null as any,
        getWorkflowEngine: () => this.processManager?.getWorkflowEngine() ?? null,
        getTriggerRegistry: () => this.processManager?.getTriggerRegistry() ?? null,
        getAgentCoordinator: () => this.processManager?.getAgentCoordinator() ?? null,
        getDirectiveQueue: () => this.processManager?.getDirectiveQueue() ?? null,
        getCoreStateStore: () => {
          try { return this.processManager?.getCoreStateStore() ?? null; }
          catch { return null; }
        },
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
   * 1. Run the RuntimeEngine startup sequence (config, state, PID file).
   * 2. Register OS signal handlers for graceful shutdown.
   * 3. Connect the MCP StdioServerTransport.
   * 4. Log the ready message.
   *
   * @throws If the RuntimeEngine startup or transport connection fails.
   */
  async start(): Promise<void> {
    const projectRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    ensureRuntimeSections(projectRoot);
    const config = loadConfig(projectRoot);
    const mode = config.executor.mode;

    if (mode === 'daemon') {
      // Pure daemon mode: no local engine, connect to daemon
      await this.ensureDaemonRunning(projectRoot, config);
      this.runtimeTransport = await createTransport({
        mode: 'daemon',
        projectRoot,
        connectTimeoutMs: config.executor.transport?.rpc_timeout_ms,
        sessionId: this.getSessionId(),
      });
    } else if (mode === 'hybrid') {
      // Hybrid: try daemon first, create local engine only if daemon unavailable
      try {
        await this.ensureDaemonRunning(projectRoot, config);
        this.runtimeTransport = await createTransport({
          mode: 'daemon',
          projectRoot,
          connectTimeoutMs: config.executor.transport?.rpc_timeout_ms,
          sessionId: this.getSessionId(),
        });
        // Daemon available — no local engine needed
      } catch {
        // Daemon unavailable — fall back to local engine
        this.processManager = new RuntimeEngine(config, projectRoot);
        await this.processManager.startup();
        this.runtimeTransport = await createTransport({
          mode: 'engaged',
          engine: this.processManager,
        });
      }
    } else {
      // Engaged (local) mode: unchanged behavior
      this.processManager = new RuntimeEngine(config, projectRoot);
      await this.processManager.startup();
      try {
        this.runtimeTransport = await createTransport({
          engine: this.processManager,
          mode: config.executor.mode,
          projectRoot: this.processManager.getProjectRoot(),
        });
      } catch (err) {
        logger.warn('Transport creation failed, falling back to local transport', {
          mode: config.executor.mode,
          err: toErrorMessage(err),
        });
        this.runtimeTransport = await createTransport({
          engine: this.processManager,
          mode: 'engaged',
        });
      }
    }

    // Register signal handlers
    setupSignalHandlers(async () => {
      await this.stop();
    });

    // Connect MCP transport
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    logger.info(`${SERVER_NAME} v${ENGINE_VERSION} ready`, {
      tools: listHandlers(),
      pid: process.pid,
      transportMode: this.runtimeTransport?.mode ?? 'unknown',
    });
  }

  private getSessionId(): string {
    return process.env.CLAUDE_SESSION_ID
      ?? process.env.SESSION_ID
      ?? `mcp-${process.pid}`;
  }

  private async ensureDaemonRunning(
    projectRoot: string,
    config: ReturnType<typeof loadConfig>,
  ): Promise<void> {
    if (!config.executor.transport?.auto_start) return;
    const lifecycle = new DaemonLifecycle(projectRoot);
    if (await lifecycle.isRunning()) return;
    await lifecycle.start();
  }

  /**
   * Stop the runtime engine:
   * 1. Shut down the RuntimeEngine (checkpoint, PID removal).
   * 2. Close the MCP server transport.
   *
   * Safe to call multiple times — subsequent calls are no-ops once the
   * server has been closed.
   */
  async stop(): Promise<void> {
    logger.info('Stopping runtime engine');

    // Disconnect runtime transport
    if (this.runtimeTransport) {
      try { await this.runtimeTransport.disconnect(); } catch { /* ignore */ }
      this.runtimeTransport = null;
    }

    // Shutdown process manager (saves checkpoint, removes PID file)
    if (this.processManager) {
      try {
        await this.processManager.shutdown();
      } catch (err) {
        logger.warn('RuntimeEngine shutdown error', {
          err: toErrorMessage(err),
        });
      }
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
