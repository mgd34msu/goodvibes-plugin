/**
 * Shared helpers for goodvibes-analytics's plain .mjs hooks (§2.4, §7 R8).
 *
 * Mirrors `plugins/goodvibes-intel/hooks/lib/common.mjs` (each plugin is
 * self-contained and independently installable, so this is a deliberate small
 * duplication rather than a cross-plugin import). See that file's header for
 * the R15/R16 rationale.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
 * R16: yield to v1 when its plugin is installed alongside this one. Cheap
 * check — v1's own `.cache/` directory, sibling to this plugin's root.
 */
export function shouldYieldToV1() {
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
  if (!pluginRoot) return false;
  try {
    return existsSync(path.resolve(pluginRoot, '..', 'goodvibes', '.cache'));
  } catch {
    return false;
  }
}

export const V1_YIELD_MESSAGE =
  'v2 hooks yielding to v1 — uninstall goodvibes v1 to activate them.';

/**
 * Fail-open hook runner: reads stdin, applies the R16 yield guard, calls
 * `handler(input)`, and always emits SOME valid response.
 */
export async function runHook(hookEventName, handler) {
  try {
    if (shouldYieldToV1()) {
      respond(createHookResponse({ hookEventName, systemMessage: V1_YIELD_MESSAGE }));
      return;
    }
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
