#!/usr/bin/env node
/**
 * Prompt-chain installer for `/goodvibes:plugin install-prompts` /
 * `uninstall-prompts`.
 *
 * Rebuilt small on purpose: v1's prompt chain was ~6,070 tokens across seven
 * always-on files (CORE-PRINCIPLES, GATHER-PLAN-APPLY, PRECISION-MASTERY,
 * PRIMARY-GOALS, SKILLS, SUBAGENT-PROTOCOL, UPGRADE-NOTIFICATIONS), installed
 * silently by the SessionStart hook. Plan §9.6 retires that mechanism —
 * install/uninstall are explicit, opt-in commands only, and the steady-state
 * budget is ≤1,500 tokens. Most of v1's doctrine either retired outright
 * (gather-plan-apply, the always-on precision doctrine) or moved to the
 * on-demand skills this plugin ships (intel-mastery, goodvibes-memory,
 * task-orchestration, review-scoring, project-onboarding) — so this installer
 * writes ONE compact pointer file, not seven doctrine files.
 *
 * Usage: node prompt-installer.mjs <install|uninstall|status> [projectDir]
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync, rmdirSync, readdirSync } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const MARKER_START = '<!-- GOODVIBES IMPORTS -->';
const IMPORT_LINE = '@.goodvibes/GOODVIBES.md';
const HUB_RELATIVE = path.join('.goodvibes', 'GOODVIBES.md');

const HUB_CONTENT = `# GoodVibes

Structure-aware code intelligence, session cost telemetry, and a connect workbench — opt-in,
measured, and honest about when native tools are the right choice.

## On-demand skills
Load by name via the Skill tool when the task calls for it — none of these are always-on:
- \`intel-mastery\` — usage guide for the intel MCP tools (code_read/code_grep/code_glob/...).
- \`project-onboarding\` — mapping an unfamiliar codebase with the intel analyzers.
- \`goodvibes-memory\` — \`.goodvibes/memory/\` cross-session decisions/patterns/failures/preferences.
- \`task-orchestration\` — decomposing work with native Task/Workflow + the Write-Review-Fix-Confirm pattern.
- \`review-scoring\` — the WRFC refutation rubric (defect list + severity, not a scalar score).

## Agents
\`engineer\`, \`refutation-reviewer\`, \`tester\`, \`architect\` — delegate via the Task tool.

## Analytics
\`/goodvibes:analytics\` for session cost/token telemetry from the analytics server.

## Connect
The connect server's \`service\`/\`api_request\`/\`db_query\` tools — registered external APIs and
databases under an explicit trust boundary (restricted by default). Manage the registry with
\`/goodvibes:services\`.

---
*Installed by \`/goodvibes:plugin install-prompts\`. Remove with \`uninstall-prompts\`.*
`;

function resolveTargetDir(projectDir) {
  // 1. ~/.claude/ if it exists, is writable, and the project isn't inside it.
  const home = path.join(os.homedir(), '.claude');
  if (existsSync(home) && !projectDir.startsWith(home)) {
    try {
      const probe = path.join(home, `.gv-write-probe-${process.pid}`);
      writeFileSync(probe, '');
      unlinkSync(probe);
      return home;
    } catch {
      /* not writable — fall through */
    }
  }
  // 2. Highest ancestor of projectDir containing a CLAUDE.md.
  let dir = projectDir;
  let highestWithClaudeMd = null;
  for (;;) {
    if (existsSync(path.join(dir, 'CLAUDE.md'))) highestWithClaudeMd = dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  if (highestWithClaudeMd) return highestWithClaudeMd;
  // 3. The project root itself.
  return projectDir;
}

function install(projectDir) {
  const targetDir = resolveTargetDir(projectDir);
  const claudeMdPath = path.join(targetDir, 'CLAUDE.md');
  const hubPath = path.join(targetDir, HUB_RELATIVE);

  mkdirSync(path.dirname(hubPath), { recursive: true });
  writeFileSync(hubPath, HUB_CONTENT);

  let claudeMd = existsSync(claudeMdPath) ? readFileSync(claudeMdPath, 'utf-8') : '';
  if (!claudeMd.includes(MARKER_START)) {
    const separator = claudeMd.length > 0 && !claudeMd.endsWith('\n') ? '\n' : '';
    claudeMd += `${separator}\n${MARKER_START}\n${IMPORT_LINE}\n`;
    writeFileSync(claudeMdPath, claudeMd);
  }

  return { targetDir, installed: [claudeMdPath, hubPath] };
}

function uninstall(projectDir) {
  const targetDir = resolveTargetDir(projectDir);
  const claudeMdPath = path.join(targetDir, 'CLAUDE.md');
  const hubPath = path.join(targetDir, HUB_RELATIVE);
  const removedFiles = [];
  let importRemoved = false;

  if (existsSync(claudeMdPath)) {
    const content = readFileSync(claudeMdPath, 'utf-8');
    const markerIndex = content.indexOf(MARKER_START);
    if (markerIndex !== -1) {
      const before = content.slice(0, markerIndex).replace(/\n+$/, '\n');
      const afterMarker = content.slice(markerIndex);
      const importLineEnd = afterMarker.indexOf('\n', afterMarker.indexOf(IMPORT_LINE));
      const after = importLineEnd === -1 ? '' : afterMarker.slice(importLineEnd + 1);
      const updated = (before + after).trim();
      if (updated.length === 0) {
        unlinkSync(claudeMdPath);
        removedFiles.push(claudeMdPath);
      } else {
        writeFileSync(claudeMdPath, updated + '\n');
      }
      importRemoved = true;
    }
  }

  if (existsSync(hubPath)) {
    unlinkSync(hubPath);
    removedFiles.push(hubPath);
  }

  const goodvibesDir = path.dirname(hubPath);
  try {
    if (existsSync(goodvibesDir) && readdirSync(goodvibesDir).length === 0) {
      rmdirSync(goodvibesDir);
    }
  } catch {
    /* non-empty or already gone — fine */
  }

  return { targetDir, removed: removedFiles.length > 0, importRemoved, removedFiles };
}

function status(projectDir) {
  const targetDir = resolveTargetDir(projectDir);
  const hubPath = path.join(targetDir, HUB_RELATIVE);
  const claudeMdPath = path.join(targetDir, 'CLAUDE.md');
  const installed = existsSync(hubPath);
  const importPresent = existsSync(claudeMdPath) && readFileSync(claudeMdPath, 'utf-8').includes(MARKER_START);
  return { targetDir, installed, importPresent };
}

const [, , command, projectDirArg] = process.argv;
const projectDir = projectDirArg || process.cwd();

let result;
switch (command) {
  case 'install':
    result = install(projectDir);
    break;
  case 'uninstall':
    result = uninstall(projectDir);
    break;
  case 'status':
    result = status(projectDir);
    break;
  default:
    process.stderr.write(`Usage: prompt-installer.mjs <install|uninstall|status> [projectDir]\n`);
    process.exit(1);
}

process.stdout.write(JSON.stringify(result));
