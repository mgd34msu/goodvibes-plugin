/**
 * PrecisionRuntime — Central lifecycle coordinator for the precision engine.
 *
 * Provides a unified initialization point that wires together:
 * - RuntimeConfig (existing functional API, referenced not replaced)
 * - KVState (Phase 2E session state KV store)
 * - Telemetry (Phase 2D SQLite call tracking)
 * - ProjectIndex (existing project-index singleton)
 * - SessionInfo (lightweight session metadata)
 *
 * Design principles:
 * 1. Does NOT replace existing singletons — wraps/references them.
 * 2. `static get()` returns null if not initialized — tools degrade gracefully.
 * 3. HooksManager (Phase 4) and ModeManager (Phase 5, implemented) are integrated.
 * 4. Every tool checks PrecisionRuntime.get() and falls back if null.
 */

import { Telemetry } from './telemetry.js';
import { KVState } from './kv-state.js';
import { ProjectIndex } from './project-index.js';
import { HooksManager } from './hooks.js';
import { DossierGenerator } from './dossier.js';
import { ModeManager } from './mode-manager.js';
import { getConfig } from '../runtime-config.js';
import type { PrecisionEngineConfig } from '../runtime-config.js';
import { logger } from '../logging.js';

// ───────────────────────────────────────────────────────────────────────────
// Public interfaces
// ───────────────────────────────────────────────────────────────────────────

/**
 * Lightweight session metadata tracked by PrecisionRuntime.
 * Session ID is sourced from the Telemetry singleton for consistency.
 */
export interface SessionInfo {
  /** 8-char hex session identifier (sourced from Telemetry). */
  readonly id: string;
  /** ISO 8601 timestamp of when the runtime was initialized. */
  readonly startedAt: string;
  /** Running count of tool calls dispatched through the runtime wrapper. */
  toolCalls: number;  // intentionally mutable
}

/**
 * Re-export ModeManager for consumers of precision-runtime.
 */
export { ModeManager } from './mode-manager.js';

// ───────────────────────────────────────────────────────────────────────────
// PrecisionRuntime
// ───────────────────────────────────────────────────────────────────────────

/**
 * PrecisionRuntime is the central coordination singleton for the precision engine.
 *
 * Usage:
 *   // Server startup
 *   const runtime = await PrecisionRuntime.initialize();
 *
 *   // Within tool handlers (graceful degradation)
 *   const runtime = PrecisionRuntime.get();
 *   if (runtime) {
 *     const id = runtime.generateId('precision_read');
 *   }
 */
export class PrecisionRuntime {
  // Singleton state

  /** The singleton instance, or null if not yet initialized. */
  private static instance: PrecisionRuntime | null = null;

  // Subsystem references

  /**
   * RuntimeConfig snapshot — captured at initialization time.
   * Reflects config at server startup (file + env + defaults).
   */
  readonly config: PrecisionEngineConfig;

  /**
   * KVState singleton — persistent session key-value store.
   */
  readonly state: KVState;

  /**
   * Telemetry singleton — SQLite-backed call tracking.
   */
  readonly telemetry: Telemetry;

  /**
   * ProjectIndex singleton — in-memory project file index.
   */
  readonly index: ProjectIndex;

  /**
   * HooksManager singleton — Phase 4G hooks system.
   */
  readonly hooks: HooksManager;

  /**
   * DossierGenerator — Phase 5H agent context package generator.
   */
  readonly dossier: DossierGenerator;

  /**
   * ModeManager — Phase 5 mode-specific defaults and enforcement.
   */
  readonly modeManager: ModeManager;

  /**
   * Lightweight session metadata for this server startup.
   */
  readonly session: SessionInfo;

  // Construction

  /**
   * Private constructor — use PrecisionRuntime.initialize() instead.
   */
  private constructor(
    config: PrecisionEngineConfig,
    state: KVState,
    telemetry: Telemetry,
    index: ProjectIndex,
    hooks: HooksManager,
    dossier: DossierGenerator,
    modeManager: ModeManager,
  ) {
    this.config = config;
    this.state = state;
    this.telemetry = telemetry;
    this.index = index;
    this.hooks = hooks;
    this.dossier = dossier;
    this.modeManager = modeManager;
    this.session = {
      id: telemetry.getSessionId(),
      startedAt: new Date().toISOString(),
      toolCalls: 0,
    };
  }

  // Lifecycle

