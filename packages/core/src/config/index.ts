/**
 * `@goodvibes/core/config`, configuration file loader for the servers.
 *
 * Rebuilt minimal per plan §1.12: a config FILE plus command-surface, never an
 * MCP config tool. The v1 dotted-key get/set asymmetry and the agent-reachable
 * sandbox/open-mode toggles do NOT carry forward. The open mode is human-only,
 * set out-of-band by editing the file; nothing here lets a tool flip it.
 *
 * Project state lives under `.goodvibes/` in the target project. `getStatePath`
 * is the single helper the telemetry, cache, logging, and overflow modules use
 * to locate their files. (R15's `.goodvibes/v2/` coexistence namespace was
 * retired in 2.1.0, v1 is uninstallable, and a legacy `v2/` subdirectory is
 * migrated up automatically, once, on first path resolution.)
 *
 * Config keys are documented from ONE source of truth (`CONFIG_KEYS`), so the
 * defaults, the docs, and the loaded shape can never drift.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export type EnvelopeMode = 'restricted' | 'open';

/** Per-call time budgets (ms). Mechanisms are mandated; values are overridable (R10). */
export interface Budgets {
  /** intel analyzers (code_surface, safe_delete, api_*, db_schema, frontend). */
  analyzer_ms: number;
  /** code_grep / code_glob / code_read. */
  search_ms: number;
  /** connect api_request default per-request timeout. */
  http_default_ms: number;
  /** connect api_request hard ceiling. */
  http_max_ms: number;
  /** connect db_query. */
  db_query_ms: number;
  /** analytics tools. */
  analytics_ms: number;
}

export interface GoodvibesConfig {
  /** Response trust mode; `open` only via a human editing the file out-of-band. */
  mode: EnvelopeMode;
  /** Loud, separate key that keeps `open` mode across sessions (re-announced each session). */
  dangerously_persist_across_sessions: boolean;
  /** Parent-liveness ppid poll interval (ms). */
  ppid_poll_ms: number;
  /** Whether telemetry writing is enabled. */
  telemetry_enabled: boolean;
  /** File-state cache memory budget (MB). */
  cache_max_mb: number;
  /** Default response token cap when a caller omits `output.max_tokens`. */
  max_tokens_default: number;
  /** Per-call time budgets. */
  budgets: Budgets;
}

interface KeyDoc {
  default: unknown;
  description: string;
}

/**
 * Single source of truth for every config key: its default and its docs.
 * `DEFAULT_CONFIG` and `describeConfigKeys()` are both derived from this map so
 * they cannot drift.
 */
export const CONFIG_KEYS: Record<string, KeyDoc> = {
  mode: {
    default: 'restricted',
    description:
      "Response trust mode: 'restricted' (default) or 'open'. Only a human editing this file may set 'open'; no tool can flip it.",
  },
  dangerously_persist_across_sessions: {
    default: false,
    description:
      "Keep 'open' mode across sessions. Loud, separate key; re-announced at every session start when true.",
  },
  ppid_poll_ms: {
    default: 5000,
    description: 'Interval for the parent-liveness poll that catches reparent-to-init.',
  },
  telemetry_enabled: {
    default: true,
    description: 'Whether the server records telemetry to the local SQLite database.',
  },
  cache_max_mb: {
    default: 200,
    description: 'Memory budget for the in-session file-state cache, in megabytes.',
  },
  max_tokens_default: {
    default: 4000,
    description: 'Default response token cap applied when a call omits output.max_tokens.',
  },
  'budgets.analyzer_ms': {
    default: 20000,
    description: 'Per-call time budget for intel analyzers.',
  },
  'budgets.search_ms': {
    default: 15000,
    description: 'Per-call time budget for code_read / code_grep / code_glob.',
  },
  'budgets.http_default_ms': {
    default: 30000,
    description: 'Default per-request timeout for connect api_request.',
  },
  'budgets.http_max_ms': {
    default: 120000,
    description: 'Hard ceiling for connect api_request timeout.',
  },
  'budgets.db_query_ms': {
    default: 30000,
    description: 'Per-call time budget for connect db_query.',
  },
  'budgets.analytics_ms': {
    default: 20000,
    description: 'Per-call time budget for analytics tools.',
  },
};

/** Default config, derived from CONFIG_KEYS so it never drifts from the docs. */
export const DEFAULT_CONFIG: GoodvibesConfig = Object.freeze({
  mode: 'restricted',
  dangerously_persist_across_sessions: false,
  ppid_poll_ms: 5000,
  telemetry_enabled: true,
  cache_max_mb: 200,
  max_tokens_default: 4000,
  budgets: Object.freeze({
    analyzer_ms: 20000,
    search_ms: 15000,
    http_default_ms: 30000,
    http_max_ms: 120000,
    db_query_ms: 30000,
    analytics_ms: 20000,
  }) as Budgets,
});

/** Project state directory name. */
export const STATE_SEGMENTS = ['.goodvibes'] as const;

/** Roots already checked for a legacy `v2/` subdirectory this process. */
const migratedRoots = new Set<string>();

/**
 * Merge-move every entry of `src` into `dst`, recursing into directories that
 * exist on both sides. On a file conflict the `src` (legacy-`v2`) copy wins,
 * it is the live state; anything at the destination is a v1 leftover.
 */
