import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { debug, logError } from '../shared/index.js';
import { PLUGIN_ROOT } from '../shared/constants.js';

/**
 * Structural import directives (always hardcoded)
 */
const CLAUDE_MD_IMPORT = `<!-- GOODVIBES IMPORTS -->
@.goodvibes/GOODVIBES.md
`;

const GOODVIBES_MD = `<!-- UPGRADE NOTIFICATIONS -->
@prompt/UPGRADE-NOTIFICATIONS.md

<!-- PRIMARY GOALS -->
@prompt/PRIMARY-GOALS.md

<!-- CORE PRINCIPLES -->
@prompt/CORE-PRINCIPLES.md

<!-- SUBAGENT PROTOCOL -->
@prompt/SUBAGENT-PROTOCOL.md
`;

/**
 * Minimal fallback prompt files (used only if templates can't be read)
 */
const FALLBACK_PROMPT_FILES: Record<string, string> = {
  'UPGRADE-NOTIFICATIONS.md': `## IMPORTANT!\n\n### TOOL UPGRADES NOW AVAILABLE:\n\nPrecision_engine tools are a superset of native tools, with transaction support, batching, and token-efficient output. Prioritize their use over the deprecated native tools (Read, Edit, Write, Glob, Grep, Update, WebFetch). Always use precision_engine equivalents. WebSearch has no replacement — use it directly.\n\n### DEPRECATION NOTICE:\n\nNative tools (Read, Edit, Write, Glob, Grep, Update, WebFetch) have been deprecated as of 2026-01-01. Use precision_engine tools as a replacement.\n`,
  'PRIMARY-GOALS.md': `## MANDATORY\n\nPRIMARY GOAL: Fully complete and functional code that meets or exceeds the minimum review score (provided in <gv> tags)\nSECONDARY DIRECTIVE: ALWAYS prioritize achieving the primary goal, but aim to minimize token usage in all actions\n`,
  'CORE-PRINCIPLES.md': `## MANDATORY\n\n1. Directives are IMMEDIATE: NEVER defer, reorder, or condition a directive on another event\n2. Execute directives BEFORE any other action. NO intervening tool calls or agent spawns\n3. Orchestrator autonomy ends when directives begin. ONLY initial task decomposition is self-directed\n4. Runtime workflow logic ALWAYS supersedes orchestrator judgment\n5. ALWAYS Execute <gv> directives from the runtime engine and maintain goodvibes logging, memory, and state functions\n6. MINIMIZE unnecessary token usage: use precision_engine verbosity settings, only request/send data necessary\n7. NEVER block main conversation: ALL subagents run in background, Task Output only by explicit user request\n8. ALWAYS think before you act. Time is cheap, tokens are expensive. Always have a plan.\n9. Execution plans do NOT supersede directives. When a directive arrives between plan phases, execute the directive FIRST, then resume the next phase. NEVER batch phases to skip intermediate directives.\n`,
  'SUBAGENT-PROTOCOL.md': `## MANDATORY\n\nALWAYS provide reminders to subagents:\n1. Use .goodvibes/ memory and logging\n2. MANDATORY: Follow GPA Loops. GATHER: discover + reads (batch where possible). PLAN: zero tool calls, plan in text. APPLY: writes/edits/verification (batch where possible). Inconvenient does not mean impossible.\n  - Preferred: precision_engine tool calls with built-in batching (files array, edits array, commands array)\n  - Acceptable: precision_engine tool call without batching (sometimes necessary, still allowed)\n  - Unacceptable: native tools for Read, Write, Edit, Glob, Grep, WebFetch, NotebookEdit\n  - Unacceptable: using precision_exec to run grep, find, rg, cat, ls, or any file search/read command\n3. precision_exec is for build/test/deploy ONLY (npm run, npx, git). NEVER use it to search files or read content\n4. NEVER use Bash cat, echo, heredoc workarounds unless precision tools have failed multiple attempts\n5. CRITICAL: NEVER set sandbox=true. Only user can activate sandbox.\n\n---\n\n<!-- PRECISION MASTERY -->\n@PRECISION-MASTERY.md\n\n<!-- GATHER-PLAN-APPLY -->\n@GATHER-PLAN-APPLY.md\n\n<!-- SKILL AWARENESS -->\n@SKILLS.md\n`,
  'SKILLS.md': `## SKILL AWARENESS\n\nSkills load automatically when relevant to your task.\n\n### Protocol Skills (Always Active)\n- precision-mastery: Token-efficient file operations, extract modes, verbosity, batching\n- gather-plan-apply: GPA execution loop (gather, plan, apply, batch aggressively)\n- review-scoring: 10-dimension scoring rubric for WRFC review loops\n- goodvibes-memory: Cross-session memory (decisions, patterns, failures, preferences)\n- error-recovery: Tiered error recovery and escalation procedures\n\n### Orchestration Skills\n- task-orchestration: Parallel agent decomposition and WRFC coordination\n- fullstack-feature: End-to-end multi-layer feature development\n\n### Outcome Skills\n- ai-integration, api-design, authentication, component-architecture, database-layer\n- deployment, payment-integration, service-integration, state-management, styling-system, testing-strategy\n\n### Quality Skills\n- accessibility-audit, code-review, debugging, performance-audit\n- project-onboarding, refactoring, security-audit\n\n### Fallback: Manual Skill Loading\nIf a skill doesn't load automatically, use ToolSearch to find get_skill_content from registry-engine.\n`,
  'PRECISION-MASTERY.md': `## PRECISION MASTERY (Auto-loaded for all subagents)\n\nThe precision engine replaces native tools (Read, Edit, Write, Grep, Glob, Update, WebFetch) with token-efficient equivalents. Correct usage saves 75-95% of tokens.\n\nVerbosity: write/edit=count_only, read=standard, grep(discovery)=files_only, grep(content)=matches, glob=paths_only, exec=minimal.\n\nExtract modes: outline (structure, 60-80% savings), symbols (exports, 70-90%), lines (ranges, 80-95%), content (full file, 0%).\n\nCommon mistakes: Don't read outline then re-read content. Don't skip memory checks. Don't make sequential same-tool calls. Don't use verbose for writes. NEVER use precision_exec to run grep, find, rg, cat, ls.\n\nEscalation: Check error -> native tool for THAT task only -> return to precision -> log to failures.json.\n`,
  'GATHER-PLAN-APPLY.md': `## GATHER-PLAN-APPLY (Auto-loaded for all subagents)\n\nGATHER -> PLAN -> APPLY -> loop if needed. Batch where possible (inconvenient does not mean impossible).\n\nGATHER: Collect context. Batch reads/greps into arrays. Use cheapest extract mode (see Precision Mastery). Check .goodvibes/memory/ first. Skip only for 1-2 known files.\nPLAN: Zero tool calls. List exact paths, changes, dependencies, batch opportunities. Scale depth to task.\nAPPLY: precision_write (count_only), precision_edit (minimal), precision_exec (minimal). Fix only failed ops.\n\nHard Rules:\n- Always check .goodvibes/memory/ before starting\n- Never use deprecated native tools when precision equivalents work\n- Never use precision_exec for file search -- use discover, precision_grep, precision_glob\n- Never use verbose/standard verbosity for writes/edits\n- Never make sequential single-item calls when arrays are available -- batch them\n- Never re-read content you just wrote\n\nOverflow: truncated results go to .goodvibes/.overflow/ -- paginate with precision_read line ranges. Aim below 7500 tokens per request, NEVER exceed 10000.\n`,
};

