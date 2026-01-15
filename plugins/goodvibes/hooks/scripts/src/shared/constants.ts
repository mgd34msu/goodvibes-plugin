/**
 * Constants
 *
 * Environment constants and package manager lockfile definitions.
 */

import * as path from 'path';

/**
 * Package manager lockfiles for detection.
 * Used to identify which package manager a project uses (pnpm, yarn, npm, or bun).
 */
export const LOCKFILES = [
  'pnpm-lock.yaml',
  'yarn.lock',
  'package-lock.json',
  'bun.lockb',
] as const;

/**
 * Determines the plugin root directory.
 * Priority:
 * 1. CLAUDE_PLUGIN_ROOT env var (set by Claude Code during hook execution)
 * 2. Detect from script location (hooks/scripts/dist -> go up 3 levels)
 * 3. Fallback to plugins/goodvibes relative to cwd (for development)
 */
function resolvePluginRoot(): string {
  // Official Claude Code env var
  if (process.env.CLAUDE_PLUGIN_ROOT) {
    return process.env.CLAUDE_PLUGIN_ROOT;
  }

  // Try to resolve from __dirname if available (works in CommonJS)
  // __dirname in hooks/scripts/dist should go up 3 levels to plugin root
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (typeof __dirname !== 'undefined' && __dirname.includes('hooks')) {
    // Find the hooks path segment and go to its parent
    const hooksIndex = __dirname.indexOf('hooks');
    if (hooksIndex > 0) {
      return __dirname.substring(0, hooksIndex - 1);
    }
  }

  // Fallback for development: assume we're in the project root
  // and plugin is at plugins/goodvibes
  const devPluginPath = path.join(process.cwd(), 'plugins', 'goodvibes');
  return devPluginPath;
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
