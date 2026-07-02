/**
 * Shared helpers for goodvibes-intel's plain .mjs hooks (§2.4, §7 R8).
 *
 * No build step — these run directly under `node`. Kept dependency-free (no
 * import from @goodvibes/core, which is a bundled TS package for the MCP
 * server, not something a no-build hook script should pull in) so every hook
 * stays a handful of files anyone can read top to bottom.
 *
 * R16 (coexistence): every v2 hook starts with `shouldYieldToV1()` and, when
 * true, responds with a single explanatory line instead of doing its normal
 * work — this stops SessionStart/PostToolUseFailure from firing twice while
 * both plugin generations are installed (the R14 window).
 *
 * R15 (state namespacing): hooks that touch project state use `v2StatePath()`,
 * mirroring `@goodvibes/core/config`'s `getStatePath()` convention
 * (`.goodvibes/v2/...`) without importing the TS package.
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
 * SessionStart row: "fix the injection schema (hookSpecificOutput.additionalContext)").
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

/**
 * R16: yield to v1 when its plugin is installed alongside this one. Cheap
 * check — v1's own `.cache/` directory, sibling to this plugin's root under
 * the shared `plugins/` (or marketplace install) directory.
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
 * `handler(input)`, and always emits SOME valid response — a hook bug must
 * never block the session.
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
