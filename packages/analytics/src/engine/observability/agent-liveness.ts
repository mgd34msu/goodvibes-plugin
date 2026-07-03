/**
 * Agent-liveness scanner (lane 9).
 *
 * Classifies background agents from their transcript files alone — no process
 * introspection required (Claude subagents are in-process, not OS children, so
 * an OS-child signal is usually absent by design). For each agent transcript we
 * combine three cheap signals:
 *
 *   - mtime age      — how long since the file last grew
 *   - write rate     — bytes added since the previous scan (when a prior scan
 *                      snapshot is supplied), else unknown
 *   - tail state     — the last meaningful event in the transcript
 *
 * into one of: `executing` (a live child, or a tool call issued and the file is
 * still actively growing), `thinking` (recent assistant/thinking output, no
 * outstanding tool call), `wedged` (a tool call issued older than N minutes with
 * no matching result and no live child), plus the honest extras `idle` (quiet,
 * nothing outstanding) and `unknown` (unreadable/empty).
 *
 * Subagent transcripts live at `<projectDir>/<session-id>/subagents/agent-*.jsonl`
 * (with `agent-*.meta.json` sidecars carrying the agent type/description) and,
 * where present, a sibling `tasks/` directory.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { JSONLReader } from '../data/jsonl-reader.js';
import type {
  JSONLRecord,
  JSONLAssistantRecord,
  JSONLUserRecord,
  ToolUseBlock,
  ToolResultBlock,
} from '../data/jsonl-types.js';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Default wedged threshold: an outstanding tool call older than this is stuck. */
export const DEFAULT_WEDGED_MINUTES = 3;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type AgentState = 'executing' | 'thinking' | 'wedged' | 'idle' | 'unknown';

/** Liveness classification for one agent transcript. */
export interface AgentLiveness {
  /** Transcript filename (e.g. `agent-a4def97d.jsonl`). */
  file: string;
  /** Agent id parsed from the filename. */
  agent_id: string;
  /** Agent type from the `.meta.json` sidecar, when present. */
  agent_type: string | null;
  /** Short task description from the `.meta.json` sidecar, when present. */
  description: string | null;
  /** Milliseconds since the transcript was last written. */
  mtime_age_ms: number;
  /** Bytes/minute since the previous scan, or null on a first scan. */
  write_rate_bpm: number | null;
  /** The computed liveness state. */
  state: AgentState;
  /** Human-readable one-liner describing the tail. */
  detail: string;
}

/** Report for a whole session's background agents. */
export interface AgentLivenessReport {
  /** The scanned session directory, or null when none was resolvable. */
  session_dir: string | null;
  agents: AgentLiveness[];
  degraded: string | null;
}

/** Per-file size snapshot, for write-rate computation across scans. */
export type SizeSnapshot = Map<string, { size: number; atMs: number }>;