/**
 * Load prompt files from templates directory
 */
async function loadPromptFiles(): Promise<Record<string, string>> {
  const templatesDir = path.join(PLUGIN_ROOT, 'templates', 'prompt');
  const promptFiles: Record<string, string> = {};

  try {
    const files = await fs.promises.readdir(templatesDir);
    const mdFiles = files.filter(f => f.endsWith('.md'));

    // Read all template files
    await Promise.all(
      mdFiles.map(async (filename) => {
        try {
          const filePath = path.join(templatesDir, filename);
          const content = await fs.promises.readFile(filePath, 'utf-8');
          promptFiles[filename] = content;
        } catch (err) {
          debug(`Failed to read template file ${filename}, using fallback`);
          // Use fallback if available
          if (filename in FALLBACK_PROMPT_FILES) {
            promptFiles[filename] = FALLBACK_PROMPT_FILES[filename];
          }
        }
      })
    );

    if (Object.keys(promptFiles).length > 0) {
      debug(`Loaded ${Object.keys(promptFiles).length} prompt files from templates`);
      return promptFiles;
    }
  } catch (err) {
    debug(`Failed to read templates directory: ${templatesDir}`);
  }

  // Fallback: use minimal hardcoded versions
  debug('Using fallback prompt files');
  return FALLBACK_PROMPT_FILES;
}

/**
 * Helper: Write file only if content differs
 */
