#!/usr/bin/env node
/**
 * Prompt-chain installer for `/goodvibes:plugin install-prompts` /
 * `uninstall-prompts`.
 *
 * Rebuilt small on purpose: v1's prompt chain was ~6,070 tokens across seven
 * always-on files (CORE-PRINCIPLES, GATHER-PLAN-APPLY, PRECISION-MASTERY,
 * PRIMARY-GOALS, SKILLS, SUBAGENT-PROTOCOL, UPGRADE-NOTIFICATIONS), installed
 * silently by the SessionStart hook. Plan §9.6 retires that mechanism,
 * install/uninstall are explicit, opt-in commands only, and the steady-state
 * budget is ≤1,500 tokens. Most of v1's doctrine either retired outright
 * (gather-plan-apply, the always-on precision doctrine) or moved to the
 * on-demand skills this plugin ships (intel-mastery, goodvibes-memory,
 * task-orchestration, review-scoring, project-onboarding), so this installer
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

const HUB_CONTENT = `# GoodVibes tools — when to reach for them

The goodvibes plugin runs three MCP servers (intel / analytics / connect). Their schemas load
on demand, so this card is the always-on map of when each tool beats the native alternative.
For a small file or a one-off trivial search, native Read/Grep are fine — these earn their
keep on repo-scale work and repetition.

## intel, structure-aware reading, search, analysis (TypeScript/JS-centric)
- \`code_read\` — you need a file's STRUCTURE or a slice, not the whole file: extract "outline"
  returns signatures/members at 40-73% fewer tokens than a full read (measured); extract
  "lines" fetches exact ranges, batched across many files in one call.
- \`code_grep\` — repo-wide search you would otherwise page through: several patterns in one
  batched call, clean output caps (counts stay true), matches expandable to line/block/function.
  Measured 62.7% fewer tokens than native grep for identical match sets.
- \`code_glob\` — find files by pattern plus size/date/content filters, gitignore-aware, one call.
- \`code_surface\` — before changing a module: its public API vs internals, from the compiler.
- \`code_safe_delete\` — before deleting a symbol: every reference that would break.
- \`structural_edit\` — multi-site or AST-anchored edits (rename every call site, rewrite every
  matching pattern): preview first, then apply; exact-string and TS-AST modes.
- \`api_routes\` / \`api_spec\` / \`api_validate\` — map a project's HTTP surface / generate
  OpenAPI from it / diff a written spec against the real routes.
- \`db_schema\` — the project's data model (Prisma / Drizzle / SQL, auto-detected).
- \`component_tree\` / \`hook_dependencies\` / \`client_boundary\` / \`layout_analysis\` — React
  analyzers: composition, hook-dependency bugs, "use client" boundaries, Tailwind layout.
- \`scaffold\` — a new app from a bundled template instead of hand-assembled boilerplate.

## analytics, session cost from transcript actuals, never self-estimates
\`/goodvibes:analytics\` (summary | status | report | doctor | budget | export | tag | sync).
\`report\` renders a self-contained HTML dashboard; \`doctor\` scans for orphaned plugin
processes when the host feels slow.

## connect, authenticated HTTP + databases behind a trust boundary
Register targets with \`/goodvibes:services\`, then \`api_request\` (credentials pinned to their
registered origin, read-only unless opted in) and \`db_query\` (registered connections only).
Restricted by default; the trust mode cannot be flipped by a tool.

---
*Installed by \`/goodvibes:plugin install-prompts\`; removed by \`uninstall-prompts\`. Content
updates with plugin releases.*
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
      /* not writable, fall through */
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
    /* non-empty or already gone, fine */
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
