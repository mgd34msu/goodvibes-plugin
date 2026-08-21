/**
 * HTML analytics report generator for the `dashboard` tool's `report` action.
 *
 * Renders a fully self-contained HTML page (inline CSS, inline SVG charts, no
 * external URLs, scripts, or fonts) from the SAME engine data the query
 * handler reads: the Aggregator's DashboardState (transcript actuals) plus the
 * live-cost per-model breakdown, and, when the global DB has data, this
 * project's session history and a cross-project summary.
 *
 * Two layers:
 *   - `renderAnalyticsReportHtml()`, pure string builder, testable with
 *     synthetic data.
 *   - `collectReportData()` / `writeAnalyticsReport()`, gather live data and
 *     persist the page to `<goodvibesDir>/reports/analytics-report.html`
 *     (stable name, overwritten each run).
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { DashboardState, GlobalSession } from '../types.js';
import type { Aggregator } from '../daemon/aggregator.js';
import { loadModelPricing } from '../config.js';
import { computeLiveSessionCost, type LiveCostReport } from '../observability/live-cost.js';
import {
  formatNumber,
  formatDollars,
  formatPercent,
  formatDuration,
  formatUptime,
} from '../format.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Report scope: which DB-backed sections to include beyond the live session. */
export type ReportScope = 'session' | 'project' | 'all_projects';

/** Cross-project rollup from the global DB. */
export interface CrossProjectSummary {
  session_count: number;
  project_count: number;
  total_cost_usd: number;
}

/** Everything the pure HTML renderer needs. */
export interface AnalyticsReportData {
  generated_at: string;
  scope: ReportScope;
  /** Live session snapshot, same DashboardState the query handler renders. */
  session: DashboardState;
  /** Per-model transcript costs (main loop + subagents), or null when unavailable. */
  live_cost: LiveCostReport | null;
  /** This project's past sessions from the global DB (scope: project/all_projects). */
  history: GlobalSession[] | null;
  /** Cross-project rollup from the global DB (scope: all_projects). */
  cross_project: CrossProjectSummary | null;
  /** Reason DB-backed sections are absent (e.g. native dep not installed). */
  global_db_note: string | null;
}

/** Result of writing the report to disk. */
export interface WrittenReport {
  /** Absolute path of the written HTML file. */
  path: string;
  /** Exactly three lines of stats for the tool result. */
  summary: [string, string, string];
}

/** Report file location under the project state dir, stable, overwritten. */
export const REPORT_SEGMENTS = ['reports', 'analytics-report.html'] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Data collection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Gather report data from the live engine.
 *
 * The session snapshot and per-model costs come from the transcript (actuals);
 * history and cross-project sections come from the global DB when it is
 * available and has data, otherwise they are null and the renderer says why.
 */
export async function collectReportData(
  aggregator: Aggregator,
  scope: ReportScope,
): Promise<AnalyticsReportData> {
  const session = aggregator.getState();

  let liveCost: LiveCostReport | null = null;
  try {
    const cfg = aggregator.getConfig();
    liveCost = await computeLiveSessionCost({
      transcriptPath: aggregator.getActiveJsonlPath(),
      pricingMap: loadModelPricing(),
      costConfig: {
        cost_per_1k_input_tokens: cfg.cost_per_1k_input_tokens,
        cost_per_1k_output_tokens: cfg.cost_per_1k_output_tokens,
      },
    });
  } catch {
    liveCost = null; // per-model section degrades; the overview still renders
  }

  let history: GlobalSession[] | null = null;
  let crossProject: CrossProjectSummary | null = null;
  let dbNote: string | null = null;

  if (scope !== 'session') {
    const db = aggregator.getGlobalDb();
    if (db === null) {
      dbNote = 'global analytics DB unavailable; historical and cross-project sections omitted';
    } else {
      try {
        const past = db.getSessionsByProject(session.project_hash);
        if (past.length > 0) {history = past;}

        if (scope === 'all_projects') {
          const all = db.getAllSessions();
          if (all.length > 0) {
            crossProject = {
              session_count: all.length,
              project_count: new Set(all.map((s) => s.project_hash)).size,
              total_cost_usd: db.getTotalCostAllProjects(),
            };
          }
        }
      } catch (err) {
        dbNote = `global analytics DB read failed: ${err instanceof Error ? err.message : String(err)}`;
        history = null;
        crossProject = null;
      }
    }
  }

  return {
    generated_at: new Date().toISOString(),
    scope,
    session,
    live_cost: liveCost,
    history,
    cross_project: crossProject,
    global_db_note: dbNote,
  };
}

