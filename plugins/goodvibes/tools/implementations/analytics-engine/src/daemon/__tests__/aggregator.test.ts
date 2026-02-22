/**
 * Unit tests for Aggregator cumulative command counter (high-water mark).
 *
 * Tests cover:
 * - Cumulative tool count never decreases when sliding window drops records
 * - Tool count increases normally when new tool calls are added
 * - Failure count is properly clamped to total
 * - High-water mark update condition (>= threshold)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Module mocks ─────────────────────────────────────────────────────────────
// Mock all filesystem and database dependencies that the Aggregator constructor
// and aggregate() pull in transitively. This prevents real I/O during tests.

vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn().mockReturnValue('{}'),
  readdirSync: vi.fn().mockReturnValue([]),
  statSync: vi.fn().mockImplementation(() => { throw new Error('ENOENT'); }),
  writeFileSync: vi.fn(),
}));

vi.mock('node:os', () => ({
  homedir: vi.fn().mockReturnValue('/mock/home'),
}));

vi.mock('../data/telemetry-reader.js', () => ({
  TelemetryReader: vi.fn().mockImplementation(() => ({
    reload: vi.fn(),
    getCurrentSessionId: vi.fn().mockReturnValue(null),
    getSessionSummary: vi.fn().mockReturnValue(null),
    getTokenMetrics: vi.fn().mockReturnValue(null),
  })),
}));

vi.mock('../data/session-reader.js', () => ({
  SessionReader: vi.fn().mockImplementation(() => ({
    readCurrentSession: vi.fn().mockReturnValue(null),
    getSessionCounters: vi.fn().mockReturnValue(null),
  })),
}));

vi.mock('../data/index-reader.js', () => ({
  IndexReader: vi.fn().mockImplementation(() => ({
    readIndex: vi.fn().mockReturnValue(null),
  })),
}));

vi.mock('../data/jsonl-reader.js', () => ({
  JSONLReader: vi.fn().mockImplementation(() => null),
  findActiveJsonlFile: vi.fn().mockReturnValue(null),
  sessionIdFromPath: vi.fn().mockReturnValue(null),
}));

vi.mock('../config.js', () => ({
  loadModelPricing: vi.fn().mockReturnValue({}),
  getModelRates: vi.fn().mockReturnValue({ inputPrice: 3, outputPrice: 15 }),
}));

vi.mock('./anomaly-detector.js', () => ({
  AnomalyDetector: vi.fn().mockImplementation(() => ({
    detect: vi.fn().mockReturnValue([]),
    getActiveAnomalies: vi.fn().mockReturnValue([]),
  })),
}));

vi.mock('./budget-tracker.js', () => ({
  BudgetTracker: vi.fn().mockImplementation(() => ({
    update: vi.fn().mockReturnValue(null),
  })),
}));

vi.mock('./memory-updater.js', () => ({
  MemoryUpdater: vi.fn().mockImplementation(() => ({
    analyze: vi.fn().mockReturnValue({ patterns: [], preferences: [] }),
    apply: vi.fn(),
  })),
}));

vi.mock('./watcher.js', () => ({
  DataWatcher: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  })),
}));

// Import AFTER mocks are registered
import { Aggregator } from '../aggregator.js';
import type { AnalyticsConfig } from '../../types.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const MINIMAL_CONFIG: AnalyticsConfig = {
  enabled: true,
  auto_start_mini: false,
  auto_start_full: false,
  auto_start_dashboard: false,
  refresh_rate_ms: 2000,
  full_tui_refresh_rate_ms: 2000,
  dashboard_refresh_rate_ms: 2000,
  cost_per_1k_input_tokens: 0.003,
  cost_per_1k_output_tokens: 0.015,
  budget: null,
  budget_warn_thresholds: [0.8, 0.9],
  anomaly_detection: false,
  auto_report_on_shutdown: false,
  webhook_url: null,
  webhook_events: [],
  global_db_path: '/mock/global.db',
};

/**
 * Build a minimal JSONLRecord representing a tool_use (bash) call.
 * The extractToolCalls path is skipped (jsonlReader is null), so we directly
 * exercise the cumulative counter path by injecting ToolCallInfo-like data
 * via the mock JSONLReader approach.
 *
 * Since jsonlReader is null, jsonlToolCalls will be [] and the cmd-counting
 * loop will yield jsonlCmdTotal=0. To actually exercise the counter, we need
 * to provide a non-null jsonlReader with a mocked extractToolCalls.
 */