  /**
   * Initialize the PrecisionRuntime singleton.
   *
   * - Loads and validates configuration
   * - Connects the KVState, Telemetry, and ProjectIndex singletons
   * - Triggers a background load of the ProjectIndex
   *
   * Safe to call multiple times — returns the existing instance if already
   * initialized rather than creating a second one.
   */
  static async initialize(): Promise<PrecisionRuntime> {
    if (PrecisionRuntime.instance) {
      logger.debug('[PrecisionRuntime] Already initialized — returning existing instance');
      return PrecisionRuntime.instance;
    }

    logger.debug('[PrecisionRuntime] Initializing subsystems...');

    // Config — load from disk (async) then retrieve synchronously
    try {
      const { loadConfig } = await import('../runtime-config.js');
      await loadConfig();
    } catch (err) {
      // Non-fatal: config will fall back to defaults
      logger.warn('[PrecisionRuntime] Config load warning', { err: String(err) });
    }
    const config = getConfig();

    // Telemetry — async WASM init, then synchronous from here
    await Telemetry.initialize();
    const telemetry = Telemetry.getInstance();

    // KVState — initialize with the Telemetry session ID so both subsystems
    // share the same session identifier. Must be called before getInstance().
    const state = KVState.initWithSessionId(telemetry.getSessionId());

    // ProjectIndex — trigger background load (non-blocking)
    const index = ProjectIndex.getInstance();
    index.load().catch((err: unknown) => {
      logger.warn('[PrecisionRuntime] ProjectIndex background load failed', { err: String(err) });
    });

    // HooksManager — load config (non-blocking on failure)
    const hooks = HooksManager.getInstance();
    hooks.loadFromConfig().catch((err: unknown) => {
      logger.warn('[PrecisionRuntime] HooksManager config load failed — using built-in hooks only', { err: String(err) });
    });

    // KVState session metrics — initialize counters once at startup so that
    // per-call auto-tracking never needs to handle the "undefined" case.
    // Fire-and-forget: consumers in index.ts MUST provide fallback defaults
    // when reading session counters, since this set() may not have settled
    // before the first tool call arrives. See executeHandler() typeof guards.
    state.set({ 'session.agents_spawned': 0 }).catch((err: unknown) => {
      logger.warn('[PrecisionRuntime] KVState agents_spawned init failed (non-fatal)', { err: String(err) });
    });

    // DossierGenerator — Phase 5H agent context package generator
    const dossier = new DossierGenerator(index);

    // ModeManager — Phase 5 mode defaults and enforcement
    const modeManager = ModeManager.getInstance();

    PrecisionRuntime.instance = new PrecisionRuntime(config, state, telemetry, index, hooks, dossier, modeManager);
    logger.info('[PrecisionRuntime] Initialized', {
      sessionId: PrecisionRuntime.instance.session.id,
      startedAt: PrecisionRuntime.instance.session.startedAt,
    });

    return PrecisionRuntime.instance;
  }

  /**
   * Return the current singleton instance, or null if not yet initialized.
   *
   * Tools should check for null and degrade gracefully:
   *   const runtime = PrecisionRuntime.get();
   *   if (!runtime) {
   *     // operate as before — no telemetry, no precision_id
   *   }
   */
  static get(): PrecisionRuntime | null {
    return PrecisionRuntime.instance;
  }

  /**
   * Reset the singleton instance.
   *
   * Intended for testing only — does NOT shut down subsystems (call shutdown()
   * first if you need a clean state). Use in beforeEach/afterEach hooks.
   */
  static resetInstance(): void {
    PrecisionRuntime.instance = null;
  }

  // Convenience methods

  /**
   * Generate a precision_id for a tool call.
   * Format: "{shortTool}_{sessionId}_{uniqueHex}"
   *
   * Delegates to Telemetry.generateId() for consistent ID format.
   */
  generateId(tool: string): string {
    return this.telemetry.generateId(tool);
  }

  /**
   * Return the 8-char hex session ID for this server startup.
   */
  getSessionId(): string {
    return this.session.id;
  }

  // KVState convenience methods

  /**
   * Get values from the KVState store by key array.
   */
  async getState(keys: string[]): Promise<Record<string, unknown>> {
    return this.state.get(keys);
  }

  /**
   * Set values in the KVState store.
   */
  async setState(values: Record<string, unknown>): Promise<void> {
    return this.state.set(values);
  }

  // Shutdown

