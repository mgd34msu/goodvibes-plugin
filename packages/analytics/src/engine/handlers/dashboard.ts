/**
 * analytics_dashboard handler — HTML report, host-health doctor, engine status.
 *
 * Actions:
 *   - report — write a fully self-contained HTML analytics report to
 *              `<goodvibesDir>/reports/analytics-report.html` (stable name,
 *              overwritten each run) and return the absolute path plus a
 *              3-line stats summary.
 *   - doctor — read-only host-health + agent-liveness report.
 *   - status — brief engine/server status text.
 */

import { resolve } from 'node:path';
import type { AnalyticsDashboardInput } from '../schemas/tools.js';
import type { Aggregator } from '../daemon/aggregator.js';
import { formatUptime } from '../format.js';
import { writeAnalyticsReport } from '../report/html.js';
import { type HandlerResponse, text } from './types.js';
import { runDoctor, runAgents } from './observability.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Handler function signature for analytics_dashboard. */
export type DashboardHandler = (
  aggregator: Aggregator,
  input: AnalyticsDashboardInput,
  goodvibesDir?: string,
) => Promise<HandlerResponse>;

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handle the `analytics_dashboard` MCP tool.
 *
 * @param aggregator  - Live Aggregator instance (session state, global DB).
 * @param input       - Validated AnalyticsDashboardInput.
 * @param goodvibesDir - Project state dir; reports are written beneath it.
 * @returns MCP response with descriptive text.
 */
export const handleDashboard: DashboardHandler = async (
  aggregator: Aggregator,
  input: AnalyticsDashboardInput,
  goodvibesDir?: string,
): Promise<HandlerResponse> => {
  const dir = goodvibesDir ?? resolve(process.env['GOODVIBES_DIR'] ?? '.goodvibes');
  try {
    switch (input.action) {
      case 'report':
        return await handleReport(aggregator, input.scope ?? 'all_projects', dir);
      case 'doctor':
        return handleDoctor(aggregator, dir);
      case 'status':
        return handleStatus(aggregator);
      default: {
        const _exhaustive: never = input.action;
        return text(`Unknown action: ${_exhaustive as string}`);
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return text(`analytics_dashboard error: ${message}`);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Action handlers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate the self-contained HTML report and return its absolute path plus
 * a 3-line stats summary.
 */
async function handleReport(
  aggregator: Aggregator,
  scope: 'session' | 'project' | 'all_projects',
  goodvibesDir: string,
): Promise<HandlerResponse> {
  const written = await writeAnalyticsReport(aggregator, goodvibesDir, scope);
  return text([`Report written: ${written.path}`, ...written.summary].join('\n'));
}

/**
 * Read-only host-health + agent-liveness report (lane 9). Never kills a
 * process — orphan offenders are listed with ready-to-run kill commands the
 * human runs (or doesn't).
 */
function handleDoctor(aggregator: Aggregator, goodvibesDir: string): HandlerResponse {
  const health = runDoctor(goodvibesDir);
  const agents = runAgents(aggregator);
  return text(`${health}\n\n${agents}`);
}

/** Brief engine/server status text. */
function handleStatus(aggregator: Aggregator): HandlerResponse {
  const state = aggregator.getState();
  const transcript = aggregator.getActiveJsonlPath();
  const lines = [
    `Engine: running | session ${state.session_id} | uptime ${formatUptime(state.uptime_ms)} | health ${state.health_status}`,
    `Transcript: ${transcript ?? 'not found (live metrics limited)'}`,
    `Global DB: ${aggregator.getGlobalDb() !== null ? 'available' : 'unavailable (historical / cross-project data offline)'}`,
  ];
  return text(lines.join('\n'));
}
