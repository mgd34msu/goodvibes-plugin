/**
 * Aggregator — Central state aggregator for the analytics-engine daemon.
 *
 * Composes all data readers (TelemetryReader, SessionReader, IndexReader) and
 * daemon components (AnomalyDetector, BudgetTracker, MemoryUpdater) into a
 * unified DashboardState. Drives event-driven refreshes via DataWatcher.
 *
 * Design:
 *   - initialize() must be called before getState() is meaningful.
 *   - State is recomputed on each refresh() call and on DataWatcher events.
 *   - MemoryUpdater analysis runs every 5th refresh to reduce disk I/O.
 *   - onStateChange callbacks are notified after every state update.
 *   - shutdown() cleanly stops the DataWatcher and closes the TelemetryReader.
 */

import { join } from 'node:path';

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

// ─────────────────────────────────────────────────────────────────────────────
// Aggregator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Central state aggregator for the analytics-engine daemon.
 *
 * Composes all data readers and daemon components into a single, consistent
 * `DashboardState` snapshot. Supports event-driven updates via DataWatcher.
 *
 * @example
 * ```ts
 * const agg = new Aggregator('/path/to/.goodvibes', config);
 * await agg.initialize();
 * agg.onStateChange((state) => render(state));
 * // ... later:
 * await agg.shutdown();
 * ```
 */
export class Aggregator {
  private readonly goodvibesDir: string;
  private readonly config: AnalyticsConfig;
  private readonly logger: Logger;

  // Data readers
  private telemetry!: TelemetryReader;
  private session!: SessionReader;
  private index!: IndexReader;

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

    // Instantiate daemon components
    this.anomalyDetector = new AnomalyDetector(this.telemetry, this.config, this.logger);
    this.budgetTracker = new BudgetTracker(this.config);
    this.memoryUpdater = new MemoryUpdater(join(this.goodvibesDir, 'memory'));

    // Wire DataWatcher events to targeted re-aggregation
    this.watcher = new DataWatcher(this.goodvibesDir);
    this.watcher.on('telemetry-change', () => { void this.refresh(); });
    this.watcher.on('session-change', () => { void this.refresh(); });
    this.watcher.on('index-change', () => { void this.refresh(); });
    this.watcher.on('config-change', () => { void this.refresh(); });
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

