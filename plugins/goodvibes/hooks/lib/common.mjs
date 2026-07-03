/**
 * Shared helpers for the goodvibes plugin's plain .mjs hooks (§2.4, §7 R8).
 *
 * The single goodvibes plugin ships all lifecycle hooks side by side under
 * hooks/, so they share this one dependency-free helper module (no build step,
 * no import from @goodvibes/core). R15 (state namespacing): hooks that touch
 * project state use `v2StatePath()` (`.goodvibes/v2/...`), mirroring
 * core/config's getStatePath convention.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';

/** Read and JSON-parse stdin. Never throws — malformed/empty input becomes `{}`. */
export async function readHookInput() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf-8');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/** Write the hook response JSON to stdout and exit 0. */
export function respond(response) {
  process.stdout.write(JSON.stringify(response ?? { continue: true }));
  process.exit(0);
}

/**
 * Build a hook response with the CORRECT schema: `additionalContext` lives
 * under `hookSpecificOutput`, not at the top level (v1 bug — plan §8
 * SessionStart row; applied consistently across all v2 hooks here too).
 */
export function createHookResponse({ hookEventName, systemMessage, additionalContext } = {}) {
  const out = { continue: true };
  if (systemMessage) out.systemMessage = systemMessage;
  if (additionalContext) {
    out.hookSpecificOutput = { hookEventName, additionalContext };
  }
  return out;
}

/** `.goodvibes/v2/<segments>` — mirrors core/config's getStatePath (R15). */
export function v2StatePath(cwd, ...segments) {
  return path.join(cwd, '.goodvibes', 'v2', ...segments);
}

export function ensureDir(dir) {
  try {
    mkdirSync(dir, { recursive: true });
  } catch {
    /* best-effort */
  }
}

export function readJsonSafe(file, fallback) {
  try {
    return JSON.parse(readFileSync(file, 'utf-8'));
  } catch {
    return fallback;
  }
}

export function writeJsonSafe(file, data) {
  try {
    ensureDir(path.dirname(file));
    writeFileSync(file, JSON.stringify(data, null, 2));
  } catch {
    /* best-effort — a hook must never throw over a state write */
  }
}

export function appendJsonlSafe(file, entry) {
  try {
    ensureDir(path.dirname(file));
    writeFileSync(file, JSON.stringify(entry) + '\n', { flag: 'a' });
  } catch {
    /* best-effort */
  }
}

/**
 * Fail-open hook runner: reads stdin, calls `handler(input)`, and always emits
 * SOME valid response — a bug in the handler still yields `{ continue: true }`.
 */
export async function runHook(hookEventName, handler) {
  try {
    const input = await readHookInput();
    const result = await handler(input);
    respond(result ?? createHookResponse({ hookEventName }));
  } catch {
    respond({ continue: true });
  }
}

/** True when running under vitest/node test harnesses (skip auto-invocation). */
export function isTestEnvironment() {
  return (
    process.env.NODE_ENV === 'test' ||
    process.env.VITEST === 'true' ||
    process.env.GOODVIBES_HOOK_TEST === '1'
  );
}
