#!/usr/bin/env node
/**
 * SessionStart hook — silence by default.
 *
 * Contract (Mike, 2026-07-02): every emitted line must be actionable. Stack
 * detection, git branch, TODO counts, and "ready" banners are all things the
 * user can already see or doesn't need — they were removed after the 2.0.2
 * dogfood session showed the TODO counter was mostly measuring TODO comments
 * inside our own committed server bundles (67 of the reported 73).
 *
 * What remains, emitted ONLY when present:
 *  - quick project-health notes (dependencies not installed; .env.example
 *    present without .env) — cheap synchronous checks, no walking;
 *  - the host-health nudge, loosely coupled to the analytics sampler's state
 *    file (orphaned busy-loop plugin processes, high per-core load) and fully
 *    graceful when analytics isn't installed or hasn't sampled yet.
 *
 * A healthy, ordinary session start produces NO context and NO system message.
 *
 * Retired from v1: the CLAUDE.md/prompt-chain writing half (moved to the
 * explicit `/goodvibes:plugin install-prompts` command — plan §8), crash
 * recovery, project file indexing, version/pricing fetch, and the
 * runtime-engine (automation) integration. Retired in 2.0.3: framework/stack
 * detection, git status, the bounded TODO walker, and the background-refresh
 * cache machinery that existed to feed them.
 */

import { existsSync } from 'node:fs';
import * as path from 'node:path';
import {
  runHook,
  createHookResponse,
  v2StatePath,
  readJsonSafe,
  isTestEnvironment,
} from './lib/common.mjs';

const HOOK_EVENT = 'SessionStart';

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
  const state = readJsonSafe(v2StatePath(cwd, 'health', 'health-state.json'), null);
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

  const problems = quickHealth(cwd);
  const nudge = healthNudge(cwd);

  // Nothing needs attention: say nothing. Silence is the feature.
  if (problems.length === 0 && !nudge) {
    return createHookResponse({ hookEventName: HOOK_EVENT });
  }

  const lines = ['[goodvibes] Needs attention'];
  for (const note of problems) lines.push(`- ${note}`);
  if (nudge) lines.push(`- ${nudge}`);

  const summaryBits = [];
  if (problems.length) summaryBits.push(`${problems.length} project note(s)`);
  if (nudge) summaryBits.push('host health alert');

  return createHookResponse({
    hookEventName: HOOK_EVENT,
    systemMessage: `goodvibes: ${summaryBits.join(', ')}`,
    additionalContext: lines.join('\n'),
  });
}

if (!isTestEnvironment()) {
  await runHook(HOOK_EVENT, handleSessionStart);
}

export { quickHealth, healthNudge, handleSessionStart };
