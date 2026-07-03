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
 * (only when the durable install can't be silently relinked — see
 * `selfHealDeps`). `systemMessage` mirrors the same information compactly.
 *
 * Still retired (never coming back): stack/framework detection, git status, the
 * TODO walker, "ready" banners, CLAUDE.md/prompt-chain writing, crash recovery,
 * project file indexing, and the background-refresh cache machinery — the
 * 2.0.2/2.0.3 noise the value-line contract exists to keep out.
 */

import { existsSync, readFileSync, symlinkSync } from 'node:fs';
import { homedir } from 'node:os';
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

/** One representative dependency per server proves that server's install. */
const SERVER_PROBES = {
  intel: '@vscode/ripgrep',
  analytics: 'ink',
  connect: 'sql.js',
};

/** Durable per-server dependency home — survives plugin-cache replacement on update. */
function durableDepsDir(server) {
  return path.join(homedir(), '.claude', '.goodvibes', 'deps', server);
}

function depsSatisfied(root, server) {
  return existsSync(
    path.join(root, 'server', server, 'node_modules', ...SERVER_PROBES[server].split('/')),
  );
}

/** True when two package.json files declare the same `dependencies` map. */
function sameDeps(fileA, fileB) {
  try {
    const a = JSON.parse(readFileSync(fileA, 'utf-8')).dependencies ?? {};
    const b = JSON.parse(readFileSync(fileB, 'utf-8')).dependencies ?? {};
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/**
 * Self-heal after a plugin update: `/goodvibes:setup` installs into the durable
 * home and leaves a symlink in the plugin copy; an update replaces the plugin
 * copy (dropping the symlink) but not the durable home. When the durable
 * install exists and its package.json still matches the new plugin version's,
 * silently relink — the user never re-runs setup. A dependency-list change in
 * the update makes this return false, so the nudge points at setup honestly.
 */
function selfHealDeps(root, server) {
  try {
    const durable = durableDepsDir(server);
    const durableModules = path.join(durable, 'node_modules');
    if (!existsSync(path.join(durableModules, ...SERVER_PROBES[server].split('/')))) return false;
    const serverDir = path.join(root, 'server', server);
    if (!sameDeps(path.join(serverDir, 'package.json'), path.join(durable, 'package.json'))) {
      return false;
    }
    const target = path.join(serverDir, 'node_modules');
    if (!existsSync(target)) symlinkSync(durableModules, target, 'dir');
    return depsSatisfied(root, server);
  } catch {
    return false;
  }
}

/**
 * One-line note when the INSTALLED plugin copy is missing native deps that
 * cannot be silently relinked from the durable home — i.e. setup genuinely
 * needs to run (never ran, or an update changed a server's dependency list).
 * This is a global condition of the installed copy, not project state, so it
 * is keyed on nothing but the probes. Silent when CLAUDE_PLUGIN_ROOT is absent.
 */
function nativeDepsNudge() {
  const root = process.env.CLAUDE_PLUGIN_ROOT;
  if (!root) return null;
  const missing = [];
  for (const server of Object.keys(SERVER_PROBES)) {
    if (depsSatisfied(root, server)) continue;
    if (selfHealDeps(root, server)) continue;
    missing.push(server);
  }
  if (missing.length === 0) return null;
  return `native deps not installed (${missing.join(', ')}) - run /goodvibes:setup (once; installs survive plugin updates)`;
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
