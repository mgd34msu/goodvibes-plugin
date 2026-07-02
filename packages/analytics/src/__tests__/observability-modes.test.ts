/**
 * Observability mode-dispatch tests (lane 9): verify that the `mode` param on
 * `query` and the `doctor` action on `dashboard` route to the observability
 * renderers (they are MODES of the existing tools, not new tools). Uses a stub
 * Aggregator so no SQLite/WASM is touched.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { handleQuery } from '../engine/handlers/query.js';
import { handleDashboard } from '../engine/handlers/dashboard.js';
import { AnalyticsQueryInput, AnalyticsDashboardInput } from '../engine/schemas/tools.js';
import { DEFAULT_CONFIG } from '../engine/types.js';
import type { Aggregator } from '../engine/daemon/aggregator.js';

/** Minimal stub exposing only what the observability runners touch. */
const stubAgg = {
  getConfig: () => DEFAULT_CONFIG,
  getActiveJsonlPath: () => null,
  getState: () => ({ session_id: 'stub' }),
} as unknown as Aggregator;

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gv-modes-'));

function textOf(res: { content: Array<{ text: string }> }): string {
  return res.content.map((c) => c.text).join('\n');
}

describe('query observability modes', () => {
  it('mode=live_cost routes to the live-cost renderer', async () => {
    const res = await handleQuery(stubAgg, AnalyticsQueryInput.parse({ mode: 'live_cost' }), tmpDir);
    expect(textOf(res)).toContain('Live Session Cost');
  });

  it('mode=agents routes to the agent-liveness renderer', async () => {
    const res = await handleQuery(stubAgg, AnalyticsQueryInput.parse({ mode: 'agents' }), tmpDir);
    expect(textOf(res)).toContain('Agent Liveness');
  });

  it('mode=doctor routes to the host-health renderer', async () => {
    const res = await handleQuery(stubAgg, AnalyticsQueryInput.parse({ mode: 'doctor' }), tmpDir);
    expect(textOf(res)).toContain('Host Health');
  });

  it('without mode, scope-based rendering still works (backward compatible)', async () => {
    // scope now defaults to 'all'; no mode → falls through to normal aggregation.
    const parsed = AnalyticsQueryInput.parse({});
    expect(parsed.scope).toBe('all');
    expect(parsed.mode).toBeUndefined();
  });
});

describe('dashboard doctor action', () => {
  it('action=doctor combines host-health and agent-liveness sections without launching a pane', async () => {
    const res = await handleDashboard(stubAgg, AnalyticsDashboardInput.parse({ action: 'doctor' }), tmpDir);
    const out = textOf(res);
    expect(out).toContain('Host Health');
    expect(out).toContain('Agent Liveness');
    // Read-only: never claims to have started/stopped a pane.
    expect(out).not.toMatch(/Started .* dashboard/);
  });
});
