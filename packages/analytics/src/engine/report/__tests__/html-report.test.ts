/**
 * HTML analytics report tests.
 *
 * The renderer is pure, so these tests drive it with synthetic data and
 * assert the contract: every section present, fully self-contained output
 * (no external URLs, the page must render offline under Claude's strict
 * page policy), dark/light handled via prefers-color-scheme, and the writer
 * persists to the stable path and overwrites on re-run.
 */

import { describe, it, expect, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  renderAnalyticsReportHtml,
  writeAnalyticsReport,
  summaryLines,
  type AnalyticsReportData,
} from '../html.js';
import type { DashboardState, GlobalSession } from '../../types.js';
import type { LiveCostReport } from '../../observability/live-cost.js';
import { DEFAULT_CONFIG } from '../../types.js';
import type { Aggregator } from '../../daemon/aggregator.js';

// ── Synthetic data ────────────────────────────────────────────────────────────

function synthState(): DashboardState {
  return {
    session_id: 'synthetic-session',
    project_hash: 'my-project',
    max_agent_chains: 6,
    started_at: '2026-07-02T10:00:00.000Z',
    uptime_ms: 3_600_000,
    metrics: {
      tokens: {
        input: 1000, output: 500, total: 1500, saved: 200, efficiency: 0.13,
        api_input: 250_000, api_output: 40_000, cache_read: 3_000_000, cache_write: 90_000,
      },
      cache: { hit_rate: 0.8, hits: 40, misses: 10, memory_peak_mb: 0, evictions: 0 },
      cost: { input: 1.2, output: 2.4, total: 3.6, saved: 0.5 },
      tools: { total: 42, success_rate: 0.95, avg_duration_ms: 120, total_duration_ms: 5040, failures: 2, slowest: null },
      agents: { spawned: 3, max_concurrent: 2, total_tokens: 60_000, active: 1, completed: 2 },
      files: { unique_read: 15, modified: 6, created: 2, conflicts: 0 },
    },
    tools_breakdown: {
      read: { calls: 20, avg_ms: 80, tokens_in: 10_000, tokens_out: 0, success_rate: 1 },
      exec: { calls: 12, avg_ms: 300, tokens_in: 0, tokens_out: 0, success_rate: 0.9 },
    },
    recent_activity: [],
    file_hotspots: [
      { path: '/repo/src/a.ts', reads: 5, writes: 2, conflicts: 0, tokens_saved: 0, last_accessed: '2026-07-02T10:30:00.000Z' },
      { path: '/repo/src/b.ts', reads: 3, writes: 0, conflicts: 0, tokens_saved: 0, last_accessed: '2026-07-02T10:31:00.000Z' },
    ],
    agent_profiles: [
      { agent_id: 'agent-1', agent_type: 'reviewer', tokens_in: 20_000, tokens_out: 4_000, tool_calls: 9, success_rate: 1, duration_ms: 90_000, status: 'completed' },
    ],
    anomalies: [],
    budget: null,
    health_status: 'healthy',
    context_percent: 42.5,
  };
}

function synthLiveCost(): LiveCostReport {
  return {
    transcript_path: '/fake/session.jsonl',
    main: {
      label: 'main-loop',
      rows: [
        { model: 'claude-fable-5', input: 200_000, output: 30_000, cache_read: 2_500_000, cache_write: 80_000, api_calls: 50, cost_usd: 3.1 },
      ],
      api_calls: 50,
      total_usd: 3.1,
      parse_warnings: 0,
    },
    subagents: [
      {
        label: 'agent-1 (reviewer)',
        rows: [
          { model: 'claude-sonnet-5', input: 50_000, output: 10_000, cache_read: 500_000, cache_write: 10_000, api_calls: 12, cost_usd: 0.5 },
        ],
        api_calls: 12,
        total_usd: 0.5,
        parse_warnings: 0,
      },
    ],
    grand_total_usd: 3.6,
    degraded: null,
  };
}

function synthHistory(): GlobalSession[] {
  return [1, 2, 3].map((n) => ({
    session_id: `past-session-${n}`,
    project_hash: 'my-project',
    started_at: `2026-06-2${n}T09:00:00.000Z`,
    model: 'claude-fable-5',
    total_input_tokens: 100_000 * n,
    total_output_tokens: 20_000 * n,
    total_cache_read_tokens: 0,
    total_cache_write_tokens: 0,
    total_cost_usd: 1.5 * n,
    total_api_calls: 40 * n,
    total_tool_calls: 30 * n,
    total_native_tool_calls: 25 * n,
    total_precision_tool_calls: 5 * n,
    total_agent_spawns: n,
    tags: [],
    status: 'completed' as const,
  }));
}