/**
 * Collect, render, and write the report to
 * `<goodvibesDir>/reports/analytics-report.html` (created if missing,
 * overwritten each run). Returns the absolute path and a 3-line summary.
 */
export async function writeAnalyticsReport(
  aggregator: Aggregator,
  goodvibesDir: string,
  scope: ReportScope,
): Promise<WrittenReport> {
  const data = await collectReportData(aggregator, scope);
  const html = renderAnalyticsReportHtml(data);

  const reportsDir = resolve(goodvibesDir, REPORT_SEGMENTS[0]);
  mkdirSync(reportsDir, { recursive: true });
  const outPath = join(reportsDir, REPORT_SEGMENTS[1]);
  writeFileSync(outPath, html, 'utf8');

  return { path: outPath, summary: summaryLines(data) };
}

/** Build the 3-line stats summary returned alongside the file path. */
export function summaryLines(data: AnalyticsReportData): [string, string, string] {
  const m = data.session.metrics;
  const cost = data.live_cost && data.live_cost.grand_total_usd > 0
    ? data.live_cost.grand_total_usd
    : m.cost.total;
  const line1 =
    `Session ${data.session.session_id}: ${formatDollars(cost)} total, ` +
    `${m.tools.total} tool call(s) (${formatPercent(m.tools.success_rate)} success), health ${data.session.health_status}`;
  const line2 =
    `Tokens: in ${formatNumber(m.tokens.api_input)} / out ${formatNumber(m.tokens.api_output)} / ` +
    `cache read ${formatNumber(m.tokens.cache_read)} / cache write ${formatNumber(m.tokens.cache_write)}`;
  const historyPart = data.history !== null ? `${data.history.length} past session(s) on record` : 'no global DB history';
  const crossPart = data.cross_project !== null
    ? `; all projects: ${data.cross_project.session_count} session(s), ${formatDollars(data.cross_project.total_cost_usd)}`
    : '';
  const line3 =
    `Agents: ${m.agents.spawned} spawned; files: ${m.files.unique_read} read, ${m.files.modified + m.files.created} written; ` +
    historyPart + crossPart;
  return [line1, line2, line3];
}

// ─────────────────────────────────────────────────────────────────────────────
// HTML rendering (pure)
// ─────────────────────────────────────────────────────────────────────────────

/** Escape a string for safe embedding in HTML text/attributes. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** One row of a horizontal SVG bar chart. */
interface BarRow {
  label: string;
  value: number;
  display: string;
}

/**
 * Render a horizontal bar chart as inline SVG (no external references).
 * Bars scale to the max value; labels and values render as SVG text.
 */
function svgBarChart(rows: BarRow[], opts: { barClass: string }): string {
  if (rows.length === 0) {return '<p class="empty">no data</p>';}
  const rowH = 28;
  const labelW = 220;
  const valueW = 110;
  const chartW = 720;
  const barMax = chartW - labelW - valueW - 16;
  const height = rows.length * rowH;
  const max = Math.max(...rows.map((r) => r.value), 0);

  const bars = rows.map((r, i) => {
    const y = i * rowH;
    const w = max > 0 ? Math.max(2, Math.round((r.value / max) * barMax)) : 2;
    return (
      `<text x="${labelW - 8}" y="${y + 18}" text-anchor="end" class="bar-label">${esc(truncateLabel(r.label, 30))}</text>` +
      `<rect x="${labelW}" y="${y + 6}" width="${w}" height="16" rx="3" class="${opts.barClass}"></rect>` +
      `<text x="${labelW + w + 8}" y="${y + 18}" class="bar-value">${esc(r.display)}</text>`
    );
  });

  return (
    `<svg viewBox="0 0 ${chartW} ${height}" width="100%" height="${height}" role="img">` +
    bars.join('') +
    '</svg>'
  );
}

