#!/usr/bin/env node
/**
 * SessionStart hook — one line of real value every session (Mike, 2026-07-02).
 *
 * 2.0.3 made this hook silent by default. 2.0.5 replaces that silence with a
 * single always-present value line built from the cost recap SessionEnd wrote
 * to `.goodvibes/cache/last-session-summary.json`:
 *
 *   [goodvibes] Last session: $X.XX over N calls (families) | project total: $Y.YY
 *
 * The first time a project is seen (no summary yet) that line points at the
 * live-cost view instead. Nothing else is emitted unless it is real: existing
 * project-health notes, the host-health nudge, and a native-deps-missing note
 * (setup ran once here, but the installed plugin copy lost its deps to an
 * update). `systemMessage` mirrors the same information compactly.
 *
 * Still retired (never coming back): stack/framework detection, git status, the
 * TODO walker, "ready" banners, CLAUDE.md/prompt-chain writing, crash recovery,
 * project file indexing, and the background-refresh cache machinery — the
 * 2.0.2/2.0.3 noise the value-line contract exists to keep out.
 */

import { existsSync } from 'node:fs';
import * as path from 'node:path';
import {
  runHook,
  createHookResponse,
  statePath,
  readJsonSafe,
  isTestEnvironment,
} from './lib/common.mjs';

const HOOK_EVENT = 'SessionStart';

/** The always-present first line: last session's cost recap, or the first-session pointer. */
function valueLine(cwd) {
  const summary = readJsonSafe(statePath(cwd, 'cache', 'last-session-summary.json'), null);
  if (!summary || typeof summary.cost_usd !== 'number') {
    return {
      context:
        '[goodvibes] First session here - 25 tools on intel/analytics/connect; ' +
        '/goodvibes:analytics shows live session cost.',
      system: 'goodvibes: first session — 25 tools on intel/analytics/connect',
    };
  }
  const cost = summary.cost_usd;
  const calls = typeof summary.calls === 'number' ? summary.calls : 0;
  const families =
    Array.isArray(summary.model_families) && summary.model_families.length
      ? summary.model_families.join('/')
      : 'no priced activity';
  const total = typeof summary.project_total_usd === 'number' ? summary.project_total_usd : cost;
  return {
    context: `[goodvibes] Last session: $${cost.toFixed(2)} over ${calls} calls (${families}) | project total: $${total.toFixed(2)}`,
    system: `goodvibes: last session $${cost.toFixed(2)} over ${calls} calls | project total $${total.toFixed(2)}`,
  };
}

/**
 * One-line note when the INSTALLED plugin copy is missing a representative
 * native dep — true on a fresh install (setup not run yet) and after a plugin
 * update (updates replace `server/<name>/node_modules`). This is a global
 * condition of the installed copy, not project state, so it is keyed on
 * nothing but the probe itself. Resolves via CLAUDE_PLUGIN_ROOT; silent when
 * that env is absent or the dep is present.
 */
function nativeDepsNudge() {
  const root = process.env.CLAUDE_PLUGIN_ROOT;
  if (!root) return null;
  const representative = path.join(root, 'server', 'intel', 'node_modules', '@vscode', 'ripgrep');
  if (existsSync(representative)) return null;
  return 'native deps not installed - run /goodvibes:setup (first run, or a plugin update replaced them)';
}

/** Cheap, synchronous project-health checks. Returns short problem notes. */
function quickHealth(cwd) {
  const notes = [];
  if (existsSync(path.join(cwd, 'package.json')) && !existsSync(path.join(cwd, 'node_modules'))) {
    notes.push('dependencies not installed (no node_modules)');
  }
  if (existsSync(path.join(cwd, '.env.example')) && !existsSync(path.join(cwd, '.env'))) {
    notes.push('.env missing (.env.example present)');
  }
  return notes;
}

/** Per-core load above this trips the host-health nudge (matches the analytics sampler). */
const HEALTH_LOAD_PER_CORE = 1.5;

/**
 * Loose file coupling to the analytics host-health sampler: when its state
 * file exists and a threshold trips (per-core load above 1.5, or any orphaned
 * busy-loop plugin process detected), surface a single nudge line. Fully
 * graceful when the file is absent — analytics may not be installed.
 * Returns a one-line string or null.
 */
function healthNudge(cwd) {
  const state = readJsonSafe(statePath(cwd, 'health', 'health-state.json'), null);
  if (!state) return null;
  try {
    const orphans = Array.isArray(state.orphans) ? state.orphans.length : 0;
    const loadPerCore = typeof state.load_per_core === 'number' ? state.load_per_core : null;
    const highLoad = loadPerCore != null && loadPerCore > HEALTH_LOAD_PER_CORE;
    if (orphans === 0 && !highLoad) return null;
    const bits = [];
    if (orphans > 0) {
      bits.push(`${orphans} orphaned plugin process(es) spinning`);
    }
    if (highLoad) {
      bits.push(`host load ${loadPerCore.toFixed(2)}/core`);
    }
    return `Host health: ${bits.join(', ')} — run analytics query mode=doctor (or dashboard action=doctor) for kill commands.`;
  } catch {
    return null;
  }
}

async function handleSessionStart(input) {
  const cwd = input.cwd || process.cwd();

  // The one always-present value line, then anything that is genuinely real.
  const value = valueLine(cwd);
  const problems = quickHealth(cwd);
  const nudge = healthNudge(cwd);
  const deps = nativeDepsNudge();

  const lines = [value.context];
  for (const note of problems) lines.push(`- ${note}`);
  if (nudge) lines.push(`- ${nudge}`);
  if (deps) lines.push(`- ${deps}`);

  const alerts = [];
  if (problems.length) alerts.push(`${problems.length} project note(s)`);
  if (nudge) alerts.push('host health alert');
  if (deps) alerts.push('native deps missing');

  const systemMessage = alerts.length ? `${value.system} — ${alerts.join(', ')}` : value.system;

  return createHookResponse({
    hookEventName: HOOK_EVENT,
    systemMessage,
    additionalContext: lines.join('\n'),
  });
}

if (!isTestEnvironment()) {
  await runHook(HOOK_EVENT, handleSessionStart);
}

export { quickHealth, healthNudge, valueLine, nativeDepsNudge, handleSessionStart };
