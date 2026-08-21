/**
 * Analytics Engine, Library Entry Point
 *
 * Initializes the analytics daemon (Aggregator) and exposes 7 MCP tools
 * for session intelligence, budget tracking, and data export.
 *
 * Usage: `import { AnalyticsEngine } from './index.js'`, instantiate and manage lifecycle.
 */

import type { AnalyticsConfig, ToolResponse } from './types.js';
import { toolResponse } from './types.js';
import { loadConfig } from './config.js';
import { engineLogger } from './runtime.js';
import { Aggregator } from './daemon/aggregator.js';
import { GlobalDB, SqlJsUnavailableError } from './data/global-db.js';
import { initializeGlobalDb } from './data/db-init.js';
import { nativeDepMessage } from '@goodvibes/core/envelope';
import {
  TOOL_DEFINITIONS,
  AnalyticsDashboardInput,
  AnalyticsQueryInput,
  AnalyticsBudgetInput,
  AnalyticsTagInput,
  AnalyticsExportInput,
  AnalyticsConfigInput,
  AnalyticsSyncInput,
} from './schemas/tools.js';

// ============================================================
// Types
// ============================================================

/** Tool name union derived from TOOL_DEFINITIONS. */
export type ToolName = keyof typeof TOOL_DEFINITIONS;

// ============================================================
// Schema map for input validation
// ============================================================

const SCHEMA_MAP = {
  analytics_dashboard: AnalyticsDashboardInput,
  analytics_query:     AnalyticsQueryInput,
  analytics_budget:    AnalyticsBudgetInput,
  analytics_tag:       AnalyticsTagInput,
  analytics_export:    AnalyticsExportInput,
  analytics_config:    AnalyticsConfigInput,
  analytics_sync:      AnalyticsSyncInput,
} as const satisfies Record<ToolName, unknown>;

// ============================================================
// Tool definitions helper
// ============================================================

/**
 * Return the list of tool definitions for MCP server registration.
 *
 * Each entry includes the tool name, description, and its Zod inputSchema
 * (the MCP SDK accepts Zod schemas directly for validation).
 *
 * @returns Array of tool definition objects.
 */
export function getToolDefinitions(): Array<{
  name: string;
  description: string;
  inputSchema: unknown;
}> {
  return Object.values(TOOL_DEFINITIONS).map((def) => ({
    name: def.name,
    description: def.description,
    inputSchema: def.inputSchema,
  }));
}

// ============================================================
// AnalyticsEngine class
// ============================================================

/**
 * Core analytics engine, manages the Aggregator lifecycle and routes
 * incoming MCP tool calls to the appropriate handler.
 *
 * Designed for library usage: instantiate, call `initialize()`, then
 * dispatch tool calls via `handleToolCall()`. Call `shutdown()` on exit.
 *
 * @example
 * ```ts
 * const engine = new AnalyticsEngine('.goodvibes');
 * await engine.initialize();
 * const result = await engine.handleToolCall('analytics_query', { scope: 'tokens', ... });
 * await engine.shutdown();
 * ```
 */
export class AnalyticsEngine {
  private readonly aggregator: Aggregator;
  private readonly config: AnalyticsConfig;
  private readonly goodvibesDir: string;
  private initialized = false;
  private globalDb: GlobalDB | null = null;
  /**
   * Set when the global analytics DB could not be opened because `sql.js` is
   * not installed yet (fresh install / post-update). The engine still
   * initializes so the live JSONL-based modes (live_cost/doctor/agents) work;
   * cross-project / historical modes surface this reason instead of crashing.
   */
  private globalDbUnavailableReason: string | null = null;

  /**
   * @param goodvibesDir - Path to the .goodvibes directory (absolute or
   *   relative to process.cwd()). Analytics config is read from here.
   */
  constructor(goodvibesDir: string) {
    this.goodvibesDir = goodvibesDir;
    this.config = loadConfig(goodvibesDir);
    this.aggregator = new Aggregator(goodvibesDir, this.config);
  }

