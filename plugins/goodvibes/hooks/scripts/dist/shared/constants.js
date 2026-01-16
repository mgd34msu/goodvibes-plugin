/**
 * Constants
 *
 * Environment constants and package manager lockfile definitions.
 */
import * as path from 'path';
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
export const LOCKFILES = [
    'pnpm-lock.yaml',
    'yarn.lock',
    'package-lock.json',
    'bun.lockb',
];
/**
 * Internal helper to resolve plugin root from a given dirname.
 * Extracted for testability.
 *
 * @internal Exported for testing purposes only
 * @param dirname - The __dirname value to use for resolution
 * @returns The resolved plugin root path
 */
export function resolvePluginRootFromDirname(dirname) {
    // Official Claude Code env var takes priority
    if (process.env.CLAUDE_PLUGIN_ROOT) {
        return process.env.CLAUDE_PLUGIN_ROOT;
    }
    // Try to resolve from dirname if available and contains 'hooks'
    if (dirname !== undefined && dirname.includes('hooks')) {
        // Find the hooks path segment and go to its parent
        const hooksIndex = dirname.indexOf('hooks');
        if (hooksIndex > 0) {
            return dirname.substring(0, hooksIndex - 1);
        }
    }
    // Fallback for development: assume we're in the project root
    // and plugin is at plugins/goodvibes
    const devPluginPath = path.join(process.cwd(), 'plugins', 'goodvibes');
    return devPluginPath;
}
/**
 * Determines the plugin root directory.
 * Priority:
 * 1. CLAUDE_PLUGIN_ROOT env var (set by Claude Code during hook execution)
 * 2. Detect from script location (hooks/scripts/dist -> go up 3 levels)
 * 3. Fallback to plugins/goodvibes relative to cwd (for development)
 *
 * @internal Exported for testing purposes only
 */
export function resolvePluginRoot() {
    // In Node.js CJS, __dirname is always defined.
    // In ESM, __dirname would be undefined (but we compile to CJS).
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    /* v8 ignore next 2 -- @preserve __dirname is always defined in Node.js CJS */
    const currentDirname = typeof __dirname !== 'undefined' ? __dirname : undefined;
    return resolvePluginRootFromDirname(currentDirname);
}
/**
 * Root directory of the GoodVibes plugin itself.
 * Uses official Claude Code environment variable or intelligent fallback.
 */
export const PLUGIN_ROOT = resolvePluginRoot();
/**
 * Root directory of the user's project.
 * Uses official Claude Code environment variable or falls back to current working directory.
 */
// eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty string should fall back to default
export const PROJECT_ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
/**
 * Cache directory for temporary plugin data.
 * Located at PLUGIN_ROOT/.cache for storing analytics and other ephemeral data.
 */
export const CACHE_DIR = path.join(PLUGIN_ROOT, '.cache');
/**
 * Path to the analytics JSON file.
 * Stores session analytics data including tool usage and skill recommendations.
 */
export const ANALYTICS_FILE = path.join(CACHE_DIR, 'analytics.json');
