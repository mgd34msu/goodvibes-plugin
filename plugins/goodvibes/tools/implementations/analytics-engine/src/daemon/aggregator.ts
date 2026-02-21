/**
 * Aggregator — Central state aggregator for the analytics-engine daemon.
 *
 * Composes all data readers (TelemetryReader, SessionReader, IndexReader,
 * JSONLReader) and daemon components (AnomalyDetector, BudgetTracker,
 * MemoryUpdater) into a unified DashboardState. Drives event-driven
 * refreshes via DataWatcher.
 *
 * Phase 2 additions:
 *   - JSONLReader integration: API tokens, tool calls, agent activity
 *   - GlobalDB integration: live session-summary upserts (debounced)
 *   - Session ID resolution from active JSONL filename
 *   - reloadConfig() for hot-reload support
 *
 * Design:
 *   - initialize() must be called before getState() is meaningful.
 *   - State is recomputed on each refresh() call and on DataWatcher events.
 *   - MemoryUpdater analysis runs every 5th refresh to reduce disk I/O.
 *   - onStateChange callbacks are notified after every state update.
 *   - shutdown() cleanly stops the DataWatcher and closes the TelemetryReader.
 */

import { join, dirname, basename } from 'node:path';
import { homedir } from 'node:os';
import { existsSync, readdirSync, statSync } from 'node:fs';

import type {
  AnalyticsConfig,
  DashboardState,
  SessionMetrics,
  TokenMetrics,
  CacheMetrics,
  CostMetrics,
  CommandMetrics,
  AgentMetrics,
  FileMetrics,
  ActivityEvent,
  FileHotspot,
  AgentProfile,
  ToolBreakdown,
  HealthStatus,
} from '../types.js';

import { TelemetryReader } from '../data/telemetry-reader.js';
import { SessionReader } from '../data/session-reader.js';
import { IndexReader } from '../data/index-reader.js';
import {
  JSONLReader,
  findActiveJsonlFile,
  sessionIdFromPath,
} from '../data/jsonl-reader.js';
import type { JSONLRecord, ToolCallInfo, AgentActivityInfo } from '../data/jsonl-types.js';
import type { GlobalDB } from '../data/global-db.js';
import { AnomalyDetector } from './anomaly-detector.js';
import { BudgetTracker } from './budget-tracker.js';
import { MemoryUpdater } from './memory-updater.js';
import { DataWatcher } from './watcher.js';

// ─────────────────────────────────────────────────────────────────────────────
// Logger
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal structured logger interface. */
interface Logger {
  warn(message: string, context?: Record<string, unknown>): void;
}

/** Default logger: prefixed console.warn. */
const DEFAULT_LOGGER: Logger = {
  warn: (msg) => console.warn(`[analytics:aggregator] ${msg}`),
};

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Number of recent telemetry records to surface as activity events. */
const RECENT_ACTIVITY_LIMIT = 50;

/** Run MemoryUpdater analysis every Nth refresh cycle. */
const MEMORY_UPDATER_INTERVAL = 5;

/** Maximum number of file hotspots to surface. */
const MAX_HOTSPOTS = 20;

/** Maximum number of anomalies retained in DashboardState. */
const MAX_ANOMALIES = 50;

/**
 * Debounce window for GlobalDB upserts (ms).
 * Prevents hammering the DB on every rapid-fire refresh cycle.
 */
const GLOBAL_DB_DEBOUNCE_MS = 10_000;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Build an empty SessionMetrics value. */
function emptySessionMetrics(): SessionMetrics {
  return {
    tokens: { input: 0, output: 0, total: 0, saved: 0, efficiency: 0, api_input: 0, api_output: 0, cache_read: 0, cache_write: 0 },
    cache: { hit_rate: 0, hits: 0, misses: 0, memory_peak_mb: 0, evictions: 0 },
    cost: { input: 0, output: 0, total: 0, saved: 0 },
    commands: { total: 0, success_rate: 1, avg_duration_ms: 0, total_duration_ms: 0, failures: 0, slowest: null },
    agents: { spawned: 0, max_concurrent: 0, total_tokens: 0, active: 0, completed: 0 },
    files: { unique_read: 0, modified: 0, created: 0, conflicts: 0 },
  };
}

/** Build an empty DashboardState. */
function emptyDashboardState(sessionId: string, startedAt: string): DashboardState {
  return {
    session_id: sessionId,
    started_at: startedAt,
    uptime_ms: 0,
    metrics: emptySessionMetrics(),
    tools_breakdown: {},
    recent_activity: [],
    file_hotspots: [],
    agent_profiles: [],
    anomalies: [],
    budget: null,
    health_status: 'healthy',
  };
}

/**
 * Compute the health status from anomaly severity and error rate.
 *
 * Rules:
 *   - 'alert' if any active anomaly is severity 'alert', or error_rate > 0.25.
 *   - 'warning' if any active anomaly is severity 'warning', or error_rate > 0.1.
 *   - 'healthy' otherwise.
 */
function computeHealthStatus(
  anomalies: DashboardState['anomalies'],
  metrics: SessionMetrics,
): HealthStatus {
  const errorRate = 1 - metrics.commands.success_rate;

  const hasAlert = anomalies.some((a) => a.severity === 'alert');
  const hasWarning = anomalies.some((a) => a.severity === 'warning');

  if (hasAlert || errorRate > 0.25) return 'alert';
  if (hasWarning || errorRate > 0.1) return 'warning';
  return 'healthy';
}

