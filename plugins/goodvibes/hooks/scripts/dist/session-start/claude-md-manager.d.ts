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
export declare function ensureClaudeMdImports(projectDir: string): Promise<void>;
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
/**
 * Detect (read-only) whether the GoodVibes prompt chain is installed.
 *
 * SessionStart must NOT write outside the project — installation happens only
 * through the explicit `/goodvibes:plugin install-prompts` command (removal
 * via `uninstall-prompts`) or the Setup hook. This function performs ZERO
 * writes; it only inspects the same candidate locations the installer uses.
 */
export declare function detectPromptInstallation(projectDir: string): Promise<PromptInstallState>;
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
/**
 * Explicit opt-out: cleanly remove a prompt-chain installation.
 *
 * Invoked by `/goodvibes:plugin uninstall-prompts` (via the prompt-installer
 * CLI). Drops the GOODVIBES IMPORTS block from CLAUDE.md (deleting the file
 * only when nothing else remains in it), deletes .goodvibes/GOODVIBES.md and
 * the installed .goodvibes/prompt/*.md files, and prunes the directories if
 * they end up empty. Files not written by the installer are never touched.
 */
export declare function removeClaudeMdImports(projectDir: string): Promise<PromptRemovalResult>;
