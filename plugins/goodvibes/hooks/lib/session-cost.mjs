/**
 * Dependency-free session cost recap for the SessionEnd hook.
 *
 * A faithful, plain-JS port of the minimal usage-summing + pricing math the
 * analytics engine uses (packages/analytics/src/engine/data/jsonl-reader.ts and
 * observability/live-cost.ts): read the session transcript JSONL, sum
 * `message.usage` tokens per model, and price with per-model $/MTok rates. No
 * imports from @goodvibes/core or the analytics bundle — the hooks are unbuilt
 * .mjs (§7 R8), so this must run on Node built-ins alone.
 *
 * Everything is fail-open: a missing/short/truncated transcript yields a
 * zero-cost recap rather than an error. The final line of a live transcript may
 * be half-written; unparseable lines are skipped.
 */

import {
  existsSync,
  statSync,
  openSync,
  readSync,
  closeSync,
  readdirSync,
  readFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import * as path from 'node:path';

/** Cap the transcript read at the last 20MB (bounds work on huge sessions). */
const MAX_READ_BYTES = 20 * 1024 * 1024;
/** First 200k input tokens price at the base rate, the rest at 2x (tiered). */
const TIER_BOUNDARY = 200_000;

/** Build a cache-aware rate row from a model's base input/output $/MTok rates. */
function priced(inputPrice, outputPrice) {
  return {
    inputPrice,
    outputPrice,
    cacheWrite5Min: inputPrice * 1.25,
    cacheWrite1Hour: inputPrice * 2,
    cacheHits: inputPrice * 0.1,
  };
}

/**
 * Tiny embedded fallback pricing ($/MTok), mirroring the analytics engine's
 * FALLBACK_MODEL_PRICING. Used when `~/.claude/model-pricing.json` is absent or
 * does not list a model.
 */
const FALLBACK_PRICING = {
  'claude-fable-5': priced(10, 50),
  'claude-mythos-5': priced(10, 50),
  'claude-opus-4-8': priced(5, 25),
  'claude-opus-4-7': priced(5, 25),
  'claude-opus-4-6': priced(5, 25),
  'claude-opus-4-5': priced(5, 25),
  'claude-sonnet-5': priced(3, 15),
  'claude-sonnet-4-6': priced(3, 15),
  'claude-sonnet-4-5': priced(3, 15),
  'claude-haiku-4-5': priced(1, 5),
};

/** Neutral default for an unknown model (sonnet-class), matching the engine. */
const DEFAULT_PRICING = priced(3, 15);

/** Round to cents. */
export function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Load `~/.claude/model-pricing.json` (the first-party overlay the analytics
 * fetcher maintains) merged over the embedded fallback table. Prices are $/MTok.
 */
function loadPricing() {
  const map = { ...FALLBACK_PRICING };
  try {
    const file = path.join(homedir(), '.claude', 'model-pricing.json');
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    const models = parsed && parsed.models;
    if (models && typeof models === 'object') {
      for (const [k, v] of Object.entries(models)) {
        if (v && typeof v.inputPrice === 'number' && typeof v.outputPrice === 'number') {
          map[k] = {
            inputPrice: v.inputPrice,
            outputPrice: v.outputPrice,
            cacheWrite5Min: typeof v.cacheWrite5Min === 'number' ? v.cacheWrite5Min : v.inputPrice * 1.25,
            cacheWrite1Hour: typeof v.cacheWrite1Hour === 'number' ? v.cacheWrite1Hour : v.inputPrice * 2,
            cacheHits: typeof v.cacheHits === 'number' ? v.cacheHits : v.inputPrice * 0.1,
          };
        }
      }
    }
  } catch {
    /* fallback table only */
  }
  return map;
}

/** Resolve a model id to a rate row: exact, dash/dot-normalised, prefix, else default. */
function pricingForModel(map, modelId) {
  if (!modelId) return DEFAULT_PRICING;
  if (map[modelId]) return map[modelId];
  const norm = modelId.replace(/-/g, '.');
  for (const k of Object.keys(map)) if (k.replace(/-/g, '.') === norm) return map[k];
  for (const k of Object.keys(map)) if (modelId.startsWith(k)) return map[k];
  return DEFAULT_PRICING;
}

/** Tiered input cost: first 200k tokens at base, the remainder at 2x. */
function tieredInput(tokens, base) {
  if (tokens <= TIER_BOUNDARY) return (tokens / 1e6) * base;
  return (TIER_BOUNDARY / 1e6) * base + ((tokens - TIER_BOUNDARY) / 1e6) * (base * 2);
}

/** Simplify a model id to its family word: 'claude-opus-4-8' -> 'opus'. */
function modelFamily(modelId) {
  const m = /claude-([a-z]+)/.exec(modelId || '');
  return m ? m[1] : modelId || 'unknown';
}

/**
 * Read up to the last {@link MAX_READ_BYTES} of a file and return its lines. If
 * the read started mid-file, the first (partial) line is dropped. The final
 * line may be truncated (the file is appended to live) — the caller tolerates
 * unparseable lines.
 */
function readTailLines(file) {
  let fd;
  try {
    const size = statSync(file).size;
    const start = size > MAX_READ_BYTES ? size - MAX_READ_BYTES : 0;
    const length = size - start;
    if (length <= 0) return [];
    fd = openSync(file, 'r');
    const buf = Buffer.allocUnsafe(length);
    let read = 0;
    while (read < length) {
      const n = readSync(fd, buf, read, length - read, start + read);
      if (n <= 0) break;
      read += n;
    }
    const lines = buf.toString('utf8', 0, read).split('\n');
    if (start > 0 && lines.length) lines.shift();
    return lines;
  } catch {
    return [];
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        /* ignore */
      }
    }
  }
}

