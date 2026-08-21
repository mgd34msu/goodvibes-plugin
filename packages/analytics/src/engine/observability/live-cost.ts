/**
 * Live session-cost reader (lane 9).
 *
 * Prices the CURRENT session's still-growing transcript on demand, split
 * main-loop vs per-subagent, using the existing per-model cache-aware pricing
 * table. Unlike the aggregator's rolling window, this re-reads the transcript
 * fresh each call so the answer reflects the live file at query time.
 *
 * Tail tolerance comes for free from {@link JSONLReader.parseFile}: a truncated
 * final line (the file is being appended to as we read) is skipped, and unknown
 * event types are ignored, never fatal. Everything degrades honestly: no
 * transcript path yields a `degraded` report rather than an error.
 *
 * Subagent transcripts live at `<projectDir>/<session-id>/subagents/agent-*.jsonl`
 * (with `agent-*.meta.json` sidecars) and, where present, a sibling `tasks/`
 * directory.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { JSONLReader } from '../data/jsonl-reader.js';
import type { ModelPricingMap } from '../config.js';
import { pricingProvenance } from '../config.js';
import { formatNumber, formatDollars } from '../format.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Cache/token/cost totals for one model within one transcript. */
export interface ModelCostRow {
  model: string;
  input: number;
  output: number;
  cache_read: number;
  cache_write: number;
  api_calls: number;
  cost_usd: number;
}

/** Aggregate cost for a single transcript (main loop or one subagent). */
export interface TranscriptCost {
  /** Display label: 'main-loop' or the agent id / type. */
  label: string;
  rows: ModelCostRow[];
  api_calls: number;
  total_usd: number;
  /** Non-fatal parse issues (e.g. skipped truncated tail). */
  parse_warnings: number;
}

/** The full live-cost report. */
export interface LiveCostReport {
  transcript_path: string | null;
  main: TranscriptCost | null;
  subagents: TranscriptCost[];
  grand_total_usd: number;
  degraded: string | null;
}

/** Options for {@link computeLiveSessionCost}. */
export interface LiveCostOptions {
  /** Absolute path to the current session's `<session-id>.jsonl`, or null. */
  transcriptPath: string | null;
  /** Per-model cache-aware pricing map (from `loadModelPricing()`). */
  pricingMap: ModelPricingMap;
  /** Flat fallback rates for models absent from the pricing map. */
  costConfig: { cost_per_1k_input_tokens: number; cost_per_1k_output_tokens: number };
}

// ─────────────────────────────────────────────────────────────────────────────
// Costing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Read one transcript file, tail-tolerantly, and roll its API calls up into
 * per-model cost rows via the shared cache-aware pricing.
 */
async function costTranscript(
  reader: JSONLReader,
  filePath: string,
  label: string,
): Promise<TranscriptCost> {
  const parsed = await reader.parseFile(filePath, 0);
  const apiCalls = reader.extractApiCalls(parsed.records);

  const byModel = new Map<string, ModelCostRow>();
  let total = 0;
  for (const call of apiCalls) {
    const model = call.model ?? 'unknown';
    let row = byModel.get(model);
    if (!row) {
      row = { model, input: 0, output: 0, cache_read: 0, cache_write: 0, api_calls: 0, cost_usd: 0 };
      byModel.set(model, row);
    }
    row.input += call.input_tokens;
    row.output += call.output_tokens;
    row.cache_read += call.cache_read_tokens;
    row.cache_write += call.cache_write_tokens;
    row.api_calls += 1;
    row.cost_usd += call.cost_usd;
    total += call.cost_usd;
  }

  const rows = [...byModel.values()].sort((a, b) => b.cost_usd - a.cost_usd);
  return {
    label,
    rows,
    api_calls: apiCalls.length,
    total_usd: total,
    parse_warnings: parsed.errors.length,
  };
}

/** Discover subagent/task transcript files for a session. */
function collectSubagentTranscripts(sessionDir: string): string[] {
  const files: string[] = [];

  const subagentsDir = join(sessionDir, 'subagents');
  try {
    for (const e of readdirSync(subagentsDir)) {
      if (e.startsWith('agent-') && e.endsWith('.jsonl')) {files.push(join(subagentsDir, e));}
    }
  } catch {
    /* no subagents dir */
  }

  const tasksDir = join(sessionDir, 'tasks');
  const walk = (dir: string, depth: number): void => {
    if (depth > 2) {return;}
    let entries: import('node:fs').Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const full = join(dir, ent.name);
      if (ent.isDirectory()) {walk(full, depth + 1);}
      else if (ent.isFile() && ent.name.endsWith('.jsonl')) {files.push(full);}
    }
  };
  walk(tasksDir, 0);

  return files;
}