  /**
   * Gracefully shut down all subsystems.
   *
   * - Flushes the ProjectIndex to disk
   * - Closes the Telemetry database connection
   * - Resets all singletons for clean process exit
   *
   * Call this before process.exit() to avoid data loss.
   */
  async shutdown(): Promise<void> {
    logger.info('[PrecisionRuntime] Shutting down...', {
      sessionId: this.session.id,
      toolCalls: this.session.toolCalls,
    });

    // Flush project index first (may have pending writes)
    try {
      await this.index.forceFlush();
    } catch (err) {
      logger.warn('[PrecisionRuntime] ProjectIndex flush failed during shutdown', { err: String(err) });
    }

    // Close Telemetry (closes SQLite connection)
    try {
      Telemetry.resetInstance();
    } catch (err) {
      logger.warn('[PrecisionRuntime] Telemetry shutdown failed', { err: String(err) });
    }

    // Persist KVState before resetting
    try {
      await this.state.persist();
    } catch (err) {
      logger.warn('[PrecisionRuntime] KVState persist failed during shutdown', { err: String(err) });
    }

    // Reset remaining singletons
    try {
      KVState.resetInstance();
    } catch (err) {
      logger.warn('[PrecisionRuntime] KVState shutdown failed', { err: String(err) });
    }

    try {
      ProjectIndex.resetInstance();
    } catch (err) {
      logger.warn('[PrecisionRuntime] ProjectIndex reset failed', { err: String(err) });
    }

    PrecisionRuntime.instance = null;
    ModeManager.resetInstance();
    logger.info('[PrecisionRuntime] Shutdown complete');
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Helper functions for handler dispatch integration
// ───────────────────────────────────────────────────────────────────────────

/**
 * Extract tool-specific metadata for telemetry recording.
 * Used by the handler wrapper in src/index.ts.
 */
export function extractMetadata(
  toolName: string,
  args: unknown,
): Record<string, unknown> {
  const input = args as Record<string, unknown>;
  switch (toolName) {
    case 'precision_read':
      return { files: (input.files as { path: string }[] | undefined)?.map((f) => f.path) };
    case 'precision_write':
      return { files: (input.files as { path: string }[] | undefined)?.map((f) => f.path) };
    case 'precision_edit':
      return {
        files: [
          ...new Set(
            (input.edits as { path?: string; file?: string }[] | undefined)?.map(
              (e) => e.path ?? e.file ?? 'unknown',
            ),
          ),
        ],
      };
    case 'precision_exec':
      return {
        commands: (input.commands as { cmd?: string }[] | undefined)?.map((c) =>
          (c.cmd ?? '').slice(0, 100),
        ),
      };
    case 'precision_grep':
      return { queries: (input.queries as unknown[] | undefined)?.length ?? 0 };
    case 'precision_glob':
      return { patterns: (input.patterns as unknown[] | undefined)?.length ?? 0 };
    case 'discover':
      return { queries: (input.queries as unknown[] | undefined)?.length ?? 0 };
    // args are pre-validated by MCP schemas; `as` casts here are safe
    case 'precision_symbols':
      return { query: input.query, kinds: input.kinds };
    case 'precision_notebook':
      return { path: input.path };
    case 'precision_fetch':
      return { urls: (input.urls as { url: string }[] | undefined)?.length ?? 0 };
    case 'precision_config':
      return { action: input.action, key: input.key };
    default:
      return {};
  }
}

/**
 * Attempt to detect a cache hit from a tool result.
 * Returns false for most tools; can be enhanced per-tool as needed.
 */
export function extractCacheHit(result: unknown): boolean {
  return extractCacheInfo(result).cache_hit;
}

/**
 * Extract cache hit status and bytes saved from a precision-engine tool result.
 *
 * Parses the MCP CallToolResult text content to detect cache indicators.
 * precision_read results contain `cache.status: "unchanged"` and `cache.tokens_saved`
 * when serving from the internal file cache.
 *
 * @returns Object with cache_hit boolean and cache_bytes_saved in bytes.
 */
export function extractCacheInfo(result: unknown): { cache_hit: boolean; cache_bytes_saved: number } {
  const none = { cache_hit: false, cache_bytes_saved: 0 };
  if (!result || typeof result !== 'object') return none;

  // MCP CallToolResult format: { content: [{ type: "text", text: "..." }] }
  const r = result as Record<string, unknown>;
  const content = r.content;
  if (!Array.isArray(content) || content.length === 0) return none;

  const first = (content as Array<{ type?: string; text?: string }>).find(
    (c) => c?.type === 'text' && typeof c?.text === 'string',
  );
  if (!first?.text) return none;

  const text = first.text;

  // Quick string check: cache status "unchanged" is the precision-engine cache hit indicator.
  if (!text.includes('"status": "unchanged"') && !text.includes('"status":"unchanged"')) {
    return none;
  }

  // Found cache hit. Sum tokens_saved across all cached files.
  let totalBytesSaved = 0;
  const pattern = /"tokens_saved":\s*(\d+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    totalBytesSaved += parseInt(match[1], 10) * 4; // tokens → bytes (4 bytes/token)
  }

  return { cache_hit: true, cache_bytes_saved: totalBytesSaved };
}