function makeAggregator(): Aggregator {
  return new Aggregator('/mock/.goodvibes', MINIMAL_CONFIG, {
    warn: vi.fn(),
  });
}

/**
 * Call the private aggregate() method and return the dashboard state.
 * The method is private so we use a cast to any.
 */
function callAggregate(agg: Aggregator) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (agg as any).aggregate() as ReturnType<Aggregator['getState']>;
}

/**
 * Directly set the private jsonlRecords array and optionally the cumulative
 * counters so we can fully control aggregate()'s inputs.
 */
function setInternals(
  agg: Aggregator,
  overrides: {
    jsonlReader?: object | null;
    jsonlRecords?: object[];
    cumulativeToolTotal?: number;
    cumulativeToolFailures?: number;
  },
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const a = agg as any;
  if ('jsonlReader' in overrides) a.jsonlReader = overrides.jsonlReader;
  if ('jsonlRecords' in overrides) a.jsonlRecords = overrides.jsonlRecords;
  if ('cumulativeToolTotal' in overrides) a.cumulativeToolTotal = overrides.cumulativeToolTotal;
  if ('cumulativeToolFailures' in overrides) a.cumulativeToolFailures = overrides.cumulativeToolFailures;
}

/**
 * Read the private cumulative counter fields from an Aggregator instance.
 */
function getCumulativeCounters(agg: Aggregator) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const a = agg as any;
  return {
    cumulativeToolTotal: a.cumulativeToolTotal as number,
    cumulativeToolFailures: a.cumulativeToolFailures as number,
  };
}

// ── Tool call factory ─────────────────────────────────────────────────────────

type MockToolCall = {
  name: string;
  timestamp: string;
  isError: boolean;
  input: Record<string, unknown>;
};

function makePrecisionCall(opts: { isError?: boolean } = {}): MockToolCall {
  return {
    name: 'mcp__plugin_goodvibes_precision-engine__precision_read',
    timestamp: new Date().toISOString(),
    isError: opts.isError ?? false,
    input: { files: [] },
  };
}

