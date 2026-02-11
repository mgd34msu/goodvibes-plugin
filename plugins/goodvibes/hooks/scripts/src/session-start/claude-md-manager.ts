import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { debug, logError } from '../shared/index.js';

/**
 * Hardcoded content constants
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

const PROMPT_FILES: Record<string, string> = {
  'UPGRADE-NOTIFICATIONS.md': `## IMPORTANT!

TOOL UPGRADES AVAILABLE! The precision_engine has tools that are a superset of native tools, with transaction support, batching, and token-efficient output. Prioritize their use over the deprecated native tools (Read, Edit, Write, Glob, Grep, WebFetch). Always use precision_engine equivalents. WebSearch has no replacement — use it directly.
`,

  'PRIMARY-GOALS.md': `## MANDATORY

PRIMARY GOAL: Fully complete and functional code that passes review with no major or minor issues. Score 9.5 or higher.
SECONDARY DIRECTIVE: Be as token-efficient as possible while still achieving the primary goal.
`,

  'CORE-PRINCIPLES.md': `## MANDATORY

1. Maintain usage of WRFC Loops and goodvibes logging & memory functions
2. Minimize unnecessary token usage:
  - Use appropriate precision_engine tool verbosity and output settings
  - ONLY request or send amount of data necessary to complete your task
  - No unnecessary precision tool verbosity, or unnecessary full file reads/writes, or context clutter
  - Writes/Edits happen on disk, verbose output in main conversation is unnecessary
3. NEVER block the main conversation
  - All subagents and processes are to be run in the background
  - Task Output should only be used in non-blocking mode, if at all
  - Task Output is unnecessary because subagents will tell you when they have completed their task
4. ALWAYS think before you act. Time is cheap, tokens are expensive. Always have a plan.
`,

  'SUBAGENT-PROTOCOL.md': `## MANDATORY

ALWAYS provide the following reminders to subagents:
1. Use .goodvibes/ memory and logging when troubleshooting a problem
2. Maintain usage of DPB Loops. D: Discover tool first, P: Plan your work to maximize token efficiency, B: Batch execution as much as possible, then Loop.
  - Preferred: batch_engine batch tool call wraps precision_engine tool calls that use precision tool batching functionality
  - Acceptable: precision_engine tool calls use batching functionality on their own without batch_engine
  - Limited: precision_engine tool call without batching functionality. (sometimes necessary, so still allowed)
  - Unacceptable: native tools for Read, Write, Edit, Glob, Grep, WebFetch, NotebookEdit
3. NEVER use Bash cat, echo, heredoc, or other workarounds unless precision_engine tools have failed multiple attempts
4. Incorrect usage of precision_engine tools DOES NOT COUNT as a failed attempt
5. ALWAYS return to using precision_engine tools after a successful workaround
6. Use appropriate precision tool verbosity, only consume or produce the amount of data necessary to complete the task
7. CRITICAL: NEVER set sandbox=true via precision_config. Only the user can activate sandbox mode.
`,
};

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
  } catch {
    // File doesn't exist, proceed with write
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
  await Promise.all(
    Object.entries(PROMPT_FILES).map(([filename, content]) => {
      const filePath = path.join(targetDir, '.goodvibes', 'prompt', filename);
      return writeIfChanged(filePath, content);
    })
  );
}

/**
 * Main export: Ensure CLAUDE.md import architecture is installed
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