async function writeIfChanged(filePath: string, content: string): Promise<void> {
  try {
    const existing = await fs.promises.readFile(filePath, 'utf-8');
    if (existing.trimEnd() === content.trimEnd()) {
      debug(`Skipping write (content unchanged): ${filePath}`);
      return;
    }
  } catch (err) {
    debug(`Template file not found or unreadable, using fallback: ${filePath}`);
  }

  const dirname = path.dirname(filePath);
  await fs.promises.mkdir(dirname, { recursive: true });
  await fs.promises.writeFile(filePath, content, 'utf-8');
  debug(`Wrote file: ${filePath}`);
}

/**
 * Try to use ~/.claude/ directory if writable and not inside project
 */
async function tryClaudeHomeDir(projectDir: string): Promise<string | null> {
  try {
    const claudeHome = path.join(os.homedir(), '.claude');
    
    // Guard: skip if project IS inside ~/.claude/
    const resolvedProject = path.resolve(projectDir);
    const claudeHomeSep = claudeHome + path.sep;
    if (resolvedProject === claudeHome || resolvedProject.startsWith(claudeHomeSep)) {
      debug('Project is inside ~/.claude/, skipping home directory strategy');
      return null;
    }

    // Check exists + writable
    await fs.promises.access(claudeHome, fs.constants.W_OK);
    debug(`Using ~/.claude/ directory: ${claudeHome}`);
    return claudeHome;
  } catch {
    debug('~/.claude/ directory not found or not writable');
    return null;
  }
}

/**
 * Find highest ancestor directory containing CLAUDE.md (excluding projectDir)
 */
async function findHighestAncestorClaudeMd(projectDir: string): Promise<string | null> {
  try {
    const resolved = path.resolve(projectDir);
    const parsed = path.parse(resolved);
    const root = parsed.root;

    // Split path into segments
    const segments = resolved.substring(root.length).split(path.sep).filter(s => s.length > 0);
    
    // Walk from root DOWN, building paths progressively
    let highestMatch: string | null = null;
    for (let i = 0; i < segments.length; i++) {
      const checkPath = path.join(root, ...segments.slice(0, i + 1));
      
      // Exclude projectDir itself
      if (checkPath === resolved) {
        continue;
      }

      const claudeMdPath = path.join(checkPath, 'CLAUDE.md');
      try {
        await fs.promises.access(claudeMdPath, fs.constants.R_OK);
        // First (highest) ancestor found
        highestMatch = checkPath;
        break;
      } catch {
        // No CLAUDE.md here, continue
      }
    }

    if (highestMatch) {
      debug(`Found highest ancestor CLAUDE.md at: ${highestMatch}`);
    }
    return highestMatch;
  } catch {
    debug('Failed to search ancestor directories for CLAUDE.md');
    return null;
  }
}

/**
 * Resolve target directory using three-strategy approach
 */
async function resolveTargetDirectory(projectDir: string): Promise<string> {
  // Strategy 1: ~/.claude/
  const claudeHome = await tryClaudeHomeDir(projectDir);
  if (claudeHome) {
    return claudeHome;
  }

  // Strategy 2: Highest ancestor with CLAUDE.md
  const ancestorDir = await findHighestAncestorClaudeMd(projectDir);
  if (ancestorDir) {
    return ancestorDir;
  }

  // Strategy 3: Project root itself
  debug(`Using project directory: ${projectDir}`);
  return projectDir;
}

/**
 * Ensure CLAUDE.md exists with import directive
 */
async function ensureClaudeMdImport(targetDir: string): Promise<void> {
  const claudeMdPath = path.join(targetDir, 'CLAUDE.md');

  try {
    const existing = await fs.promises.readFile(claudeMdPath, 'utf-8');
    
    // Check if already has import
    if (existing.includes('<!-- GOODVIBES IMPORTS -->')) {
      debug(`CLAUDE.md already has import: ${claudeMdPath}`);
      return;
    }

    // Append import
    const separator = existing.endsWith('\n') ? '\n' : '\n\n';
    const updated = existing + separator + CLAUDE_MD_IMPORT;
    await writeIfChanged(claudeMdPath, updated);
  } catch {
    // File doesn't exist, create it
    await writeIfChanged(claudeMdPath, CLAUDE_MD_IMPORT);
  }
}

/**
 * Ensure .goodvibes/GOODVIBES.md exists
 */
