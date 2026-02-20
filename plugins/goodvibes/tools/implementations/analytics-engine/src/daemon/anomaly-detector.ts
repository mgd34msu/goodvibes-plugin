/**
 * AnomalyDetector — rule-based anomaly detection for session telemetry.
 *
 * Evaluates a fixed set of rules against the current DashboardState and
 * TelemetryReader. Each rule inspects a rolling time window and returns an
 * Anomaly when a threshold is breached.
 *
 * Design:
 *   - Rules are stateless functions; deduplication is handled by the detector.
 *   - Anomalies fire at most once per window per type (same-type within same
 *     window does not re-fire).
 *   - A minimum of 10 total tool-call records is required before any rule
 *     fires, to avoid false positives at session start.
 *   - Detection is gated by `config.anomaly_detection`.
 */

import type {
  Anomaly,
  AnomalyType,
  AnomalySeverity,
  DashboardState,
  AnalyticsConfig,
  TelemetryRecord,
} from '../types.js';
import type { TelemetryReader } from '../data/telemetry-reader.js';

// ─────────────────────────────────────────────────────────────────────────────
// Logger
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal structured logger interface. */
interface Logger {
  warn(message: string, context?: Record<string, unknown>): void;
}

/** Default logger: prefixed console.warn. */
const DEFAULT_LOGGER: Logger = {
  warn: (msg) => console.warn(`[analytics] ${msg}`),
};

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A single anomaly detection rule.
 *
 * Rules are evaluated on every `detect()` call. Each rule inspects the
 * provided telemetry and dashboard state and returns an `Anomaly` if the
 * threshold is breached, or `null` if no anomaly is detected.
 */