/** Truncate a chart label, keeping the tail (paths are most distinctive there). */
function truncateLabel(s: string, max: number): string {
  if (s.length <= max) {return s;}
  return '…' + s.slice(-(max - 1));
}

/** Render a two-column key/value overview table. */
function kvTable(rows: Array<[string, string]>): string {
  const body = rows
    .map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${esc(v)}</td></tr>`)
    .join('');
  return `<table class="kv">${body}</table>`;
}

const STYLE = `
:root {
  --bg: #ffffff;
  --fg: #1a1d21;
  --muted: #5c6570;
  --border: #d8dde3;
  --card: #f6f8fa;
  --accent: #2563eb;
  --accent2: #0d9488;
  --warn: #b45309;
  color-scheme: light dark;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #14171a;
    --fg: #e6e9ec;
    --muted: #9aa4af;
    --border: #333a42;
    --card: #1d2226;
    --accent: #60a5fa;
    --accent2: #2dd4bf;
    --warn: #fbbf24;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0 auto;
  padding: 24px;
  max-width: 860px;
  background: var(--bg);
  color: var(--fg);
  font: 15px/1.5 system-ui, sans-serif;
}
h1 { font-size: 1.4rem; margin: 0 0 4px; }
h2 { font-size: 1.05rem; margin: 28px 0 10px; border-bottom: 1px solid var(--border); padding-bottom: 6px; }
.meta { color: var(--muted); font-size: 0.85rem; margin-bottom: 20px; }
.note { color: var(--warn); font-size: 0.9rem; }
.empty { color: var(--muted); font-style: italic; }
table { border-collapse: collapse; width: 100%; font-size: 0.9rem; }
th, td { text-align: left; padding: 6px 10px; border-bottom: 1px solid var(--border); }
thead th { color: var(--muted); font-weight: 600; }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
table.kv th { width: 220px; color: var(--muted); font-weight: 500; }
.cards { display: flex; flex-wrap: wrap; gap: 12px; margin: 12px 0; }
.card {
  flex: 1 1 150px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px 14px;
}
.card .big { font-size: 1.3rem; font-weight: 700; font-variant-numeric: tabular-nums; }
.card .label { color: var(--muted); font-size: 0.8rem; }
svg { display: block; margin: 8px 0; }
svg text { font: 12px system-ui, sans-serif; fill: var(--fg); }
svg .bar-label { fill: var(--muted); }
svg .bar-value { font-variant-numeric: tabular-nums; }
.bar-cost { fill: var(--accent); }
.bar-hist { fill: var(--accent2); }
`;

/**
 * Render the complete self-contained HTML report. Pure: no I/O, no clock reads
 * (the timestamp comes from `data.generated_at`).
 */
export function renderAnalyticsReportHtml(data: AnalyticsReportData): string {
  const sections: string[] = [
    renderOverview(data),
    renderModelCosts(data),
    renderToolUsage(data.session),
    renderAgents(data.session),
    renderFiles(data.session),
  ];

  if (data.history !== null) {sections.push(renderHistory(data.history));}
  if (data.cross_project !== null) {sections.push(renderCrossProject(data.cross_project));}
  if (data.global_db_note !== null) {
    sections.push(`<p class="note">${esc(data.global_db_note)}</p>`);
  }

  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>GoodVibes analytics report: session ${esc(data.session.session_id)}</title>`,
    `<style>${STYLE}</style>`,
    '</head>',
    '<body>',
    '<h1>GoodVibes analytics report</h1>',
    `<p class="meta">Session ${esc(data.session.session_id)} · scope: ${esc(data.scope)} · generated ${esc(data.generated_at)}</p>`,
    ...sections,
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

/** Session overview: cost, tokens, cache. */
function renderOverview(data: AnalyticsReportData): string {
  const m = data.session.metrics;
  const cost = data.live_cost && data.live_cost.grand_total_usd > 0
    ? data.live_cost.grand_total_usd
    : m.cost.total;

  const cards = [
    ['Total cost', formatDollars(cost)],
    ['API input', formatNumber(m.tokens.api_input)],
    ['API output', formatNumber(m.tokens.api_output)],
    ['Cache read', formatNumber(m.tokens.cache_read)],
    ['Cache write', formatNumber(m.tokens.cache_write)],
  ]
    .map(
      ([label, value]) =>
        `<div class="card"><div class="big">${esc(value!)}</div><div class="label">${esc(label!)}</div></div>`,
    )
    .join('');

  const details = kvTable([
    ['Uptime', formatUptime(data.session.uptime_ms)],
    ['Health', data.session.health_status],
    ['Context window used', `${data.session.context_percent.toFixed(1)}%`],
    ['Cost saved (cached reads)', formatDollars(m.cost.saved)],
    ['Precision cache hit rate', formatPercent(m.cache.hit_rate)],
  ]);

  return `<h2>Session overview</h2><div class="cards">${cards}</div>${details}`;
}

/** Per-model cost from the live transcript (main loop + subagents). */
function renderModelCosts(data: AnalyticsReportData): string {
  const heading = '<h2>Per-model cost</h2>';
  const lc = data.live_cost;
  if (lc === null || lc.degraded !== null || lc.main === null) {
    const why = lc?.degraded ?? 'transcript cost breakdown unavailable';
    return `${heading}<p class="empty">${esc(why)}</p>`;
  }

  // Merge main-loop and subagent rows into one per-model rollup.
  const byModel = new Map<string, { cost: number; calls: number }>();
  const transcripts = [lc.main, ...lc.subagents];
  for (const t of transcripts) {
    for (const r of t.rows) {
      const agg = byModel.get(r.model) ?? { cost: 0, calls: 0 };
      agg.cost += r.cost_usd;
      agg.calls += r.api_calls;
      byModel.set(r.model, agg);
    }
  }

  const rows: BarRow[] = [...byModel.entries()]
    .sort((a, b) => b[1].cost - a[1].cost)
    .map(([model, agg]) => ({
      label: model,
      value: agg.cost,
      display: `${formatDollars(agg.cost)} (${agg.calls} calls)`,
    }));

  const split =
    `<p class="meta">Main loop: ${esc(formatDollars(lc.main.total_usd))} · ` +
    `subagents: ${esc(formatDollars(lc.subagents.reduce((s, a) => s + a.total_usd, 0)))} across ${lc.subagents.length} agent(s) · ` +
    `grand total: ${esc(formatDollars(lc.grand_total_usd))}</p>`;

  return heading + split + svgBarChart(rows, { barClass: 'bar-cost' });
}

/** Tool usage breakdown table. */
function renderToolUsage(session: DashboardState): string {
  const heading = '<h2>Tool usage</h2>';
  const entries = Object.entries(session.tools_breakdown).sort(
    ([, a], [, b]) => b.calls - a.calls,
  );
  const m = session.metrics.tools;
  const totals =
    `<p class="meta">${m.total} call(s) · ${esc(formatPercent(m.success_rate))} success · ` +
    `${m.failures} failure(s) · avg ${esc(formatDuration(m.avg_duration_ms))}</p>`;

  if (entries.length === 0) {
    return `${heading}${totals}<p class="empty">no per-tool breakdown recorded</p>`;
  }

  const body = entries
    .map(
      ([tool, b]) =>
        `<tr><td>${esc(tool)}</td><td class="num">${b.calls}</td>` +
        `<td class="num">${esc(formatDuration(b.avg_ms))}</td>` +
        `<td class="num">${esc(formatPercent(b.success_rate))}</td>` +
        `<td class="num">${esc(formatNumber(b.tokens_in))}</td>` +
        `<td class="num">${esc(formatNumber(b.tokens_out))}</td></tr>`,
    )
    .join('');

  return (
    heading +
    totals +
    '<table><thead><tr><th>Tool</th><th class="num">Calls</th><th class="num">Avg</th>' +
    '<th class="num">Success</th><th class="num">Tokens in</th><th class="num">Tokens out</th></tr></thead>' +
    `<tbody>${body}</tbody></table>`
  );
}

/** Agent activity table. */
function renderAgents(session: DashboardState): string {
  const heading = '<h2>Agents</h2>';
  const a = session.metrics.agents;
  const totals =
    `<p class="meta">${a.spawned} spawned · ${a.completed} completed · ${a.active} active · ` +
    `peak concurrency ${a.max_concurrent}</p>`;

  if (session.agent_profiles.length === 0) {
    return `${heading}${totals}<p class="empty">no agents spawned this session</p>`;
  }

  const body = session.agent_profiles
    .map(
      (p) =>
        `<tr><td>${esc(p.agent_id)}</td><td>${esc(p.agent_type)}</td><td>${esc(p.status)}</td>` +
        `<td class="num">${p.tool_calls}</td>` +
        `<td class="num">${esc(formatNumber(p.tokens_in + p.tokens_out))}</td>` +
        `<td class="num">${esc(formatDuration(p.duration_ms))}</td></tr>`,
    )
    .join('');

  return (
    heading +
    totals +
    '<table><thead><tr><th>Agent</th><th>Type</th><th>Status</th><th class="num">Calls</th>' +
    '<th class="num">Tokens</th><th class="num">Duration</th></tr></thead>' +
    `<tbody>${body}</tbody></table>`
  );
}

/** Files touched (hotspots) table. */
function renderFiles(session: DashboardState): string {
  const heading = '<h2>Files touched</h2>';
  const f = session.metrics.files;
  const totals =
    `<p class="meta">${f.unique_read} unique read · ${f.modified} modified · ${f.created} created</p>`;

  if (session.file_hotspots.length === 0) {
    return `${heading}${totals}<p class="empty">no file activity recorded</p>`;
  }

  const body = session.file_hotspots
    .map(
      (h) =>
        `<tr><td>${esc(truncateLabel(h.path, 70))}</td>` +
        `<td class="num">${h.reads}</td><td class="num">${h.writes}</td></tr>`,
    )
    .join('');

  return (
    heading +
    totals +
    '<table><thead><tr><th>File</th><th class="num">Reads</th><th class="num">Writes</th></tr></thead>' +
    `<tbody>${body}</tbody></table>`
  );
}

/** Historical sessions for this project (global DB). */
function renderHistory(history: GlobalSession[]): string {
  const heading = '<h2>Project history</h2>';
  const recent = [...history]
    .sort((a, b) => b.started_at.localeCompare(a.started_at))
    .slice(0, 15);
  const totalCost = history.reduce((s, h) => s + h.total_cost_usd, 0);

  const rows: BarRow[] = recent.map((h) => ({
    label: `${h.started_at.slice(0, 10)} ${h.session_id.slice(0, 8)}`,
    value: h.total_cost_usd,
    display: formatDollars(h.total_cost_usd),
  }));

  return (
    heading +
    `<p class="meta">${history.length} recorded session(s) · ${esc(formatDollars(totalCost))} total · showing the ${recent.length} most recent</p>` +
    svgBarChart(rows, { barClass: 'bar-hist' })
  );
}

/** Cross-project rollup (global DB). */
function renderCrossProject(summary: CrossProjectSummary): string {
  return (
    '<h2>All projects</h2>' +
    kvTable([
      ['Projects', String(summary.project_count)],
      ['Sessions', String(summary.session_count)],
      ['Total cost', formatDollars(summary.total_cost_usd)],
    ])
  );
}
