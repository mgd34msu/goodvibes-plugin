/**
 * ReportGenerator — session report generation for the analytics engine.
 *
 * Produces a structured Markdown report from a `DashboardState` snapshot,
 * optionally enriched with `HistoricalComparison` data.
 *
 * Two public methods:
 *   - `render()` — pure function; returns the Markdown string.
 *   - `generate()` — calls `render()` then persists to disk atomically.
 *
 * Atomic writes are performed using a temporary file followed by `fs.rename`.
 * All filesystem operations are wrapped in try/catch to prevent crashes in
 * non-critical reporting paths.
 */

import { writeFileSync, renameSync, mkdirSync } from 'node:fs';
import * as path from 'node:path';
import type {
  DashboardState,
  HistoricalComparison,
  SessionMetrics,
  ToolBreakdown,
  Anomaly,
  FileHotspot,
  AgentProfile,
} from '../types.js';
import {
  formatNumber,
  formatDollars,
  formatPercent,
  formatDuration,
  formatUptime,
  formatDelta,
} from '../tui/mini/format.js';

// ─────────────────────────────────────────────────────────────────────────────
// ReportGenerator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generates Markdown session reports from analytics dashboard state.
 *
 * @example
 * ```ts
 * const generator = new ReportGenerator('/path/to/.goodvibes/logs');
 *
 * // Pure render — returns Markdown string
 * const md = generator.render(sessionId, state, comparison);
 *
 * // Render + persist atomically to disk
 * const filePath = generator.generate(sessionId, state, comparison);
 * ```
 */
export class ReportGenerator {
  private readonly logsDir: string;