/** Mapping from raw TelemetryRecord tool names to ActivityEventType values. */
const TOOL_TO_ACTIVITY_TYPE: Readonly<Record<string, import('../types.js').ActivityEventType>> = {
  read: 'read',
  write: 'write',
  edit: 'edit',
  exec: 'exec',
  grep: 'grep',
  glob: 'glob',
  discover: 'discover',
  conflict: 'conflict',
  agent_spawn: 'agent_spawn',
  agent_complete: 'agent_complete',
  fetch: 'fetch',
  symbols: 'symbols',
  notebook: 'notebook',
};

/**
 * Map a raw TelemetryRecord tool name to an ActivityEventType.
 */
function toolToActivityType(
  tool: string,
): import('../types.js').ActivityEventType {
  return TOOL_TO_ACTIVITY_TYPE[tool] ?? 'exec';
}

/**
 * Resolve the JSONL project directory for the current project.
 *
 * Tries to infer from the goodvibesDir path. The project hash is the name
 * of the directory under ~/.claude/projects/ that corresponds to this project
 * (it is typically the URL-encoded project path or a hash thereof).
 *
 * Resolution:
 *   1. Expand ~ in jsonlBasePath.
 *   2. Try to match a subdir whose name appears in goodvibesDir's ancestor path.
 *   3. Fallback: return the most recently modified project dir that has JSONL files.
 *
 * @param goodvibesDir  - Absolute path to the .goodvibes directory.
 * @param jsonlBasePath - Base path for Claude JSONL files (config.jsonl_base_path).
 * @returns Absolute path to the JSONL project directory, or null.
 */
function resolveJsonlProjectDir(
  goodvibesDir: string,
  jsonlBasePath: string,
): string | null {
  // Expand ~ in jsonlBasePath.
  const expandedBase = jsonlBasePath.startsWith('~')
    ? join(homedir(), jsonlBasePath.slice(1))
    : jsonlBasePath;

  if (!existsSync(expandedBase)) return null;

  let entries: string[];
  try {
    entries = readdirSync(expandedBase);
  } catch {
    return null;
  }

  // Try to find the project directory matching the goodvibesDir ancestor.
  // The goodvibesDir is typically <project-root>/.goodvibes.
  // The project hash appears as a directory name under the projects base.
  const projectParent = basename(dirname(goodvibesDir));
  for (const entry of entries) {
    if (entry === projectParent) {
      const candidate = join(expandedBase, entry);
      if (existsSync(candidate)) return candidate;
    }
  }

  // Fallback: find the most recently modified project dir that contains JSONL files.
  let latestMtime = 0;
  let latestDir: string | null = null;

  for (const entry of entries) {
    const dirPath = join(expandedBase, entry);
    try {
      const s = statSync(dirPath);
      if (s.isDirectory() && s.mtimeMs > latestMtime) {
        // Only consider directories that actually have JSONL files.
        const subEntries = readdirSync(dirPath);
        if (subEntries.some((f) => f.endsWith('.jsonl'))) {
          latestMtime = s.mtimeMs;
          latestDir = dirPath;
        }
      }
    } catch {
      // Skip unreadable entries.
    }
  }

  if (latestDir !== null) {
    console.warn(
      `[analytics:aggregator] JSONL project directory not found for primary match; falling back to most recent directory`,
    );
  }

  return latestDir;
}

// ─────────────────────────────────────────────────────────────────────────────
// JSONL-derived token accumulation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Accumulated totals derived from the JSONL session file.
 * Reset whenever a new JSONL file is detected.
 */
interface JsonlTotals {
  api_input: number;
  api_output: number;
  cache_read: number;
  cache_write: number;
  cost_usd: number;
  api_calls: number;
  model: string;
  started_at: string | null;
  last_activity_at: string | null;
}