async function ensureGoodvibesMd(targetDir: string): Promise<void> {
  const goodvibesMdPath = path.join(targetDir, '.goodvibes', 'GOODVIBES.md');
  await writeIfChanged(goodvibesMdPath, GOODVIBES_MD);
}

/**
 * Ensure all prompt files exist
 */
async function ensurePromptFiles(targetDir: string): Promise<void> {
  const promptFiles = await loadPromptFiles();
  await Promise.all(
    Object.entries(promptFiles).map(([filename, content]) => {
      const filePath = path.join(targetDir, '.goodvibes', 'prompt', filename);
      return writeIfChanged(filePath, content);
    })
  );
}

/**
 * Main export: Ensure CLAUDE.md import architecture is installed.
 *
 * CONSENT BOUNDARY: this function writes files, potentially OUTSIDE the
 * project directory (~/.claude). It must only run from explicit user-consented
 * entry points: the Setup hook (`claude init`) and the
 * `/goodvibes:plugin install-prompts` command. It must NEVER be called from
 * SessionStart, which is restricted to read-only detection
 * (see detectPromptInstallation below).
 */
export async function ensureClaudeMdImports(projectDir: string): Promise<void> {
  try {
    const targetDir = await resolveTargetDirectory(projectDir);
    await ensureClaudeMdImport(targetDir);
    await Promise.all([
      ensureGoodvibesMd(targetDir),
      ensurePromptFiles(targetDir),
    ]);
  } catch (err) {
    logError('Failed to ensure CLAUDE.md imports', err instanceof Error ? err : new Error(String(err)));
  }
}

/**
 * Prompt-chain installation state, as detected (read-only) at session start.
 */
export interface PromptInstallState {
  /** True when a GoodVibes prompt-chain installation was found */
  installed: boolean;
  /** Directory the installation was found in (null when not installed) */
  targetDir: string | null;
  /** CLAUDE.md in targetDir contains the GOODVIBES IMPORTS marker */
  importPresent: boolean;
  /** .goodvibes/GOODVIBES.md exists in targetDir */
  goodvibesMdPresent: boolean;
  /** .goodvibes/prompt/ directory exists in targetDir */
  promptDirPresent: boolean;
}

const NOT_INSTALLED: PromptInstallState = {
  installed: false,
  targetDir: null,
  importPresent: false,
  goodvibesMdPresent: false,
  promptDirPresent: false,
};

/** Read-only inspection of a single candidate directory for install markers. */
async function inspectCandidate(dir: string): Promise<PromptInstallState> {
  let importPresent = false;
  try {
    const content = await fs.promises.readFile(path.join(dir, 'CLAUDE.md'), 'utf-8');
    importPresent = content.includes('<!-- GOODVIBES IMPORTS -->');
  } catch {
    // No readable CLAUDE.md here
  }

  let goodvibesMdPresent = false;
  try {
    await fs.promises.access(path.join(dir, '.goodvibes', 'GOODVIBES.md'), fs.constants.R_OK);
    goodvibesMdPresent = true;
  } catch {
    // Absent
  }

  let promptDirPresent = false;
  try {
    const stat = await fs.promises.stat(path.join(dir, '.goodvibes', 'prompt'));
    promptDirPresent = stat.isDirectory();
  } catch {
    // Absent
  }

  const installed = importPresent || goodvibesMdPresent;
  return {
    installed,
    targetDir: installed ? dir : null,
    importPresent,
    goodvibesMdPresent,
    promptDirPresent,
  };
}

/**
 * Detect (read-only) whether the GoodVibes prompt chain is installed.
 *
 * SessionStart must NOT write outside the project — installation happens only
 * through the explicit `/goodvibes:plugin install-prompts` command (removal
 * via `uninstall-prompts`) or the Setup hook. This function performs ZERO
 * writes; it only inspects the same candidate locations the installer uses.
 */
export async function detectPromptInstallation(projectDir: string): Promise<PromptInstallState> {
  try {
    const candidates: string[] = [];

    // Candidate 1: ~/.claude (unless the project is inside it)
    const claudeHome = path.join(os.homedir(), '.claude');
    const resolvedProject = path.resolve(projectDir);
    if (resolvedProject !== claudeHome && !resolvedProject.startsWith(claudeHome + path.sep)) {
      candidates.push(claudeHome);
    }

    // Candidate 2: highest ancestor directory with a CLAUDE.md
    const ancestorDir = await findHighestAncestorClaudeMd(projectDir);
    if (ancestorDir) {
      candidates.push(ancestorDir);
    }

    // Candidate 3: the project itself
    candidates.push(resolvedProject);

    for (const dir of candidates) {
      const state = await inspectCandidate(dir);
      if (state.installed) {
        return state;
      }
    }
    return { ...NOT_INSTALLED };
  } catch (err) {
    logError('Failed to detect prompt installation', err instanceof Error ? err : new Error(String(err)));
    return { ...NOT_INSTALLED };
  }
}