/** Label a subagent transcript from its `.meta.json` sidecar, falling back to the id. */
function labelForSubagent(file: string): string {
  const name = basename(file);
  const idMatch = /^agent-(.+)\.jsonl$/.exec(name);
  const id = idMatch ? idMatch[1]! : basename(name, '.jsonl');
  const metaPath = file.replace(/\.jsonl$/, '.meta.json');
  try {
    const parsed = JSON.parse(readFileSync(metaPath, 'utf8')) as Record<string, unknown>;
    const type = typeof parsed['agentType'] === 'string' ? parsed['agentType'] : null;
    return type ? `${id} (${type})` : id;
  } catch {
    return id;
  }
}

/**
 * Compute the live session cost, split main-loop vs per-subagent.
 *
 * @returns a report even on failure, `degraded` explains any missing section
 *   rather than throwing.
 */
export async function computeLiveSessionCost(options: LiveCostOptions): Promise<LiveCostReport> {
  if (!options.transcriptPath) {
    return {
      transcript_path: null,
      main: null,
      subagents: [],
      grand_total_usd: 0,
      degraded: 'no active session transcript found; live cost unavailable',
    };
  }

  const reader = new JSONLReader(options.costConfig, options.pricingMap);

  let main: TranscriptCost | null = null;
  try {
    main = await costTranscript(reader, options.transcriptPath, 'main-loop');
  } catch (err) {
    return {
      transcript_path: options.transcriptPath,
      main: null,
      subagents: [],
      grand_total_usd: 0,
      degraded: `could not read transcript: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Subagent transcripts live under <projectDir>/<session-id>/{subagents,tasks}.
  const sessionId = basename(options.transcriptPath, '.jsonl');
  const sessionDir = join(dirname(options.transcriptPath), sessionId);
  const subagentFiles = collectSubagentTranscripts(sessionDir);

  const subagents: TranscriptCost[] = [];
  for (const file of subagentFiles) {
    try {
      const cost = await costTranscript(reader, file, labelForSubagent(file));
      // Skip transcripts with no priced activity to keep the table compact.
      if (cost.api_calls > 0) {subagents.push(cost);}
    } catch {
      /* one bad subagent file must not fail the whole report */
    }
  }
  subagents.sort((a, b) => b.total_usd - a.total_usd);

  const grand = main.total_usd + subagents.reduce((s, a) => s + a.total_usd, 0);

  return {
    transcript_path: options.transcriptPath,
    main,
    subagents,
    grand_total_usd: grand,
    degraded: null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Rendering
// ─────────────────────────────────────────────────────────────────────────────

/** Render one transcript's per-model rows as indented table lines. */
function renderRows(cost: TranscriptCost): string[] {
  const lines: string[] = [];
  if (cost.rows.length === 0) {
    lines.push('    (no priced API activity yet)');
    return lines;
  }
  for (const r of cost.rows) {
    lines.push(
      `    ${r.model.padEnd(22)} ` +
        `in=${formatNumber(r.input).padStart(7)} ` +
        `out=${formatNumber(r.output).padStart(7)} ` +
        `cr=${formatNumber(r.cache_read).padStart(7)} ` +
        `cw=${formatNumber(r.cache_write).padStart(7)} ` +
        `calls=${String(r.api_calls).padStart(4)} ` +
        `${formatDollars(r.cost_usd).padStart(9)}`,
    );
  }
  return lines;
}

/** Render the live-cost report as compact table-style text. */
export function renderLiveCostReport(report: LiveCostReport): string {
  const lines: string[] = ['=== Live Session Cost ==='];

  if (report.degraded) {
    lines.push(`(${report.degraded})`);
    return lines.join('\n');
  }

  if (report.main) {
    const warn = report.main.parse_warnings > 0 ? ` (${report.main.parse_warnings} line(s) skipped)` : '';
    lines.push(`Main loop: ${formatDollars(report.main.total_usd)} over ${report.main.api_calls} API call(s)${warn}`);
    lines.push(...renderRows(report.main));
  }

  if (report.subagents.length > 0) {
    const subTotal = report.subagents.reduce((s, a) => s + a.total_usd, 0);
    lines.push('');
    lines.push(`Subagents: ${formatDollars(subTotal)} across ${report.subagents.length} agent(s)`);
    for (const sub of report.subagents) {
      lines.push(`  ${sub.label}: ${formatDollars(sub.total_usd)} over ${sub.api_calls} call(s)`);
      lines.push(...renderRows(sub));
    }
  } else {
    lines.push('');
    lines.push('Subagents: none with priced activity this session');
  }

  lines.push('');
  lines.push(`Grand total: ${formatDollars(report.grand_total_usd)}`);

  // Provenance: say where the rates came from, always.
  const prov = pricingProvenance();
  if (prov.source === 'first-party') {
    const age = prov.ageHours !== undefined ? `, fetched ${prov.ageHours}h ago` : '';
    lines.push(`Rates: platform.claude.com pricing page${age} (fallback table fills unlisted models)`);
  } else {
    lines.push('Rates: built-in fallback table (first-party fetch pending or unavailable)');
  }

  return lines.join('\n');
}
