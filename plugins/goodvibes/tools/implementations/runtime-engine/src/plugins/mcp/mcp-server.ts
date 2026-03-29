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
import { RemoteTransport } from '../../transport/remote-transport.js';
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
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;
  private healthCheckInProgress = false;

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
        getTimePlugin: () => this.processManager?.getTimePlugin?.() ?? null,
        getExternalPlugin: () => this.processManager?.getExternalPlugin?.() ?? null,
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

    // Prevent unhandled errors from killing the MCP server process.
    // An unhandled rejection from any async path silently crashes the process,
    // and Claude Code sees a dead pipe / "MCP server disconnected".
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception (process kept alive)', {
        message: error.message,
        stack: error.stack,
        name: error.name,
      });
    });

    process.on('unhandledRejection', (reason) => {
      const message = reason instanceof Error ? reason.message : String(reason);
      const stack = reason instanceof Error ? reason.stack : undefined;
      logger.error('Unhandled rejection (process kept alive)', { message, stack });
    });

    // Detect when the client closes stdin — graceful shutdown prevents zombies.
    process.stdin.on('close', () => {
      logger.info('stdin closed — client disconnected, shutting down');
      this.stop().finally(() => process.exit(0));
    });
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
    logger.info('Starting runtime engine server', {
      projectRoot,
      source: process.env.CLAUDE_PROJECT_DIR ? 'CLAUDE_PROJECT_DIR' : 'cwd',
    });
    ensureRuntimeSections(projectRoot);
    const config = loadConfig(projectRoot);
    logger.info('Config loaded', {
      mode: config.executor.mode,
      http_listener_enabled: config.external?.http_listener?.enabled ?? false,
      http_listener_port: config.external?.http_listener?.port,
    });
    const mode = config.executor.mode;

    if (mode === 'daemon') {
      // Pure daemon mode: no local engine, connect to daemon
      await this.ensureDaemonRunning(projectRoot, config);
      this.runtimeTransport = await createTransport(this.buildDaemonTransportOptions(projectRoot, config));
      this.startHealthCheck(projectRoot, config);
    } else if (mode === 'hybrid') {
      // Hybrid: try daemon first, create local engine only if daemon unavailable.
      // Always create a local engine with IPC socket — hooks need it regardless
      // of whether the daemon transport is used for MCP tool routing.
      let usedDaemon = false;
      if (config.executor.transport?.auto_start) {
        try {
          await this.ensureDaemonRunning(projectRoot, config);
          this.runtimeTransport = await createTransport(this.buildDaemonTransportOptions(projectRoot, config));
          this.startHealthCheck(projectRoot, config);
          usedDaemon = true;
        } catch {
          // Daemon unavailable — fall through to local engine
        }
      }
      if (!usedDaemon) {
        // Local engine: creates IPC socket for hook communication
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

  private buildDaemonTransportOptions(
    projectRoot: string,
    config: ReturnType<typeof loadConfig>,
  ): Parameters<typeof createTransport>[0] {
    const reconnectCfg = config.executor.transport?.reconnect;
    return {
      mode: 'daemon' as const,
      projectRoot,
      connectTimeoutMs: config.executor.transport?.rpc_timeout_ms,
      sessionId: this.getSessionId(),
      reconnect: reconnectCfg ? {
        enabled: reconnectCfg.enabled ?? true,
        maxAttempts: reconnectCfg.max_attempts ?? 10,
        baseDelayMs: reconnectCfg.base_delay_ms ?? 100,
        maxDelayMs: reconnectCfg.max_delay_ms ?? 10_000,
      } : { enabled: true, maxAttempts: 10, baseDelayMs: 100, maxDelayMs: 10_000 },
      onDead: (error) => this.handleTransportDead(projectRoot, config, error),
    };
  }

  // ─── Health Check ────────────────────────────────────────────────────────────

  private startHealthCheck(
    projectRoot: string,
    config: ReturnType<typeof loadConfig>,
  ): void {
    if (this.healthCheckTimer) return;
    const intervalMs = config.executor.transport?.health_check_interval_ms ?? 10_000;

    this.healthCheckTimer = setInterval(async () => {
      if (this.healthCheckInProgress) return;
      if (!this.runtimeTransport || this.runtimeTransport.mode !== 'remote') return;

      const remote = this.runtimeTransport as RemoteTransport;
      const state = remote.getConnectionState();

      // Skip if already reconnecting or connecting
      if (state === 'reconnecting' || state === 'connecting') return;

      // If dead or idle, attempt recovery
      if (state === 'dead' || state === 'idle') {
        this.healthCheckInProgress = true;
        try {
          await this.recoverTransport(projectRoot, config);
        } finally {
          this.healthCheckInProgress = false;
        }
        return;
      }

      // If connected, ping to verify liveness
      if (state === 'connected') {
        this.healthCheckInProgress = true;
        try {
          await remote.getUptime();
        } catch (err) {
          logger.warn('Health check ping failed — transport will reconnect', { error: toErrorMessage(err) });
        } finally {
          this.healthCheckInProgress = false;
        }
      }
    }, intervalMs);
    this.healthCheckTimer.unref();
  }

  private async recoverTransport(
    projectRoot: string,
    config: ReturnType<typeof loadConfig>,
  ): Promise<void> {
    logger.info('Attempting daemon transport recovery');

    if (this.runtimeTransport) {
      try { await this.runtimeTransport.disconnect(); } catch (err) {
        logger.debug('Disconnect during recovery failed', { error: toErrorMessage(err) });
      }
    }

    try {
      await this.ensureDaemonRunning(projectRoot, config);
    } catch (err) {
      logger.warn('Failed to ensure daemon running during recovery', { error: toErrorMessage(err) });
    }

    try {
      this.runtimeTransport = await createTransport(this.buildDaemonTransportOptions(projectRoot, config));
      logger.info('Daemon transport recovered successfully');
    } catch (err) {
      logger.warn('Daemon transport recovery failed', { error: toErrorMessage(err) });
    }
  }

  private handleTransportDead(
    _projectRoot: string,
    _config: ReturnType<typeof loadConfig>,
    error: Error,
  ): void {
    logger.warn('Transport declared dead, health check will attempt recovery', { error: error.message });
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

    // Stop health check timer
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    // Disconnect runtime transport
    if (this.runtimeTransport) {
      try { await this.runtimeTransport.disconnect(); } catch (err) {
        logger.debug('Disconnect during stop failed', { error: toErrorMessage(err) });
      }
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
