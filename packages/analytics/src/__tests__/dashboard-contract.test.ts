/**
 * Dashboard tool contract tests: the tool accepts only
 * { action: report | doctor | status, scope? } — the old pane targets and
 * pane actions are gone — and each action answers per the contract:
 * report writes the self-contained HTML file and returns its absolute path
 * plus a 3-line summary; status returns brief engine text; doctor stays the
 * read-only observability view (covered in observability-modes.test.ts).
 */

import { describe, it, expect, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { handleDashboard } from '../engine/handlers/dashboard.js';
import { AnalyticsDashboardInput } from '../engine/schemas/tools.js';
import { dashboardTool } from '../tools/dashboard.js';
import { DEFAULT_CONFIG } from '../engine/types.js';
import type { Aggregator } from '../engine/daemon/aggregator.js';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gv-dash-'));
afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

/** Minimal stub exposing what report/status/doctor read from the Aggregator. */
const stubAgg = {
  getState: () => ({
    session_id: 'stub-session',
    project_hash: 'stub-project',
    max_agent_chains: 6,
    started_at: new Date().toISOString(),
    uptime_ms: 60_000,
    metrics: {
      tokens: { input: 0, output: 0, total: 0, saved: 0, efficiency: 0, api_input: 0, api_output: 0, cache_read: 0, cache_write: 0 },
      cache: { hit_rate: 0, hits: 0, misses: 0, memory_peak_mb: 0, evictions: 0 },
      cost: { input: 0, output: 0, total: 0, saved: 0 },
      tools: { total: 0, success_rate: 1, avg_duration_ms: 0, total_duration_ms: 0, failures: 0, slowest: null },
      agents: { spawned: 0, max_concurrent: 0, total_tokens: 0, active: 0, completed: 0 },
      files: { unique_read: 0, modified: 0, created: 0, conflicts: 0 },
    },
    tools_breakdown: {},
    recent_activity: [],
    file_hotspots: [],
    agent_profiles: [],
    anomalies: [],
    budget: null,
    health_status: 'healthy',
    context_percent: 0,
  }),
  getConfig: () => DEFAULT_CONFIG,
  getActiveJsonlPath: () => null,
  getGlobalDb: () => null,
} as unknown as Aggregator;

function textOf(res: { content: Array<{ text: string }> }): string {
  return res.content.map((c) => c.text).join('\n');
}

describe('dashboard input schema', () => {
  it('accepts report | doctor | status with optional scope', () => {
    expect(AnalyticsDashboardInput.parse({ action: 'report' }).action).toBe('report');
    expect(AnalyticsDashboardInput.parse({ action: 'doctor' }).action).toBe('doctor');
    expect(AnalyticsDashboardInput.parse({ action: 'status' }).action).toBe('status');
    expect(AnalyticsDashboardInput.parse({ action: 'report', scope: 'session' }).scope).toBe('session');
    expect(AnalyticsDashboardInput.parse({ action: 'report', scope: 'all_projects' }).scope).toBe('all_projects');
  });

  it('rejects the deleted pane actions and pane targets', () => {
    expect(() => AnalyticsDashboardInput.parse({ action: 'start' })).toThrow();
    expect(() => AnalyticsDashboardInput.parse({ action: 'stop' })).toThrow();
    expect(() => AnalyticsDashboardInput.parse({ action: 'report', scope: 'mini' })).toThrow();
    // Old pane fields are no longer part of the parsed shape.
    const parsed = AnalyticsDashboardInput.parse({ action: 'report', target: 'both' });
    expect('target' in parsed).toBe(false);
  });

  it('advertises the same contract in the advisory JSON schema', () => {
    const props = dashboardTool.inputSchema['properties'] as Record<string, { enum?: string[] }>;
    expect(props['action']!.enum).toEqual(['report', 'doctor', 'status']);
    expect(props['scope']!.enum).toEqual(['session', 'project', 'all_projects']);
    expect(props['target']).toBeUndefined();
    expect(props['options']).toBeUndefined();
  });
});

describe('dashboard actions', () => {
  it('report writes the HTML file and returns its absolute path plus a 3-line summary', async () => {
    const res = await handleDashboard(stubAgg, AnalyticsDashboardInput.parse({ action: 'report' }), tmpDir);
    const out = textOf(res);
    const lines = out.split('\n');

    const expectedPath = path.join(tmpDir, 'reports', 'analytics-report.html');
    expect(lines[0]).toBe(`Report written: ${expectedPath}`);
    expect(lines).toHaveLength(4); // path line + 3 summary lines
    expect(fs.existsSync(expectedPath)).toBe(true);

    const html = fs.readFileSync(expectedPath, 'utf8');
    expect(html).toContain('stub-session');
    expect(html.toLowerCase()).not.toContain('http');
  });

  it('status returns brief engine status text', async () => {
    const res = await handleDashboard(stubAgg, AnalyticsDashboardInput.parse({ action: 'status' }), tmpDir);
    const out = textOf(res);
    expect(out).toContain('Engine: running');
    expect(out).toContain('stub-session');
    expect(out).toContain('Global DB: unavailable');
  });
});