/** Build empty JSONL totals. */
function emptyJsonlTotals(): JsonlTotals {
  return {
    api_input: 0,
    api_output: 0,
    cache_read: 0,
    cache_write: 0,
    cost_usd: 0,
    api_calls: 0,
    model: 'unknown',
    started_at: null,
    last_activity_at: null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Aggregator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Central state aggregator for the analytics-engine daemon.
 *
 * Composes all data readers and daemon components into a single, consistent
 * `DashboardState` snapshot. Supports event-driven updates via DataWatcher.
 *
 * Phase 2: Now merges JSONL-sourced data (API tokens, tool calls, agent
 * activity) with precision telemetry, and persists session summaries to
 * the global analytics database.
 *
 * @example
 * ```ts
 * const agg = new Aggregator('/path/to/.goodvibes', config);
 * agg.setGlobalDb(globalDb); // inject from AnalyticsEngine
 * await agg.initialize();
 * agg.onStateChange((state) => render(state));
 * // ... later:
 * await agg.shutdown();
 * ```
 */
export class Aggregator {
  private readonly goodvibesDir: string;
  private config: AnalyticsConfig;
  private readonly logger: Logger;

  // Data readers
  private telemetry!: TelemetryReader;
  private session!: SessionReader;
  private index!: IndexReader;

  // JSONL reader — created in initialize() from config pricing.
  private jsonlReader: JSONLReader | null = null;

  // Accumulated JSONL records from the current file, merged in batches.
  private jsonlRecords: JSONLRecord[] = [];

  // Resolved path to the active JSONL file (null if not found).
  private activeJsonlPath: string | null = null;

  // Session ID resolved from the active JSONL filename.
  private jsonlSessionId: string | null = null;

  // Aggregated totals from JSONL records (recomputed after each accumulation).
  private jsonlTotals: JsonlTotals = emptyJsonlTotals();

  // GlobalDB instance — injected by AnalyticsEngine before initialize().
  private globalDb: GlobalDB | null = null;

  // Debounce timer for GlobalDB upserts.
  private globalDbSaveTimer: ReturnType<typeof setTimeout> | null = null;

  // Daemon components
  private anomalyDetector!: AnomalyDetector;
  private budgetTracker!: BudgetTracker;
  private memoryUpdater!: MemoryUpdater;
  private watcher!: DataWatcher;

  /** Cached current state. Updated on every refresh. */
  private state: DashboardState = emptyDashboardState('', new Date().toISOString());

  /** Timestamp when the aggregator was initialized. */
  private startedAt: string = new Date().toISOString();

  /** Registered state-change callbacks. */
  private readonly callbacks: Array<(state: DashboardState) => void> = [];

  /** Counter tracking how many refresh cycles have run. */
  private refreshCount = 0;

  /** Whether initialize() has completed. */
  private initialized = false;

  /** Mutex: true while a refresh() call is in progress. */
  private refreshing = false;

  /** Whether another refresh was requested while one was already running. */
  private refreshQueued = false;

  /**
   * @param goodvibesDir - Absolute path to the .goodvibes directory.
   * @param config       - Analytics configuration.
   * @param logger       - Optional structured logger; defaults to prefixed console.warn.
   */
  constructor(
    goodvibesDir: string,
    config: AnalyticsConfig,
    logger: Logger = DEFAULT_LOGGER,
  ) {
    this.goodvibesDir = goodvibesDir;
    this.config = config;
    this.logger = logger;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Public API
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Inject the GlobalDB instance from the owning AnalyticsEngine.
   *
   * Must be called before `initialize()` if GlobalDB write-back is desired.
   * Safe to call at any time — if called after initialize(), subsequent
   * GlobalDB upserts will use the new instance.
   *
   * @param db - Initialized GlobalDB instance, or null to disable write-back.
   */
  setGlobalDb(db: GlobalDB | null): void {
    this.globalDb = db;
  }

  /**
   * Reload configuration without restarting the aggregator.
   *
   * Updates the stored config (including token costs) and recreates the
   * JSONLReader with the new pricing rates. Safe to call at any time after
   * initialize().
   *
   * @param newConfig - Updated analytics configuration.
   */
  reloadConfig(newConfig: AnalyticsConfig): void {
    this.config = newConfig;
    this.jsonlReader = new JSONLReader({
      cost_per_1k_input_tokens: newConfig.cost_per_1k_input_tokens,
      cost_per_1k_output_tokens: newConfig.cost_per_1k_output_tokens,
    });
    // Recompute JSONL totals with new pricing, then refresh state.
    this.recomputeJsonlTotals();
    void this.refresh();
  }

  /**
   * Initialize all readers and start watching for changes.
   *
   * Must be called before `getState()` returns meaningful data.
   * Subsequent calls are no-ops (idempotent).
   *
   * @returns Promise that resolves once initialization is complete.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.startedAt = new Date().toISOString();

    // Instantiate data readers
    this.telemetry = new TelemetryReader(this.goodvibesDir);
    this.session = new SessionReader(this.goodvibesDir);
    this.index = new IndexReader(this.goodvibesDir);

    // Initialize the telemetry reader (loads SQLite)
    await this.telemetry.initialize();

    // Create the JSONL reader with configured pricing rates.
    this.jsonlReader = new JSONLReader({
      cost_per_1k_input_tokens: this.config.cost_per_1k_input_tokens,
      cost_per_1k_output_tokens: this.config.cost_per_1k_output_tokens,
    });

    // Resolve the JSONL project directory and load any existing records.
    const jsonlProjectDir = resolveJsonlProjectDir(
      this.goodvibesDir,
      this.config.jsonl_base_path,
    );

    if (jsonlProjectDir !== null) {
      await this.initJsonlFromFile(jsonlProjectDir);
    }

    // Instantiate daemon components
    this.anomalyDetector = new AnomalyDetector(this.telemetry, this.config, this.logger);
    this.budgetTracker = new BudgetTracker(this.config);
    this.memoryUpdater = new MemoryUpdater(join(this.goodvibesDir, 'memory'));

    // Wire DataWatcher events to targeted re-aggregation.
    // Pass jsonlProjectDir so the watcher can tail the active JSONL file.
    this.watcher = new DataWatcher(this.goodvibesDir, {
      jsonlProjectDir: jsonlProjectDir ?? undefined,
      jsonlCostConfig: {
        cost_per_1k_input_tokens: this.config.cost_per_1k_input_tokens,
        cost_per_1k_output_tokens: this.config.cost_per_1k_output_tokens,
      },
    });

    // Wire standard data source events.
    this.watcher.on('telemetry-change', () => { void this.refresh(); });
    this.watcher.on('session-change', () => { void this.refresh(); });
    this.watcher.on('index-change', () => { void this.refresh(); });
    this.watcher.on('config-change', () => { void this.refresh(); });

    // Wire JSONL records event — accumulate new records and trigger refresh.
    this.watcher.on('jsonl-records', (records: JSONLRecord[]) => {
      this.accumulateJsonlRecords(records);
      void this.refresh();
    });

    this.watcher.start();

    // Initial state computation
    await this.refresh();

    this.initialized = true;
  }

  /**
   * Get the current dashboard state.
   *
   * Returns the last computed snapshot. Call `refresh()` to force a new
   * computation, or rely on DataWatcher to trigger automatic updates.
   *
   * @returns The current aggregated DashboardState.
   */
  getState(): DashboardState {
    return this.state;
  }

  /**
   * Force a full refresh of all data sources and recompute the state.
   *
   * Triggers state-change callbacks if the state was updated.
   *
   * @returns Promise that resolves once the refresh is complete.
   */
  async refresh(): Promise<void> {
    if (!this.initialized) {
      this.logger.warn('refresh() called before initialize()');
      return;
    }
    if (this.refreshing) {
      this.refreshQueued = true;
      return;
    }
    this.refreshing = true;
    try {
      const newState = this.aggregate();
      this.state = newState;
      this.refreshCount++;

      // Run MemoryUpdater analysis every Nth refresh cycle
      if (this.refreshCount % MEMORY_UPDATER_INTERVAL === 0) {
        try {
          const updates = this.memoryUpdater.analyze(this.state);
          if (updates.patterns.length > 0 || updates.preferences.length > 0) {
            this.memoryUpdater.apply(updates);
          }
        } catch (err) {
          this.logger.warn(`MemoryUpdater analysis failed: ${String(err)}`);
        }
      }

      // Schedule a debounced GlobalDB session-summary upsert.
      this.scheduleGlobalDbSave();

      this.notifyCallbacks();
    } catch (err) {
      this.logger.warn(`Aggregation refresh failed: ${String(err)}`);
    } finally {
      this.refreshing = false;
      if (this.refreshQueued) {
        this.refreshQueued = false;
        void Promise.resolve().then(() => this.refresh());
      }
    }
  }

  /**
   * Register a callback to be invoked whenever the state changes.
   *
   * The callback is called synchronously after each refresh cycle with the
   * new DashboardState.
   *
   * @param callback - Function to call with the updated state.
   * @returns An unsubscribe function that removes the callback when called.
   */
  onStateChange(callback: (state: DashboardState) => void): () => void {
    this.callbacks.push(callback);
    return () => {
      const idx = this.callbacks.indexOf(callback);
      if (idx >= 0) this.callbacks.splice(idx, 1);
    };
  }

  /**
   * Clean shutdown: stop the DataWatcher, close the TelemetryReader,
   * and flush any pending GlobalDB write.
   *
   * Safe to call multiple times — subsequent calls are no-ops.
   *
   * @returns Promise that resolves once shutdown is complete.
   */
  async shutdown(): Promise<void> {
    // Cancel pending GlobalDB debounce and do a final synchronous write.
    if (this.globalDbSaveTimer !== null) {
      clearTimeout(this.globalDbSaveTimer);
      this.globalDbSaveTimer = null;
      this.writeGlobalDbSession();
    }

    if (this.watcher) {
      this.watcher.stop();
    }
    if (this.telemetry) {
      this.telemetry.close();
    }
  }

  /**
   * Set a budget constraint for the current session.
   *
   * Delegates to BudgetTracker and triggers a state refresh.
   *
   * @param amount - Budget amount.
   * @param unit   - Unit of measurement ('dollars' or 'tokens').
   */
  setBudget(amount: number, unit: 'dollars' | 'tokens'): void {
    if (!this.initialized) {
      this.logger.warn('setBudget() called before initialize()');
      return;
    }
    this.budgetTracker.setBudget(amount, unit);
    void this.refresh();
  }

  /**
   * Clear the current budget constraint.
   *
   * Delegates to BudgetTracker and triggers a state refresh.
   */
  clearBudget(): void {
    if (!this.initialized) {
      this.logger.warn('clearBudget() called before initialize()');
      return;
    }
    this.budgetTracker.clearBudget();
    void this.refresh();
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Private: JSONL integration
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Load the initial JSONL records from the active file in the project dir.
   *
   * Parses the entire file from offset 0 on first load to populate
   * historical data from the current session.
   *
   * @param jsonlProjectDir - Absolute path to the JSONL project directory.
   */
  private async initJsonlFromFile(jsonlProjectDir: string): Promise<void> {
    if (this.jsonlReader === null) return;

    try {
      const activeFile = await findActiveJsonlFile(jsonlProjectDir);
      if (activeFile === null) return;

      this.activeJsonlPath = activeFile;
      this.jsonlSessionId = sessionIdFromPath(activeFile);

      // Parse the full file from the start to seed historical data.
      const result = await this.jsonlReader.parseFile(activeFile, 0);
      if (result.records.length > 0) {
        this.accumulateJsonlRecords(result.records);
      }

      if (result.errors.length > 0) {
        this.logger.warn(
          `JSONL initial load had ${result.errors.length} parse error(s) in "${activeFile}"`,
        );
      }
    } catch (err) {
      this.logger.warn(`JSONL init failed: ${String(err)}`);
    }
  }

  /**
   * Accumulate a batch of new JSONL records.
   *
   * Appends to the in-memory record list and recomputes JSONL totals.
   * Called both on initial load (from parseFile) and on live watcher events.
   *
   * @param records - New records to append.
   */
  private static readonly MAX_JSONL_RECORDS = 10000;

  private accumulateJsonlRecords(records: JSONLRecord[]): void {
    if (records.length === 0) return;
    this.jsonlRecords.push(...records);
    if (this.jsonlRecords.length > Aggregator.MAX_JSONL_RECORDS) {
      this.jsonlRecords = this.jsonlRecords.slice(-Aggregator.MAX_JSONL_RECORDS);
    }
    this.recomputeJsonlTotals();
  }

  /**
   * Recompute all JSONL-sourced totals from the accumulated record list.
   *
   * Scans all accumulated records to build aggregate token counts, cost,
   * and model/timing information. Runs after each batch accumulation.
   */
  private recomputeJsonlTotals(): void {
    if (this.jsonlReader === null) return;

    const apiCalls = this.jsonlReader.extractApiCalls(this.jsonlRecords);
    const sessionInfo = this.jsonlReader.extractSessionInfo(this.jsonlRecords);

    const totals = emptyJsonlTotals();
    totals.api_calls = apiCalls.length;
    totals.model = sessionInfo.model;
    totals.started_at = sessionInfo.startedAt !== '' ? sessionInfo.startedAt : null;
    totals.last_activity_at = sessionInfo.lastActivityAt !== '' ? sessionInfo.lastActivityAt : null;

    for (const call of apiCalls) {
      totals.api_input  += call.input_tokens;
      totals.api_output += call.output_tokens;
      totals.cache_read += call.cache_read_tokens;
      totals.cache_write += call.cache_write_tokens;
      totals.cost_usd  += call.cost_usd;
    }

    this.jsonlTotals = totals;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Private: aggregation
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Compute a fresh DashboardState from all data sources.
   *
   * Merges precision telemetry (cache stats, tool timing) with JSONL-sourced
   * data (API token counts, real cost, agent activity, file hotspots).
   *
   * All errors within individual data sources are caught and logged so that
   * a single reader failure does not crash the entire aggregation.
   */
  private aggregate(): DashboardState {
    const now = Date.now();
    const startedAtMs = new Date(this.startedAt).getTime();
    const uptimeMs = now - startedAtMs;

    // ── Session identity ──────────────────────────────────────────────────
    // Prefer JSONL-derived session ID, fall back to precision telemetry / session file.
    const sessionId =
      this.jsonlSessionId ??
      this.safeCall(() => this.telemetry?.getCurrentSessionId(), null) ??
      this.safeCall(() => this.session?.readCurrentSession()?.id, null) ??
      'unknown';

    // ── Telemetry summary (precision-engine data) ─────────────────────────
    const telemetrySummary = this.safeCall(() => this.telemetry.getSessionSummary(), null);
    const tokenMetrics = this.safeCall(() => this.telemetry.getTokenMetrics(), null);

    // ── Token metrics: merge precision telemetry with JSONL API data ──────
    //
    // Strategy:
    //   - input/output/total/saved/efficiency: from precision telemetry
    //     (these track precision-tool token usage accurately)
    //   - api_input/api_output/cache_read/cache_write: from JSONL
    //     (real Claude API token counts from assistant records)
    //
    // If JSONL data is available, JSONL api_* fields take priority because
    // they come directly from Claude's API responses.
    const jsonl = this.jsonlTotals;
    const hasJsonlData = this.jsonlRecords.length > 0;
    const tokens: TokenMetrics = {
      // Precision telemetry fields (fall back to 0 if unavailable).
      input:      tokenMetrics?.input      ?? 0,
      output:     tokenMetrics?.output     ?? 0,
      total:      tokenMetrics?.total      ?? 0,
      saved:      tokenMetrics?.saved      ?? 0,
      efficiency: tokenMetrics?.efficiency ?? 0,
      // JSONL API fields: prefer JSONL if available, else precision telemetry.
      // Use presence check (hasJsonlData) rather than > 0 to distinguish
      // "no data" from "zero tokens" correctly.
      api_input:   hasJsonlData ? jsonl.api_input   : (tokenMetrics?.api_input   ?? 0),
      api_output:  hasJsonlData ? jsonl.api_output  : (tokenMetrics?.api_output  ?? 0),
      cache_read:  hasJsonlData ? jsonl.cache_read  : (tokenMetrics?.cache_read  ?? 0),
      cache_write: hasJsonlData ? jsonl.cache_write : (tokenMetrics?.cache_write ?? 0),
    };

    // If precision telemetry has no total but JSONL does, derive from JSONL.
    if (tokens.total === 0 && (jsonl.api_input + jsonl.api_output) > 0) {
      const jsonlSum = jsonl.api_input + jsonl.api_output + jsonl.cache_read + jsonl.cache_write;
      tokens.total  = jsonlSum;
      tokens.input  = jsonl.api_input + jsonl.cache_read;
      tokens.output = jsonl.api_output;
    }

    // ── Cache metrics ─────────────────────────────────────────────────────
    const cache: CacheMetrics = this.buildCacheMetrics(telemetrySummary);

    // ── Cost metrics: prefer JSONL calculated cost (uses real API tokens) ──
    const cost: CostMetrics = (() => {
      if (jsonl.cost_usd > 0) {
        // Decompose total cost into input/output split from token counts.
        const inputCost = (jsonl.api_input / 1000) * this.config.cost_per_1k_input_tokens;
        const outputCost = (jsonl.api_output / 1000) * this.config.cost_per_1k_output_tokens;
        const saved = (tokens.saved / 1000) * this.config.cost_per_1k_input_tokens;
        return {
          input: inputCost,
          output: outputCost,
          total: jsonl.cost_usd,
          saved,
        };
      }
      // Fall back to precision telemetry cost estimate.
      return {
        input: (tokens.input / 1000) * this.config.cost_per_1k_input_tokens,
        output: (tokens.output / 1000) * this.config.cost_per_1k_output_tokens,
        total:
          (tokens.input / 1000) * this.config.cost_per_1k_input_tokens +
          (tokens.output / 1000) * this.config.cost_per_1k_output_tokens,
        saved: (tokens.saved / 1000) * this.config.cost_per_1k_input_tokens,
      };
    })();

    // ── Command metrics (from exec tool breakdown) ─────────────────────────
    const commands: CommandMetrics = (() => {
      const execBreakdown = telemetrySummary?.by_tool['exec'];
      if (!execBreakdown) {
        return { total: 0, success_rate: 1, avg_duration_ms: 0, total_duration_ms: 0, failures: 0, slowest: null };
      }
      const total = execBreakdown.calls;
      const failures = Math.round(total * (1 - execBreakdown.success_rate));
      return {
        total,
        success_rate: execBreakdown.success_rate,
        avg_duration_ms: execBreakdown.avg_ms,
        total_duration_ms: execBreakdown.avg_ms * total,
        failures,
        slowest: null, // would require scanning individual records
      };
    })();

    // ── Agent activity from JSONL ────────────────────────────────────────────
    const agentActivities = this.safeCall(
      () => this.jsonlReader !== null
        ? this.jsonlReader.extractAgentActivity(this.jsonlRecords)
        : [],
      [] as AgentActivityInfo[],
    );
    const completedAgents = agentActivities.filter((a) => a.completed).length;
    const activeAgents = agentActivities.length - completedAgents;

    // ── Agent metrics: merge JSONL and session-reader data ─────────────────
    const sessionCounters = this.safeCall(() => this.session.getSessionCounters(), null);
    const agents: AgentMetrics = {
      spawned: agentActivities.length > 0
        ? agentActivities.length
        : (sessionCounters?.agents_spawned ?? 0),
      max_concurrent: 0,  // Requires active session-state tracking
      total_tokens: 0,    // Not derivable without per-agent JSONL correlation
      active: activeAgents,
      completed: completedAgents,
    };

    // ── JSONL tool calls for file tracking ───────────────────────────────
    const jsonlToolCalls = this.safeCall(
      () => this.jsonlReader !== null
        ? this.jsonlReader.extractToolCalls(this.jsonlRecords)
        : [],
      [] as ToolCallInfo[],
    );

    // Count unique files accessed from JSONL tool_use blocks.
    const uniqueReadFiles = new Set<string>();
    let createdFiles = 0;
    for (const tc of jsonlToolCalls) {
      const toolName = (tc.name ?? '').toLowerCase();
      const inputPath = typeof tc.input['path'] === 'string' ? tc.input['path'] : null;
      if (inputPath !== null) {
        if (toolName === 'read' || toolName === 'precision_read') {
          uniqueReadFiles.add(inputPath);
        } else if (toolName === 'write' || toolName === 'precision_write') {
          createdFiles++;
        }
      }
    }

    // ── File metrics ──────────────────────────────────────────────────────
    const files: FileMetrics = {
      unique_read: uniqueReadFiles.size,
      modified: sessionCounters?.files_modified.length ?? 0,
      created: createdFiles,
      conflicts: 0,
    };

    const metrics: SessionMetrics = { tokens, cache, cost, commands, agents, files };

    // ── Tools breakdown ───────────────────────────────────────────────────
    const toolsBreakdown: Record<string, ToolBreakdown> =
      telemetrySummary?.by_tool ?? {};

    // ── Recent activity ───────────────────────────────────────────────────
    const recentActivity: ActivityEvent[] = this.buildRecentActivity();

    // ── File hotspots ─────────────────────────────────────────────────────
    const fileHotspots: FileHotspot[] = this.buildFileHotspots(
      toolsBreakdown,
      jsonlToolCalls,
      sessionCounters,
    );

    // ── Agent profiles ────────────────────────────────────────────────────
    const agentProfiles: AgentProfile[] = this.buildAgentProfiles(agentActivities);

    // ── Anomaly detection ─────────────────────────────────────────────────
    const partialState: DashboardState = {
      session_id: sessionId,
      started_at: this.startedAt,
      uptime_ms: uptimeMs,
      metrics,
      tools_breakdown: toolsBreakdown,
      recent_activity: recentActivity,
      file_hotspots: fileHotspots,
      agent_profiles: agentProfiles,
      anomalies: this.state.anomalies, // carry forward existing anomalies
      budget: this.state.budget,
      health_status: this.state.health_status,
    };

    const newAnomalies = this.safeCall(
      () => this.anomalyDetector.detect(partialState),
      [] as DashboardState['anomalies'],
    );

    const allAnomalies = [
      ...this.anomalyDetector.getActiveAnomalies(),
      ...newAnomalies,
    ]
      .filter((a, i, arr) => arr.findIndex((x) => x.id === a.id) === i)
      .slice(-MAX_ANOMALIES);

    // ── Budget tracking ───────────────────────────────────────────────────
    // Real JSONL cost flows through metrics.cost.total to the budget tracker.
    const budget = this.safeCall(
      () => this.budgetTracker.update(metrics, this.config),
      null,
    );

    // ── Health status ─────────────────────────────────────────────────────
    const healthStatus = computeHealthStatus(allAnomalies, metrics);

    return {
      session_id: sessionId,
      started_at: this.startedAt,
      uptime_ms: uptimeMs,
      metrics,
      tools_breakdown: toolsBreakdown,
      recent_activity: recentActivity,
      file_hotspots: fileHotspots,
      agent_profiles: agentProfiles,
      anomalies: allAnomalies,
      budget,
      health_status: healthStatus,
    };
  }

  /**
   * Build the recent activity list from the most recent telemetry records.
   */
  private buildRecentActivity(): ActivityEvent[] {
    const records = this.safeCall(
      () => this.telemetry.getRecentRecords(RECENT_ACTIVITY_LIMIT),
      [],
    );

    return records.map((r) => ({
      timestamp: r.created_at,
      type: toolToActivityType(r.tool),
      tool: r.tool,
      description: r.error ?? (r.status === 'success' ? 'ok' : r.status),
      duration_ms: r.duration_ms,
      cache_hit: r.cache_hit,
      tokens: (r.tokens_in ?? 0) + (r.tokens_out ?? 0),
      details: {
        status: r.status,
        tokens_in: r.tokens_in,
        tokens_out: r.tokens_out,
        cache_bytes_saved: r.cache_bytes_saved,
      },
    }));
  }

  /**
   * Build file hotspot data by merging JSONL tool call file access patterns
   * with session-reader modified-file data.
   *
   * JSONL tool_use blocks contain actual file paths for read/write/edit calls,
   * enabling per-file access counting. Session-reader provides modified files
   * as a fallback for files not captured in JSONL.
   *
   * @param _breakdown      - Tool breakdown from precision telemetry (reserved).
   * @param jsonlToolCalls  - Extracted tool calls from JSONL records.
   * @param sessionCounters - Session counters from the SessionReader.
   */
  private buildFileHotspots(
    _breakdown: Record<string, ToolBreakdown>,
    jsonlToolCalls: ToolCallInfo[],
    sessionCounters: ReturnType<SessionReader['getSessionCounters']> | null,
  ): FileHotspot[] {
    // Accumulate per-file stats from JSONL tool calls.
    const fileStats = new Map<string, { reads: number; writes: number; conflicts: number; lastAccessed: string }>();

    for (const tc of jsonlToolCalls) {
      const toolName = (tc.name ?? '').toLowerCase();
      const timestamp = tc.timestamp ?? new Date().toISOString();

      // Collect all file paths referenced by this tool call.
      const filePaths: string[] = [];

      // Single-path tools: path input field.
      const singlePath = typeof tc.input['path'] === 'string' ? tc.input['path'] : null;
      if (singlePath !== null) {
        filePaths.push(singlePath);
      }

      // Batch tools (precision_read / precision_write): files array.
      if (Array.isArray(tc.input['files'])) {
        for (const f of tc.input['files'] as unknown[]) {
          if (
            typeof f === 'object' && f !== null &&
            typeof (f as Record<string, unknown>)['path'] === 'string'
          ) {
            filePaths.push((f as Record<string, unknown>)['path'] as string);
          }
        }
      }

      // Batch edit tool: edits array (each edit has a 'path' or 'file' field).
      if (Array.isArray(tc.input['edits'])) {
        for (const e of tc.input['edits'] as unknown[]) {
          if (typeof e === 'object' && e !== null) {
            const editRec = e as Record<string, unknown>;
            const editPath = typeof editRec['path'] === 'string'
              ? editRec['path']
              : typeof editRec['file'] === 'string' ? editRec['file'] : null;
            if (editPath !== null) filePaths.push(editPath);
          }
        }
      }

      for (const filePath of filePaths) {
        if (!fileStats.has(filePath)) {
          fileStats.set(filePath, { reads: 0, writes: 0, conflicts: 0, lastAccessed: timestamp });
        }
        const stat = fileStats.get(filePath)!;
        if (timestamp > stat.lastAccessed) stat.lastAccessed = timestamp;

        if (
          toolName === 'read'  || toolName === 'precision_read'  ||
          toolName === 'grep'  || toolName === 'precision_grep'  ||
          toolName === 'glob'  || toolName === 'precision_glob'  ||
          toolName === 'symbols' || toolName === 'precision_symbols'
        ) {
          stat.reads++;
        } else if (
          toolName === 'write' || toolName === 'precision_write' ||
          toolName === 'edit'  || toolName === 'precision_edit'
        ) {
          stat.writes++;
        } else if (toolName === 'conflict') {
          stat.conflicts++;
        }
      }
    }

    // Merge with session-reader modified files (fills gaps where JSONL lacks paths).
    if (sessionCounters) {
      for (const filePath of sessionCounters.files_modified) {
        if (!fileStats.has(filePath)) {
          fileStats.set(filePath, {
            reads: 0,
            writes: 1,
            conflicts: 0,
            lastAccessed: new Date().toISOString(),
          });
        }
      }
    }

    // Convert to FileHotspot[], sorted by total access count descending.
    const hotspots: FileHotspot[] = Array.from(fileStats.entries())
      .map(([path, stat]) => ({
        path,
        reads: stat.reads,
        writes: stat.writes,
        conflicts: stat.conflicts,
        tokens_saved: 0, // Not derivable without per-file cache tracking
        last_accessed: stat.lastAccessed,
      }))
      .sort((a, b) => (b.reads + b.writes) - (a.reads + a.writes))
      .slice(0, MAX_HOTSPOTS);

    return hotspots;
  }

  /**
   * Build agent profile data from JSONL-extracted agent activity.
   *
   * Each `AgentActivityInfo` entry corresponds to a Task tool_use block
   * found in the JSONL records. Status is inferred from completion state.
   *
   * @param agentActivities - Agent activity records extracted from JSONL.
   */
  private buildAgentProfiles(agentActivities: AgentActivityInfo[]): AgentProfile[] {
    return agentActivities.map((a) => ({
      agent_id: a.agentId,
      agent_type: 'task', // All JSONL-derived agents are Task tool spawns
      tokens_in: 0,       // Per-agent token counts require subagent JSONL correlation
      tokens_out: 0,
      tool_calls: 0,      // Not derivable without subagent session correlation
      success_rate: 1,    // Default; no per-agent failure data available
      duration_ms: 0,     // Not available without completed_at timestamps
      status: a.completed
        ? (a.exitStatus === 'error' ? 'failed' : 'completed')
        : 'active',
    }));
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Private: GlobalDB write-back
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Schedule a debounced GlobalDB session-summary upsert.
   *
   * Resets the timer on every call. The actual write fires after
   * GLOBAL_DB_DEBOUNCE_MS of inactivity. This prevents hammering the DB
   * on rapid-fire refresh cycles.
   */
  private scheduleGlobalDbSave(): void {
    if (this.globalDb === null) return;

    if (this.globalDbSaveTimer !== null) {
      clearTimeout(this.globalDbSaveTimer);
    }
    this.globalDbSaveTimer = setTimeout(() => {
      this.globalDbSaveTimer = null;
      this.writeGlobalDbSession();
    }, GLOBAL_DB_DEBOUNCE_MS);
  }

  /**
   * Write the current session summary to GlobalDB.
   *
   * Constructs a `GlobalSession` record from the current aggregated state
   * and calls `upsertSession()`. Errors are logged but do not propagate.
   */
  private writeGlobalDbSession(): void {
    if (this.globalDb === null) return;
    const sessionId = this.state.session_id;
    if (!sessionId || sessionId === 'unknown') return;

    try {
      const metrics = this.state.metrics;
      const jsonl = this.jsonlTotals;

      const projectHash = basename(dirname(this.goodvibesDir));
      const jsonlToolCalls = this.jsonlReader !== null
        ? this.jsonlReader.extractToolCalls(this.jsonlRecords)
        : [];
      const precisionCalls = jsonlToolCalls.filter(
        (tc) => (tc.name ?? '').startsWith('mcp__plugin_goodvibes_precision'),
      ).length;

      this.globalDb.upsertSession({
        session_id: sessionId,
        project_path: this.goodvibesDir,
        project_hash: projectHash,
        started_at: this.startedAt,
        model: jsonl.model !== 'unknown' ? jsonl.model : undefined,
        total_input_tokens: metrics.tokens.api_input,
        total_output_tokens: metrics.tokens.api_output,
        total_cache_read_tokens: metrics.tokens.cache_read,
        total_cache_write_tokens: metrics.tokens.cache_write,
        total_cost_usd: metrics.cost.total,
        total_api_calls: jsonl.api_calls,
        total_tool_calls: Object.values(this.state.tools_breakdown).reduce(
          (sum, tb) => sum + tb.calls,
          0,
        ),
        total_native_tool_calls: jsonlToolCalls.length - precisionCalls,
        total_precision_tool_calls: precisionCalls,
        total_agent_spawns: metrics.agents.spawned,
        status: 'active',
      });
    } catch (err) {
      this.logger.warn(`GlobalDB session upsert failed: ${String(err)}`);
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Private: utilities
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Build cache metrics from the telemetry summary.
   *
   * memory_peak_mb and evictions are not tracked in the telemetry DB;
   * they are reported as 0 until a richer data source is available.
   */
  private buildCacheMetrics(
    telemetrySummary: ReturnType<TelemetryReader['getSessionSummary']> | null,
  ): CacheMetrics {
    if (!telemetrySummary) {
      return { hit_rate: 0, hits: 0, misses: 0, memory_peak_mb: 0, evictions: 0 };
    }
    const hits = telemetrySummary.total_cache_hits;
    const total = telemetrySummary.total_calls;
    const misses = total - hits;
    const hitRate = total > 0 ? hits / total : 0;
    return {
      hit_rate: hitRate,
      hits,
      misses,
      memory_peak_mb: 0, // not tracked in telemetry DB
      evictions: 0,       // not tracked in telemetry DB
    };
  }

  /**
   * Execute a function and return its result, or a fallback value on error.
   *
   * Errors are logged at warn level but do not propagate — a single reader
   * failure must not abort the full aggregation cycle.
   *
   * @param fn       - Function to execute.
   * @param fallback - Value returned if fn throws.
   */
  private safeCall<T>(fn: () => T, fallback: T): T {
    try {
      return fn();
    } catch (err) {
      this.logger.warn(`safeCall error: ${String(err)}`);
      return fallback;
    }
  }

  /**
   * Invoke all registered state-change callbacks with the current state.
   * Errors in callbacks are caught and logged to avoid cascade failures.
   */
  private notifyCallbacks(): void {
    for (const cb of this.callbacks) {
      try {
        cb(this.state);
      } catch (err) {
        this.logger.warn(`State-change callback threw: ${String(err)}`);
      }
    }
  }
}