export interface AnomalyRule {
  /** Unique anomaly type this rule detects. */
  type: AnomalyType;
  /** Severity level emitted when the rule fires. */
  severity: AnomalySeverity;
  /** Size of the rolling time window in milliseconds. */
  windowMs: number;
  /** Human-readable description of the rule. */
  description: string;
  /**
   * Evaluate the rule against the current state.
   *
   * @param telemetry - Read-only telemetry reader.
   * @param state     - Current aggregated dashboard state.
   * @returns An `Anomaly` if the rule fires, or `null` otherwise.
   */
  check: (telemetry: TelemetryReader, state: DashboardState) => Anomaly | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Minimum number of total tool-call records required before rules fire. */
const MIN_RECORDS_THRESHOLD = 10;

/** Build commands regex — matches typical build/test command strings. */
const BUILD_CMD_RE = /npm\s+run\s+(build|test|lint|typecheck)|npx\s+tsc|jest|vitest/i;

/**
 * Build a stable deduplication key for a rule within a time window.
 * Two calls with the same type that fall into the same window bucket produce
 * the same key and the anomaly will not fire again.
 *
 * @param now - Optional timestamp override (defaults to Date.now()) for testability.
 */
function windowKey(type: AnomalyType, windowMs: number, now: number = Date.now()): string {
  const bucket = Math.floor(now / windowMs);
  return `${type}:${bucket}`;
}

/**
 * Build a unique anomaly ID.
 */
function anomalyId(type: AnomalyType): string {
  return `anomaly_${type}_${Date.now()}`;
}

/**
 * Compute the average of a numeric array.  Returns 0 for empty arrays.
 */
function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

// ─────────────────────────────────────────────────────────────────────────────
// Built-in rules
// ─────────────────────────────────────────────────────────────────────────────

/** 5-minute window used by most rules. */
const WINDOW_5_MIN = 5 * 60 * 1_000;

/** 10-minute window for agent stall detection. */
const WINDOW_10_MIN = 10 * 60 * 1_000;

/**
 * Rule 1: Cache degradation.
 * Fires when the cache hit rate in the last 5 minutes drops more than 15
 * percentage points below the session average.
 */
const cacheDegradationRule: AnomalyRule = {
  type: 'cache_degradation',
  severity: 'warning',
  windowMs: WINDOW_5_MIN,
  description: 'Cache hit rate dropped >15% vs session average in a 5-min window',
  check(telemetry, state) {
    const windowRecords = telemetry.getRecordsInWindow(WINDOW_5_MIN);
    if (windowRecords.length === 0) return null;

    const windowHits = windowRecords.filter((r) => r.cache_hit).length;
    const windowRate = windowHits / windowRecords.length;

    const sessionRate = state.metrics.cache.hit_rate;
    const drop = sessionRate - windowRate;

    if (drop >= 0.15) {
      return {
        id: anomalyId('cache_degradation'),
        type: 'cache_degradation',
        severity: 'warning',
        message: `Cache hit rate degraded: ${(windowRate * 100).toFixed(1)}% in last 5m vs ${(sessionRate * 100).toFixed(1)}% session avg (drop: ${(drop * 100).toFixed(1)}pp)`,
        timestamp: new Date().toISOString(),
        details: {
          window_rate: windowRate,
          session_rate: sessionRate,
          drop_pp: drop,
          window_records: windowRecords.length,
        },
      };
    }
    return null;
  },
};

/**
 * Rule 2: Error spike.
 * Fires when the error rate in the last 5 minutes exceeds 25%.
 */
const errorSpikeRule: AnomalyRule = {
  type: 'error_spike',
  severity: 'alert',
  windowMs: WINDOW_5_MIN,
  description: 'Error rate exceeds 25% in a 5-min window',
  check(telemetry, _state) {
    const windowRecords = telemetry.getRecordsInWindow(WINDOW_5_MIN);
    if (windowRecords.length === 0) return null;

    const failed = windowRecords.filter((r) => r.status === 'failed').length;
    const errorRate = failed / windowRecords.length;

    if (errorRate > 0.25) {
      return {
        id: anomalyId('error_spike'),
        type: 'error_spike',
        severity: 'alert',
        message: `Error spike detected: ${(errorRate * 100).toFixed(1)}% failure rate in last 5m (${failed}/${windowRecords.length} calls)`,
        timestamp: new Date().toISOString(),
        details: {
          error_rate: errorRate,
          failed_calls: failed,
          total_calls: windowRecords.length,
        },
      };
    }
    return null;
  },
};

/**
 * Rule 3: Token burn.
 * Fires when the token consumption rate in the last 5 minutes is more than
 * 2x the overall session average rate.
 */
const tokenBurnRule: AnomalyRule = {
  type: 'token_burn',
  severity: 'warning',
  windowMs: WINDOW_5_MIN,
  description: 'Token consumption rate >2x session average in a 5-min window',
  check(telemetry, state) {
    const windowRecords = telemetry.getRecordsInWindow(WINDOW_5_MIN);
    if (windowRecords.length === 0) return null;

    const windowTokens = windowRecords.reduce(
      (sum, r) => sum + (r.tokens_in ?? 0) + (r.tokens_out ?? 0),
      0,
    );
    // Rate: tokens per millisecond over the actual recorded span, not the full
    // window duration — avoids artificially deflating the rate when records
    // only cover a fraction of the window.
    const earliest = Math.min(...windowRecords.map((r) => new Date(r.created_at).getTime()));
    const span = Math.max(Date.now() - earliest, 1);
    const windowRate = windowTokens / span;

    const sessionTotalTokens = state.metrics.tokens.total;
    const sessionUptimeMs = state.uptime_ms;
    if (sessionUptimeMs <= 0 || sessionTotalTokens <= 0) return null;

    const sessionRate = sessionTotalTokens / sessionUptimeMs;
    if (sessionRate <= 0) return null;

    const ratio = windowRate / sessionRate;
    if (ratio > 2) {
      return {
        id: anomalyId('token_burn'),
        type: 'token_burn',
        severity: 'warning',
        message: `Token burn rate is ${ratio.toFixed(1)}x session average (${Math.round(windowTokens).toLocaleString()} tokens in last 5m)`,
        timestamp: new Date().toISOString(),
        details: {
          window_tokens: windowTokens,
          window_rate_per_ms: windowRate,
          session_rate_per_ms: sessionRate,
          ratio,
        },
      };
    }
    return null;
  },
};

/**
 * Rule 4: Build regression.
 * Fires when the average build/test command duration in the last 5 minutes
 * is more than 2x the session average build duration.
 */
const buildRegressionRule: AnomalyRule = {
  type: 'build_regression',
  severity: 'warning',
  windowMs: WINDOW_5_MIN,
  description: 'Build/test duration >2x session average in a 5-min window',
  check(telemetry, _state) {
    const allRecords = telemetry.getRecords();
    const buildRecords = allRecords.filter(
      (r) =>
        r.tool === 'exec' &&
        r.metadata !== undefined &&
        isBuildCommand(r.metadata),
    );

    if (buildRecords.length < 2) return null;

    const windowSince = Date.now() - WINDOW_5_MIN;
    const windowBuildRecords = buildRecords.filter(
      (r) => new Date(r.created_at).getTime() >= windowSince,
    );
    if (windowBuildRecords.length === 0) return null;

    const sessionAvg = average(
      buildRecords.map((r) => r.duration_ms ?? 0).filter((d) => d > 0),
    );
    if (sessionAvg <= 0) return null;

    const windowAvg = average(
      windowBuildRecords.map((r) => r.duration_ms ?? 0).filter((d) => d > 0),
    );
    if (windowAvg <= 0) return null;

    const ratio = windowAvg / sessionAvg;
    if (ratio > 2) {
      return {
        id: anomalyId('build_regression'),
        type: 'build_regression',
        severity: 'warning',
        message: `Build regression: avg ${Math.round(windowAvg)}ms in last 5m vs ${Math.round(sessionAvg)}ms session avg (${ratio.toFixed(1)}x slower)`,
        timestamp: new Date().toISOString(),
        details: {
          window_avg_ms: windowAvg,
          session_avg_ms: sessionAvg,
          ratio,
          window_build_count: windowBuildRecords.length,
        },
      };
    }
    return null;
  },
};

/**
 * Rule 5: Conflict storm.
 * Fires when more than 3 file conflicts are detected in the last 5 minutes.
 * Conflicts are identified via the metadata field on telemetry records.
 */
const conflictStormRule: AnomalyRule = {
  type: 'conflict_storm',
  severity: 'alert',
  windowMs: WINDOW_5_MIN,
  description: '>3 file conflicts detected in a 5-min window',
  check(telemetry, state) {
    // First check the aggregated conflict count from DashboardState
    // (faster than scanning records). If the session total is low, skip.
    if (state.metrics.files.conflicts === 0) return null;

    const windowRecords = telemetry.getRecordsInWindow(WINDOW_5_MIN);
    const conflictRecords = windowRecords.filter((r) => isConflictRecord(r));

    if (conflictRecords.length > 3) {
      return {
        id: anomalyId('conflict_storm'),
        type: 'conflict_storm',
        severity: 'alert',
        message: `Conflict storm: ${conflictRecords.length} file conflicts in last 5m`,
        timestamp: new Date().toISOString(),
        details: {
          conflict_count: conflictRecords.length,
          window_ms: WINDOW_5_MIN,
        },
      };
    }
    return null;
  },
};

/**
 * Rule 6: Agent stall.
 * Fires when an agent has been running for more than 10 minutes without
 * recording a tool call. Identified by comparing agent spawn records against
 * the latest activity timestamp in the session.
 */
const agentStallRule: AnomalyRule = {
  type: 'agent_stall',
  severity: 'warning',
  windowMs: WINDOW_10_MIN,
  description: 'Agent running >10min without tool call',
  check(_telemetry, state) {
    // Use DashboardState agent profiles to find long-running active agents
    const now = Date.now();
    const stalledAgents: string[] = [];

    for (const profile of state.agent_profiles) {
      if (profile.status !== 'active') continue;

      // Find the most recent activity for this agent
      const agentActivity = state.recent_activity.filter(
        (a) => a.agent_id === profile.agent_id,
      );

      let lastActivityTime: number;
      if (agentActivity.length > 0) {
        const latest = agentActivity.reduce((a, b) =>
          new Date(a.timestamp).getTime() > new Date(b.timestamp).getTime() ? a : b,
        );
        lastActivityTime = new Date(latest.timestamp).getTime();
      } else {
        // No activity recorded: use the agent profile duration as a proxy
        // (the agent has been active for profile.duration_ms without tool calls)
        lastActivityTime = now - profile.duration_ms;
      }

      const idleMs = now - lastActivityTime;
      if (idleMs > WINDOW_10_MIN) {
        stalledAgents.push(profile.agent_id);
      }
    }

    if (stalledAgents.length > 0) {
      return {
        id: anomalyId('agent_stall'),
        type: 'agent_stall',
        severity: 'warning',
        message: `Agent stall: ${stalledAgents.length} agent(s) inactive >10min: ${stalledAgents.slice(0, 3).join(', ')}${stalledAgents.length > 3 ? '...' : ''}`,
        timestamp: new Date().toISOString(),
        details: {
          stalled_agents: stalledAgents,
          stall_threshold_ms: WINDOW_10_MIN,
        },
      };
    }
    return null;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Metadata helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true if a telemetry record's metadata indicates a build/test command.
 * The metadata field is a JSON string written by precision-engine.
 */
function isBuildCommand(metadata: string): boolean {
  try {
    const parsed: unknown = JSON.parse(metadata);
    const meta = typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : {};
    const cmd = typeof meta['cmd'] === 'string' ? meta['cmd'] : '';
    return BUILD_CMD_RE.test(cmd);
  } catch {
    return BUILD_CMD_RE.test(metadata);
  }
}

/**
 * Returns true if a telemetry record represents a file conflict.
 * Looks for conflict indicators in tool name and metadata.
 */
function isConflictRecord(record: TelemetryRecord): boolean {
  if (record.tool === 'conflict') return true;
  if (!record.metadata) return false;
  try {
    const parsed: unknown = JSON.parse(record.metadata);
    const meta = typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : {};
    return (
      meta['conflict'] === true ||
      meta['type'] === 'conflict' ||
      typeof meta['conflict_file'] === 'string'
    );
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AnomalyDetector
// ─────────────────────────────────────────────────────────────────────────────

/** All built-in rules, in evaluation order. */
const BUILT_IN_RULES: AnomalyRule[] = [
  cacheDegradationRule,
  errorSpikeRule,
  tokenBurnRule,
  buildRegressionRule,
  conflictStormRule,
  agentStallRule,
];

/**
 * Rule-based anomaly detector.
 *
 * Evaluates built-in rules on each `detect()` call, deduplicates within
 * rolling windows, and maintains an in-memory list of active anomalies.
 *
 * @example
 * ```ts
 * const detector = new AnomalyDetector(telemetryReader, config);
 * const newAnomalies = detector.detect(dashboardState);
 * const all = detector.getActiveAnomalies();
 * detector.prune(30 * 60 * 1000); // remove anomalies older than 30 min
 * ```
 */
export class AnomalyDetector {
  private readonly telemetry: TelemetryReader;
  private readonly config: AnalyticsConfig;
  private readonly rules: AnomalyRule[];
  private readonly logger: Logger;

  /**
   * In-memory list of detected anomalies (newest last).
   * Pruned on demand via `pruneStale()`.
   */
  private anomalies: Anomaly[] = [];

  /**
   * Deduplication map: windowKey(type, windowMs) → timestamp of last fire.
   * Prevents the same type from firing more than once per window bucket.
   */
  private readonly fired: Map<string, number> = new Map();

  /**
   * @param telemetry - Initialized TelemetryReader (may be unavailable).
   * @param config    - Analytics configuration (detection can be disabled).
   * @param logger    - Optional structured logger; defaults to prefixed console.warn.
   */
  constructor(telemetry: TelemetryReader, config: AnalyticsConfig, logger: Logger = DEFAULT_LOGGER) {
    this.telemetry = telemetry;
    this.config = config;
    this.rules = BUILT_IN_RULES;
    this.logger = logger;
  }

  /**
   * Evaluate all rules against the current state and return any new anomalies.
   *
   * Rules that have already fired within their window are skipped (deduplicated).
   * Anomalies are also appended to the internal list returned by
   * `getActiveAnomalies()`.
   *
   * Returns an empty array if:
   *   - `config.anomaly_detection` is false, or
   *   - fewer than 10 total tool-call records exist (early-session protection), or
   *   - the telemetry reader is unavailable.
   *
   * @param state - Current aggregated dashboard state.
   * @returns Newly detected anomalies (may be empty).
   */
  detect(state: DashboardState): Anomaly[] {
    if (!this.config.anomaly_detection) return [];
    if (!this.telemetry.isAvailable()) return [];

    // Enforce minimum data threshold to avoid false positives at session start
    const allRecords = this.telemetry.getRecords();
    if (allRecords.length < MIN_RECORDS_THRESHOLD) return [];

    // Prune stale dedup entries on every cycle to bound Map growth.
    this.pruneStale(30 * 60 * 1_000);

    const newAnomalies: Anomaly[] = [];
    const now = Date.now();

    for (const rule of this.rules) {
      const key = windowKey(rule.type, rule.windowMs, now);
      if (this.fired.has(key)) {
        // Already fired in this window bucket
        continue;
      }

      let anomaly: Anomaly | null = null;
      try {
        anomaly = rule.check(this.telemetry, state);
      } catch (err) {
        // Rule evaluation errors must not crash the detection loop
        this.logger.warn(`Rule '${rule.type}' threw an error: ${String(err)}`);
        continue;
      }

      if (anomaly !== null) {
        this.fired.set(key, now);
        this.anomalies.push(anomaly);
        newAnomalies.push(anomaly);
      }
    }

    return newAnomalies;
  }

  /**
   * Return all anomalies currently held in memory.
   *
   * The list includes all anomalies since the last `pruneStale()` call.
   * Ordered chronologically (oldest first).
   *
   * @returns Shallow copy of the active anomaly list.
   */
  getActiveAnomalies(): Anomaly[] {
    return [...this.anomalies];
  }

  /**
   * Remove anomalies older than `maxAgeMs` milliseconds from the in-memory
   * list, and clean up stale deduplication entries.
   *
   * Safe to call during or between `detect()` cycles. Keys to delete are
   * collected first to avoid mutating the Map during iteration.
   *
   * @param maxAgeMs - Maximum age in milliseconds. Anomalies older than this
   *                   are discarded.
   */
  pruneStale(maxAgeMs: number): void {
    const cutoff = Date.now() - maxAgeMs;

    this.anomalies = this.anomalies.filter(
      (a) => new Date(a.timestamp).getTime() > cutoff,
    );

    // Collect stale keys first, then delete — avoids mutating Map during iteration.
    const toDelete: string[] = [];
    for (const [key, ts] of this.fired.entries()) {
      if (ts < cutoff) toDelete.push(key);
    }
    for (const key of toDelete) this.fired.delete(key);
  }
}