function synthData(overrides: Partial<AnalyticsReportData> = {}): AnalyticsReportData {
  return {
    generated_at: '2026-07-02T11:00:00.000Z',
    scope: 'all_projects',
    session: synthState(),
    live_cost: synthLiveCost(),
    history: synthHistory(),
    cross_project: { session_count: 12, project_count: 4, total_cost_usd: 55.2 },
    global_db_note: null,
    ...overrides,
  };
}

// ── Renderer ─────────────────────────────────────────────────────────────────

describe('renderAnalyticsReportHtml', () => {
  it('renders every section with synthetic data', () => {
    const html = renderAnalyticsReportHtml(synthData());
    expect(html).toContain('Session overview');
    expect(html).toContain('Per-model cost');
    expect(html).toContain('Tool usage');
    expect(html).toContain('Agents');
    expect(html).toContain('Files touched');
    expect(html).toContain('Project history');
    expect(html).toContain('All projects');
    // Transcript actuals surface in the page.
    expect(html).toContain('claude-fable-5');
    expect(html).toContain('synthetic-session');
  });

  it('is fully self-contained: no external URL anywhere in the output', () => {
    const html = renderAnalyticsReportHtml(synthData());
    // Strict: not even inside comments, the page must never dial out.
    expect(html.toLowerCase()).not.toContain('http');
    expect(html).not.toContain('//cdn');
    expect(html).not.toContain('@import');
    expect(html).not.toContain('url(');
  });

  it('handles both color schemes via prefers-color-scheme', () => {
    const html = renderAnalyticsReportHtml(synthData());
    expect(html).toContain('prefers-color-scheme: dark');
    expect(html).toContain('color-scheme: light dark');
  });

  it('renders inline SVG charts for costs and history', () => {
    const html = renderAnalyticsReportHtml(synthData());
    expect(html).toContain('<svg viewBox=');
    expect(html).toContain('bar-cost');
    expect(html).toContain('bar-hist');
  });

  it('escapes HTML in dynamic strings', () => {
    const data = synthData();
    data.session.session_id = '<script>alert(1)</script>';
    const html = renderAnalyticsReportHtml(data);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('omits DB-backed sections and shows the note when the global DB is absent', () => {
    const html = renderAnalyticsReportHtml(
      synthData({ history: null, cross_project: null, global_db_note: 'global analytics DB unavailable; historical and cross-project sections omitted' }),
    );
    expect(html).not.toContain('Project history');
    expect(html).not.toContain('All projects');
    expect(html).toContain('global analytics DB unavailable');
  });

  it('degrades the per-model section honestly when the transcript is missing', () => {
    const html = renderAnalyticsReportHtml(synthData({ live_cost: null }));
    expect(html).toContain('Per-model cost');
    expect(html).toContain('transcript cost breakdown unavailable');
  });
});

// ── Summary ──────────────────────────────────────────────────────────────────

describe('summaryLines', () => {
  it('returns exactly three lines with the headline stats', () => {
    const lines = summaryLines(synthData());
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('synthetic-session');
    expect(lines[0]).toContain('$3.60'); // live-cost grand total wins over metrics estimate
    expect(lines[1]).toContain('250.0k'); // api_input
    expect(lines[2]).toContain('3 past session(s)');
    expect(lines[2]).toContain('12 session(s)');
  });
});

// ── Writer ───────────────────────────────────────────────────────────────────

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gv-report-'));
afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

const stubAgg = {
  getState: () => synthState(),
  getConfig: () => DEFAULT_CONFIG,
  getActiveJsonlPath: () => null,
  getGlobalDb: () => null,
} as unknown as Aggregator;

describe('writeAnalyticsReport', () => {
  it('writes the report to <goodvibesDir>/reports/analytics-report.html and overwrites on re-run', async () => {
    const first = await writeAnalyticsReport(stubAgg, tmpDir, 'all_projects');
    expect(first.path).toBe(path.join(tmpDir, 'reports', 'analytics-report.html'));
    expect(path.isAbsolute(first.path)).toBe(true);
    expect(fs.existsSync(first.path)).toBe(true);
    expect(first.summary).toHaveLength(3);

    const html = fs.readFileSync(first.path, 'utf8');
    expect(html).toContain('Session overview');
    expect(html.toLowerCase()).not.toContain('http');

    // Stable name: a second run lands on the same path, no siblings pile up.
    const second = await writeAnalyticsReport(stubAgg, tmpDir, 'session');
    expect(second.path).toBe(first.path);
    expect(fs.readdirSync(path.join(tmpDir, 'reports'))).toEqual(['analytics-report.html']);
  });
});