/** Options for {@link scanAgentLiveness}. */
export interface AgentLivenessOptions {
  /** `<projectDir>/<session-id>` — parent of `subagents/` and `tasks/`. */
  sessionDir: string | null;
  /** Wedged threshold in minutes (default 3). */
  wedgedMinutes?: number;
  /** Agent ids known to have a live OS child (forces `executing`). Default empty. */
  liveChildAgentIds?: Set<string>;
  /** Previous scan's size snapshot, for write-rate. Mutated with fresh sizes. */
  prevSizes?: SizeSnapshot;
  /** Injectable clock (default `Date.now`). */
  now?: () => number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tail analysis
// ─────────────────────────────────────────────────────────────────────────────

/** What the end of a transcript looks like. */
interface TailState {
  /** Timestamp of the most recent outstanding tool call (no matching result). */
  pendingCallAtMs: number | null;
  pendingCallName: string | null;
  /** Whether the last assistant record carried thinking/text output. */
  lastHadThinkingOrText: boolean;
  /** Whether any record was found at all. */
  hasRecords: boolean;
}

/**
 * Analyse the tail of a set of records: find the newest tool_use that never got
 * a tool_result (an outstanding call), and note whether the final assistant
 * message produced thinking/text.
 */
function analyseTail(records: JSONLRecord[]): TailState {
  if (records.length === 0) {
    return { pendingCallAtMs: null, pendingCallName: null, lastHadThinkingOrText: false, hasRecords: false };
  }

  // Collect resolved tool_use ids from user tool_result blocks.
  const resolved = new Set<string>();
  for (const rec of records) {
    if (rec.type !== 'user') {continue;}
    const content = (rec as JSONLUserRecord).message?.content;
    if (!Array.isArray(content)) {continue;}
    for (const block of content) {
      const b = block as ToolResultBlock;
      if (b?.type === 'tool_result' && b.tool_use_id) {resolved.add(b.tool_use_id);}
    }
  }

  // Find the newest outstanding tool_use (issued, unresolved).
  let pendingCallAtMs: number | null = null;
  let pendingCallName: string | null = null;
  for (const rec of records) {
    if (rec.type !== 'assistant') {continue;}
    const assistant = rec as JSONLAssistantRecord;
    const content = assistant.message?.content;
    if (!Array.isArray(content)) {continue;}
    const ts = assistant.timestamp ? new Date(assistant.timestamp).getTime() : NaN;
    for (const block of content) {
      const b = block as ToolUseBlock;
      if (b?.type !== 'tool_use' || !b.id) {continue;}
      if (resolved.has(b.id)) {continue;}
      if (Number.isFinite(ts) && (pendingCallAtMs === null || ts >= pendingCallAtMs)) {
        pendingCallAtMs = ts;
        pendingCallName = b.name ?? 'tool';
      }
    }
  }

  // Did the final assistant record produce thinking/text?
  let lastHadThinkingOrText = false;
  for (let i = records.length - 1; i >= 0; i--) {
    const rec = records[i]!;
    if (rec.type !== 'assistant') {continue;}
    const content = (rec as JSONLAssistantRecord).message?.content;
    if (Array.isArray(content)) {
      lastHadThinkingOrText = content.some(
        (b) => (b as { type?: string })?.type === 'thinking' || (b as { type?: string })?.type === 'text',
      );
    }
    break;
  }

  return { pendingCallAtMs, pendingCallName, lastHadThinkingOrText, hasRecords: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// File discovery
// ─────────────────────────────────────────────────────────────────────────────

/** Collect `agent-*.jsonl` under `subagents/` and any `*.jsonl` under `tasks/`. */
function collectAgentFiles(sessionDir: string): string[] {
  const files: string[] = [];

  const subagentsDir = join(sessionDir, 'subagents');
  try {
    for (const e of readdirSync(subagentsDir)) {
      if (e.startsWith('agent-') && e.endsWith('.jsonl')) {files.push(join(subagentsDir, e));}
    }
  } catch {
    /* no subagents dir — fine */
  }

  // tasks/ may nest a level; walk shallowly (2 levels) for *.jsonl.
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

/** Read the `.meta.json` sidecar next to an `agent-*.jsonl` file, if present. */
function readMeta(agentFile: string): { agent_type: string | null; description: string | null } {
  const metaPath = agentFile.replace(/\.jsonl$/, '.meta.json');
  try {
    const parsed = JSON.parse(readFileSync(metaPath, 'utf8')) as Record<string, unknown>;
    return {
      agent_type: typeof parsed['agentType'] === 'string' ? parsed['agentType'] : null,
      description: typeof parsed['description'] === 'string' ? parsed['description'] : null,
    };
  } catch {
    return { agent_type: null, description: null };
  }
}

/** Parse an agent id out of an `agent-<id>.jsonl` filename. */
function agentIdFromFile(file: string): string {
  const name = basename(file);
  const m = /^agent-(.+)\.jsonl$/.exec(name);
  return m ? m[1]! : basename(name, '.jsonl');
}

// ─────────────────────────────────────────────────────────────────────────────
// Scanner
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Scan a session's background-agent transcripts and classify each one.
 *
 * Reuses {@link JSONLReader} for tail-tolerant parsing (a truncated final line
 * and unknown event types are skipped, never fatal). Never throws — an
 * unreadable file becomes an `unknown`-state entry, a missing session dir a
 * `degraded` report.
 */
export function scanAgentLiveness(options: AgentLivenessOptions): AgentLivenessReport {
  const now = options.now ?? (() => Date.now());
  const wedgedMs = (options.wedgedMinutes ?? DEFAULT_WEDGED_MINUTES) * 60_000;
  const liveChildren = options.liveChildAgentIds ?? new Set<string>();
  const prevSizes = options.prevSizes;

  if (!options.sessionDir) {
    return { session_dir: null, agents: [], degraded: 'no active session directory — agent liveness unavailable' };
  }

  const files = collectAgentFiles(options.sessionDir);
  if (files.length === 0) {
    return { session_dir: options.sessionDir, agents: [], degraded: null };
  }

  // A dependency-free reader: liveness reads token/tail structure, not cost.
  const reader = new JSONLReader({ cost_per_1k_input_tokens: 0, cost_per_1k_output_tokens: 0 });
  const agents: AgentLiveness[] = [];

  for (const file of files) {
    const agentId = agentIdFromFile(file);
    const meta = readMeta(file);

    let sizeBytes = 0;
    let mtimeMs = now();
    let content = '';
    let readable = true;
    try {
      const st = statSync(file);
      sizeBytes = st.size;
      mtimeMs = st.mtimeMs;
      content = readFileSync(file, 'utf8');
    } catch {
      readable = false;
    }

    // Write rate vs the previous scan snapshot.
    let writeRate: number | null = null;
    if (prevSizes) {
      const prev = prevSizes.get(file);
      if (prev && now() > prev.atMs) {
        const dBytes = sizeBytes - prev.size;
        const dMin = (now() - prev.atMs) / 60_000;
        if (dMin > 0) {writeRate = Math.max(0, Math.round(dBytes / dMin));}
      }
      prevSizes.set(file, { size: sizeBytes, atMs: now() });
    }

    if (!readable) {
      agents.push({
        file: basename(file),
        agent_id: agentId,
        agent_type: meta.agent_type,
        description: meta.description,
        mtime_age_ms: 0,
        write_rate_bpm: writeRate,
        state: 'unknown',
        detail: 'transcript unreadable',
      });
      continue;
    }

    const records = reader.parseLines(content.split('\n'));
    const tail = analyseTail(records);
    const ageMs = Math.max(0, now() - mtimeMs);
    const recent = ageMs <= wedgedMs;
    const hasLiveChild = liveChildren.has(agentId);

    let state: AgentState;
    let detail: string;

    if (!tail.hasRecords) {
      state = 'unknown';
      detail = 'no parseable records yet';
    } else if (tail.pendingCallAtMs !== null) {
      const callAgeMs = Math.max(0, now() - tail.pendingCallAtMs);
      if (hasLiveChild || recent) {
        state = 'executing';
        detail = hasLiveChild
          ? `live child running ${tail.pendingCallName}`
          : `tool ${tail.pendingCallName} in flight, transcript still growing`;
      } else {
        state = 'wedged';
        detail = `tool ${tail.pendingCallName} issued ${Math.round(callAgeMs / 60_000)}m ago, no result, no live child`;
      }
    } else if (hasLiveChild) {
      state = 'executing';
      detail = 'live child running';
    } else if (recent && tail.lastHadThinkingOrText) {
      state = 'thinking';
      detail = 'recent assistant/thinking output, no tool outstanding';
    } else if (recent) {
      state = 'thinking';
      detail = 'recently active, no tool outstanding';
    } else {
      state = 'idle';
      detail = `quiet for ${Math.round(ageMs / 60_000)}m, nothing outstanding`;
    }

    agents.push({
      file: basename(file),
      agent_id: agentId,
      agent_type: meta.agent_type,
      description: meta.description,
      mtime_age_ms: ageMs,
      write_rate_bpm: writeRate,
      state,
      detail,
    });
  }

  // Stablest-first: wedged agents surface at the top where they matter.
  const order: Record<AgentState, number> = { wedged: 0, executing: 1, thinking: 2, idle: 3, unknown: 4 };
  agents.sort((a, b) => order[a.state] - order[b.state] || a.file.localeCompare(b.file));

  return { session_dir: options.sessionDir, agents, degraded: null };
}

/** Render the agent-liveness report as compact table-style text. */
export function renderAgentLiveness(report: AgentLivenessReport): string {
  const lines: string[] = ['=== Agent Liveness ==='];

  if (report.degraded) {
    lines.push(`(${report.degraded})`);
    return lines.join('\n');
  }
  if (report.agents.length === 0) {
    lines.push('No background agent transcripts found for this session.');
    return lines.join('\n');
  }

  for (const a of report.agents) {
    const label = a.agent_type ? `${a.agent_id} (${a.agent_type})` : a.agent_id;
    const ageMin = (a.mtime_age_ms / 60_000).toFixed(1);
    const rate = a.write_rate_bpm != null ? ` ${a.write_rate_bpm}B/min` : '';
    lines.push(`  [${a.state.toUpperCase().padEnd(9)}] ${label}  age=${ageMin}m${rate}`);
    lines.push(`      ${a.detail}`);
  }

  return lines.join('\n');
}
