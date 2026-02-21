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

import { join, dirname, basename, resolve } from 'node:path';
import { homedir } from 'node:os';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';

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
import type { JSONLRecord, JSONLAssistantRecord, ToolCallInfo, AgentActivityInfo } from '../data/jsonl-types.js';
import { loadModelPricing, getModelRates } from '../config.js';
import type { ModelPricingMap } from '../config.js';
import type { GlobalDB } from '../data/global-db.js';
import { AnomalyDetector } from './anomaly-detector.js';
import { BudgetTracker } from './budget-tracker.js';
import { MemoryUpdater } from './memory-updater.js';
import { DataWatcher } from './watcher.js';

// ─────────────────────────────────────────────────────────────────────────────
// Logger
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Data extracted from the Claude Code statusline JSON file.
 * This file is written by Claude Code's statusline hook and contains
 * the most authoritative real-time context window and cost values.
 */
interface StatuslineData {
  /** Context window used percentage (0-100) */
  contextPercent: number;
  /** Total context window size in tokens */
  contextWindowSize: number;
  /** Total API input tokens for this session */
  apiInput: number;
  /** Total API output tokens for this session */
  apiOutput: number;
  /** Cache read (prompt cache hit) tokens */
  cacheRead: number;
  /** Cache write (prompt cache creation) tokens */
  cacheWrite: number;
  /** Accumulated session cost in USD */
  costUsd: number;
}

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

/** Divisor for converting raw token counts to thousands (for cost calculation). */
const TOKENS_PER_K = 1000;

/** Maximum age (ms) for the statusline JSON file before it's considered stale. */
const STATUSLINE_STALENESS_MS = 60_000;

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

/**
 * Read `max_parallel_agent_chains` from project goodvibes.json, falling back
 * to the global ~/.goodvibes/goodvibes.json, then to a default of 6.
 */
function readMaxAgentChains(goodvibesDir: string): number {
  const DEFAULT = 6;
  // Project-level overrides global.
  for (const configPath of [
    join(goodvibesDir, 'goodvibes.json'),
    join(homedir(), '.goodvibes', 'goodvibes.json'),
  ]) {
    try {
      const raw = readFileSync(configPath, 'utf8');
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const val = parsed['max_parallel_agent_chains'];
      if (typeof val === 'number' && val > 0) return val;
    } catch { /* file missing or unparseable — try next */ }
  }
  return DEFAULT;
}