  /**
   * @param logsDir - Directory where session report files are written.
   *                  Typically `.goodvibes/logs`. Created automatically if it
   *                  does not exist.
   */
  constructor(logsDir: string) {
    this.logsDir = logsDir;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Public API
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Render a complete Markdown session report.
   *
   * This method is pure — it performs no I/O and always returns a string.
   * Suitable for use in API handlers that stream the report to a client.
   *
   * @param sessionId  - Session identifier, used in the report heading.
   * @param state      - Aggregated dashboard state to report on.
   * @param comparison - Optional historical comparison data. When provided,
   *                     a "Historical Comparison" section is appended.
   * @returns Complete Markdown report as a string.
   */
  render(
    sessionId: string,
    state: DashboardState,
    comparison?: HistoricalComparison,
  ): string {
    const sections: string[] = [
      this.renderHeader(sessionId),
      this.renderSummary(state),
      this.renderTokenUsage(state.metrics),
      this.renderCost(state.metrics),
      this.renderCachePerformance(state.metrics),
      this.renderCommands(state.metrics),
      this.renderAgents(state),
      this.renderFileHotspots(state.file_hotspots),
      this.renderToolBreakdown(state.tools_breakdown),
      this.renderAnomalies(state.anomalies),
    ];

    if (comparison !== undefined) {
      sections.push(this.renderHistoricalComparison(comparison));
    }

    sections.push(this.renderRecommendations(state));

    return sections.join('\n\n') + '\n';
  }

  /**
   * Render and persist a session report to disk.
   *
   * Writes the report atomically: content is first written to a temporary
   * file, then renamed into place. This prevents partial reads if the process
   * is interrupted mid-write.
   *
   * @param sessionId  - Session identifier, used for the output filename.
   * @param state      - Aggregated dashboard state to report on.
   * @param comparison - Optional historical comparison data.
   * @returns Absolute path of the written report file, or an empty string if
   *          writing failed.
   */
  generate(
    sessionId: string,
    state: DashboardState,
    comparison?: HistoricalComparison,
  ): string {
    const markdown = this.render(sessionId, state, comparison);
    const outPath = path.join(this.logsDir, `session-report-${sessionId}.md`);
    const tmpPath = `${outPath}.tmp`;

    try {
      mkdirSync(this.logsDir, { recursive: true });
    } catch (err) {
      console.warn('[ReportGenerator] Failed to create logs directory:', String(err));
      return '';
    }

    try {
      writeFileSync(tmpPath, markdown, 'utf-8');
    } catch (err) {
      console.warn('[ReportGenerator] Failed to write temporary report file:', String(err));
      return '';
    }

    try {
      renameSync(tmpPath, outPath);
    } catch (err) {
      console.warn('[ReportGenerator] Failed to rename report file:', String(err));
      return '';
    }

    return outPath;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Section renderers
  // ───────────────────────────────────────────────────────────────────────────

  private renderHeader(sessionId: string): string {
    const generated = new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC');
    return [
      `# Session Report: ${sessionId}`,
      `Generated: ${generated}`,
    ].join('\n');
  }

  private renderSummary(state: DashboardState): string {
    const uptime = formatUptime(state.uptime_ms);
    const { commands } = state.metrics;
    const total = commands.total;
    const successRate = formatPercent(commands.success_rate);
    const health = state.health_status;

    return [
      '## Summary',
      `- Duration: ${uptime}`,
      `- Total Tool Calls: ${formatNumber(total)} (${successRate} success)`,
      `- Health: ${health}`,
    ].join('\n');
  }

  private renderTokenUsage(metrics: SessionMetrics): string {
    const { tokens } = metrics;
    const efficiencyLabel = Number.isFinite(tokens.efficiency) && tokens.total + tokens.saved > 0
      ? `${(tokens.efficiency * 100).toFixed(1)}%`
      : '0.0%';

    return [
      '## Token Usage',
      '',
      '| Metric | Value |',
      '|--------|-------|',
      `| Input | ${formatNumber(tokens.input)} |`,
      `| Output | ${formatNumber(tokens.output)} |`,
      `| Total | ${formatNumber(tokens.total)} |`,
      `| Saved | ${formatNumber(tokens.saved)} |`,
      `| Efficiency | ${efficiencyLabel} |`,
    ].join('\n');
  }

  private renderCost(metrics: SessionMetrics): string {
    const { cost } = metrics;
    return [
      '## Cost',
      '',
      '| Metric | Value |',
      '|--------|-------|',
      `| Input Cost | ${formatDollars(cost.input)} |`,
      `| Output Cost | ${formatDollars(cost.output)} |`,
      `| Net Cost | ${formatDollars(cost.total)} |`,
      `| Savings | ${formatDollars(cost.saved)} |`,
    ].join('\n');
  }

  private renderCachePerformance(metrics: SessionMetrics): string {
    const { cache } = metrics;
    return [
      '## Cache Performance',
      '',
      '| Metric | Value |',
      '|--------|-------|',
      `| Hit Rate | ${formatPercent(cache.hit_rate)} |`,
      `| Hits | ${formatNumber(cache.hits)} |`,
      `| Misses | ${formatNumber(cache.misses)} |`,
      `| Evictions | ${formatNumber(cache.evictions)} |`,
      `| Peak Memory | ${cache.memory_peak_mb.toFixed(1)} MB |`,
    ].join('\n');
  }

  private renderCommands(metrics: SessionMetrics): string {
    const { commands } = metrics;
    const slowest = commands.slowest
      ? `${commands.slowest.command} (${formatDuration(commands.slowest.duration_ms)})`
      : 'N/A';

    return [
      '## Commands',
      '',
      '| Metric | Value |',
      '|--------|-------|',
      `| Total | ${formatNumber(commands.total)} |`,
      `| Success Rate | ${formatPercent(commands.success_rate)} |`,
      `| Failures | ${formatNumber(commands.failures)} |`,
      `| Avg Duration | ${formatDuration(commands.avg_duration_ms)} |`,
      `| Total Duration | ${formatDuration(commands.total_duration_ms)} |`,
      `| Slowest | ${slowest} |`,
    ].join('\n');
  }

  private renderAgents(state: DashboardState): string {
    const { agents } = state.metrics;
    const lines = [
      '## Agents',
      '',
      '| Metric | Value |',
      '|--------|-------|',
      `| Spawned | ${formatNumber(agents.spawned)} |`,
      `| Completed | ${formatNumber(agents.completed)} |`,
      `| Active | ${formatNumber(agents.active)} |`,
      `| Max Concurrent | ${formatNumber(agents.max_concurrent)} |`,
      `| Total Tokens | ${formatNumber(agents.total_tokens)} |`,
    ];

    if (state.agent_profiles.length > 0) {
      lines.push('', '### Agent Profiles', '');
      lines.push('| Agent | Type | Status | Calls | Duration | Success Rate |');
      lines.push('|-------|------|--------|-------|----------|--------------|');
      for (const profile of state.agent_profiles) {
        lines.push(
          `| ${profile.agent_id} | ${profile.agent_type} | ${profile.status} | ${formatNumber(profile.tool_calls)} | ${formatDuration(profile.duration_ms)} | ${formatPercent(profile.success_rate)} |`,
        );
      }
    }

    return lines.join('\n');
  }

  private renderFileHotspots(hotspots: FileHotspot[]): string {
    const top10 = hotspots
      .slice()
      .sort((a, b) => b.reads + b.writes - (a.reads + a.writes))
      .slice(0, 10);

    if (top10.length === 0) {
      return '## File Hotspots (top 10)\n\nNo file activity recorded.';
    }

    const lines = [
      '## File Hotspots (top 10)',
      '',
      '| File | Reads | Writes | Conflicts | Tokens Saved |',
      '|------|-------|--------|-----------|--------------|',
    ];

    for (const h of top10) {
      const shortPath = h.path.length > 60 ? `...${h.path.slice(-57)}` : h.path;
      lines.push(
        `| ${shortPath} | ${formatNumber(h.reads)} | ${formatNumber(h.writes)} | ${formatNumber(h.conflicts)} | ${formatNumber(h.tokens_saved)} |`,
      );
    }

    return lines.join('\n');
  }

  private renderToolBreakdown(breakdown: Record<string, ToolBreakdown>): string {
    const entries = Object.entries(breakdown).sort(
      ([, a], [, b]) => b.calls - a.calls,
    );

    if (entries.length === 0) {
      return '## Tool Breakdown\n\nNo tool calls recorded.';
    }

    const lines = [
      '## Tool Breakdown',
      '',
      '| Tool | Calls | Avg ms | Cache Hit % | Tokens In | Tokens Out | Success % |',
      '|------|-------|--------|-------------|-----------|------------|-----------|',
    ];

    for (const [tool, stats] of entries) {
      const cacheHit = stats.cache_hit_rate !== undefined
        ? formatPercent(stats.cache_hit_rate)
        : 'N/A';
      lines.push(
        `| ${tool} | ${formatNumber(stats.calls)} | ${formatNumber(stats.avg_ms)} | ${cacheHit} | ${formatNumber(stats.tokens_in)} | ${formatNumber(stats.tokens_out)} | ${formatPercent(stats.success_rate)} |`,
      );
    }

    return lines.join('\n');
  }

  private renderAnomalies(anomalies: Anomaly[]): string {
    if (anomalies.length === 0) {
      return '## Anomalies\n\nNo anomalies detected.';
    }

    const lines = [
      '## Anomalies',
      '',
      '| Severity | Type | Message | Timestamp |',
      '|----------|------|---------|-----------|',
    ];

    for (const a of anomalies) {
      const ts = a.timestamp.replace('T', ' ').replace(/\.\d+Z$/, ' UTC');
      lines.push(`| ${a.severity} | ${a.type} | ${a.message} | ${ts} |`);
    }

    return lines.join('\n');
  }

  private renderHistoricalComparison(comparison: HistoricalComparison): string {
    const { deltas, sessions } = comparison;
    const lines = [
      '## Historical Comparison',
      '',
      `Compared against ${sessions.length} historical session(s).`,
      '',
      '| Metric | Current | Avg | Delta |',
      '|--------|---------|-----|-------|',
    ];

    const current = comparison.current;
    const avg = comparison.average;

    // Token row
    const tokenDelta = deltas['tokens.total'];
    lines.push(
      `| Total Tokens | ${formatNumber(current.tokens.total)} | ${formatNumber(avg.tokens.total)} | ${tokenDelta ? formatDelta(current.tokens.total, avg.tokens.total) : 'N/A'} |`,
    );

    // Cost row
    const costDelta = deltas['cost.total'];
    lines.push(
      `| Net Cost | ${formatDollars(current.cost.total)} | ${formatDollars(avg.cost.total)} | ${costDelta ? formatDelta(current.cost.total, avg.cost.total) : 'N/A'} |`,
    );

    // Cache row
    const cacheDelta = deltas['cache.hit_rate'];
    lines.push(
      `| Cache Hit Rate | ${formatPercent(current.cache.hit_rate)} | ${formatPercent(avg.cache.hit_rate)} | ${cacheDelta ? formatDelta(current.cache.hit_rate, avg.cache.hit_rate) : 'N/A'} |`,
    );

    // Commands row
    const cmdDelta = deltas['commands.success_rate'];
    lines.push(
      `| Command Success | ${formatPercent(current.commands.success_rate)} | ${formatPercent(avg.commands.success_rate)} | ${cmdDelta ? formatDelta(current.commands.success_rate, avg.commands.success_rate) : 'N/A'} |`,
    );

    return lines.join('\n');
  }

  private renderRecommendations(state: DashboardState): string {
    const recs: string[] = [];

    // Cache hit rate recommendations
    const { cache, commands, tokens, agents } = state.metrics;
    if (cache.hit_rate < 0.5) {
      recs.push('- **Low cache hit rate** — Consider reviewing precision_read extract modes (use `outline` or `symbols` instead of `content` where possible).');
    } else if (cache.hit_rate < 0.7) {
      recs.push('- **Moderate cache hit rate** — Some improvement possible by using cheaper extract modes for discovery queries.');
    }

    // Error rate recommendations
    if (commands.total > 0 && commands.success_rate < 0.9) {
      recs.push(`- **Elevated failure rate** (${formatPercent(1 - commands.success_rate)}) — Review recent failures in the tool breakdown above.`);
    }

    // Token efficiency recommendations
    if (tokens.total > 0 && tokens.efficiency < 0.3) {
      recs.push('- **Low token efficiency** — Increase use of cached reads and cheaper extract modes to improve the savings ratio.');
    }

    // Anomaly recommendations
    if (state.anomalies.length > 0) {
      const alertCount = state.anomalies.filter((a) => a.severity === 'alert').length;
      if (alertCount > 0) {
        recs.push(`- **${alertCount} alert-severity anomaly(ies)** — Review the Anomalies section above for details.`);
      }
    }

    // Agent recommendations
    if (agents.spawned > 0 && agents.total_tokens > 0) {
      const avgAgentTokens = agents.total_tokens / agents.spawned;
      if (avgAgentTokens > 50_000) {
        recs.push(`- **High per-agent token usage** (avg ${formatNumber(avgAgentTokens)} tokens) — Consider narrowing agent scope or splitting into smaller tasks.`);
      }
    }

    if (recs.length === 0) {
      recs.push('- Session metrics look healthy. No specific recommendations.');
    }

    return ['## Recommendations', '', ...recs].join('\n');
  }
}