function mergeMoveDir(src: string, dst: string): void {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src)) {
    const s = path.join(src, entry);
    const d = path.join(dst, entry);
    try {
      if (!fs.existsSync(d)) {
        fs.renameSync(s, d);
      } else if (fs.statSync(s).isDirectory() && fs.statSync(d).isDirectory()) {
        mergeMoveDir(s, d);
      } else {
        fs.rmSync(d, { recursive: true, force: true });
        fs.renameSync(s, d);
      }
    } catch {
      /* skip the entry, migration is best-effort */
    }
  }
  try {
    fs.rmdirSync(src);
  } catch {
    /* not empty (skipped entries), harmless, retried next process */
  }
}

/**
 * One-time migration of the pre-2.1.0 layout: state used to live under
 * `.goodvibes/v2/`; it now lives directly under `.goodvibes/`. Fail-open and
 * checked once per root per process.
 */
function migrateLegacyStateDir(root: string): void {
  if (migratedRoots.has(root)) {return;}
  migratedRoots.add(root);
  try {
    const legacy = path.join(root, 'v2');
    if (fs.existsSync(legacy) && fs.statSync(legacy).isDirectory()) {
      mergeMoveDir(legacy, root);
    }
  } catch {
    /* fail-open, a migration problem must never block a path lookup */
  }
}

/**
 * Resolve a path inside the project state directory (`.goodvibes/`).
 * @param cwd - project root
 * @param segments - path segments under `.goodvibes/`
 */
export function getStatePath(cwd: string, ...segments: string[]): string {
  const root = path.join(cwd, ...STATE_SEGMENTS);
  migrateLegacyStateDir(root);
  return path.join(root, ...segments);
}

/**
 * Resolve a state path relative to the current working directory.
 * Evaluated lazily at call time so it honours the server's runtime cwd.
 * @param segments - path segments under `.goodvibes/`
 */
export function statePath(...segments: string[]): string {
  return getStatePath(process.cwd(), ...segments);
}

/** Project-level config file path (under `.goodvibes/`). */
export function projectConfigPath(cwd: string = process.cwd()): string {
  return getStatePath(cwd, 'config.json');
}

/** User-level config file path (`~/.claude/.goodvibes/config.json`). */
export function userConfigPath(): string {
  return path.join(os.homedir(), '.claude', '.goodvibes', 'config.json');
}

function readJsonIfPresent(file: string): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function mergeBudgets(base: Budgets, override: unknown): Budgets {
  if (!override || typeof override !== 'object') {return base;}
  const o = override as Record<string, unknown>;
  const pick = (k: keyof Budgets): number =>
    typeof o[k] === 'number' && Number.isFinite(o[k]) && (o[k] as number) > 0
      ? (o[k] as number)
      : base[k];
  return {
    analyzer_ms: pick('analyzer_ms'),
    search_ms: pick('search_ms'),
    http_default_ms: pick('http_default_ms'),
    http_max_ms: pick('http_max_ms'),
    db_query_ms: pick('db_query_ms'),
    analytics_ms: pick('analytics_ms'),
  };
}

let cached: { key: string; value: GoodvibesConfig } | null = null;

/**
 * Load the effective config: defaults, overlaid by the user file, overlaid by
 * the project file. `mode: 'open'` is only honoured from a file on disk, there
 * is no in-process setter, so a tool can never toggle it.
 *
 * @param cwd - project root (defaults to process.cwd())
 * @returns the merged, validated config
 */
export function loadConfig(cwd: string = process.cwd()): GoodvibesConfig {
  const projFile = projectConfigPath(cwd);
  const userFile = userConfigPath();
  const cacheKey = `${userFile}::${projFile}`;
  if (cached && cached.key === cacheKey) {return cached.value;}

  const user = readJsonIfPresent(userFile);
  const project = readJsonIfPresent(projFile);
  const merged = { ...DEFAULT_CONFIG, ...user, ...project } as Record<string, unknown>;

  const num = (k: keyof GoodvibesConfig, d: number): number =>
    typeof merged[k] === 'number' && Number.isFinite(merged[k]) && (merged[k] as number) > 0
      ? (merged[k] as number)
      : d;

  const mode: EnvelopeMode = merged.mode === 'open' ? 'open' : 'restricted';

  const value: GoodvibesConfig = {
    mode,
    dangerously_persist_across_sessions: merged.dangerously_persist_across_sessions === true,
    ppid_poll_ms: num('ppid_poll_ms', DEFAULT_CONFIG.ppid_poll_ms),
    telemetry_enabled: merged.telemetry_enabled !== false,
    cache_max_mb: num('cache_max_mb', DEFAULT_CONFIG.cache_max_mb),
    max_tokens_default: num('max_tokens_default', DEFAULT_CONFIG.max_tokens_default),
    budgets: mergeBudgets(DEFAULT_CONFIG.budgets, merged.budgets),
  };

  cached = { key: cacheKey, value };
  return value;
}

/** Clear the in-memory config cache (test isolation / explicit reload). */
export function resetConfigCache(): void {
  cached = null;
}

/**
 * The read-only mode status echoed into every response envelope.
 * @param cfg - loaded config (loaded fresh if omitted)
 */
export function configForEnvelope(cfg: GoodvibesConfig = loadConfig()): {
  mode: EnvelopeMode;
  read_only: boolean;
} {
  return { mode: cfg.mode, read_only: cfg.mode === 'restricted' };
}

/** Human-readable, generated-from-code documentation of every config key. */
export function describeConfigKeys(): string {
  const lines = ['# GoodVibes config keys', ''];
  for (const [key, doc] of Object.entries(CONFIG_KEYS)) {
    lines.push(`- \`${key}\` (default: ${JSON.stringify(doc.default)}): ${doc.description}`);
  }
  return lines.join('\n');
}