/** Build an empty DashboardState. */
function emptyDashboardState(sessionId: string, projectHash: string, startedAt: string): DashboardState {
  return {
    session_id: sessionId,
    project_hash: projectHash,
    max_agent_chains: 6,
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
    context_percent: 0,
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
  // Claude stores JSONL project dirs with dashed-path names, e.g.
  // /home/user/Projects/myapp → -home-user-Projects-myapp
  const projectRoot = dirname(resolve(goodvibesDir));
  const dashedPath = projectRoot.replace(/\//g, '-');
  for (const entry of entries) {
    if (entry === dashedPath) {
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

  // Model pricing map — loaded on initialize() from ~/.claude/model-pricing.json.
  private pricingMap: ModelPricingMap = {};

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

  /** Cache for subagent file reads keyed by file path — avoids re-reading unchanged files. */
  private subagentCache = new Map<string, { mtime: number; data: { tokens_in: number; tokens_out: number; tool_calls: number } }>();

  /** Cache for subagent directory listing — avoids re-reading unchanged directories. */
  private subagentDirCache: { mtime: number; files: string[] } | null = null;

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
  private state: DashboardState = emptyDashboardState('', '', new Date().toISOString());

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
   * Return the current GlobalDB instance, or null if not initialized.
   * Allows handlers to access cross-project data without unsafe casts.
   */
  getGlobalDb(): GlobalDB | null {
    return this.globalDb;
  }

  /**
   * Return the current resolved analytics configuration.
   * Allows handlers to read cost rates and other config without unsafe casts.
   */
  getConfig(): AnalyticsConfig {
    return this.config;
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
    this.pricingMap = loadModelPricing();
    this.jsonlReader = new JSONLReader(
      {
        cost_per_1k_input_tokens: newConfig.cost_per_1k_input_tokens,
        cost_per_1k_output_tokens: newConfig.cost_per_1k_output_tokens,
      },
      this.pricingMap,
    );
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

    // Load dynamic model pricing.
    this.pricingMap = loadModelPricing();

    // Create the JSONL reader with configured pricing rates and dynamic pricing map.
    this.jsonlReader = new JSONLReader(
      {
        cost_per_1k_input_tokens: this.config.cost_per_1k_input_tokens,
        cost_per_1k_output_tokens: this.config.cost_per_1k_output_tokens,
      },
      this.pricingMap,
    );

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

    // Mark initialized before watcher starts — watcher events call refresh()
    // which checks this flag.
    this.initialized = true;

    this.watcher.start();

    // Initial state computation
    await this.refresh();
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
    // Reload telemetry DB from disk on each aggregate cycle.
    // Cost: file I/O + sql.js WASM re-init (~1-5ms). Acceptable at 2s refresh rate.
    // Future: debounce via file mtime check if profiling shows bottleneck.
    this.safeCall(() => this.telemetry.reload(), undefined);

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
    const tokenMetrics = this.safeCall(() => this.telemetry.getTokenMetrics(sessionId), null);

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

    // NOTE: tokens.input/output/total/saved/efficiency remain from precision telemetry above.
    // API fields (api_input, api_output, cache_read, cache_write) come from JSONL above.
    // These two caching systems are distinct and must NOT be conflated.

    // ── Statusline data (authoritative source) ────────────────────────────────
    // Read Claude Code's statusline JSON for the most up-to-date context %,
    // API token counts, and cost. Overrides JSONL-derived values when available.
    const statuslineData = this.readStatuslineData();
    if (statuslineData) {
      // Statusline values come directly from Claude Code's runtime state,
      // making them more accurate than JSONL-accumulated totals.
      // Apply token overrides BEFORE the cost IIFE so that cost decomposition
      // uses the same authoritative token values (no input/output source mismatch).
      tokens.api_input   = statuslineData.apiInput;
      tokens.api_output  = statuslineData.apiOutput;
      tokens.cache_read  = statuslineData.cacheRead;
      tokens.cache_write = statuslineData.cacheWrite;
    }

    // ── Cache metrics (precision engine only) ────────────────────────────
    const cache: CacheMetrics = this.buildCacheMetrics(telemetrySummary);

    // ── Cost metrics: prefer JSONL calculated cost (uses real API tokens) ──
    // NOTE: tokens.api_input / tokens.api_output already reflect statusline overrides
    // (applied above), so cost decomposition and token counts use the same source.
    const cost: CostMetrics = (() => {
      if (jsonl.cost_usd > 0) {
        // Decompose total cost proportionally using model-specific rates.
        // Using flat config rates would cause input + output != total when dynamic pricing is active.
        const rates = getModelRates(jsonl.model, this.pricingMap);
        const inputRate = rates.inputPrice / 1_000_000; // $/MTok to per-token
        const outputRate = rates.outputPrice / 1_000_000;
        // Use tokens.api_input/api_output (already statusline-overridden if available).
        const rawInputCost = tokens.api_input * inputRate;
        const rawOutputCost = tokens.api_output * outputRate;
        const rawTotal = rawInputCost + rawOutputCost;
        // Scale to match the accurate jsonl.cost_usd total (which includes cache + tiers).
        const scale = rawTotal > 0 ? jsonl.cost_usd / rawTotal : 1;
        const inputCost = rawInputCost * scale;
        const outputCost = rawOutputCost * scale;
        // Saved tokens are input tokens — use input rate for cost saved.
        const savedRate = rates.inputPrice / 1_000_000;
        const saved = tokens.saved * savedRate;
        return {
          input: inputCost,
          output: outputCost,
          total: jsonl.cost_usd,
          saved,
        };
      }
      // Fall back to precision telemetry cost estimate.
      return {
        input: (tokens.input / TOKENS_PER_K) * this.config.cost_per_1k_input_tokens,
        output: (tokens.output / TOKENS_PER_K) * this.config.cost_per_1k_output_tokens,
        total:
          (tokens.input / TOKENS_PER_K) * this.config.cost_per_1k_input_tokens +
          (tokens.output / TOKENS_PER_K) * this.config.cost_per_1k_output_tokens,
        saved: (tokens.saved / TOKENS_PER_K) * this.config.cost_per_1k_input_tokens,
      };
    })();

    // Override cost.total with statusline value if available (most accurate).
    // Rescale cost.input and cost.output proportionally so the invariant
    // cost.input + cost.output == cost.total is preserved.
    if (statuslineData && statuslineData.costUsd > 0) {
      const prevTotal = cost.total;
      cost.total = statuslineData.costUsd;
      if (prevTotal > 0) {
        const rescale = statuslineData.costUsd / prevTotal;
        cost.input *= rescale;
        cost.output *= rescale;
      }
    }

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

    // Derive max_concurrent by scanning overlapping spawn/complete windows.
    // An agent is "active" from its spawnedAt until its completedAt (or now if still active).
    const nowIso = new Date().toISOString();
    const agentWindows = agentActivities.map((a) => ({
      start: a.spawnedAt,
      end: a.completedAt ?? nowIso,
    }));
    // Sweep-line: count active agents at every boundary timestamp.
    const events: Array<{ time: string; delta: number }> = [];
    for (const w of agentWindows) {
      events.push({ time: w.start, delta: +1 });
      events.push({ time: w.end, delta: -1 });
    }
    // Sort: at same timestamp, starts (+1) before ends (-1)
    events.sort((a, b) => {
      const cmp = a.time.localeCompare(b.time);
      if (cmp !== 0) return cmp;
      return b.delta - a.delta;
    });
    let maxConcurrent = 0;
    let currentConcurrent = 0;
    for (const { delta } of events) {
      currentConcurrent += delta;
      if (currentConcurrent > maxConcurrent) maxConcurrent = currentConcurrent;
    }

    // ── Agent profiles ────────────────────────────────────────────────────
    // Build agent profiles first so total_tokens can be set correctly during
    // agents object construction, avoiding a fragile post-creation mutation.
    const agentProfiles: AgentProfile[] = this.buildAgentProfiles(agentActivities);
    const agentTotalTokens = agentProfiles.reduce(
      (sum, p) => sum + p.tokens_in + p.tokens_out, 0,
    );

    const agents: AgentMetrics = {
      spawned: agentActivities.length > 0
        ? agentActivities.length
        : (sessionCounters?.agents_spawned ?? 0),
      max_concurrent: maxConcurrent, // peak overlap derived from spawn/complete timestamp windows
      total_tokens: agentTotalTokens,
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
      const toolName = Aggregator.extractBaseToolName(tc.name ?? '');
      const inputPath = typeof tc.input['path'] === 'string' ? tc.input['path'] : null;
      if (inputPath !== null) {
        if (toolName === 'read' || toolName === 'precision_read') {
          uniqueReadFiles.add(inputPath);
        } else if (toolName === 'write' || toolName === 'precision_write') {
          createdFiles++;
        } else if (toolName === 'edit' || toolName === 'precision_edit') {
          uniqueReadFiles.add(inputPath);  // Edits modify existing files
        }
      }
      // Handle precision batch tools: precision_read / precision_write use a files[] array.
      if (toolName === 'precision_read' || toolName === 'precision_write') {
        const filesArr = tc.input['files'];
        if (Array.isArray(filesArr)) {
          for (const f of filesArr as unknown[]) {
            const p = typeof f === 'object' && f !== null && typeof (f as Record<string, unknown>)['path'] === 'string'
              ? (f as Record<string, unknown>)['path'] as string
              : null;
            if (p) {
              if (toolName === 'precision_read') uniqueReadFiles.add(p);
              else createdFiles++;
            }
          }
        }
      } else if (toolName === 'precision_edit') {
        // precision_edit uses an edits[] array, each item has 'path' or 'file'.
        const editsArr = tc.input['edits'];
        if (Array.isArray(editsArr)) {
          for (const e of editsArr as unknown[]) {
            if (typeof e === 'object' && e !== null) {
              const editRec = e as Record<string, unknown>;
              const p = typeof editRec['path'] === 'string'
                ? editRec['path'] as string
                : typeof editRec['file'] === 'string' ? editRec['file'] as string : null;
              if (p) uniqueReadFiles.add(p);
            }
          }
        }
      }
    }

    // ── Command metrics (Bug 2): JSONL as primary source, telemetry as supplement ──
    const commands: CommandMetrics = (() => {
      // Count bash/precision_exec/exec calls from JSONL tool calls.
      let jsonlCmdTotal = 0;
      let jsonlCmdFailures = 0;
      for (const tc of jsonlToolCalls) {
        const toolName = Aggregator.extractBaseToolName(tc.name ?? '');
        if (toolName === 'bash' || toolName === 'precision_exec' || toolName === 'exec') {
          jsonlCmdTotal++;
          if (tc.isError) jsonlCmdFailures++;
        }
      }

      if (jsonlCmdTotal > 0) {
        // JSONL-derived: accurate tool call counts.
        const successRate = (jsonlCmdTotal - jsonlCmdFailures) / jsonlCmdTotal;
        // Get avg_duration_ms from telemetry if available, else 0.
        const execBreakdown = telemetrySummary?.by_tool['exec'];
        const avgDuration = execBreakdown?.avg_ms ?? 0;
        return {
          total: jsonlCmdTotal,
          success_rate: successRate,
          avg_duration_ms: avgDuration,
          // total_duration_ms is approximate: telemetry avg_ms (all exec calls) × JSONL
          // command count (may differ from telemetry count). No per-call duration sum is
          // exposed by ToolBreakdown, so this is the best available estimate.
          total_duration_ms: avgDuration * jsonlCmdTotal,
          failures: jsonlCmdFailures,
          slowest: null,
        };
      }

      // Fall back to precision telemetry exec breakdown.
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
        slowest: null,
      };
    })();

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
    const recentActivity: ActivityEvent[] = this.buildRecentActivity(jsonlToolCalls, agentActivities);

    // ── File hotspots ─────────────────────────────────────────────────────
    const fileHotspots: FileHotspot[] = this.buildFileHotspots(
      toolsBreakdown,
      jsonlToolCalls,
      sessionCounters,
    );

    // agentProfiles already built above (before agents object creation).

    // ── Context window usage percentage ───────────────────────────────────
    // Prefer statusline data (authoritative real-time value from Claude Code).
    // Fall back to deriving from the most recent assistant record's input_tokens.
    let contextPercent = 0;
    if (statuslineData) {
      // Statusline reports exact percentage directly from Claude Code's runtime.
      // Clamp to [0, 100] to guard against out-of-range values in the JSON file.
      contextPercent = Math.max(0, Math.min(100, statuslineData.contextPercent));
    } else {
      // Fallback: derive from JSONL records.
      // The full conversation history is sent as input each turn, so the
      // most recent value approximates current context window fill level.
      const CONTEXT_WINDOW_SIZE = this.config?.context_window_tokens ?? 200_000; // tokens (configurable; default = Claude context window)
      for (let i = this.jsonlRecords.length - 1; i >= 0; i--) {
        const rec = this.jsonlRecords[i]!;
        if (rec.type === 'assistant') {
          const assistantRec = rec as JSONLAssistantRecord;
          const inputTok = assistantRec.message?.usage?.input_tokens;
          if (inputTok != null && inputTok > 0) {
            contextPercent = Math.min(100, (inputTok / CONTEXT_WINDOW_SIZE) * 100);
            break;
          }
        }
      }
    }

    // ── Anomaly detection ─────────────────────────────────────────────────
    const maxAgentChains = readMaxAgentChains(this.goodvibesDir);

    const partialState: DashboardState = {
      session_id: sessionId,
      project_hash: basename(dirname(this.goodvibesDir)),
      max_agent_chains: maxAgentChains,
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
      context_percent: contextPercent,
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
      project_hash: basename(dirname(this.goodvibesDir)),
      max_agent_chains: maxAgentChains,
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
      context_percent: contextPercent,
    };
  }

  /**
   * Build the recent activity list from the most recent telemetry records.
   */
  private buildRecentActivity(
    jsonlToolCalls: ToolCallInfo[],
    agentActivities: AgentActivityInfo[],
  ): ActivityEvent[] {
    const events: ActivityEvent[] = [];

    // Build events from JSONL tool calls (primary source — telemetry DB is often empty).
    for (const tc of jsonlToolCalls) {
      const toolName = Aggregator.extractBaseToolName(tc.name ?? '');
      events.push({
        timestamp: tc.timestamp,
        type: toolToActivityType(toolName),
        tool: toolName,
        description: tc.isError ? 'error' : 'ok',
        duration_ms: 0,
        cache_hit: false,
        tokens: 0,
        details: { status: tc.isError ? 'error' : 'success' },
      });
    }

    // Build events from agent spawn/complete records.
    for (const a of agentActivities) {
      events.push({
        timestamp: a.spawnedAt,
        type: 'agent_spawn',
        tool: 'Task',
        description: 'agent spawned',
        duration_ms: 0,
        cache_hit: false,
        tokens: 0,
        details: { agent_id: a.agentId },
      });
      if (a.completedAt !== undefined) {
        events.push({
          timestamp: a.completedAt,
          type: 'agent_complete',
          tool: 'Task',
          description: a.exitStatus === 'error' ? 'error' : 'completed',
          duration_ms: 0,
          cache_hit: false,
          tokens: 0,
          details: { agent_id: a.agentId, status: a.exitStatus },
        });
      }
    }

    // Also include precision telemetry records when available.
    const telemetryRecords = this.safeCall(
      () => this.telemetry.getRecentRecords(RECENT_ACTIVITY_LIMIT),
      [],
    );
    for (const r of telemetryRecords) {
      events.push({
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
      });
    }

    // Sort by timestamp descending and return most recent RECENT_ACTIVITY_LIMIT events.
    events.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    return events.slice(0, RECENT_ACTIVITY_LIMIT);
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
      const toolName = Aggregator.extractBaseToolName(tc.name ?? '');
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

      for (const rawPath of filePaths) {
        // Normalize path to avoid duplicate entries from relative vs absolute variants.
        const filePath = resolve(rawPath);
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
    const sessionDir = this.findSessionDir();

    return agentActivities.map((a) => {
      // Calculate duration from spawnedAt/completedAt timestamps when both are present.
      let duration_ms = 0;
      if (a.completedAt !== undefined) {
        const spawnMs = new Date(a.spawnedAt).getTime();
        const completeMs = new Date(a.completedAt).getTime();
        if (!isNaN(spawnMs) && !isNaN(completeMs) && completeMs >= spawnMs) {
          duration_ms = completeMs - spawnMs;
        }
      }

      // Try to find and parse the matching subagent JSONL file.
      let tokens_in = 0;
      let tokens_out = 0;
      let tool_calls = 0;

      if (sessionDir !== null) {
        const subagentData = this.parseSubagentFile(sessionDir, a.agentId);
        if (subagentData !== null) {
          tokens_in = subagentData.tokens_in;
          tokens_out = subagentData.tokens_out;
          tool_calls = subagentData.tool_calls;
        }
      }

      return {
        agent_id: a.agentId,
        agent_type: (a.taskInput['subagent_type'] as string) ?? (a.taskInput['description'] as string) ?? 'unknown',
        tokens_in,
        tokens_out,
        tool_calls,
        success_rate: 1,
        duration_ms,
        status: a.completed
          ? (a.exitStatus === 'error' ? 'failed' : 'completed')
          : 'active',
      };
    });
  }

  /**
   * Determine the session directory (parent dir of the active JSONL file).
   * Subagent files live at <session-dir>/subagents/agent-<id>.jsonl
   */
  private findSessionDir(): string | null {
    if (this.activeJsonlPath === null) return null;
    return dirname(this.activeJsonlPath);
  }

  /**
   * Parse a subagent JSONL file and return aggregated token/tool counts.
   *
   * @param sessionDir - Session directory (parent of the main JSONL file).
   * @param agentId    - Agent ID from the Task tool_use block (may be a prefix).
   */
  private parseSubagentFile(
    sessionDir: string,
    agentId: string,
  ): { tokens_in: number; tokens_out: number; tool_calls: number } | null {
    const subagentsDir = join(sessionDir, 'subagents');
    if (!existsSync(subagentsDir)) return null;

    // Find a matching file: exact match or agentId as prefix.
    // Use cached directory listing when the directory mtime is unchanged.
    let entries: string[];
    try {
      const dirStat = statSync(subagentsDir);
      if (this.subagentDirCache !== null && this.subagentDirCache.mtime === dirStat.mtimeMs) {
        entries = this.subagentDirCache.files;
      } else {
        entries = readdirSync(subagentsDir);
        this.subagentDirCache = { mtime: dirStat.mtimeMs, files: entries };
      }
    } catch {
      return null;
    }

    let subagentFile: string | null = null;
    for (const entry of entries) {
      if (!entry.startsWith('agent-') || !entry.endsWith('.jsonl')) continue;
      // The agentId is the tool_use id; the filename is agent-<id>.jsonl.
      // Try exact match first, then prefix match.
      const fileId = entry.slice('agent-'.length, -'.jsonl'.length);
      if (fileId === agentId || fileId.startsWith(agentId)) {
        subagentFile = join(subagentsDir, entry);
        break;
      }
    }

    if (subagentFile === null) return null;

    // Check file mtime cache before re-reading.
    try {
      const fileStat = statSync(subagentFile);
      const cached = this.subagentCache.get(subagentFile);
      if (cached !== undefined && cached.mtime === fileStat.mtimeMs) {
        return cached.data;
      }

      const content = readFileSync(subagentFile, 'utf8');
      const lines = content.split('\n').filter((l) => l.trim() !== '');
      let tokens_in = 0;
      let tokens_out = 0;
      let tool_calls = 0;

      for (const line of lines) {
        try {
          const entry = JSON.parse(line) as Record<string, unknown>;
          if (entry['type'] !== 'assistant') continue;
          const msg = entry['message'] as Record<string, unknown> | undefined;
          if (msg?.['usage']) {
            const usage = msg['usage'] as Record<string, number>;
            tokens_in += usage['input_tokens'] ?? 0;
            tokens_out += usage['output_tokens'] ?? 0;
          }
          const contentBlocks = msg?.['content'];
          if (Array.isArray(contentBlocks)) {
            for (const block of contentBlocks) {
              if (
                typeof block === 'object' && block !== null &&
                (block as Record<string, unknown>)['type'] === 'tool_use'
              ) {
                tool_calls++;
              }
            }
          }
        } catch {
          // Skip malformed lines.
        }
      }

      const result = { tokens_in, tokens_out, tool_calls };
      this.subagentCache.set(subagentFile, { mtime: fileStat.mtimeMs, data: result });
      return result;
    } catch {
      return null;
    }
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
   * `hit_rate` is a 0–1 count-based ratio derived from the precision engine:
   * `cache_hits / total_calls`. It is NOT a percentage and is NOT the Anthropic
   * API prompt cache ratio (`cache_read_tokens / api_input_tokens`).
   *
   * `hits` and `misses` are precision engine call counts, not token counts.
   * The API prompt cache is tracked separately in `tokens.cache_read`.
   *
   * `memory_peak_mb` and `evictions` are not tracked in the telemetry DB;
   * they are reported as 0 until a richer data source is available.
   */
  private buildCacheMetrics(
    telemetrySummary: ReturnType<TelemetryReader['getSessionSummary']> | null,
  ): CacheMetrics {
    // Precision engine cache: hit rate is count-based (hits / total calls).
    // This is distinct from the Anthropic API prompt cache (cache_read_tokens / api_input_tokens).
    // Do NOT conflate: tokens.cache_read is the API prompt cache, not the precision engine cache.
    const hits   = telemetrySummary?.total_cache_hits ?? 0;
    const total  = telemetrySummary?.total_calls      ?? 0;
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
  /**
   * Extract the base tool name from a raw MCP tool name.
   *
   * Strips the MCP prefix (e.g. 'mcp__plugin_goodvibes_precision-engine__precision_read'
   * becomes 'precision_read'). Also lowercases the result.
   *
   * @param rawName - Raw tool name from JSONL tool_use block.
   * @returns Lowercased base tool name without MCP prefix.
   */
  static extractBaseToolName(rawName: string): string {
    const name = rawName.toLowerCase();
    return name.includes('__') ? name.split('__').pop()! : name;
  }

  private safeCall<T>(fn: () => T, fallback: T): T {
    try {
      return fn();
    } catch (err) {
      this.logger.warn(`safeCall error: ${String(err)}`);
      return fallback;
    }
  }

  /**
   * Read authoritative context/cost data from Claude Code's statusline JSON file.
   *
   * Claude Code pipes statusline data to hook scripts via stdin. The user's
   * statusline script dumps this JSON to ~/.claude/debug-statusline-input.json,
   * making it available for polling by the analytics daemon.
   *
   * @returns Parsed statusline data, or null if the file doesn't exist,
   *          is stale (>60s old), or cannot be parsed.
   */
  private readStatuslineData(): StatuslineData | null {
    const filePath = join(homedir(), '.claude', 'debug-statusline-input.json');
    try {
      const stat = statSync(filePath);
      const ageMs = Date.now() - stat.mtimeMs;
      // Treat the file as stale after STATUSLINE_STALENESS_MS — the daemon
      // refreshes frequently, so stale data could mislead the dashboard.
      if (ageMs > STATUSLINE_STALENESS_MS) {
        return null;
      }
      const raw = readFileSync(filePath, 'utf-8');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const json = JSON.parse(raw);
      // Validate required structure before extracting values.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (typeof json?.context_window?.used_percentage !== 'number') {
        return null;
      }
      // Use Number() coercion with || 0 fallback to handle non-number values at
      // runtime without relying on `as number ?? 0` (which is a TypeScript-only
      // assertion — the ?? 0 never fires because `as number` always "succeeds").
      return {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        contextPercent:    Number(json.context_window.used_percentage)                                     || 0,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        contextWindowSize: Number(json.context_window.context_window_size)                                 || 0,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        apiInput:          Number(json.context_window.total_input_tokens)                                   || 0,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        apiOutput:         Number(json.context_window.total_output_tokens)                                  || 0,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        cacheRead:         Number(json.context_window.current_usage?.cache_read_input_tokens)               || 0,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        cacheWrite:        Number(json.context_window.current_usage?.cache_creation_input_tokens)           || 0,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        costUsd:           Number(json.cost?.total_cost_usd)                                                || 0,
      };
    } catch {
      // File doesn't exist or failed to parse — return null to use fallback.
      return null;
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
