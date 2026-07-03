/**
 * goodvibes-analytics MCP server (v2).
 *
 * Wraps the ported analytics engine over stdio and serves the seven tools
 * (`query`, `dashboard`, `budget`, `export`, `tag`, `sync`, `config` — the
 * `analytics_` prefix dropped per R13; the server key is the namespace).
 *
 * Process hygiene (field issue 9) comes from `@goodvibes/core/proc`:
 * `installProcessHygiene()` gives the server a parent-liveness watchdog, idle
 * self-exit, and plain SIGTERM death; every tool call runs under `withBudget`
 * so a slow handler returns with honest `budget_exceeded` accounting instead of
 * hanging the client. All project state lives under the R15-namespaced
 * `.goodvibes/v2/` root via `getStatePath`/`statePath`.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  type CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';
import { installProcessHygiene, withBudget } from '@goodvibes/core/proc';
import { toCallToolResult, errorEnvelope } from '@goodvibes/core/envelope';
import { loadConfig, statePath } from '@goodvibes/core/config';
import { AnalyticsEngine } from './engine/index.js';
import { HostHealthSampler } from './engine/observability/index.js';
import type { ToolModule } from './tools/types.js';
import { queryTool } from './tools/query.js';
import { dashboardTool } from './tools/dashboard.js';
import { budgetTool } from './tools/budget.js';
import { exportTool } from './tools/export.js';
import { tagTool } from './tools/tag.js';
import { syncTool } from './tools/sync.js';
import { configTool } from './tools/config.js';

export const SERVER_NAME = 'analytics';
export const SERVER_VERSION = '2.0.0-alpha.1';

/** The seven analytics tools, in surface order. */
export const TOOL_MODULES: ToolModule[] = [
  queryTool,
  dashboardTool,
  budgetTool,
  exportTool,
  tagTool,
  syncTool,
  configTool,
];

/** Options for {@link createServer} (all optional; defaults suit production). */
export interface CreateServerOptions {
  /** Called on every incoming request to reset the idle-exit timer. */
  onActivity?: () => void;
  /** Project state root; defaults to the R15-namespaced `.goodvibes/v2/`. */
  goodvibesDir?: string;
  /** Invoked when the engine is first constructed, so the caller can shut it down. */
  onEngine?: (engine: AnalyticsEngine) => void;
}

/**
 * Build the configured MCP server. The engine is created and initialized lazily
 * on the first tool call, so the `initialize` handshake and `tools/list` answer
 * immediately without loading the SQLite/WASM layer.
 */
export function createServer(options: CreateServerOptions = {}): Server {
  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } },
  );

  const goodvibesDir = options.goodvibesDir ?? statePath();
  // Downstream engine readers and the tmux dashboard subprocess resolve state
  // from GOODVIBES_DIR; pin it to the v2-namespaced root.
  if (!process.env.GOODVIBES_DIR) process.env.GOODVIBES_DIR = goodvibesDir;

  const budgetMs = loadConfig().budgets.analytics_ms;
  const byName = new Map(TOOL_MODULES.map((m) => [m.name, m]));

  let engine: AnalyticsEngine | null = null;
  let initPromise: Promise<void> | null = null;
  async function getEngine(): Promise<AnalyticsEngine> {
    if (!engine) {
      engine = new AnalyticsEngine(goodvibesDir);
      options.onEngine?.(engine);
    }
    if (!initPromise) initPromise = engine.initialize();
    await initPromise;
    return engine;
  }

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    options.onActivity?.();
    return {
      tools: TOOL_MODULES.map((m) => ({
        name: m.name,
        description: m.description,
        inputSchema: m.inputSchema,
      })),
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
    options.onActivity?.();
    const mod = byName.get(request.params.name);
    if (!mod) {
      return toCallToolResult(errorEnvelope(`Unknown tool: ${request.params.name}`));
    }

    try {
      const eng = await getEngine();
      const outcome = await withBudget(budgetMs, async () =>
        eng.handleToolCall(mod.engineTool, request.params.arguments ?? {}),
      );
      const resp = outcome.value;
      const content = [...resp.content];
      if (outcome.budget_exceeded) {
        content.push({
          type: 'text',
          text: `\n[budget_exceeded: analytics time budget of ${budgetMs}ms elapsed after ${outcome.elapsed_ms}ms]`,
        });
      }
      return { content, isError: resp.isError };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return toCallToolResult(errorEnvelope(`Tool ${mod.name} failed: ${message}`));
    }
  });

  return server;
}

/** Boot over stdio with the process-hygiene watchdogs installed. */
export async function main(): Promise<void> {
  const cfg = loadConfig();
  const goodvibesDir = process.env.GOODVIBES_DIR ?? statePath();
  let engineRef: AnalyticsEngine | null = null;

  // Host-health sampler (lane 9): slow, unref'd, zero-dep /proc reader that
  // maintains `.goodvibes/v2/health/health-state.json` for the doctor view and
  // intel's SessionStart nudge. Its interval is unref'd, so it can never be the
  // thing that keeps a dead server alive (field issue 9 — the sin it hunts).
  const healthSampler = new HostHealthSampler({ goodvibesDir });
  healthSampler.start();

  const hygiene = installProcessHygiene({
    ppidPollMs: cfg.ppid_poll_ms,
    onShutdown: async () => {
      healthSampler.stop();
      // Best-effort: flush and release the engine's DB/watchers before exit.
      try {
        await engineRef?.shutdown();
      } catch {
        /* never block or cancel the exit */
      }
    },
  });

  const server = createServer({
    goodvibesDir,
    onActivity: () => hygiene.noteActivity(),
    onEngine: (e) => {
      engineRef = e;
    },
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (!process.env.VITEST) {
  void main().catch((err) => {
    console.error(`[${SERVER_NAME}] fatal:`, err);
    process.exit(1);
  });
}