/**
 * Result of an explicit prompt-chain removal (uninstall-prompts).
 */
export interface PromptRemovalResult {
  /** True when an installation was found and removed */
  removed: boolean;
  /** Directory the installation was removed from (null when nothing found) */
  targetDir: string | null;
  /** True when the GOODVIBES IMPORTS block was dropped from CLAUDE.md */
  importRemoved: boolean;
  /** Absolute paths of files deleted during removal */
  removedFiles: string[];
}

/** All prompt filenames the installer may have written (templates + fallbacks). */
async function installedPromptFileNames(): Promise<string[]> {
  const names = new Set(Object.keys(FALLBACK_PROMPT_FILES));
  try {
    const templatesDir = path.join(PLUGIN_ROOT, 'templates', 'prompt');
    const files = await fs.promises.readdir(templatesDir);
    for (const f of files) {
      if (f.endsWith('.md')) names.add(f);
    }
  } catch {
    // Templates unavailable — fallback names cover the minimal install
  }
  return [...names];
}

/**
 * Explicit opt-out: cleanly remove a prompt-chain installation.
 *
 * Invoked by `/goodvibes:plugin uninstall-prompts` (via the prompt-installer
 * CLI). Drops the GOODVIBES IMPORTS block from CLAUDE.md (deleting the file
 * only when nothing else remains in it), deletes .goodvibes/GOODVIBES.md and
 * the installed .goodvibes/prompt/*.md files, and prunes the directories if
 * they end up empty. Files not written by the installer are never touched.
 */
export async function removeClaudeMdImports(projectDir: string): Promise<PromptRemovalResult> {
  const none: PromptRemovalResult = {
    removed: false,
    targetDir: null,
    importRemoved: false,
    removedFiles: [],
  };
  try {
    const state = await detectPromptInstallation(projectDir);
    if (!state.installed || !state.targetDir) {
      return none;
    }
    const targetDir = state.targetDir;
    const removedFiles: string[] = [];
    let importRemoved = false;

    // 1. Drop the import block from CLAUDE.md
    const claudeMdPath = path.join(targetDir, 'CLAUDE.md');
    try {
      const existing = await fs.promises.readFile(claudeMdPath, 'utf-8');
      if (existing.includes('<!-- GOODVIBES IMPORTS -->')) {
        const updated = existing
          .replace(/[ \t]*<!-- GOODVIBES IMPORTS -->\s*\n@\.goodvibes\/GOODVIBES\.md[ \t]*\n?/g, '')
          .replace(/\n{3,}/g, '\n\n');
        if (updated.trim().length === 0) {
          // The file contained nothing but our import — remove it entirely
          await fs.promises.unlink(claudeMdPath);
          removedFiles.push(claudeMdPath);
        } else {
          await fs.promises.writeFile(claudeMdPath, updated, 'utf-8');
        }
        importRemoved = true;
      }
    } catch {
      // No CLAUDE.md — nothing to drop
    }

    // 2. Delete installed prompt files (only names the installer writes)
    const promptDir = path.join(targetDir, '.goodvibes', 'prompt');
    for (const name of await installedPromptFileNames()) {
      const filePath = path.join(promptDir, name);
      try {
        await fs.promises.unlink(filePath);
        removedFiles.push(filePath);
      } catch {
        // Not present — fine
      }
    }

    // 3. Delete .goodvibes/GOODVIBES.md
    const goodvibesMdPath = path.join(targetDir, '.goodvibes', 'GOODVIBES.md');
    try {
      await fs.promises.unlink(goodvibesMdPath);
      removedFiles.push(goodvibesMdPath);
    } catch {
      // Not present — fine
    }

    // 4. Prune now-empty directories (rmdir fails on non-empty — intended)
    for (const dir of [promptDir, path.join(targetDir, '.goodvibes')]) {
      try {
        await fs.promises.rmdir(dir);
      } catch {
        // Directory not empty or missing — leave it alone
      }
    }

    return { removed: true, targetDir, importRemoved, removedFiles };
  } catch (err) {
    logError('Failed to remove CLAUDE.md imports', err instanceof Error ? err : new Error(String(err)));
    return none;
  }
}