  /**
   * Initialize the aggregator and underlying data watchers.
   * Must be called before `handleToolCall()`.
   *
   * @throws If the aggregator fails to initialize.
   */
  async initialize(): Promise<void> {
    // On a fresh install (or a post-update install that has not run setup
    // yet) sql.js is missing and this throws; that must NOT sink the whole
    // engine, since the live modes read JSONL/proc and need no native dep.
    // Degrade to a null global DB and record the reason; DB-backed modes
    // surface the setup pointer, live modes work.
    try {
      this.globalDb = await initializeGlobalDb();
    } catch (err) {
      this.globalDb = null;
      this.globalDbUnavailableReason =
        err instanceof SqlJsUnavailableError
          ? nativeDepMessage('Cross-project analytics history')
          : `Cross-project analytics history unavailable: ${err instanceof Error ? err.message : String(err)}`;
      engineLogger().warn('GlobalDB unavailable; live modes only', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    this.aggregator.setGlobalDb(this.globalDb);
    await this.aggregator.initialize();
    this.initialized = true;
  }

  /**
   * The reason the global analytics DB is unavailable (native dep not installed
   * yet), or null when it opened normally. Handlers that require the DB use
   * this to return an honest setup-pointer message.
   */
  getGlobalDbUnavailableReason(): string | null {
    return this.globalDbUnavailableReason;
  }

  /**
   * Dispatch an MCP tool call by name.
   *
   * Validates the tool name and input schema before invoking the handler.
   * Returns a structured `ToolResponse`, never throws.
   *
   * @param name - MCP tool name (e.g. `"analytics_query"`).
   * @param args - Raw (unvalidated) arguments from the MCP client.
   * @returns Tool response with content and optional `isError` flag.
   */
  async handleToolCall(name: string, args: unknown): Promise<ToolResponse> {
    if (!this.initialized) {
      return toolResponse('Analytics engine not initialized. Call initialize() first.', true);
    }

    if (!(name in SCHEMA_MAP)) {
      return toolResponse(`Unknown analytics tool: ${name}`, true);
    }

    const schema = SCHEMA_MAP[name as ToolName];
    const parseResult = (schema as { safeParse: (v: unknown) => { success: boolean; data?: unknown; error?: { issues: Array<{ path: (string | number)[]; message: string }> } } }).safeParse(args);
    if (!parseResult.success) {
      const errors = (parseResult.error?.issues ?? []).map(
        (i) => `${i.path.join('.')}: ${i.message}`,
      ).join('; ');
      return toolResponse(`Validation error: ${errors}`, true);
    }

    // Dynamically import handler registry so this module can be imported
    // before handlers are compiled (tree-shaking friendly).
    // HandlerFn is structurally compatible with ToolResponse return type (both have content + optional isError).
    try {
      const { HANDLER_REGISTRY } = await import('./handlers/index.js');
      const handler = HANDLER_REGISTRY[name];
      if (!handler) {
        return toolResponse(`No handler registered for tool: ${name}`, true);
      }
      return await handler(this.aggregator, parseResult.data, this.goodvibesDir) as ToolResponse;
    } catch (err: unknown) {
      // A handler that needs the SQLite-backed store (sync, tag, cross-project
      // query) fails with a typed error when sql.js is not installed yet,
      // return the honest setup pointer instead of a raw "module not found".
      if (err instanceof SqlJsUnavailableError) {
        return toolResponse(nativeDepMessage(`analytics ${name} (historical / cross-project data)`), true);
      }
      const message = err instanceof Error ? err.message : String(err);
      return toolResponse(`Handler error: ${message}`, true);
    }
  }

  /**
   * Gracefully shut down the aggregator and release all resources.
   * Safe to call multiple times.
   */
  async shutdown(): Promise<void> {
    await this.aggregator.shutdown();
    this.globalDb?.close();
    this.globalDb = null;
    this.initialized = false;
  }

  /**
   * Expose the underlying Aggregator for direct state access by TUI renderers.
   * @returns The Aggregator instance.
   */
  getAggregator(): Aggregator {
    return this.aggregator;
  }

  /**
   * Return the global analytics database instance.
   *
   * @throws {Error} If the engine has not been initialized.
   */
  getGlobalDb(): GlobalDB {
    if (!this.globalDb) {
      throw new Error('AnalyticsEngine: not initialized. Call initialize() first.');
    }
    return this.globalDb;
  }

  /**
   * Return the resolved analytics configuration (DEFAULT_CONFIG merged with
   * any values loaded from `analytics.json`).
   * @returns The active AnalyticsConfig.
   */
  getConfig(): AnalyticsConfig {
    return this.config;
  }
}

// ============================================================
// Default export
// ============================================================

export default AnalyticsEngine;

