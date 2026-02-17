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
  'UPGRADE-NOTIFICATIONS.md': `## IMPORTANT!\n\nTOOL UPGRADES AVAILABLE! Use precision_engine tools.\n`,
  'PRIMARY-GOALS.md': `## MANDATORY\n\nPRIMARY GOAL: Fully complete and functional code.\nSECONDARY DIRECTIVE: Be token-efficient.\n`,
  'CORE-PRINCIPLES.md': `## MANDATORY\n\n1. Maintain usage of WRFC Loops\n2. Minimize token usage\n3. NEVER block main conversation\n4. Always have a plan\n`,
  'SUBAGENT-PROTOCOL.md': `## MANDATORY\n\nALWAYS provide reminders to subagents:\n1. Use .goodvibes/ memory and logging\n2. MANDATORY: Follow strict DPB Loops. D: Single discover call (batched). P: Plan in text (zero tool calls). B: Single batched precision call. Target: 3 tool calls per DPB cycle.\n3. Use precision_engine tools, NEVER native tools\n4. CRITICAL: NEVER set sandbox=true. Only user can activate sandbox.\n\n---\n\n<!-- PRECISION MASTERY -->\n@PRECISION-MASTERY.md\n\n<!-- DISCOVER-PLAN-BATCH -->\n@DISCOVER-PLAN-BATCH.md\n\n<!-- SKILL AWARENESS -->\n@SKILLS.md\n`,
  'SKILLS.md': `## SKILL AWARENESS\n\nSkills load automatically when relevant to your task.\n\n### Protocol Skills (Always Active)\n- precision-mastery: Token-efficient file operations, extract modes, verbosity, batching\n- discover-plan-batch: Strict 3-call DPB execution loop\n- review-scoring: 10-dimension scoring rubric for WRFC review loops\n- goodvibes-memory: Cross-session memory (decisions, patterns, failures, preferences)\n- error-recovery: Tiered error recovery and escalation procedures\n\n### Orchestration Skills\n- task-orchestration: Parallel agent decomposition and WRFC coordination\n- fullstack-feature: End-to-end multi-layer feature development\n\n### Outcome Skills\n- ai-integration, api-design, authentication, component-architecture, database-layer\n- deployment, payment-integration, service-integration, state-management, styling-system, testing-strategy\n\n### Quality Skills\n- accessibility-audit, code-review, debugging, performance-audit\n- project-onboarding, refactoring, security-audit\n\n### Fallback: Manual Skill Loading\nIf a skill doesn't load automatically, use ToolSearch to find get_skill_content from registry-engine.\n`,
  'PRECISION-MASTERY.md': `## PRECISION MASTERY\n\nUse precision_engine tools over native tools. Batch operations. Use minimal verbosity.\n`,
  'DISCOVER-PLAN-BATCH.md': `## DISCOVER-PLAN-BATCH\n\nFollow DPB loop: Discover (1 call) -> Plan (0 calls) -> Batch (1 call). Target 3 tool calls per cycle.\n`,
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
