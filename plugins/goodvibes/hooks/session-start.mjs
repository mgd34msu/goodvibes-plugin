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
 * project-health notes, the host-health nudge, and one native-deps line
 * (only when the durable install can't be silently relinked — see
 * `nativeDepsAction`). `systemMessage` mirrors the same information compactly.
 *
 * Native deps install themselves: when a server's probe is missing and the
 * durable home can't cover it, this hook kicks `lib/deps-install.mjs` as a
 * DETACHED background process (stdio ignored, unref'd — SessionStart never
 * blocks on npm) and says so in one line. A recent (<24h) failed install is
 * reported instead of retried, pointing at the log and /goodvibes:setup.
 *
 * Still retired (never coming back): stack/framework detection, git status, the
 * TODO walker, "ready" banners, CLAUDE.md/prompt-chain writing, crash recovery,
 * project file indexing, and the background-refresh cache machinery — the
 * 2.0.2/2.0.3 noise the value-line contract exists to keep out.
 */

import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import {
  runHook,
  createHookResponse,
  statePath,
  readJsonSafe,
  isTestEnvironment,
} from './lib/common.mjs';
import {
  SERVER_PROBES,
  depsSatisfied,
  durableDepsDir,
  durableDepsRoot,
  hasProbe,
  linkDeps,
} from './lib/deps-link.mjs';
import { spawnDetachedInstall } from './lib/deps-install.mjs';

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
 * True when every dependency the plugin copy's package.json declares is
 * present in the durable install's package.json at the same version range —
 * i.e. the durable install covers the plugin copy (superset-or-equal). An
 * update that only REMOVES dependencies still relinks; one that adds a
 * dependency or changes a range does not, and a reinstall runs instead.
 */
function durableCoversPlugin(pluginPkgFile, durablePkgFile) {
  try {
    const plugin = JSON.parse(readFileSync(pluginPkgFile, 'utf-8')).dependencies ?? {};
    const durable = JSON.parse(readFileSync(durablePkgFile, 'utf-8')).dependencies ?? {};
    return Object.entries(plugin).every(([name, range]) => durable[name] === range);
  } catch {
    return false;
  }
}

/**
 * Self-heal after a plugin update: installs live in the durable home and the
 * plugin copy holds a link to them; an update replaces the plugin copy
 * (dropping the link) but not the durable home. When the durable install has
 * the probe and covers the new plugin copy's dependency list, silently relink.
 */
function selfHealDeps(root, server) {
  try {
    const durable = durableDepsDir(server);
    if (!hasProbe(path.join(durable, 'node_modules'), server)) return false;
    if (
      !durableCoversPlugin(
        path.join(root, 'server', server, 'package.json'),
        path.join(durable, 'package.json'),
      )
    ) {
      return false;
    }
    linkDeps(root, server);
    return depsSatisfied(root, server);
  } catch {
    return false;
  }
}

/** The failed-server list from a recent (<24h) failed install, else null. */
function recentInstallFailure() {
  const result = readJsonSafe(path.join(durableDepsRoot(), '.last-result.json'), null);
  if (!result || result.ok !== false) return null;
  const finished = Date.parse(result.finished_at);
  if (!Number.isFinite(finished) || Date.now() - finished > 24 * 60 * 60 * 1000) return null;
  return Array.isArray(result.failed) ? result.failed : [];
}

/**
 * Decide what to do about native deps this session. Probes each server; a
 * missing server first tries the silent relink from the durable home. Anything
 * still missing means an install has to run: a recent failed attempt is
 * reported (with the log path and the manual /goodvibes:setup fallback)
 * instead of retried; otherwise the background installer should be kicked.
 * Returns null (all satisfied) or { line, alert, spawnInstall }.
 * Silent when CLAUDE_PLUGIN_ROOT is absent.
 */
function nativeDepsAction() {
  const root = process.env.CLAUDE_PLUGIN_ROOT;
  if (!root) return null;
  const missing = [];
  for (const server of Object.keys(SERVER_PROBES)) {
    if (depsSatisfied(root, server)) continue;
    if (selfHealDeps(root, server)) continue;
    missing.push(server);
  }
  if (missing.length === 0) return null;
  const failed = recentInstallFailure();
  if (failed) {
    const servers = failed.length ? failed : missing;
    return {
      line: `goodvibes: native dep install failed for ${servers.join(', ')} - see ~/.claude/.goodvibes/deps/install.log or run /goodvibes:setup`,
      alert: 'native dep install failed',
      spawnInstall: false,
    };
  }
  return {
    line: 'goodvibes: installing native deps in the background - ready next session',
    alert: 'installing native deps',
    spawnInstall: true,
  };
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
  const deps = nativeDepsAction();
  if (deps?.spawnInstall && process.env.GOODVIBES_NO_BG_INSTALL !== '1') {
    spawnDetachedInstall(process.env.CLAUDE_PLUGIN_ROOT);
  }

  const lines = [value.context];
  for (const note of problems) lines.push(`- ${note}`);
  if (nudge) lines.push(`- ${nudge}`);
  if (deps) lines.push(deps.line);

  const alerts = [];
  if (problems.length) alerts.push(`${problems.length} project note(s)`);
  if (nudge) alerts.push('host health alert');
  if (deps) alerts.push(deps.alert);

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

export { quickHealth, healthNudge, valueLine, nativeDepsAction, handleSessionStart };