/** Sum one transcript's assistant `message.usage` rows into `acc`, priced. */
function sumTranscript(lines, pricing, acc) {
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    let rec;
    try {
      rec = JSON.parse(t);
    } catch {
      continue; // truncated / partial line — skip
    }
    if (!rec || rec.type !== 'assistant') continue;
    const msg = rec.message;
    const usage = msg && msg.usage;
    if (!usage) continue;

    const model = (msg && msg.model) || 'unknown';
    const input = usage.input_tokens || 0;
    const output = usage.output_tokens || 0;
    const cacheRead = usage.cache_read_input_tokens || 0;
    const c5 = (usage.cache_creation && usage.cache_creation.ephemeral_5m_input_tokens) || 0;
    const c1h = (usage.cache_creation && usage.cache_creation.ephemeral_1h_input_tokens) || 0;
    const cacheWrite = c5 > 0 || c1h > 0 ? c5 + c1h : usage.cache_creation_input_tokens || 0;
    if (input === 0 && output === 0 && cacheRead === 0 && cacheWrite === 0) continue;

    const p = pricingForModel(pricing, model);
    const inputCost = tieredInput(input, p.inputPrice);
    const outputCost = (output / 1e6) * p.outputPrice;
    const cacheReadCost = (cacheRead / 1e6) * p.cacheHits;
    const cacheWriteCost =
      c5 > 0 || c1h > 0
        ? (c5 / 1e6) * p.cacheWrite5Min + (c1h / 1e6) * p.cacheWrite1Hour
        : (cacheWrite / 1e6) * p.cacheWrite5Min;
    const cost = inputCost + outputCost + cacheReadCost + cacheWriteCost;

    const row =
      acc.byModel[model] ||
      (acc.byModel[model] = { input: 0, output: 0, cache_read: 0, cache_write: 0, calls: 0, cost_usd: 0 });
    row.input += input;
    row.output += output;
    row.cache_read += cacheRead;
    row.cache_write += cacheWrite;
    row.calls += 1;
    row.cost_usd += cost;
    acc.calls += 1;
    acc.cost_usd += cost;
  }
}

/**
 * Resolve the main transcript path. Prefer the hook-provided `transcriptPath`;
 * otherwise derive `~/.claude/projects/<slug>/<sessionId>.jsonl` (slug = the cwd
 * path with non-alphanumerics replaced by '-', the Claude Code encoding), then
 * fall back to scanning every project dir for `<sessionId>.jsonl`.
 */
function resolveTranscriptPath(transcriptPath, sessionId, cwd) {
  if (transcriptPath && existsSync(transcriptPath)) return transcriptPath;
  if (!sessionId) return null;
  const projects = process.env.CLAUDE_PROJECTS_DIR || path.join(homedir(), '.claude', 'projects');
  const slug = (cwd || '').replace(/[^a-zA-Z0-9]/g, '-');
  const bySlug = path.join(projects, slug, `${sessionId}.jsonl`);
  if (existsSync(bySlug)) return bySlug;
  try {
    for (const dir of readdirSync(projects)) {
      const c = path.join(projects, dir, `${sessionId}.jsonl`);
      if (existsSync(c)) return c;
    }
  } catch {
    /* projects dir absent */
  }
  return null;
}

/** Collect subagent/task transcripts under `<projectDir>/<sessionId>/{subagents,tasks}`. */
function collectSubagentTranscripts(mainPath, sessionId) {
  const files = [];
  const sessionDir = path.join(path.dirname(mainPath), sessionId);
  try {
    const subs = path.join(sessionDir, 'subagents');
    for (const e of readdirSync(subs)) {
      if (e.startsWith('agent-') && e.endsWith('.jsonl')) files.push(path.join(subs, e));
    }
  } catch {
    /* no subagents dir */
  }
  const walk = (dir, depth) => {
    if (depth > 2) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(full, depth + 1);
      else if (ent.isFile() && ent.name.endsWith('.jsonl')) files.push(full);
    }
  };
  walk(path.join(sessionDir, 'tasks'), 0);
  return files;
}

/**
 * Compute a compact recap of one session: total priced cost, API call count,
 * the distinct model families, and a per-model breakdown. Sums the main
 * transcript plus any subagent/task transcripts (their cost is part of the
 * session). Never throws — returns a zero recap when nothing is readable.
 *
 * @param {{ transcriptPath?: string|null, sessionId?: string, cwd?: string }} opts
 * @returns {{ session_id: string, cost_usd: number, calls: number, model_families: string[], by_model: object }}
 */
export function computeSessionRecap(opts = {}) {
  const { transcriptPath = null, sessionId = 'unknown', cwd = process.cwd() } = opts;
  const acc = { calls: 0, cost_usd: 0, byModel: {} };
  try {
    const pricing = loadPricing();
    const mainPath = resolveTranscriptPath(transcriptPath, sessionId, cwd);
    if (mainPath && existsSync(mainPath)) {
      sumTranscript(readTailLines(mainPath), pricing, acc);
      for (const sub of collectSubagentTranscripts(mainPath, sessionId)) {
        sumTranscript(readTailLines(sub), pricing, acc);
      }
    }
  } catch {
    /* fail-open: whatever accumulated so far */
  }
  const families = [...new Set(Object.keys(acc.byModel).map(modelFamily))].sort();
  return {
    session_id: sessionId,
    cost_usd: round2(acc.cost_usd),
    calls: acc.calls,
    model_families: families,
    by_model: acc.byModel,
  };
}
