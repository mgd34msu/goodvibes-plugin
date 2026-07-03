/**
 * goodvibes-connect — warn-first secrets commit guard (PreToolUse on Bash).
 *
 * Plain `.mjs`, no build step (R8). This is the REBUILT guard the plan requires:
 * real detection, warn-first escalation, and tests — nothing placebo. Unlike the
 * v1 guard (which only matched a literal filename and let `git add -A` through on
 * the strength of .gitignore), this one:
 *   1. matches explicit references to a protected credential file, AND
 *   2. for broad stages/commits (`git add -A|.|-u`, `git commit -a`) runs
 *      `git status --porcelain` and scans for a protected file that would be
 *      swept in;
 * then escalates warn → block: the FIRST risky attempt warns (and drops a marker),
 * a SECOND risky attempt (marker present) is denied.
 *
 * Pure functions are exported for the connect test suite; `main()` runs only when
 * executed directly.
 */

import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, basename } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Credential files that must never be committed (basenames). */
export const PROTECTED_FILES = ['goodvibes.secrets.json', 'goodvibes.cookies.json'];

/**
 * Parse a shell command for git staging/committing intent.
 * @param {string} command
 * @returns {{ isGit: boolean, isBroad: boolean, explicitHits: string[] }}
 */
export function analyzeCommitCommand(command) {
  const cmd = String(command ?? '');
  const isGit = /\bgit\s+(add|commit|stage)\b/i.test(cmd);
  if (!isGit) return { isGit: false, isBroad: false, explicitHits: [] };

  // Broad stage/commit that could sweep an untracked/modified secret in.
  // Covers `git add -A|--all|-u|.|*`, and `git commit --all` or any combined
  // short-flag cluster containing `a` (`-a`, `-am`, `-avm`, …).
  const isBroad =
    /\bgit\s+add\s+(-A\b|--all\b|-u\b|\.|\*)/i.test(cmd) ||
    /\bgit\s+commit\b[^\n]*--all\b/i.test(cmd) ||
    /\bgit\s+commit\b[^\n]*\s-[A-Za-z]*a[A-Za-z]*\b/i.test(cmd);

  const explicitHits = PROTECTED_FILES.filter((f) => cmd.includes(f));
  return { isGit: true, isBroad, explicitHits };
}

/**
 * Scan `git status --porcelain` output for protected files.
 * @param {string} porcelain
 * @param {string[]} basenames
 * @returns {string[]} the protected basenames present in the status
 */
export function scanStatusForProtected(porcelain, basenames) {
  const hits = new Set();
  for (const rawLine of String(porcelain ?? '').split('\n')) {
    if (!rawLine.trim()) continue;
    // Porcelain v1 is fixed-column: "XY PATH" (path starts at index 3); a rename
    // shows "old -> new" — take the destination.
    const pathPart = rawLine.slice(3).trim().split(' -> ').pop();
    if (!pathPart) continue;
    const base = basename(pathPart.replace(/^"|"$/g, ''));
    if (basenames.includes(base)) hits.add(base);
  }
  return [...hits];
}

/**
 * Warn-first state machine. First risky attempt warns; a repeat (already warned)
 * is blocked.
 * @param {{ risky: boolean, hits: string[], alreadyWarned: boolean }} input
 * @returns {{ action: 'allow'|'warn'|'block', message?: string }}
 */
export function decideCommitGuard(input) {
  if (!input.risky) return { action: 'allow' };
  const files = input.hits.join(', ') || 'a credential file';
  if (!input.alreadyWarned) {
    return {
      action: 'warn',
      message:
        `goodvibes: this git command would stage ${files}, which holds credentials ` +
        `and must never be committed (it is gitignored). Proceeding this once — repeat the ` +
        `command and it will be BLOCKED. Remove it from staging or add it to .gitignore.`,
    };
  }
  return {
    action: 'block',
    message:
      `goodvibes: BLOCKED — this git command would commit ${files}, which holds ` +
      `credentials. You were warned once. Unstage it (git restore --staged ${files}) before committing.`,
  };
}

function markerPath(cwd) {
  return join(cwd, '.goodvibes', '.commit-guard-warned');
}

/**
 * Evaluate a Bash tool invocation against the guard. All I/O is injectable so
 * the whole decision is testable without a repo.
 * @param {{
 *   toolName?: string, command?: string, cwd?: string,
 *   gitStatus?: () => string, exists?: (p:string)=>boolean, writeMarker?: (cwd:string)=>void
 * }} opts
 * @returns {{ action: 'allow'|'warn'|'block', message?: string }}
 */
export function evaluateCommit(opts = {}) {
  const cwd = opts.cwd ?? process.cwd();
  const exists = opts.exists ?? existsSync;

  if (opts.toolName !== 'Bash') return { action: 'allow' };

  const analysis = analyzeCommitCommand(opts.command ?? '');
  if (!analysis.isGit) return { action: 'allow' };

  const hits = new Set(analysis.explicitHits);
  if (analysis.isBroad) {
    const gitStatus = opts.gitStatus ?? (() => defaultGitStatus(cwd));
    for (const h of scanStatusForProtected(gitStatus(), PROTECTED_FILES)) hits.add(h);
  }

  const hitList = [...hits];
  const risky = hitList.length > 0;
  const alreadyWarned = exists(markerPath(cwd));
  const decision = decideCommitGuard({ risky, hits: hitList, alreadyWarned });

  if (decision.action === 'warn') {
    const writeMarker = opts.writeMarker ?? defaultWriteMarker;
    writeMarker(cwd);
  }
  return decision;
}

function defaultGitStatus(cwd) {
  try {
    return execFileSync('git', ['status', '--porcelain'], { cwd, encoding: 'utf-8' });
  } catch {
    return '';
  }
}

function defaultWriteMarker(cwd) {
  try {
    const p = markerPath(cwd);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, new Date().toISOString() + '\n', 'utf-8');
  } catch {
    /* best-effort */
  }
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
  const decision = evaluateCommit({
    toolName: input.tool_name,
    command: input.tool_input?.command,
    cwd,
  });

  if (decision.action === 'block') {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: decision.message,
        },
      }),
    );
    return;
  }
  if (decision.action === 'warn') {
    process.stdout.write(
      JSON.stringify({
        systemMessage: decision.message,
        hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' },
      }),
    );
    return;
  }
  // allow: say nothing, let the command proceed.
  process.stdout.write(JSON.stringify({ continue: true }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    // Fail open — a guard failure must never block legitimate work.
    process.stdout.write(JSON.stringify({ continue: true }));
  });
}
