/**
 * Constants
 *
 * Environment constants and package manager lockfile definitions.
 */
/**
 * Package manager lockfile names in priority order.
 *
 * Used to detect which package manager a project uses by checking
 * for the presence of these files. Order determines preference when
 * multiple lockfiles exist.
 *
 * @example
 * // Check for lockfiles to detect package manager
 * for (const lockfile of LOCKFILES) {
 *   if (await fileExists(path.join(cwd, lockfile))) {
 *     return lockfile; // Found preferred package manager
 *   }
 * }
 */
export declare const LOCKFILES: readonly ["pnpm-lock.yaml", "yarn.lock", "package-lock.json", "bun.lockb"];
/**
 * Internal helper to resolve plugin root from a given dirname.
 * Extracted for testability.
 *
 * @internal Exported for testing purposes only
 * @param dirname - The __dirname value to use for resolution
 * @returns The resolved plugin root path
 */
export declare function resolvePluginRootFromDirname(dirname: string | undefined): string;
/**
 * Determines the plugin root directory.
 * Priority:
 * 1. CLAUDE_PLUGIN_ROOT env var (set by Claude Code during hook execution)
 * 2. Detect from script location (hooks/scripts/dist -> go up 3 levels)
 * 3. Fallback to plugins/goodvibes relative to cwd (for development)
 *
 * @internal Exported for testing purposes only
 */
export declare function resolvePluginRoot(): string;
/**
 * Root directory of the GoodVibes plugin itself.
 * Uses official Claude Code environment variable or intelligent fallback.
 */
export declare const PLUGIN_ROOT: string;
/**
 * Root directory of the user's project.
 * Uses official Claude Code environment variable or falls back to current working directory.
 */
export declare const PROJECT_ROOT: string;
/**
 * Cache directory for temporary plugin data.
 * Located at PLUGIN_ROOT/.cache for storing analytics and other ephemeral data.
 */
export declare const CACHE_DIR: string;
/**
 * Path to the analytics JSON file.
 * Stores session analytics data including tool usage and skill recommendations.
 */
export declare const ANALYTICS_FILE: string;
