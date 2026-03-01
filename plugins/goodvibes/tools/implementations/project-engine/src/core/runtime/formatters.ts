/**
 * Result formatting utilities for the runtime domain.
 *
 * Provides markdown formatting for log analysis and function profiling results.
 *
 * @module core/runtime/formatters
 */

import type { LogAnalyzerResult } from './types.js';

/**
 * A profiling result shape expected by formatProfileResult.
 *
 * Matches the ProfileFunctionResult interface from the profile handler.
 */
export interface ProfileResultShape {
  function_name: string;
  file: string;
  iterations: number;
  warmup_iterations: number;
  timing: {
    mean_ms: number;
    median_ms: number;
    p95_ms: number;
    p99_ms: number;
    min_ms: number;
    max_ms: number;
    std_dev_ms: number;
    total_ms: number;
  };
  memory?: {
    heap_used_before_mb: number;
    heap_used_after_mb: number;
    heap_delta_mb: number;
    external_delta_mb: number;
  };
  result_sample?: unknown;
  error?: string;
}

/**
 * Formats a LogAnalyzerResult as human-readable markdown.
 *
 * Includes time range, level distribution, anomalies, top errors,
 * top warnings, pattern matches, rate analysis, and a raw JSON block.
 *
 * @param result - The log analysis result to format
 * @returns Markdown-formatted string
 */
export function formatLogAnalysis(result: LogAnalyzerResult): string {
  const lines: string[] = [];

  lines.push('## Log Analysis Results');
  lines.push('');
  lines.push(`**Entries Analyzed:** ${result.entries_analyzed}`);
  lines.push(`**Format Detected:** ${result.format_detected}`);
  lines.push(
    `**Source:** ${result.source_info.type} (${result.source_info.path_or_command})`
  );
  lines.push(`**Lines Read:** ${result.source_info.lines_read}`);
  lines.push('');

  if (result.time_range.start) {
    lines.push('### Time Range');
    lines.push(`- Start: ${result.time_range.start}`);
    lines.push(`- End: ${result.time_range.end}`);
    if (result.time_range.duration_ms) {
      const durationMin = Math.round(result.time_range.duration_ms / 60000);
      lines.push(`- Duration: ${durationMin} minutes`);
    }
    lines.push('');
  }

  lines.push('### Log Level Distribution');
  lines.push(`- Debug: ${result.levels.debug}`);
  lines.push(`- Info: ${result.levels.info}`);
  lines.push(`- Warn: ${result.levels.warn}`);
  lines.push(`- Error: ${result.levels.error}`);
  lines.push(`- Unknown: ${result.levels.unknown}`);
  lines.push('');

  if (result.anomalies.length > 0) {
    lines.push('### Anomalies Detected');
    for (const anomaly of result.anomalies) {
      const severity = anomaly.severity.toUpperCase();
      lines.push(`- **[${severity}]** ${anomaly.type}: ${anomaly.description}`);
    }
    lines.push('');
  }

  if (result.errors.length > 0) {
    lines.push('### Top Errors');
    for (const err of result.errors.slice(0, 10)) {
      lines.push(`- **${err.count}x** ${err.message.slice(0, 100)}`);
      lines.push(`  - First: ${err.first_seen}, Last: ${err.last_seen}`);
    }
    lines.push('');
  }

  if (result.warnings.length > 0) {
    lines.push('### Top Warnings');
    for (const warn of result.warnings.slice(0, 5)) {
      lines.push(`- **${warn.count}x** ${warn.message.slice(0, 100)}`);
    }
    lines.push('');
  }

  if (Object.keys(result.patterns_matched).length > 0) {
    lines.push('### Custom Pattern Matches');
    for (const [name, count] of Object.entries(result.patterns_matched)) {
      lines.push(`- ${name}: ${count}`);
    }
    lines.push('');
  }

  if (result.rate_analysis) {
    lines.push('### Rate Analysis');
    lines.push(`- Entries/min: ${result.rate_analysis.entries_per_minute}`);
    lines.push(`- Errors/min: ${result.rate_analysis.errors_per_minute}`);
    lines.push(`- Peak period: ${result.rate_analysis.peak_period}`);
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  // The JSON block below is intentional: it provides machine-parseable output
  // alongside the human-readable markdown sections above, so consumers can
  // choose to process either format without re-requesting data.
  lines.push('```json');
  lines.push(JSON.stringify(result, null, 2));
  lines.push('```');

  return lines.join('\n');
}

/**
 * Formats a ProfileFunctionResult as human-readable markdown.
 *
 * Includes timing statistics table, optional memory statistics,
 * optional sample return value, and a raw JSON block.
 *
 * @param result - The profiling result to format
 * @returns Markdown-formatted string
 */
export function formatProfileResult(result: ProfileResultShape): string {
  const lines: string[] = [];

  lines.push('## Function Profile Results');
  lines.push('');
  lines.push(`**Function:** \`${result.function_name}\``);
  lines.push(`**File:** \`${result.file}\``);
  lines.push(`**Iterations:** ${result.iterations} (warmup: ${result.warmup_iterations})`);
  lines.push('');

  if (result.error) {
    lines.push('### Error');
    lines.push(`\`\`\`\n${result.error}\n\`\`\``);
    lines.push('');
  }

  lines.push('### Timing Statistics');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Mean | ${result.timing.mean_ms.toFixed(4)} ms |`);
  lines.push(`| Median | ${result.timing.median_ms.toFixed(4)} ms |`);
  lines.push(`| P95 | ${result.timing.p95_ms.toFixed(4)} ms |`);
  lines.push(`| P99 | ${result.timing.p99_ms.toFixed(4)} ms |`);
  lines.push(`| Min | ${result.timing.min_ms.toFixed(4)} ms |`);
  lines.push(`| Max | ${result.timing.max_ms.toFixed(4)} ms |`);
  lines.push(`| Std Dev | ${result.timing.std_dev_ms.toFixed(4)} ms |`);
  lines.push(`| Total | ${result.timing.total_ms.toFixed(2)} ms |`);
  lines.push('');

  if (result.memory) {
    lines.push('### Memory Statistics');
    lines.push('');
    lines.push('| Metric | Value |');
    lines.push('|--------|-------|');
    lines.push(`| Heap Before | ${result.memory.heap_used_before_mb.toFixed(4)} MB |`);
    lines.push(`| Heap After | ${result.memory.heap_used_after_mb.toFixed(4)} MB |`);
    lines.push(`| Heap Delta | ${result.memory.heap_delta_mb.toFixed(4)} MB |`);
    lines.push(`| External Delta | ${result.memory.external_delta_mb.toFixed(4)} MB |`);
    lines.push('');
  }

  if (result.result_sample !== undefined) {
    lines.push('### Sample Return Value');
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify(result.result_sample, null, 2));
    lines.push('```');
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  // The JSON block below is intentional: it provides machine-parseable output
  // alongside the human-readable markdown sections above.
  lines.push('```json');
  lines.push(JSON.stringify(result, null, 2));
  lines.push('```');

  return lines.join('\n');
}