      this.notifyCallbacks();
    } catch (err) {
      this.logger.warn(`Aggregation refresh failed: ${String(err)}`);
    } finally {
      this.refreshing = false;
      if (this.refreshQueued) {
        this.refreshQueued = false;
        return this.refresh();
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
   * Clean shutdown: stop the DataWatcher, close the TelemetryReader.
   *
   * Safe to call multiple times — subsequent calls are no-ops.
   *
   * Async for future extensibility — shutdown steps may become async
   * (e.g. flushing buffered writes, awaiting in-flight refreshes).
   *
   * @returns Promise that resolves once shutdown is complete.
   */
  async shutdown(): Promise<void> {
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
  // Private: aggregation
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Compute a fresh DashboardState from all data sources.
   *
   * All errors within individual data sources are caught and logged so that
   * a single reader failure does not crash the entire aggregation.
   */
  private aggregate(): DashboardState {
    const now = Date.now();
    const startedAtMs = new Date(this.startedAt).getTime();
    const uptimeMs = now - startedAtMs;

    // ── Session identity ──────────────────────────────────────────────────
    const sessionId =
      this.telemetry?.getCurrentSessionId() ??
      this.session?.readCurrentSession()?.id ??
      'unknown';

    // ── Telemetry summary ─────────────────────────────────────────────────
    const telemetrySummary = this.safeCall(() => this.telemetry.getSessionSummary(), null);
    const tokenMetrics = this.safeCall(() => this.telemetry.getTokenMetrics(), null);

    // ── Token metrics ─────────────────────────────────────────────────────
    const tokens: TokenMetrics = tokenMetrics
      ? {
          ...tokenMetrics,
          api_input:   tokenMetrics.api_input   ?? 0,
          api_output:  tokenMetrics.api_output  ?? 0,
          cache_read:  tokenMetrics.cache_read  ?? 0,
          cache_write: tokenMetrics.cache_write ?? 0,
        }
      : {
          input: 0,
          output: 0,
          total: 0,
          saved: 0,
          efficiency: 0,
          api_input: 0,
          api_output: 0,
          cache_read: 0,
          cache_write: 0,
        };

    // ── Cache metrics ─────────────────────────────────────────────────────
    const cache: CacheMetrics = this.buildCacheMetrics(telemetrySummary);

    // ── Cost metrics ──────────────────────────────────────────────────────
    const cost: CostMetrics = {
      input: (tokens.input / 1000) * this.config.cost_per_1k_input_tokens,
      output: (tokens.output / 1000) * this.config.cost_per_1k_output_tokens,
      total:
        (tokens.input / 1000) * this.config.cost_per_1k_input_tokens +
        (tokens.output / 1000) * this.config.cost_per_1k_output_tokens,
      saved: (tokens.saved / 1000) * this.config.cost_per_1k_input_tokens,
    };

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

    // ── Agent metrics (from session reader) ───────────────────────────────
    const sessionCounters = this.safeCall(() => this.session.getSessionCounters(), null);
    const agents: AgentMetrics = {
      spawned: sessionCounters?.agents_spawned ?? 0,
      max_concurrent: 0, // Requires active session-state tracking
      total_tokens: 0,
      active: 0, // Requires active session-state tracking
      completed: 0, // Requires completion tracking — not yet available
    };

    // ── File metrics (from session reader) ────────────────────────────────
    const files: FileMetrics = {
      unique_read: 0,
      modified: sessionCounters?.files_modified.length ?? 0,
      created: 0,
      conflicts: 0,
    };

    const metrics: SessionMetrics = { tokens, cache, cost, commands, agents, files };

    // ── Tools breakdown ───────────────────────────────────────────────────
    const toolsBreakdown: Record<string, ToolBreakdown> =
      telemetrySummary?.by_tool ?? {};

    // ── Recent activity ───────────────────────────────────────────────────
    const recentActivity: ActivityEvent[] = this.buildRecentActivity();

    // ── File hotspots ─────────────────────────────────────────────────────
    const fileHotspots: FileHotspot[] = this.buildFileHotspots(toolsBreakdown);

    // ── Agent profiles ────────────────────────────────────────────────────
    const agentProfiles: AgentProfile[] = this.buildAgentProfiles();

    // ── Anomaly detection ─────────────────────────────────────────────────
    // Build a temporary partial state for the detector, then merge anomalies
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

    // Merge new anomalies (detect() handles its own pruning internally)
    const allAnomalies = [
      ...this.anomalyDetector.getActiveAnomalies(),
      ...newAnomalies,
    ]
      .filter((a, i, arr) => arr.findIndex((x) => x.id === a.id) === i) // deduplicate by id
      .slice(-MAX_ANOMALIES);

    // ── Budget tracking ───────────────────────────────────────────────────
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
   * Build file hotspot data from the tools breakdown.
   *
   * Uses the write/edit/read breakdown to approximate per-file access counts.
   * Without per-file telemetry, returns a simplified top-level summary.
   */
  private buildFileHotspots(_breakdown: Record<string, ToolBreakdown>): FileHotspot[] {
    // Per-file hotspot tracking requires metadata scanning which is expensive;
    // Return the top modified files from session counters if available.
    const counters = this.safeCall(() => this.session.getSessionCounters(), null);
    if (!counters || counters.files_modified.length === 0) return [];

    return counters.files_modified
      .slice(0, MAX_HOTSPOTS)
      .map((path): FileHotspot => ({
        path,
        reads: 0,
        writes: 1,
        conflicts: 0,
        tokens_saved: 0,
        last_accessed: new Date().toISOString(),
      }));
  }

  /**
   * Build agent profile data.
   *
   * Currently returns an empty array — per-agent token/timing data requires
   * session-state entries keyed by agent ID, which the current SessionReader
   * API does not expose. Will be populated when agent tracking is added to
   * the precision-engine data surface.
   */
  private buildAgentProfiles(): AgentProfile[] {
    return [];
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