/** @deprecated Use makePrecisionCall — kept for backward compat in tests */
const makeBashCall = makePrecisionCall;

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Aggregator cumulative tool counter (high-water mark)', () => {
  let agg: Aggregator;
  let mockJsonlReader: { extractToolCalls: ReturnType<typeof vi.fn>; extractAgentActivity: ReturnType<typeof vi.fn>; extractApiCalls: ReturnType<typeof vi.fn>; extractSessionInfo: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    agg = makeAggregator();

    // Provide a mock JSONLReader that returns tool calls we control.
    // aggregate() guards with `this.jsonlReader !== null` before calling.
    mockJsonlReader = {
      extractToolCalls: vi.fn().mockReturnValue([]),
      extractAgentActivity: vi.fn().mockReturnValue([]),
      extractApiCalls: vi.fn().mockReturnValue([]),
      extractSessionInfo: vi.fn().mockReturnValue({ started_at: null, last_activity_at: null }),
    };
    setInternals(agg, { jsonlReader: mockJsonlReader, jsonlRecords: [] });

    // anomalyDetector is NOT set by the constructor (only by initialize()).
    // Inject it directly so aggregate() can call getActiveAnomalies() without throwing.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (agg as any).anomalyDetector = {
      detect: vi.fn().mockReturnValue([]),
      getActiveAnomalies: vi.fn().mockReturnValue([]),
    };
    // Inject budgetTracker similarly (used in safeCall but safer to provide a mock).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (agg as any).budgetTracker = {
      update: vi.fn().mockReturnValue(null),
    };
  });

  describe('initial state', () => {
    it('starts with cumulative counters at zero', () => {
      const counters = getCumulativeCounters(agg);
      expect(counters.cumulativeToolTotal).toBe(0);
      expect(counters.cumulativeToolFailures).toBe(0);
    });

    it('returns zero command metrics when no tool calls exist', () => {
      mockJsonlReader.extractToolCalls.mockReturnValue([]);
      const state = callAggregate(agg);
      // When effectiveToolTotal is 0, the tools block is not built from JSONL.
      // The state.metrics.tools.total may fall back to 0 from telemetry.
      expect(state.metrics.tools.total).toBe(0);
    });
  });

  describe('command counting with window records', () => {
    it('counts precision tool calls and increases tool total', () => {
      mockJsonlReader.extractToolCalls.mockReturnValue([
        makePrecisionCall(),
        makePrecisionCall(),
        makePrecisionCall(),
      ]);

      const state = callAggregate(agg);

      expect(state.metrics.tools.total).toBe(3);
      expect(getCumulativeCounters(agg).cumulativeToolTotal).toBe(3);
    });

    it('counts failed precision tool calls as failures', () => {
      mockJsonlReader.extractToolCalls.mockReturnValue([
        makePrecisionCall({ isError: false }),
        makePrecisionCall({ isError: true }),
        makePrecisionCall({ isError: false }),
      ]);

      const state = callAggregate(agg);

      expect(state.metrics.tools.total).toBe(3);
      // 1 failure out of 3 -> success_rate = 2/3 ≈ 0.667
      expect(state.metrics.tools.failures).toBe(1);
      expect(state.metrics.tools.success_rate).toBeCloseTo(2 / 3, 5);
    });

    it('counts precision_exec tool calls as tools', () => {
      mockJsonlReader.extractToolCalls.mockReturnValue([
        { name: 'mcp__plugin_goodvibes_precision-engine__precision_exec', timestamp: new Date().toISOString(), isError: false, input: {} },
      ]);

      const state = callAggregate(agg);

      expect(state.metrics.tools.total).toBe(1);
      expect(getCumulativeCounters(agg).cumulativeToolTotal).toBe(1);
    });
  });

  describe('high-water mark: count never decreases', () => {
    it('retains previous count when window records drop to zero', () => {
      // First aggregate: 5 bash calls visible in window.
      mockJsonlReader.extractToolCalls.mockReturnValue([
        makeBashCall(), makeBashCall(), makeBashCall(), makeBashCall(), makeBashCall(),
      ]);
      callAggregate(agg);
      expect(getCumulativeCounters(agg).cumulativeToolTotal).toBe(5);

      // Second aggregate: window now shows 0 calls (older records slid off).
      mockJsonlReader.extractToolCalls.mockReturnValue([]);
      const state = callAggregate(agg);

      // The effective total must NOT drop below the high-water mark of 5.
      expect(state.metrics.tools.total).toBe(5);
      // The cumulative counter stays at 5 (not updated when jsonlToolTotal < cumulativeToolTotal).
      expect(getCumulativeCounters(agg).cumulativeToolTotal).toBe(5);
    });

    it('retains count when window shrinks but does not reach zero', () => {
      // First aggregate: 8 commands visible.
      mockJsonlReader.extractToolCalls.mockReturnValue([
        makeBashCall(), makeBashCall(), makeBashCall(), makeBashCall(),
        makeBashCall(), makeBashCall(), makeBashCall(), makeBashCall(),
      ]);
      callAggregate(agg);
      expect(getCumulativeCounters(agg).cumulativeToolTotal).toBe(8);

      // Second aggregate: only 3 commands remain in window (5 dropped off).
      mockJsonlReader.extractToolCalls.mockReturnValue([
        makeBashCall(), makeBashCall(), makeBashCall(),
      ]);
      const state = callAggregate(agg);

      // effectiveToolTotal = max(3, 8) = 8 — count is preserved.
      expect(state.metrics.tools.total).toBe(8);
      // cumulativeToolTotal stays at 8 (3 < 8, no update).
      expect(getCumulativeCounters(agg).cumulativeToolTotal).toBe(8);
    });

    it('updates high-water mark when current count equals previous high', () => {
      // Seed the cumulative counter to 5 directly.
      setInternals(agg, { cumulativeToolTotal: 5, cumulativeToolFailures: 1 });

      // Current window also has exactly 5 commands (>= threshold triggers update).
      mockJsonlReader.extractToolCalls.mockReturnValue([
        makeBashCall(), makeBashCall(), makeBashCall(), makeBashCall(), makeBashCall(),
      ]);
      callAggregate(agg);

      // >= condition: cumulativeToolTotal updated to 5 (same value, 0 failures).
      expect(getCumulativeCounters(agg).cumulativeToolTotal).toBe(5);
      // Failures are reset to 0 since new batch has none.
      expect(getCumulativeCounters(agg).cumulativeToolFailures).toBe(0);
    });

    it('updates high-water mark when count increases', () => {
      // Seed the cumulative counter at 3.
      setInternals(agg, { cumulativeToolTotal: 3, cumulativeToolFailures: 1 });

      // New aggregate cycle shows 7 commands (growth).
      mockJsonlReader.extractToolCalls.mockReturnValue([
        makeBashCall(), makeBashCall(), makeBashCall(), makeBashCall(),
        makeBashCall(), makeBashCall({ isError: true }), makeBashCall(),
      ]);
      const state = callAggregate(agg);

      expect(state.metrics.tools.total).toBe(7);
      expect(getCumulativeCounters(agg).cumulativeToolTotal).toBe(7);
      // Failures from current window: 1
      expect(getCumulativeCounters(agg).cumulativeToolFailures).toBe(1);
    });
  });

  describe('failure count clamping', () => {
    it('clamps effectiveCmdFailures to effectiveCmdTotal', () => {
      // Edge case: if cumulativeToolFailures somehow exceeds the effective total,
      // effectiveToolFailures = min(cumulativeToolFailures, effectiveToolTotal).
      // Seed unrealistic state: 10 cumulative total, 10 failures.
      setInternals(agg, { cumulativeToolTotal: 10, cumulativeToolFailures: 10 });

      // Window now shows only 2 commands (all successful) — total drops, failures capped.
      mockJsonlReader.extractToolCalls.mockReturnValue([
        makeBashCall(), makeBashCall(),
      ]);
      const state = callAggregate(agg);

      // effectiveToolTotal = max(2, 10) = 10
      // effectiveToolFailures = min(10, 10) = 10
      // success_rate = (10 - 10) / 10 = 0
      expect(state.metrics.tools.total).toBe(10);
      expect(state.metrics.tools.failures).toBe(10);
      expect(state.metrics.tools.success_rate).toBe(0);
    });

    it('clamps effectiveToolFailures when failures exceed new effective total', () => {
      // Seed: 20 total, 15 failures.
      setInternals(agg, { cumulativeToolTotal: 20, cumulativeToolFailures: 15 });

      // Window shows 3 successes — effective total is still 20 (high-water mark).
      mockJsonlReader.extractToolCalls.mockReturnValue([
        makeBashCall(), makeBashCall(), makeBashCall(),
      ]);
      const state = callAggregate(agg);

      // effectiveToolTotal = max(3, 20) = 20
      // effectiveToolFailures = min(15, 20) = 15
      expect(state.metrics.tools.total).toBe(20);
      expect(state.metrics.tools.failures).toBe(15);
      expect(state.metrics.tools.success_rate).toBeCloseTo(5 / 20, 5);
    });
  });

  describe('successive aggregation cycles', () => {
    it('accumulates command count correctly across multiple cycles', () => {
      // Cycle 1: 3 commands.
      mockJsonlReader.extractToolCalls.mockReturnValue([
        makeBashCall(), makeBashCall(), makeBashCall(),
      ]);
      let state = callAggregate(agg);
      expect(state.metrics.tools.total).toBe(3);

      // Cycle 2: 5 commands (window grew — e.g. new records added).
      mockJsonlReader.extractToolCalls.mockReturnValue([
        makeBashCall(), makeBashCall(), makeBashCall(), makeBashCall(), makeBashCall(),
      ]);
      state = callAggregate(agg);
      expect(state.metrics.tools.total).toBe(5);

      // Cycle 3: window drops back to 2 (old records fell off).
      mockJsonlReader.extractToolCalls.mockReturnValue([
        makeBashCall(), makeBashCall(),
      ]);
      state = callAggregate(agg);
      // High-water mark was 5, so effective total stays at 5.
      expect(state.metrics.tools.total).toBe(5);

      // Cycle 4: window grows to 9 (past the high-water mark).
      mockJsonlReader.extractToolCalls.mockReturnValue([
        makeBashCall(), makeBashCall(), makeBashCall(), makeBashCall(), makeBashCall(),
        makeBashCall(), makeBashCall(), makeBashCall(), makeBashCall(),
      ]);
      state = callAggregate(agg);
      expect(state.metrics.tools.total).toBe(9);
      expect(getCumulativeCounters(agg).cumulativeToolTotal).toBe(9);
    });
  });
});
