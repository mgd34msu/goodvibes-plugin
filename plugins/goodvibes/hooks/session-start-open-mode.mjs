/**
 * goodvibes-connect, SessionStart open-mode announcement (connect-owned, R9).
 *
 * Plain `.mjs`, no build step (R8). Announces the trust mode at session start and
 * enforces the ephemerality contract:
 *  - `mode: open` + `dangerously_persist_across_sessions: true`  → loud, RE-announced
 *    every session; the file is left as the human set it.
 *  - `mode: open` + persist false  → open mode is ephemeral: it is announced and the
 *    PROJECT config is reset to `restricted` so it cannot silently linger into the
 *    next session. (The human enabled it mid-session; this fires at the NEXT start.)
 *  - `mode: restricted`  → nothing is said.
 *
 * The pure functions are exported for the connect test suite; `main()` runs only when
 * the file is executed directly by Claude Code.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';

/**
 * Decide what the announcement hook should do given the effective config.
 * @param {{ mode: string, persist: boolean }} cfg
 * @returns {{ announce: string|null, revert: boolean }}
 */
export function computeOpenModeAction(cfg) {
  if (cfg.mode !== 'open') return { announce: null, revert: false };
  if (cfg.persist) {
    return {
      announce:
        'goodvibes: OPEN trust mode is ACTIVE and PERSISTED across sessions ' +
        '(dangerously_persist_across_sessions=true). The destination allowlist is lifted; ' +
        'credentials remain pinned to their registered origins. Set mode=restricted to close it.',
      revert: false,
    };
  }
  return {
    announce:
      'goodvibes: OPEN trust mode was set without dangerously_persist_across_sessions, ' +
      'so it is ephemeral — it has been reset to restricted for this session. Re-enable it per ' +
      'session, or set dangerously_persist_across_sessions=true to keep it.',
    revert: true,
  };
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf-8'));
  } catch {
    return {};
  }
}

/** Project + user config file paths for connect (project wins on merge). */
export function configPaths(cwd) {
  return {
    project: join(cwd, '.goodvibes', 'config.json'),
    user: join(homedir(), '.claude', '.goodvibes', 'config.json'),
  };
}

/**
 * Read the effective mode + persist flag (project overrides user).
 * @param {string} cwd
 * @returns {{ mode: string, persist: boolean, projectPath: string }}
 */
export function readMergedConfig(cwd) {
  const { project, user } = configPaths(cwd);
  const merged = { ...readJson(user), ...readJson(project) };
  return {
    mode: merged.mode === 'open' ? 'open' : 'restricted',
    persist: merged.dangerously_persist_across_sessions === true,
    projectPath: project,
  };
}

/** Reset the PROJECT config file's mode to restricted (enforces ephemerality). */
function revertProjectToRestricted(projectPath) {
  const current = readJson(projectPath);
  current.mode = 'restricted';
  mkdirSync(dirname(projectPath), { recursive: true });
  writeFileSync(projectPath, JSON.stringify(current, null, 2) + '\n', 'utf-8');
}

/**
 * Run the announcement logic for a project. Pure except for the (documented)
 * ephemeral revert write. Returns what happened for testing.
 * @param {{ cwd?: string }} [opts]
 * @returns {{ announce: string|null, reverted: boolean }}
 */
export function applyOpenMode(opts = {}) {
  const cwd = opts.cwd ?? process.cwd();

  const { mode, persist, projectPath } = readMergedConfig(cwd);
  const action = computeOpenModeAction({ mode, persist });
  let reverted = false;
  if (action.revert) {
    revertProjectToRestricted(projectPath);
    reverted = true;
  }
  return { announce: action.announce, reverted };
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf-8'));
  } catch {
    return {};
  }
}

async function main() {
  const input = await readStdin();
  const cwd = input.cwd || process.cwd();
  const { announce } = applyOpenMode({ cwd });
  if (announce) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: announce },
      }),
    );
  }
}

// Run only when executed directly (not when imported by tests).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    /* fail open, never break session start */
  });
}
